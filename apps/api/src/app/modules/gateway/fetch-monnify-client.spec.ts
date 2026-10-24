import { FetchMonnifyClient } from './fetch-monnify-client';
import { MonnifyError, type MonnifyCredentials } from './monnify-client';

const credentials: MonnifyCredentials = {
  mode: 'sandbox',
  apiKey: 'MK_TEST_ABC',
  secretKey: 'SECRET',
  contractCode: '2957982769',
};

interface Reply {
  status?: number;
  body?: unknown;
}

const answer = ({ status = 200, body = {} }: Reply) =>
  Response.json(body, { status });

const login = {
  body: {
    requestSuccessful: true,
    responseBody: { accessToken: 'token-1', expiresIn: 3500 },
  },
};

function script(...replies: Reply[]) {
  const fetcher = vi.fn<typeof fetch>();
  for (const reply of replies) {
    fetcher.mockResolvedValueOnce(answer(reply));
  }
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

const call = (fetcher: ReturnType<typeof script>, index: number) => {
  const [url, init] = fetcher.mock.calls[index]!;
  return { url: typeof url === 'string' ? url : '', init: init! };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

const client = new FetchMonnifyClient();

describe('FetchMonnifyClient.verifyCredentials', () => {
  it('logs in with Basic apiKey:secretKey on the sandbox host', async () => {
    const fetcher = script(login);

    await client.verifyCredentials(credentials);

    const { url, init } = call(fetcher, 0);
    expect(url).toBe('https://sandbox.monnify.com/api/v1/auth/login');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Authorization: `Basic ${Buffer.from('MK_TEST_ABC:SECRET').toString('base64')}`,
    });
  });

  it('uses the live host for live keys', async () => {
    const fetcher = script(login);

    await client.verifyCredentials({ ...credentials, mode: 'live' });

    expect(call(fetcher, 0).url).toBe(
      'https://api.monnify.com/api/v1/auth/login'
    );
  });

  it('says rejected when Monnify refuses the keys', async () => {
    script({
      status: 401,
      body: { requestSuccessful: false, responseMessage: 'Unauthorized' },
    });

    await expect(client.verifyCredentials(credentials)).rejects.toMatchObject({
      kind: 'rejected',
      message: 'Unauthorized',
    });
  });

  it('says unavailable for a server error, a throttle, a timeout and a network failure', async () => {
    for (const status of [500, 503, 429]) {
      script({ status, body: {} });
      await expect(client.verifyCredentials(credentials)).rejects.toMatchObject(
        { kind: 'unavailable' }
      );
    }
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await expect(client.verifyCredentials(credentials)).rejects.toBeInstanceOf(
      MonnifyError
    );
    await expect(client.verifyCredentials(credentials)).rejects.toMatchObject({
      kind: 'unavailable',
    });
  });

  it('says rejected when a success carries no token', async () => {
    script({ body: { requestSuccessful: true, responseBody: {} } });

    await expect(client.verifyCredentials(credentials)).rejects.toMatchObject({
      kind: 'rejected',
    });
  });
});

describe('FetchMonnifyClient reserved accounts', () => {
  const stored = {
    body: {
      requestSuccessful: true,
      responseBody: {
        accountReference: 'EDV-W-1',
        accounts: [
          {
            bankCode: '035',
            bankName: 'Wema bank',
            accountNumber: '5000000001',
            accountName: 'Mrs Ojo',
          },
        ],
      },
    },
  };

  it('finds an account by its reference with the bearer token', async () => {
    const fetcher = script(login, stored);

    const found = await client.findReservedAccount(credentials, 'EDV-W-1');

    expect(found).toEqual({
      accountNumber: '5000000001',
      bankName: 'Wema bank',
      accountName: 'Mrs Ojo',
    });
    const { url, init } = call(fetcher, 1);
    expect(url).toBe(
      'https://sandbox.monnify.com/api/v2/bank-transfer/reserved-accounts/EDV-W-1'
    );
    expect(init.headers).toMatchObject({ Authorization: 'Bearer token-1' });
  });

  it('answers undefined when Monnify has no such account', async () => {
    script(login, {
      status: 404,
      body: { requestSuccessful: false, responseMessage: 'not found' },
    });

    await expect(
      client.findReservedAccount(credentials, 'EDV-W-1')
    ).resolves.toBeUndefined();
  });

  it('creates one with the contract code, the guardian and one bank', async () => {
    const fetcher = script(login, stored);

    const created = await client.createReservedAccount(credentials, {
      accountReference: 'EDV-W-1',
      accountName: 'Mrs Ojo',
      customerName: 'Mrs Ojo',
      customerEmail: 'ojo@example.com',
    });

    expect(created.accountNumber).toBe('5000000001');
    const { url, init } = call(fetcher, 1);
    expect(url).toBe(
      'https://sandbox.monnify.com/api/v2/bank-transfer/reserved-accounts'
    );
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      accountReference: 'EDV-W-1',
      accountName: 'Mrs Ojo',
      currencyCode: 'NGN',
      contractCode: '2957982769',
      customerEmail: 'ojo@example.com',
      customerName: 'Mrs Ojo',
      getAllAvailableBanks: false,
    });
  });

  it('refuses when Monnify answers with no accounts', async () => {
    script(login, {
      body: { requestSuccessful: true, responseBody: { accounts: [] } },
    });

    await expect(
      client.createReservedAccount(credentials, {
        accountReference: 'EDV-W-1',
        accountName: 'x',
        customerName: 'x',
        customerEmail: 'x@example.com',
      })
    ).rejects.toMatchObject({ kind: 'rejected' });
  });
});

describe('FetchMonnifyClient.getTransaction', () => {
  const paid = {
    body: {
      requestSuccessful: true,
      responseBody: {
        transactionReference: 'MNFY|20|20261024120000|000001',
        paymentReference: 'pay-1',
        paymentStatus: 'PAID',
        currency: 'NGN',
        amountPaid: 50_000,
        settlementAmount: '49500.00',
        paidOn: '2026-10-24 12:15:29.0',
        product: { type: 'RESERVED_ACCOUNT', reference: 'EDV-W-1' },
      },
    },
  };

  it('maps the transaction into minor units, UTC time and the account reference', async () => {
    const fetcher = script(login, paid);

    const found = await client.getTransaction(
      credentials,
      'MNFY|20|20261024120000|000001'
    );

    expect(found).toEqual({
      transactionReference: 'MNFY|20|20261024120000|000001',
      paymentReference: 'pay-1',
      paymentStatus: 'PAID',
      currency: 'NGN',
      amountPaidMinor: 5_000_000,
      settlementMinor: 4_950_000,
      paidAt: new Date('2026-10-24T11:15:29Z'),
      accountReference: 'EDV-W-1',
    });
    expect(call(fetcher, 1).url).toBe(
      'https://sandbox.monnify.com/api/v2/transactions/MNFY%7C20%7C20261024120000%7C000001'
    );
  });

  it('leaves the account reference empty when the transaction has no product', async () => {
    const { product: _product, ...withoutProduct } = paid.body.responseBody;
    script(login, {
      body: { requestSuccessful: true, responseBody: withoutProduct },
    });

    const found = await client.getTransaction(credentials, 'MNFY|x');

    expect(found?.accountReference).toBeNull();
  });

  it('answers undefined for a transaction Monnify does not know', async () => {
    script(login, {
      status: 404,
      body: { requestSuccessful: false, responseMessage: 'not found' },
    });

    await expect(
      client.getTransaction(credentials, 'MNFY|x')
    ).resolves.toBeUndefined();
  });

  it('refuses an amount with sub-kobo digits', async () => {
    script(login, {
      body: {
        requestSuccessful: true,
        responseBody: { ...paid.body.responseBody, amountPaid: '10.505' },
      },
    });

    await expect(
      client.getTransaction(credentials, 'MNFY|x')
    ).rejects.toMatchObject({ kind: 'rejected' });
  });
});
