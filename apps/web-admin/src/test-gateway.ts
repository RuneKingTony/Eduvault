import type { GatewayConnection } from '@eduvault/api-contract';

export const WEBHOOK_URL =
  'https://api.eduvault.test/webhooks/monnify/school-a';

export const connectedGateway = (
  over: Partial<NonNullable<GatewayConnection['connection']>> = {}
): GatewayConnection => ({
  webhookUrl: WEBHOOK_URL,
  connection: {
    mode: 'sandbox',
    contractCode: '2957982769',
    apiKeyMask: '••••EFGH',
    secretKeyMask: '••••1234',
    lastTestedAt: null,
    lastTestOk: null,
    updatedAt: '2026-10-24T10:00:00.000Z',
    ...over,
  },
});

export const unconnectedGateway = (): GatewayConnection => ({
  webhookUrl: WEBHOOK_URL,
  connection: null,
});
