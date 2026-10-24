import { z } from 'zod';

export const GATEWAY_MODES = ['sandbox', 'live'] as const;
export const gatewayModeSchema = z.enum(GATEWAY_MODES);
export type GatewayMode = z.infer<typeof gatewayModeSchema>;

export const GATEWAY_CONTRACT_CODE_MAX = 60;
export const GATEWAY_SECRET_MAX = 200;
export const GATEWAY_SECRET_MASK = '••••';

export const GATEWAY_NOT_CONNECTED_MESSAGE =
  'Online payments aren’t connected yet. An owner can connect Monnify in Settings > Online payments.';
export const GATEWAY_KEYS_REQUIRED_MESSAGE =
  'Enter the API key and the secret key to connect, or to change between sandbox and live.';
export const GATEWAY_CONTRACT_CODE_MESSAGE = 'Enter the contract code.';
export const GATEWAY_API_KEY_MESSAGE = 'Enter the API key.';
export const GATEWAY_SECRET_KEY_MESSAGE = 'Enter the secret key.';
export const GATEWAY_UNAVAILABLE_MESSAGE =
  'Monnify could not be reached right now. Try again in a moment.';
export const GATEWAY_ENCRYPTION_OFF_MESSAGE =
  'Saving keys is switched off on this server. Ask Eduvault support to finish setting up online payments.';
export const GATEWAY_ACCOUNT_REFUSED_MESSAGE =
  'Monnify did not create the account. Check the connection in Settings > Online payments.';
export const GATEWAY_KEYS_REJECTED_MESSAGE =
  'Monnify did not accept these keys. Check the mode, API key and secret key.';
export const GATEWAY_TEST_OK_MESSAGE = 'Connected to Monnify.';
export const GATEWAY_WEBHOOK_REJECTED_MESSAGE = 'Notification not accepted';

const secretText = (message: string) =>
  z.string({ error: message }).trim().min(1, message).max(GATEWAY_SECRET_MAX);

export const saveGatewayConnectionSchema = z.object({
  mode: gatewayModeSchema,
  contractCode: z
    .string({ error: GATEWAY_CONTRACT_CODE_MESSAGE })
    .trim()
    .min(1, GATEWAY_CONTRACT_CODE_MESSAGE)
    .max(GATEWAY_CONTRACT_CODE_MAX),
  apiKey: secretText(GATEWAY_API_KEY_MESSAGE).optional(),
  secretKey: secretText(GATEWAY_SECRET_KEY_MESSAGE).optional(),
});
export type SaveGatewayConnectionInput = z.input<
  typeof saveGatewayConnectionSchema
>;
export type SaveGatewayConnection = z.output<
  typeof saveGatewayConnectionSchema
>;

export const gatewayConnectionSchema = z.object({
  webhookUrl: z.url(),
  connection: z
    .object({
      mode: gatewayModeSchema,
      contractCode: z.string(),
      apiKeyMask: z.string(),
      secretKeyMask: z.string(),
      lastTestedAt: z.iso.datetime({ offset: true }).nullable(),
      lastTestOk: z.boolean().nullable(),
      updatedAt: z.iso.datetime({ offset: true }),
    })
    .nullable(),
});
export type GatewayConnection = z.infer<typeof gatewayConnectionSchema>;

export const gatewayTestResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  testedAt: z.iso.datetime({ offset: true }),
  connection: gatewayConnectionSchema,
});
export type GatewayTestResult = z.infer<typeof gatewayTestResultSchema>;

export const MONNIFY_SIGNATURE_HEADER = 'monnify-signature';
export const MONNIFY_SUCCESS_EVENT = 'SUCCESSFUL_TRANSACTION';

export const monnifyWebhookParamsSchema = z.object({
  organizationId: z.string().min(1).max(100),
});
export type MonnifyWebhookParams = z.output<typeof monnifyWebhookParamsSchema>;

const monnifyAmount = z.union([z.number(), z.string()]);

export const monnifyWebhookBodySchema = z.object({
  eventType: z.string().min(1).max(100),
  eventData: z
    .object({
      transactionReference: z.string().trim().min(1).max(120),
      paymentReference: z.string().trim().min(1).max(120).optional(),
      amountPaid: monnifyAmount.optional(),
    })
    .loose(),
});
export type MonnifyWebhookBody = z.output<typeof monnifyWebhookBodySchema>;

export const monnifyWebhookResultSchema = z.object({
  status: z.enum(['posted', 'replayed', 'ignored']),
});
export type MonnifyWebhookResult = z.infer<typeof monnifyWebhookResultSchema>;
