import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { nairaToMinor, monnifyDate } from './monnify-amount';
import {
  MonnifyClient,
  MonnifyError,
  type MonnifyAccount,
  type MonnifyCredentials,
  type MonnifyTransaction,
  type NewReservedAccount,
} from './monnify-client';

const BASE_URL = {
  sandbox: 'https://sandbox.monnify.com',
  live: 'https://api.monnify.com',
} as const;

const TIMEOUT_MS = 10_000;
const RESERVED_ACCOUNTS = '/api/v2/bank-transfer/reserved-accounts';

const envelopeSchema = z.object({
  requestSuccessful: z.boolean(),
  responseMessage: z.string().optional(),
  responseBody: z.unknown().optional(),
});

const loginSchema = z.object({ accessToken: z.string().min(1) });

const reservedAccountSchema = z.object({
  accounts: z
    .array(
      z.object({
        accountNumber: z.string().min(1),
        bankName: z.string().min(1),
        accountName: z.string().min(1),
      })
    )
    .min(1),
});

const amountSchema = z.union([z.number(), z.string()]);

const transactionSchema = z.object({
  transactionReference: z.string().min(1),
  paymentReference: z.string().min(1),
  paymentStatus: z.string(),
  currency: z.string(),
  amountPaid: amountSchema,
  settlementAmount: amountSchema,
  paidOn: z.string().optional(),
  product: z.object({ reference: z.string().optional() }).optional(),
});

interface Call {
  credentials: MonnifyCredentials;
  method: 'GET' | 'POST';
  path: string;
  token?: string;
  body?: unknown;
}

interface Answer {
  status: number;
  envelope: z.output<typeof envelopeSchema> | undefined;
}

const basic = ({ apiKey, secretKey }: MonnifyCredentials): string => {
  const pair = `${apiKey}:${secretKey}`;
  return `Basic ${Buffer.from(pair).toString('base64')}`;
};

async function send(call: Call): Promise<Answer> {
  const { credentials, method, path, token, body } = call;
  try {
    const response = await fetch(`${BASE_URL[credentials.mode]}${path}`, {
      method,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        Authorization:
          token === undefined ? basic(credentials) : `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const parsed = envelopeSchema.safeParse(
      await response.json().catch(() => undefined)
    );
    return {
      status: response.status,
      envelope: parsed.success ? parsed.data : undefined,
    };
  } catch {
    throw new MonnifyError('unavailable', 'Monnify did not answer');
  }
}

function refuse(answer: Answer): never {
  if (answer.status >= 500 || answer.status === 429) {
    throw new MonnifyError('unavailable', `Monnify answered ${answer.status}`);
  }
  throw new MonnifyError(
    'rejected',
    answer.envelope?.responseMessage ?? `Monnify answered ${answer.status}`
  );
}

function bodyOf<Schema extends z.ZodType>(
  answer: Answer,
  schema: Schema
): z.output<Schema> {
  if (answer.status >= 400 || answer.envelope?.requestSuccessful !== true) {
    refuse(answer);
  }
  const parsed = schema.safeParse(answer.envelope.responseBody);
  if (!parsed.success) {
    throw new MonnifyError('rejected', 'Monnify sent an answer we cannot read');
  }
  return parsed.data;
}

const absent = (answer: Answer): boolean =>
  answer.status === 404 ||
  (answer.status < 500 && answer.envelope?.requestSuccessful === false);

async function login(credentials: MonnifyCredentials): Promise<string> {
  const answer = await send({
    credentials,
    method: 'POST',
    path: '/api/v1/auth/login',
  });
  return bodyOf(answer, loginSchema).accessToken;
}

@Injectable()
export class FetchMonnifyClient extends MonnifyClient {
  async verifyCredentials(credentials: MonnifyCredentials): Promise<void> {
    await login(credentials);
  }

  async findReservedAccount(
    credentials: MonnifyCredentials,
    accountReference: string
  ): Promise<MonnifyAccount | undefined> {
    const token = await login(credentials);
    const answer = await send({
      credentials,
      token,
      method: 'GET',
      path: `${RESERVED_ACCOUNTS}/${encodeURIComponent(accountReference)}`,
    });
    if (absent(answer)) {
      return undefined;
    }
    return bodyOf(answer, reservedAccountSchema).accounts[0];
  }

  async createReservedAccount(
    credentials: MonnifyCredentials,
    account: NewReservedAccount
  ): Promise<MonnifyAccount> {
    const token = await login(credentials);
    const answer = await send({
      credentials,
      token,
      method: 'POST',
      path: RESERVED_ACCOUNTS,
      body: {
        accountReference: account.accountReference,
        accountName: account.accountName,
        currencyCode: 'NGN',
        contractCode: credentials.contractCode,
        customerEmail: account.customerEmail,
        customerName: account.customerName,
        getAllAvailableBanks: false,
      },
    });
    const [created] = bodyOf(answer, reservedAccountSchema).accounts;
    if (created === undefined) {
      throw new MonnifyError('rejected', 'Monnify sent no account');
    }
    return created;
  }

  async getTransaction(
    credentials: MonnifyCredentials,
    transactionReference: string
  ): Promise<MonnifyTransaction | undefined> {
    const token = await login(credentials);
    const answer = await send({
      credentials,
      token,
      method: 'GET',
      path: `/api/v2/transactions/${encodeURIComponent(transactionReference)}`,
    });
    if (absent(answer)) {
      return undefined;
    }
    const body = bodyOf(answer, transactionSchema);
    const amountPaidMinor = nairaToMinor(body.amountPaid);
    const settlementMinor = nairaToMinor(body.settlementAmount);
    if (amountPaidMinor === undefined || settlementMinor === undefined) {
      throw new MonnifyError(
        'rejected',
        'Monnify sent an amount we cannot read'
      );
    }
    return {
      transactionReference: body.transactionReference,
      paymentReference: body.paymentReference,
      paymentStatus: body.paymentStatus,
      currency: body.currency,
      amountPaidMinor,
      settlementMinor,
      paidAt: monnifyDate(body.paidOn ?? '', new Date()),
      accountReference: body.product?.reference ?? null,
    };
  }
}
