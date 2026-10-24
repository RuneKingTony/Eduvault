import { contract } from './contract';
import {
  FEE_COPY_NO_SOURCE_MESSAGE,
  FEE_LINE_AMOUNT_MESSAGE,
  FEE_LINE_NAME_REQUIRED,
  FEE_OPT_IN_LIMIT,
  FEE_TYPE_NAME_REQUIRED,
  JOURNAL_RANGE_MESSAGE,
  MONEY_ACCOUNT_LAST4_MESSAGE,
  MONEY_ACCOUNT_NAME_REQUIRED,
  OPENING_AMOUNT_MESSAGE,
  cashBookQuerySchema,
  copyFeeLinesSchema,
  createFeeLineSchema,
  createFeeTypeSchema,
  createLedgerAccountSchema,
  createMoneyAccountSchema,
  feeCopyEmptySourceMessage,
  feeCopyQuerySchema,
  feeCopyTargetNotEmptyMessage,
  feeGridQuerySchema,
  feeLineDuplicateMessage,
  feeLineListQuerySchema,
  feeTermLabel,
  journalQuerySchema,
  openingBalancesSchema,
  setFeeOptInsSchema,
  setFeeOptionSchema,
  updateFeeLineSchema,
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
  it('takes a bank or cash account for a campus or the whole school', () => {
    expect(createMoneyAccountSchema.safeParse(account).success).toBe(true);
    expect(
      createMoneyAccountSchema.safeParse({
        name: 'Petty cash',
        kind: 'cash',
        campusId: id,
      }).success
    ).toBe(true);
  });

  it('refuses the gateway kind, an unknown kind and a missing campus', () => {
    for (const kind of ['pos', 'gateway', 'wallet', '']) {
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

const feeLine = {
  termId: id,
  classLevelId: other,
  feeTypeId: id,
  campusId: null,
  name: 'Tuition',
  amountMinor: 1_500_000,
};

describe('createFeeLineSchema', () => {
  it('defaults to everyone and not optional', () => {
    expect(createFeeLineSchema.parse(feeLine)).toMatchObject({
      appliesTo: 'all',
      isOptional: false,
    });
  });

  it('trims the name and refuses a blank one', () => {
    expect(
      createFeeLineSchema.parse({ ...feeLine, name: '  Bus  ' }).name
    ).toBe('Bus');
    expect(
      issueMessages(createFeeLineSchema.safeParse({ ...feeLine, name: ' ' }))
    ).toEqual([FEE_LINE_NAME_REQUIRED]);
  });

  it('refuses a zero, negative, fractional or missing amount with one message', () => {
    for (const amountMinor of [0, -100, 12.5, undefined]) {
      expect(
        issueMessages(
          createFeeLineSchema.safeParse({ ...feeLine, amountMinor })
        )
      ).toEqual([FEE_LINE_AMOUNT_MESSAGE]);
    }
  });

  it('refuses an unknown appliesTo', () => {
    expect(
      createFeeLineSchema.safeParse({ ...feeLine, appliesTo: 'staff' }).success
    ).toBe(false);
  });
});

describe('updateFeeLineSchema', () => {
  it('takes only a positive amount', () => {
    expect(updateFeeLineSchema.safeParse({ amountMinor: 100 }).success).toBe(
      true
    );
    expect(updateFeeLineSchema.safeParse({ amountMinor: 0 }).success).toBe(
      false
    );
    expect(
      updateFeeLineSchema.safeParse({ amountMinor: 100, name: 'x' }).success
    ).toBe(false);
  });
});

describe('createFeeTypeSchema', () => {
  it('trims the name and refuses a blank one', () => {
    expect(createFeeTypeSchema.parse({ name: ' Sports levy ' }).name).toBe(
      'Sports levy'
    );
    expect(issueMessages(createFeeTypeSchema.safeParse({ name: '' }))).toEqual([
      FEE_TYPE_NAME_REQUIRED,
    ]);
  });
});

describe('fee query schemas', () => {
  it('reads includeRetired from a query string and defaults it to true', () => {
    expect(feeLineListQuerySchema.parse({ termId: id }).includeRetired).toBe(
      true
    );
    expect(
      feeLineListQuerySchema.parse({ termId: id, includeRetired: 'false' })
        .includeRetired
    ).toBe(false);
  });

  it('needs a group for the grid', () => {
    expect(feeGridQuerySchema.safeParse({ termId: id }).success).toBe(false);
    expect(
      feeGridQuerySchema.safeParse({ termId: id, group: 'school' }).success
    ).toBe(true);
  });
});

describe('setFeeOptionSchema', () => {
  it('needs a boolean opt-in', () => {
    expect(setFeeOptionSchema.safeParse({ optedIn: true }).success).toBe(true);
    expect(setFeeOptionSchema.safeParse({ optedIn: 'yes' }).success).toBe(
      false
    );
  });
});

describe('setFeeOptInsSchema', () => {
  const body = { termId: id, studentIds: [id], optedIn: true };

  it('takes one to 200 unique student ids', () => {
    expect(setFeeOptInsSchema.safeParse(body).success).toBe(true);
    const full = Array.from({ length: FEE_OPT_IN_LIMIT }, () =>
      crypto.randomUUID()
    );
    expect(
      setFeeOptInsSchema.safeParse({ ...body, studentIds: full }).success
    ).toBe(true);
  });

  it('rejects an empty list', () => {
    expect(
      setFeeOptInsSchema.safeParse({ ...body, studentIds: [] }).success
    ).toBe(false);
  });

  it('rejects more than 200 ids', () => {
    const tooMany = Array.from({ length: FEE_OPT_IN_LIMIT + 1 }, () =>
      crypto.randomUUID()
    );
    expect(
      setFeeOptInsSchema.safeParse({ ...body, studentIds: tooMany }).success
    ).toBe(false);
  });

  it('rejects duplicate ids', () => {
    expect(
      setFeeOptInsSchema.safeParse({ ...body, studentIds: [id, id] }).success
    ).toBe(false);
  });
});

describe('feeLineDuplicateMessage', () => {
  it('names the fee type, level and campus, or every campus', () => {
    const parts = { feeType: 'Tuition', level: 'JSS 2', campus: null };
    expect(feeLineDuplicateMessage(parts)).toBe(
      'There is already a Tuition fee for JSS 2 on every campus this term. Change its amount instead.'
    );
    expect(feeLineDuplicateMessage({ ...parts, campus: 'Ikeja' })).toContain(
      'on Ikeja this term'
    );
  });

  it('does not repeat fee when the fee type already ends in it', () => {
    expect(
      feeLineDuplicateMessage({
        feeType: 'Laboratory fee',
        level: 'JSS 2',
        campus: null,
      })
    ).toBe(
      'There is already a Laboratory fee for JSS 2 on every campus this term. Change its amount instead.'
    );
  });
});

describe('the fee copy messages', () => {
  it('label a term by name and school year', () => {
    expect(
      feeTermLabel({ name: 'Third term', schoolYearName: '2026/2027' })
    ).toBe('Third term, 2026/2027');
  });

  it('name the term in each refusal', () => {
    const label = 'Third term, 2026/2027';
    expect(FEE_COPY_NO_SOURCE_MESSAGE).toBe(
      'There is no earlier term to copy fees from.'
    );
    expect(feeCopyEmptySourceMessage(label)).toBe(
      'Third term, 2026/2027 has no fees to copy.'
    );
    expect(feeCopyTargetNotEmptyMessage(label)).toBe(
      'Third term, 2026/2027 already has fees. Change them one at a time instead.'
    );
  });
});

describe('the fee copy schemas', () => {
  it('take a term id in the query and the body', () => {
    expect(feeCopyQuerySchema.safeParse({ termId: id }).success).toBe(true);
    expect(feeCopyQuerySchema.safeParse({}).success).toBe(false);
    expect(copyFeeLinesSchema.safeParse({ termId: id }).success).toBe(true);
    expect(copyFeeLinesSchema.safeParse({}).success).toBe(false);
  });

  it('refuses extra keys in the body', () => {
    expect(
      copyFeeLinesSchema.safeParse({ termId: id, fromTermId: other }).success
    ).toBe(false);
  });
});

describe('the fee routes', () => {
  it('sit under the fee line, fee type and student option paths', () => {
    expect(contract.feeLines.grid.path).toBe('/fee-lines/grid');
    expect(contract.feeLines.copySource.path).toBe('/fee-lines/copy-source');
    expect(contract.feeLines.copy.method).toBe('POST');
    expect(contract.feeLines.retire.method).toBe('POST');
    expect(contract.feeTypes.create.path).toBe('/fee-types');
    expect(contract.feeOptions.set.method).toBe('PUT');
  });
});
