import { contract } from './contract';
import {
  JOURNAL_RANGE_MESSAGE,
  MONEY_ACCOUNT_LAST4_MESSAGE,
  MONEY_ACCOUNT_NAME_REQUIRED,
  OPENING_AMOUNT_MESSAGE,
  cashBookQuerySchema,
  createLedgerAccountSchema,
  createMoneyAccountSchema,
  journalQuerySchema,
  openingBalancesSchema,
  updateMoneyAccountSchema,
} from './finance';

const id = '0b0c8a8e-8a3e-4c6c-a8c4-0e2f0f6b1f11';
const other = '6f1d2a7c-3b0e-4e53-9c55-0d6a3f5f2b10';

const account = {
  name: 'GTBank current',
  kind: 'bank',
  bankName: 'GTBank',
  last4: '4417',
  campusId: null,
};

const issueMessages = (result: {
  success: boolean;
  error?: { issues: { message: string }[] };
}) => result.error?.issues.map((issue) => issue.message) ?? [];

describe('createMoneyAccountSchema', () => {
  it('takes a bank, pos or cash account for a campus or the whole school', () => {
    expect(createMoneyAccountSchema.safeParse(account).success).toBe(true);
    expect(
      createMoneyAccountSchema.safeParse({
        name: 'Moniepoint POS',
        kind: 'pos',
        campusId: id,
      }).success
    ).toBe(true);
    expect(
      createMoneyAccountSchema.safeParse({
        name: 'Petty cash',
        kind: 'cash',
        campusId: id,
      }).success
    ).toBe(true);
  });

  it('refuses the gateway kind, an unknown kind and a missing campus', () => {
    for (const kind of ['gateway', 'wallet', '']) {
      expect(
        createMoneyAccountSchema.safeParse({ ...account, kind }).success
      ).toBe(false);
    }
    expect(
      createMoneyAccountSchema.safeParse({ name: 'X', kind: 'cash' }).success
    ).toBe(false);
  });

  it('refuses a blank name and trims the rest', () => {
    const blank = createMoneyAccountSchema.safeParse({
      ...account,
      name: '  ',
    });
    expect(blank.success).toBe(false);
    expect(issueMessages(blank)).toContain(MONEY_ACCOUNT_NAME_REQUIRED);
    expect(
      createMoneyAccountSchema.parse({ ...account, name: '  GTBank  ' }).name
    ).toBe('GTBank');
    expect(
      createMoneyAccountSchema.safeParse({ ...account, name: 'a'.repeat(81) })
        .success
    ).toBe(false);
  });

  it('takes exactly four digits for the last 4', () => {
    expect(
      createMoneyAccountSchema.safeParse({ ...account, last4: '0007' }).success
    ).toBe(true);
    for (const last4 of ['12a', '123', '12345', '12 4', '']) {
      const result = createMoneyAccountSchema.safeParse({ ...account, last4 });
      expect(result.success).toBe(false);
      expect(issueMessages(result)).toContain(MONEY_ACCOUNT_LAST4_MESSAGE);
    }
  });
});

describe('updateMoneyAccountSchema', () => {
  it('takes a name, a bank name, a last 4 or null, and a retire flag', () => {
    expect(updateMoneyAccountSchema.parse({})).toEqual({});
    expect(
      updateMoneyAccountSchema.parse({
        name: ' Main ',
        bankName: 'GTBank',
        last4: null,
        retired: true,
      })
    ).toEqual({
      name: 'Main',
      bankName: 'GTBank',
      last4: null,
      retired: true,
    });
  });

  it('refuses kind and campus, which never change', () => {
    expect(updateMoneyAccountSchema.safeParse({ kind: 'cash' }).success).toBe(
      false
    );
    expect(updateMoneyAccountSchema.safeParse({ campusId: id }).success).toBe(
      false
    );
  });

  it('refuses a blank name and a bad last 4', () => {
    expect(updateMoneyAccountSchema.safeParse({ name: '' }).success).toBe(
      false
    );
    expect(updateMoneyAccountSchema.safeParse({ last4: '12a' }).success).toBe(
      false
    );
  });
});

describe('createLedgerAccountSchema', () => {
  it('takes a parent id and a trimmed name', () => {
    expect(
      createLedgerAccountSchema.parse({ parentId: id, name: ' Sports ' })
    ).toEqual({ parentId: id, name: 'Sports' });
  });

  it('refuses a blank name and a parent that is not an id', () => {
    expect(
      createLedgerAccountSchema.safeParse({ parentId: id, name: ' ' }).success
    ).toBe(false);
    expect(
      createLedgerAccountSchema.safeParse({ parentId: '4000', name: 'Sports' })
        .success
    ).toBe(false);
  });
});

describe('journalQuerySchema', () => {
  it('defaults to page 1 of 10 and takes dates and a kind', () => {
    expect(journalQuerySchema.parse({})).toEqual({ page: 1, pageSize: 10 });
    expect(
      journalQuerySchema.parse({
        from: '2026-09-01',
        to: '2026-09-30',
        kind: 'opening',
        page: '2',
      })
    ).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
      kind: 'opening',
      page: 2,
      pageSize: 10,
    });
  });

  it('refuses a bad date, an unknown kind and a From after the To', () => {
    expect(journalQuerySchema.safeParse({ from: '01/09/2026' }).success).toBe(
      false
    );
    expect(journalQuerySchema.safeParse({ to: '2026-13-01' }).success).toBe(
      false
    );
    expect(journalQuerySchema.safeParse({ kind: 'gift' }).success).toBe(false);
    const reversed = journalQuerySchema.safeParse({
      from: '2026-10-02',
      to: '2026-10-01',
    });
    expect(reversed.success).toBe(false);
    expect(issueMessages(reversed)).toContain(JOURNAL_RANGE_MESSAGE);
    expect(
      journalQuerySchema.safeParse({ from: '2026-10-01', to: '2026-10-01' })
        .success
    ).toBe(true);
  });
});

describe('cashBookQuerySchema', () => {
  it('defaults to page 1 of 10 and caps the page size at 50', () => {
    expect(cashBookQuerySchema.parse({})).toEqual({ page: 1, pageSize: 10 });
    expect(cashBookQuerySchema.safeParse({ pageSize: '51' }).success).toBe(
      false
    );
    expect(cashBookQuerySchema.safeParse({ page: '0' }).success).toBe(false);
  });
});

describe('openingBalancesSchema', () => {
  const debt = {
    studentId: id,
    amountMinor: 1_200_000,
    direction: 'debt',
    memo: 'Opening balance',
    effectiveOn: '2026-09-01',
  };

  it('takes student balances and money account balances', () => {
    const parsed = openingBalancesSchema.parse({
      items: [debt, { ...debt, studentId: other, direction: 'credit' }],
      moneyAccounts: [
        {
          moneyAccountId: id,
          amountMinor: 9_500_000,
          effectiveOn: '2026-09-01',
        },
      ],
    });
    expect(parsed.items).toHaveLength(2);
    expect(parsed.moneyAccounts).toHaveLength(1);
  });

  it('defaults a missing list to empty but needs one balance', () => {
    expect(
      openingBalancesSchema.parse({ items: [debt] }).moneyAccounts
    ).toEqual([]);
    expect(openingBalancesSchema.safeParse({}).success).toBe(false);
    expect(openingBalancesSchema.safeParse({ items: [] }).success).toBe(false);
  });

  it('refuses zero, negative and fractional amounts', () => {
    for (const amountMinor of [0, -5, 10.5]) {
      const result = openingBalancesSchema.safeParse({
        items: [{ ...debt, amountMinor }],
      });
      expect(result.success).toBe(false);
    }
    expect(
      issueMessages(
        openingBalancesSchema.safeParse({
          items: [{ ...debt, amountMinor: 0 }],
        })
      )
    ).toContain(OPENING_AMOUNT_MESSAGE);
  });

  it('refuses a bad direction and a bad date', () => {
    expect(
      openingBalancesSchema.safeParse({
        items: [{ ...debt, direction: 'owed' }],
      }).success
    ).toBe(false);
    expect(
      openingBalancesSchema.safeParse({
        items: [{ ...debt, effectiveOn: 'yesterday' }],
      }).success
    ).toBe(false);
  });
});

describe('the finance routes', () => {
  it('serves the money accounts, ledger accounts, journal and opening balances', () => {
    expect(contract.moneyAccounts.list.path).toBe('/finance/money-accounts');
    expect(contract.moneyAccounts.cashBook.path).toBe(
      '/finance/money-accounts/:id/cash-book'
    );
    expect(contract.moneyAccounts.create.method).toBe('POST');
    expect(contract.moneyAccounts.update.method).toBe('PATCH');
    expect(contract.ledgerAccounts.list.path).toBe('/finance/ledger-accounts');
    expect(contract.journal.list.path).toBe('/finance/journal');
    expect(contract.openingBalances.post.path).toBe(
      '/finance/opening-balances'
    );
    expect(contract.dashboard.money.path).toBe('/dashboard/money');
  });

  it('has no delete route for money rows', () => {
    const methods = [
      ...Object.values(contract.moneyAccounts),
      ...Object.values(contract.ledgerAccounts),
      ...Object.values(contract.journal),
      ...Object.values(contract.openingBalances),
    ].map((route) => route.method);
    expect(methods).not.toContain('DELETE');
  });
});
