import {
  GATEWAY_API_KEY_MESSAGE,
  GATEWAY_CONTRACT_CODE_MESSAGE,
  GATEWAY_SECRET_KEY_MESSAGE,
  gatewayConnectionSchema,
  monnifyWebhookBodySchema,
  saveGatewayConnectionSchema,
} from './gateway';
import { walletMovementSourceSchema } from './wallets';

const messages = (result: {
  success: boolean;
  error?: { issues: { message: string }[] };
}) => result.error?.issues.map((issue) => issue.message) ?? [];

const connect = {
  mode: 'sandbox',
  contractCode: '2957982769',
  apiKey: 'MK_TEST_ABC',
  secretKey: 'SECRET',
};

describe('saveGatewayConnectionSchema', () => {
  it('trims what is typed and accepts a connection', () => {
    expect(
      saveGatewayConnectionSchema.parse({
        ...connect,
        contractCode: ' 2957982769 ',
        apiKey: ' MK_TEST_ABC ',
      })
    ).toEqual(connect);
  });

  it('leaves both keys optional, so a saved connection can change its contract code alone', () => {
    expect(
      saveGatewayConnectionSchema.parse({ mode: 'live', contractCode: '1' })
    ).toEqual({ mode: 'live', contractCode: '1' });
  });

  it('refuses a blank key, a blank contract code and an unknown mode', () => {
    expect(
      messages(
        saveGatewayConnectionSchema.safeParse({ ...connect, apiKey: ' ' })
      )
    ).toEqual([GATEWAY_API_KEY_MESSAGE]);
    expect(
      messages(
        saveGatewayConnectionSchema.safeParse({ ...connect, secretKey: '' })
      )
    ).toEqual([GATEWAY_SECRET_KEY_MESSAGE]);
    expect(
      messages(
        saveGatewayConnectionSchema.safeParse({ ...connect, contractCode: '' })
      )
    ).toEqual([GATEWAY_CONTRACT_CODE_MESSAGE]);
    expect(
      saveGatewayConnectionSchema.safeParse({ ...connect, mode: 'staging' })
        .success
    ).toBe(false);
  });
});

describe('gatewayConnectionSchema', () => {
  const connection = {
    mode: 'live',
    contractCode: '1',
    apiKeyMask: '••••ABCD',
    secretKeyMask: '••••WXYZ',
    lastTestedAt: null,
    lastTestOk: null,
    updatedAt: '2026-10-24T10:00:00.000Z',
  };

  it('holds masks and never a key, even if one is sent along', () => {
    const parsed = gatewayConnectionSchema.parse({
      webhookUrl: 'https://api.example.com/webhooks/monnify/s1',
      connection: { ...connection, apiKey: 'MK_LIVE_SECRET' },
    });

    expect(JSON.stringify(parsed)).not.toContain('MK_LIVE_SECRET');
  });

  it('answers not connected with a null connection', () => {
    expect(
      gatewayConnectionSchema.parse({
        webhookUrl: 'https://api.example.com/webhooks/monnify/s1',
        connection: null,
      }).connection
    ).toBeNull();
  });
});

describe('monnifyWebhookBodySchema', () => {
  it('needs an event and a transaction reference and keeps the rest of what Monnify sends', () => {
    const parsed = monnifyWebhookBodySchema.parse({
      eventType: 'SUCCESSFUL_TRANSACTION',
      eventData: {
        transactionReference: 'MNFY|20|20261024120000|000001',
        amountPaid: '5000.00',
        product: { type: 'RESERVED_ACCOUNT', reference: 'EDV-W-1' },
      },
    });

    expect(parsed.eventData).toMatchObject({
      transactionReference: 'MNFY|20|20261024120000|000001',
      amountPaid: '5000.00',
      product: { reference: 'EDV-W-1' },
    });
  });

  it.each([
    {},
    { eventType: 'SUCCESSFUL_TRANSACTION' },
    { eventType: 'SUCCESSFUL_TRANSACTION', eventData: {} },
    { eventType: '', eventData: { transactionReference: 'x' } },
  ])('refuses %j', (body) => {
    expect(monnifyWebhookBodySchema.safeParse(body).success).toBe(false);
  });
});

describe('the monnify movement source', () => {
  const source = {
    type: 'monnify',
    id: '0b0c8a8e-8a3e-4c6c-a8c4-0e2f0f6b1f11',
    transactionReference: 'MNFY|20|20261024120000|000001',
    paymentReference: 'pay-1',
    signatureVerified: true,
    paidAt: '2026-10-24T11:15:29.000Z',
    confirmedAt: '2026-10-24T11:15:31.000Z',
    grossMinor: 5_000_000,
    feeMinor: 50_000,
    netMinor: 4_950_000,
  };

  it('carries the Trace fields', () => {
    expect(walletMovementSourceSchema.parse(source)).toEqual(source);
  });

  it('only exists for a verified signature', () => {
    expect(
      walletMovementSourceSchema.safeParse({
        ...source,
        signatureVerified: false,
      }).success
    ).toBe(false);
  });
});
