import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  GATEWAY_NOT_CONNECTED_MESSAGE,
  WALLET_NOT_PAYING_MESSAGE,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { FakeGatewayRepository } from './fake-gateway.repository';
import { FakeMonnifyClient } from './fake-monnify-client';
import { GatewayConnectionService } from './gateway-connection.service';
import { GatewaySecrets } from './gateway-secrets';
import {
  ReservedAccountService,
  reservedAccountReference,
} from './reserved-account.service';

const ORG = 'school-a';
const LEKKI = 'campus-lekki';
const KEY = Buffer.alloc(32, 3).toString('base64');

const ctx = (campusScope: OrgContext['campusScope'] = 'all') =>
  ({
    organizationId: ORG,
    user: { id: 'owner', name: 'Owner' },
    campusScope,
  }) as OrgContext;

async function setup({ connected = true } = {}) {
  const gateway = new FakeGatewayRepository();
  const client = new FakeMonnifyClient();
  const connections = new GatewayConnectionService(
    gateway,
    new GatewaySecrets({ GATEWAY_ENCRYPTION_KEY: KEY }),
    { BETTER_AUTH_URL: 'http://localhost:3000' }
  );
  if (connected) {
    await connections.save(ctx(), {
      mode: 'sandbox',
      contractCode: '123',
      apiKey: 'api-key',
      secretKey: 'secret-key',
    });
  }
  gateway.families.push({
    organizationId: ORG,
    walletId: 'wallet-1',
    guardianId: 'guardian-1',
    guardianName: 'Mrs Ojo',
    guardianEmail: 'ojo@example.com',
    paying: true,
    campusIds: [LEKKI],
  });
  return {
    gateway,
    client,
    service: new ReservedAccountService(gateway, connections, client),
  };
}

describe('ReservedAccountService.ensureForWallet', () => {
  it('creates the account once, under a reference that depends only on the wallet', async () => {
    const { gateway, client, service } = await setup();

    await service.ensureForWallet(ctx(), 'wallet-1');
    await service.ensureForWallet(ctx(), 'wallet-1');

    expect(client.created).toEqual([
      {
        accountReference: reservedAccountReference('wallet-1'),
        accountName: 'Mrs Ojo',
        customerName: 'Mrs Ojo',
        customerEmail: 'ojo@example.com',
      },
    ]);
    expect(gateway.accounts).toHaveLength(1);
  });

  it('reuses the account Monnify already holds for the reference instead of making a second', async () => {
    const { gateway, client, service } = await setup();
    client.accounts.set(reservedAccountReference('wallet-1'), {
      accountNumber: '5000000099',
      bankName: 'Wema Bank',
      accountName: 'Mrs Ojo',
    });

    await service.ensureForWallet(ctx(), 'wallet-1');

    expect(client.created).toEqual([]);
    expect(gateway.accounts[0]).toMatchObject({ accountNumber: '5000000099' });
  });

  it('tells the caller to connect first when the school has not', async () => {
    const { gateway, service } = await setup({ connected: false });

    await expect(service.ensureForWallet(ctx(), 'wallet-1')).rejects.toThrow(
      GATEWAY_NOT_CONNECTED_MESSAGE
    );
    await expect(
      service.ensureForWallet(ctx(), 'wallet-1')
    ).rejects.toBeInstanceOf(ConflictException);
    expect(gateway.accounts).toEqual([]);
  });

  it('answers 404 for a wallet out of the caller’s sight and 400 when no guardian pays', async () => {
    const { gateway, service } = await setup();

    await expect(
      service.ensureForWallet(ctx(['campus-ikeja']), 'wallet-1')
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.ensureForWallet(ctx(), 'wallet-elsewhere')
    ).rejects.toBeInstanceOf(NotFoundException);

    const [family] = gateway.families;
    if (family !== undefined) {
      family.paying = false;
    }
    await expect(service.ensureForWallet(ctx(), 'wallet-1')).rejects.toThrow(
      WALLET_NOT_PAYING_MESSAGE
    );
    await expect(
      service.ensureForWallet(ctx(), 'wallet-1')
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('says so when Monnify is down or refuses, and stores nothing', async () => {
    const { gateway, client, service } = await setup();
    client.down = true;
    await expect(
      service.ensureForWallet(ctx(), 'wallet-1')
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    client.down = false;
    client.rejectKeys = true;
    await expect(
      service.ensureForWallet(ctx(), 'wallet-1')
    ).rejects.toBeInstanceOf(BadGatewayException);
    expect(gateway.accounts).toEqual([]);
  });
});

describe('ReservedAccountService.tryEnsureForGuardian', () => {
  it('creates the account for a paying guardian', async () => {
    const { gateway, service } = await setup();

    await service.tryEnsureForGuardian(ORG, 'guardian-1');

    expect(gateway.accounts).toHaveLength(1);
  });

  it('never raises: not connected, not paying, no wallet, Monnify down', async () => {
    const unconnected = await setup({ connected: false });
    await expect(
      unconnected.service.tryEnsureForGuardian(ORG, 'guardian-1')
    ).resolves.toBeUndefined();

    const { gateway, client, service } = await setup();
    await expect(
      service.tryEnsureForGuardian(ORG, 'nobody')
    ).resolves.toBeUndefined();

    client.down = true;
    await expect(
      service.tryEnsureForGuardian(ORG, 'guardian-1')
    ).resolves.toBeUndefined();
    const [family] = gateway.families;
    if (family !== undefined) {
      family.paying = false;
    }
    client.down = false;
    await service.tryEnsureForGuardian(ORG, 'guardian-1');
    expect(gateway.accounts).toEqual([]);
    expect(client.created).toEqual([]);
  });
});
