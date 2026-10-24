import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  GATEWAY_KEYS_REJECTED_MESSAGE,
  GATEWAY_KEYS_REQUIRED_MESSAGE,
  GATEWAY_TEST_OK_MESSAGE,
  GATEWAY_UNAVAILABLE_MESSAGE,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { Clock } from '../../common/clock';
import { FakeGatewayRepository } from './fake-gateway.repository';
import { FakeMonnifyClient } from './fake-monnify-client';
import { GatewayConnectionService } from './gateway-connection.service';
import { GatewaySecrets, tailOf } from './gateway-secrets';
import { GatewayTestService } from './gateway-test.service';

const ORG = 'school-a';
const KEY = Buffer.alloc(32, 5).toString('base64');

const ctx = (organizationId = ORG) =>
  ({ organizationId, user: { id: 'owner-1', name: 'Owner' } }) as OrgContext;

const keys = {
  mode: 'sandbox',
  contractCode: '2957982769',
  apiKey: 'MK_TEST_ABCDEFGH',
  secretKey: 'SECRET-KEY-WXYZ-1234',
} as const;

function setup(encryptionKey: string | null = KEY) {
  const gateway = new FakeGatewayRepository();
  const client = new FakeMonnifyClient();
  const clock = new Clock();
  clock.set('2026-10-24');
  const connections = new GatewayConnectionService(
    gateway,
    new GatewaySecrets({ GATEWAY_ENCRYPTION_KEY: encryptionKey ?? undefined }),
    { BETTER_AUTH_URL: 'https://api.eduvault.test/' }
  );
  return {
    gateway,
    client,
    service: connections,
    tests: new GatewayTestService(connections, client, clock),
  };
}

describe('GatewayConnectionService.get', () => {
  it('answers not connected, with the school’s webhook URL', async () => {
    const { service } = setup();

    await expect(service.get(ctx())).resolves.toEqual({
      webhookUrl: 'https://api.eduvault.test/webhooks/monnify/school-a',
      connection: null,
    });
  });
});

describe('GatewayConnectionService.save', () => {
  it('stores the keys encrypted and shows only masked tails', async () => {
    const { gateway, service } = setup();

    const saved = await service.save(ctx(), keys);

    expect(saved.connection).toMatchObject({
      mode: 'sandbox',
      contractCode: '2957982769',
      apiKeyMask: '••••EFGH',
      secretKeyMask: '••••1234',
      lastTestedAt: null,
      lastTestOk: null,
    });
    const stored = gateway.connections.get(ORG);
    expect(stored?.apiKey.enc).not.toContain('ABCDEFGH');
    expect(stored?.secretKey.enc).not.toContain('WXYZ');
    expect(gateway.savedBy).toEqual(['owner-1']);
    expect(JSON.stringify(saved)).not.toContain('MK_TEST_ABCDEFGH');
    expect(JSON.stringify(saved)).not.toContain('SECRET-KEY-WXYZ-1234');
  });

  it('gives the keys back in the clear only to the server', async () => {
    const { service } = setup();
    await service.save(ctx(), keys);

    await expect(service.credentials(ORG)).resolves.toEqual({
      mode: 'sandbox',
      contractCode: '2957982769',
      apiKey: 'MK_TEST_ABCDEFGH',
      secretKey: 'SECRET-KEY-WXYZ-1234',
    });
    await expect(service.credentials('school-b')).resolves.toBeUndefined();
  });

  it('keeps the stored keys when only the contract code changes in the same mode', async () => {
    const { service } = setup();
    await service.save(ctx(), keys);

    await service.save(ctx(), {
      mode: 'sandbox',
      contractCode: '999',
      secretKey: 'NEW-SECRET-0000',
    });

    await expect(service.credentials(ORG)).resolves.toEqual({
      mode: 'sandbox',
      contractCode: '999',
      apiKey: 'MK_TEST_ABCDEFGH',
      secretKey: 'NEW-SECRET-0000',
    });
  });

  it('wants both keys to connect and to switch between sandbox and live', async () => {
    const { service } = setup();
    await expect(
      service.save(ctx(), { mode: 'sandbox', contractCode: '1' })
    ).rejects.toThrow(GATEWAY_KEYS_REQUIRED_MESSAGE);

    await service.save(ctx(), keys);
    await expect(
      service.save(ctx(), { mode: 'live', contractCode: '1' })
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.save(ctx(), { mode: 'live', contractCode: '1', apiKey: 'only' })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('forgets an earlier test result when the keys change', async () => {
    const { service, tests } = setup();
    await service.save(ctx(), keys);
    await tests.test(ctx());

    const saved = await service.save(ctx(), {
      ...keys,
      apiKey: 'MK_TEST_NEW12345',
    });

    expect(saved.connection).toMatchObject({
      lastTestedAt: null,
      lastTestOk: null,
    });
  });

  it('refuses to store keys when the server has no encryption key', async () => {
    const { gateway, service } = setup(null);

    await expect(service.save(ctx(), keys)).rejects.toBeInstanceOf(
      ServiceUnavailableException
    );
    expect(gateway.connections.size).toBe(0);
  });

  it('will not open a school’s keys under another school', async () => {
    const { gateway, service } = setup();
    await service.save(ctx(), keys);
    const stored = gateway.connections.get(ORG);
    if (stored !== undefined) {
      gateway.connections.set('school-b', stored);
    }

    await expect(service.credentials('school-b')).rejects.toThrow();
  });
});

describe('GatewayTestService.test', () => {
  it('records a good result with the time', async () => {
    const { service, tests, client } = setup();
    await service.save(ctx(), keys);

    const result = await tests.test(ctx());

    expect(result).toMatchObject({
      ok: true,
      message: GATEWAY_TEST_OK_MESSAGE,
      testedAt: '2026-10-24T12:00:00.000Z',
    });
    expect(result.connection.connection).toMatchObject({
      lastTestOk: true,
      lastTestedAt: '2026-10-24T12:00:00.000Z',
    });
    expect(client.logins).toHaveLength(1);
    expect(client.logins[0]).toMatchObject({ apiKey: 'MK_TEST_ABCDEFGH' });
  });

  it('records a refusal and an outage as different messages', async () => {
    const { service, tests, client } = setup();
    await service.save(ctx(), keys);

    client.rejectKeys = true;
    await expect(tests.test(ctx())).resolves.toMatchObject({
      ok: false,
      message: GATEWAY_KEYS_REJECTED_MESSAGE,
    });
    client.rejectKeys = false;
    client.down = true;
    const down = await tests.test(ctx());
    expect(down).toMatchObject({
      ok: false,
      message: GATEWAY_UNAVAILABLE_MESSAGE,
    });
    expect(down.connection.connection?.lastTestOk).toBe(false);
  });

  it('answers 409 when the school has not connected', async () => {
    const { tests } = setup();

    await expect(tests.test(ctx())).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('tailOf', () => {
  it('shows at most four characters and less of a short key', () => {
    expect(tailOf('MK_TEST_ABCDEFGH')).toBe('EFGH');
    expect(tailOf('abcdefgh')).toBe('gh');
    expect(tailOf('abc')).toBe('c');
  });
});
