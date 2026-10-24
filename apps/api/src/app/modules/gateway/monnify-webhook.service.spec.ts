import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { FakeGatewayRepository } from './fake-gateway.repository';
import { FakeMonnifyClient } from './fake-monnify-client';
import { GatewayConnectionService } from './gateway-connection.service';
import { GatewaySecrets } from './gateway-secrets';
import { monnifySignature } from './monnify-signature';
import { MonnifyWebhookService } from './monnify-webhook.service';
import { reservedAccountReference } from './reserved-account.service';

const SCHOOL_A = 'school-a';
const SCHOOL_B = 'school-b';
const SECRET_A = 'secret-of-school-a';
const SECRET_B = 'secret-of-school-b';
const KEY = Buffer.alloc(32, 9).toString('base64');
const WALLET_A = 'wallet-a';
const WALLET_B = 'wallet-b';
const REFERENCE = 'MNFY|20|20261024120000|000001';

const ctxOf = (organizationId: string) =>
  ({ organizationId, user: { id: 'owner', name: 'Owner' } }) as never;

async function setup() {
  const gateway = new FakeGatewayRepository();
  const client = new FakeMonnifyClient();
  const secrets = new GatewaySecrets({ GATEWAY_ENCRYPTION_KEY: KEY });
  const connections = new GatewayConnectionService(gateway, secrets, {
    BETTER_AUTH_URL: 'http://localhost:3000',
  });
  for (const [org, secret, walletId] of [
    [SCHOOL_A, SECRET_A, WALLET_A],
    [SCHOOL_B, SECRET_B, WALLET_B],
  ] as const) {
    gateway.organizations.add(org);
    await connections.save(ctxOf(org), {
      mode: 'sandbox',
      contractCode: '123',
      apiKey: `key-${org}`,
      secretKey: secret,
    });
    gateway.accounts.push({
      id: `account-${walletId}`,
      organizationId: org,
      walletId,
      accountReference: reservedAccountReference(walletId),
      accountNumber: '5000000001',
      bankName: 'Wema Bank',
      accountName: 'Mrs Ojo',
    });
  }
  client.transactions.set(REFERENCE, {
    transactionReference: REFERENCE,
    paymentReference: 'pay-1',
    paymentStatus: 'PAID',
    currency: 'NGN',
    amountPaidMinor: 5_000_000,
    settlementMinor: 4_950_000,
    paidAt: new Date('2026-10-24T11:15:29Z'),
    accountReference: reservedAccountReference(WALLET_A),
  });
  return {
    gateway,
    client,
    service: new MonnifyWebhookService(gateway, connections, client),
  };
}

const notification = (overrides: Record<string, unknown> = {}) =>
  Buffer.from(
    JSON.stringify({
      eventType: 'SUCCESSFUL_TRANSACTION',
      eventData: {
        transactionReference: REFERENCE,
        paymentReference: 'pay-1',
        amountPaid: 50_000,
        ...overrides,
      },
    })
  );

const signed = (body: Buffer, secret = SECRET_A) => ({
  rawBody: body,
  signature: monnifySignature(secret, body),
});

describe('MonnifyWebhookService.receive', () => {
  it('posts a signed, confirmed payment once, as the net amount with the fee kept', async () => {
    const { gateway, service } = await setup();

    const result = await service.receive({
      organizationId: SCHOOL_A,
      ...signed(notification()),
    });

    expect(result).toEqual({ status: 'posted' });
    expect(gateway.posted).toHaveLength(1);
    expect(gateway.posted[0]).toMatchObject({
      organizationId: SCHOOL_A,
      walletId: WALLET_A,
      reservedAccountId: `account-${WALLET_A}`,
      reference: REFERENCE,
      paymentReference: 'pay-1',
      grossMinor: 5_000_000,
      feeMinor: 50_000,
      netMinor: 4_950_000,
      effectiveOn: '2026-10-24',
    });
  });

  it('answers a replay with success and posts nothing more', async () => {
    const { gateway, service } = await setup();
    const delivery = { organizationId: SCHOOL_A, ...signed(notification()) };

    await service.receive(delivery);
    const again = await service.receive(delivery);

    expect(again).toEqual({ status: 'replayed' });
    expect(gateway.posted).toHaveLength(1);
  });

  it('refuses a bad, missing or other-school signature before asking Monnify anything', async () => {
    const { gateway, client, service } = await setup();
    const body = notification();

    for (const signature of [
      'f'.repeat(128),
      monnifySignature(SECRET_B, body),
      undefined,
      'short',
    ]) {
      await expect(
        service.receive({ organizationId: SCHOOL_A, rawBody: body, signature })
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }
    expect(client.lookups).toEqual([]);
    expect(gateway.posted).toEqual([]);
  });

  it('refuses a body changed after it was signed', async () => {
    const { gateway, service } = await setup();
    const { signature } = signed(notification());

    await expect(
      service.receive({
        organizationId: SCHOOL_A,
        rawBody: notification({ amountPaid: 90_000 }),
        signature,
      })
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(gateway.posted).toEqual([]);
  });

  it('answers 404 for an unknown school and for a school that has not connected', async () => {
    const { gateway, service } = await setup();
    gateway.organizations.add('school-c');

    for (const organizationId of ['nowhere', 'school-c']) {
      await expect(
        service.receive({ organizationId, ...signed(notification()) })
      ).rejects.toBeInstanceOf(NotFoundException);
    }
  });

  it('trusts the confirmed amount, so a notification for another amount is refused', async () => {
    const { gateway, service } = await setup();

    await expect(
      service.receive({
        organizationId: SCHOOL_A,
        ...signed(notification({ amountPaid: 500_000 })),
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.receive({
        organizationId: SCHOOL_A,
        ...signed(notification({ amountPaid: undefined })),
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(gateway.posted).toEqual([]);
  });

  it('refuses a transaction Monnify does not know, has not marked paid, or counts in another currency', async () => {
    const { gateway, client, service } = await setup();
    const unknown = notification({ transactionReference: 'MNFY|unknown' });
    await expect(
      service.receive({ organizationId: SCHOOL_A, ...signed(unknown) })
    ).rejects.toBeInstanceOf(BadRequestException);

    const known = client.transactions.get(REFERENCE);
    for (const change of [{ paymentStatus: 'PENDING' }, { currency: 'USD' }]) {
      client.transactions.set(REFERENCE, { ...known!, ...change });
      await expect(
        service.receive({ organizationId: SCHOOL_A, ...signed(notification()) })
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(gateway.posted).toEqual([]);
  });

  it('refuses a settlement of nothing, or more than was paid', async () => {
    const { client, service } = await setup();
    const known = client.transactions.get(REFERENCE)!;
    for (const settlementMinor of [0, 5_000_001]) {
      client.transactions.set(REFERENCE, { ...known, settlementMinor });
      await expect(
        service.receive({ organizationId: SCHOOL_A, ...signed(notification()) })
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('credits no fee when Monnify settles the whole amount', async () => {
    const { gateway, client, service } = await setup();
    const known = client.transactions.get(REFERENCE)!;
    client.transactions.set(REFERENCE, {
      ...known,
      settlementMinor: 5_000_000,
    });

    await service.receive({
      organizationId: SCHOOL_A,
      ...signed(notification()),
    });

    expect(gateway.posted[0]).toMatchObject({
      feeMinor: 0,
      netMinor: 5_000_000,
    });
  });

  it('cannot credit school B with a payment to an account of B, signed with A’s secret', async () => {
    const { gateway, client, service } = await setup();
    const known = client.transactions.get(REFERENCE)!;
    client.transactions.set(REFERENCE, {
      ...known,
      accountReference: reservedAccountReference(WALLET_B),
    });

    await expect(
      service.receive({ organizationId: SCHOOL_A, ...signed(notification()) })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(gateway.posted).toEqual([]);
  });

  it('refuses A’s secret on B’s URL', async () => {
    const { gateway, service } = await setup();

    await expect(
      service.receive({
        organizationId: SCHOOL_B,
        ...signed(notification(), SECRET_A),
      })
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(gateway.posted).toEqual([]);
  });

  it('refuses a payment to something that is not a reserved account', async () => {
    const { gateway, client, service } = await setup();
    const known = client.transactions.get(REFERENCE)!;
    for (const accountReference of [null, 'EDV-W-unknown']) {
      client.transactions.set(REFERENCE, { ...known, accountReference });
      await expect(
        service.receive({ organizationId: SCHOOL_A, ...signed(notification()) })
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(gateway.posted).toEqual([]);
  });

  it('ignores other events after checking the signature', async () => {
    const { gateway, client, service } = await setup();
    const body = Buffer.from(
      JSON.stringify({
        eventType: 'SUCCESSFUL_DISBURSEMENT',
        eventData: { transactionReference: 'MNFY|x' },
      })
    );

    await expect(
      service.receive({ organizationId: SCHOOL_A, ...signed(body) })
    ).resolves.toEqual({ status: 'ignored' });
    expect(client.lookups).toEqual([]);
    expect(gateway.posted).toEqual([]);
  });

  it('refuses a signed body that is not a notification', async () => {
    const { service } = await setup();

    for (const body of [
      Buffer.from('not json'),
      Buffer.from('{"eventType":1}'),
    ]) {
      await expect(
        service.receive({ organizationId: SCHOOL_A, ...signed(body) })
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    await expect(
      service.receive({
        organizationId: SCHOOL_A,
        rawBody: undefined,
        signature: 'x',
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('asks Monnify to try again when it cannot confirm', async () => {
    const { gateway, client, service } = await setup();
    client.down = true;

    await expect(
      service.receive({ organizationId: SCHOOL_A, ...signed(notification()) })
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(gateway.posted).toEqual([]);
  });

  it('answers 409 when the reference is already another journal entry', async () => {
    const { gateway, service } = await setup();
    gateway.foreignReferences.add(`${SCHOOL_A}:${REFERENCE}`);

    await expect(
      service.receive({ organizationId: SCHOOL_A, ...signed(notification()) })
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('confirms with the school’s own keys', async () => {
    const { client, service } = await setup();

    await service.receive({
      organizationId: SCHOOL_A,
      ...signed(notification()),
    });

    expect(client.logins.at(-1)).toMatchObject({
      apiKey: `key-${SCHOOL_A}`,
      secretKey: SECRET_A,
      contractCode: '123',
    });
  });
});
