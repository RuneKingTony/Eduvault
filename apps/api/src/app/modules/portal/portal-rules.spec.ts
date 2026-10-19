import type { PortalChild } from '@eduvault/api-contract';
import type { OwnStatement } from '../student-account/student-account.service';
import {
  firstNameOf,
  portalKindOf,
  realEmail,
  toPortalFamilyStatement,
  toPortalStatement,
} from './portal-rules';
import type { PortalStudentRecord } from './portal.repository';

describe('portalKindOf', () => {
  it('is student when the caller has a student row, else guardian', () => {
    expect(portalKindOf(true)).toBe('student');
    expect(portalKindOf(false)).toBe('guardian');
  });
});

describe('realEmail', () => {
  it('hides the placeholder address of a username login', () => {
    expect(realEmail('0b0c8a8e@users.eduvault.invalid')).toBeNull();
    expect(realEmail('0B0C8A8E@USERS.EDUVAULT.INVALID')).toBeNull();
  });

  it('keeps a real address', () => {
    expect(realEmail('ngozi@example.com')).toBe('ngozi@example.com');
  });
});

describe('firstNameOf', () => {
  it('prefers the student’s own first name', () => {
    expect(firstNameOf('Mary Jane Okeke', 'Mary Jane')).toBe('Mary Jane');
  });

  it('takes the first word of a guardian’s name', () => {
    expect(firstNameOf('  Ngozi Okeke ', null)).toBe('Ngozi');
    expect(firstNameOf('Ngozi', null)).toBe('Ngozi');
  });
});

const record: PortalStudentRecord = {
  id: 'ada',
  firstName: 'Ada',
  lastName: 'Okeke',
  admissionNumber: 'GF-0001',
  dateOfBirth: '2014-05-02',
  className: 'JSS 1 Gold',
  campusName: 'Lekki',
  campusId: 'lekki',
  armId: 'arm',
  username: 'gf-0001',
  archived: true,
};

const own: OwnStatement = {
  currency: 'NGN',
  totals: {
    balanceMinor: 6_000_000,
    totalMinor: 10_000_000,
    paidMinor: 4_000_000,
    reducedMinor: 0,
  },
  rows: [
    {
      entryId: 'entry-1',
      effectiveOn: '2026-09-01',
      reference: 'RCT-0001',
      description: 'Payment RCT-0001 from Ngozi (Bank transfer)',
      status: 'paid',
      amountMinor: 4_000_000,
      link: { type: 'payment', id: 'payment-1' },
    },
  ],
  total: 1,
  page: 1,
  pageSize: 10,
  unpaid: [
    {
      reference: 'INV-0001',
      outstandingMinor: 6_000_000,
      link: { type: 'invoice', id: 'invoice-1' },
    },
  ],
  term: null,
  broughtForward: null,
  closingMinor: null,
  termOptions: [],
};

describe('toPortalStatement', () => {
  it('names the student from the portal record, archived flag included', () => {
    expect(toPortalStatement(record, own).student).toEqual({
      id: 'ada',
      name: 'Ada Okeke',
      admissionNumber: 'GF-0001',
      className: 'JSS 1 Gold',
      campusName: 'Lekki',
      archived: true,
    });
  });

  it('drops the reference, link and entry id from every row', () => {
    const { rows } = toPortalStatement(record, own);
    expect(rows).toEqual([
      {
        effectiveOn: '2026-09-01',
        description: 'Payment RCT-0001 from Ngozi (Bank transfer)',
        status: 'paid',
        amountMinor: 4_000_000,
      },
    ]);
  });

  it('passes the chosen term, brought forward, closing and options through', () => {
    const term = {
      id: 'term-1',
      label: 'First term, 2026/2027',
      fromOn: '2026-09-01',
      toOn: null,
    };
    const filtered = {
      ...own,
      term,
      broughtForward: { amountMinor: 1500 },
      closingMinor: 6_000_000,
      termOptions: [{ id: 'term-1', label: term.label }],
    };
    expect(toPortalStatement(record, filtered)).toMatchObject({
      term,
      broughtForward: { amountMinor: 1500 },
      closingMinor: 6_000_000,
      termOptions: [{ id: 'term-1', label: term.label }],
    });
  });

  it('leaves the term fields null for the whole history', () => {
    expect(toPortalStatement(record, own)).toMatchObject({
      term: null,
      broughtForward: null,
      closingMinor: null,
      termOptions: [],
    });
  });

  it('keeps the charge number and amount of an unpaid charge and drops its link', () => {
    expect(toPortalStatement(record, own).unpaid).toEqual([
      { number: 'INV-0001', outstandingMinor: 6_000_000 },
    ]);
  });

  it('carries the totals and paging across unchanged', () => {
    expect(toPortalStatement(record, own)).toMatchObject({
      currency: 'NGN',
      totals: own.totals,
      total: 1,
      page: 1,
      pageSize: 10,
    });
  });
});

const child = (
  id: string,
  overrides: Partial<PortalChild> = {}
): PortalChild => ({
  id,
  firstName: id,
  lastName: 'Okeke',
  className: null,
  campusName: 'Lekki',
  archived: false,
  ...overrides,
});

const noTerm = { term: null, termOptions: [] };

describe('toPortalFamilyStatement', () => {
  it('keeps ₦100,000 owed and ₦20,000 credit apart rather than netting them', () => {
    const family = toPortalFamilyStatement(
      [child('ada'), child('chidi'), child('tobi')],
      {
        currency: 'NGN',
        balances: new Map([
          ['ada', 6_000_000],
          ['chidi', 4_000_000],
          ['tobi', -2_000_000],
        ]),
        ...noTerm,
      }
    );
    expect(family.totalOwedMinor).toBe(10_000_000);
    expect(family.creditMinor).toBe(2_000_000);
    expect(family.children.map((row) => row.balanceMinor)).toEqual([
      6_000_000, 4_000_000, -2_000_000,
    ]);
  });

  it('lists a left child with debt as archived with their balance', () => {
    const family = toPortalFamilyStatement([child('ada', { archived: true })], {
      currency: 'NGN',
      balances: new Map([['ada', 300_000]]),
      ...noTerm,
    });
    expect(family.children).toEqual([
      {
        studentId: 'ada',
        name: 'ada Okeke',
        className: null,
        campusName: 'Lekki',
        archived: true,
        balanceMinor: 300_000,
      },
    ]);
    expect(family.totalOwedMinor).toBe(300_000);
  });

  it('is empty with zero totals when no child is in scope', () => {
    expect(
      toPortalFamilyStatement([], {
        currency: 'NGN',
        balances: new Map(),
        ...noTerm,
      })
    ).toEqual({
      currency: 'NGN',
      totalOwedMinor: 0,
      creditMinor: 0,
      children: [],
      term: null,
      termOptions: [],
    });
  });

  it('carries the term and its options without changing the totals', () => {
    const account = {
      currency: 'NGN',
      balances: new Map([
        ['ada', 6_000_000],
        ['tobi', -2_000_000],
      ]),
    };
    const children = [child('ada'), child('tobi')];
    const term = {
      id: 'first',
      label: 'First term, 2026/2027',
      fromOn: '2026-09-01',
      toOn: null,
    };
    const termOptions = [{ id: 'first', label: 'First term, 2026/2027' }];

    const whole = toPortalFamilyStatement(children, { ...account, ...noTerm });
    const filtered = toPortalFamilyStatement(children, {
      ...account,
      term,
      termOptions,
    });

    expect(filtered).toMatchObject({ term, termOptions });
    expect(filtered.totalOwedMinor).toBe(whole.totalOwedMinor);
    expect(filtered.creditMinor).toBe(whole.creditMinor);
    expect(filtered.children).toEqual(whole.children);
  });
});
