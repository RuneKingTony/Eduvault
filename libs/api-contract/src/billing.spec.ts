import {
  BILLING_CAMPUS_REQUIRED_MESSAGE,
  BILLING_LEVEL_REQUIRED_MESSAGE,
  billingRunListQuerySchema,
  billingRunSchema,
  prepareBodySchema,
} from './billing';
import { contract } from './contract';
import { DISCOUNTS_GIVEN_SYSTEM_KEY } from './finance';
import { invoiceListQuerySchema, invoiceSchema } from './invoices';

const id = '0b0c8a8e-8a3e-4c6c-a8c4-0e2f0f6b1f11';
const other = '6f1d2a7c-3b0e-4e53-9c55-0d6a3f5f2b10';

const messages = (result: {
  success: boolean;
  error?: { issues: { message: string }[] };
}) => result.error?.issues.map((issue) => issue.message) ?? [];

describe('prepareBodySchema', () => {
  it('takes a whole-school prepare with no scope id', () => {
    expect(
      prepareBodySchema.safeParse({ termId: id, scope: 'school' }).success
    ).toBe(true);
  });

  it('takes a campus or level prepare with its scope id', () => {
    for (const scope of ['campus', 'level']) {
      expect(
        prepareBodySchema.safeParse({ termId: id, scope, scopeId: other })
          .success
      ).toBe(true);
    }
  });

  it('asks for the campus or the level that is missing', () => {
    expect(
      messages(prepareBodySchema.safeParse({ termId: id, scope: 'campus' }))
    ).toEqual([BILLING_CAMPUS_REQUIRED_MESSAGE]);
    expect(
      messages(prepareBodySchema.safeParse({ termId: id, scope: 'level' }))
    ).toEqual([BILLING_LEVEL_REQUIRED_MESSAGE]);
  });

  it('refuses an unknown scope and a term that is not an id', () => {
    expect(
      prepareBodySchema.safeParse({ termId: id, scope: 'student' }).success
    ).toBe(false);
    expect(
      prepareBodySchema.safeParse({ termId: 'first', scope: 'school' }).success
    ).toBe(false);
  });
});

describe('list queries', () => {
  it('pages rounds ten at a time from the first page', () => {
    expect(billingRunListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 10,
    });
    expect(billingRunListQuerySchema.parse({ page: '3' }).page).toBe(3);
    expect(
      billingRunListQuerySchema.safeParse({ pageSize: '500' }).success
    ).toBe(false);
  });

  it('takes the charge filters as strings from the query string', () => {
    expect(
      invoiceListQuerySchema.parse({
        kind: 'term',
        status: 'draft',
        q: '  Ada ',
        studentId: id,
        termId: other,
        billingRunId: id,
        page: '2',
      })
    ).toEqual({
      kind: 'term',
      status: 'draft',
      q: 'Ada',
      studentId: id,
      termId: other,
      billingRunId: id,
      page: 2,
      pageSize: 10,
    });
  });

  it('refuses an unknown kind, status or student id', () => {
    for (const query of [
      { kind: 'refund' },
      { status: 'sent' },
      { studentId: 'ada' },
    ]) {
      expect(invoiceListQuerySchema.safeParse(query).success).toBe(false);
    }
  });
});

describe('routes', () => {
  it('lists the round routes with the fixed ones before the id route', () => {
    const paths = Object.values(contract.billingRuns).map(
      (route) => route.path
    );
    expect(paths.indexOf('/billing-runs/terms')).toBeLessThan(
      paths.indexOf('/billing-runs/:id')
    );
    expect(contract.billingRuns.prepare.method).toBe('POST');
    expect(contract.billingRuns.issue.path).toBe('/billing-runs/:id/issue');
    expect(contract.billingRuns.cancel.path).toBe('/billing-runs/:id/cancel');
  });

  it('has read-only charge routes', () => {
    expect(
      Object.values(contract.invoices).map((route) => route.method)
    ).toEqual(['GET', 'GET']);
  });

  it('names the discounts account by its system key', () => {
    expect(DISCOUNTS_GIVEN_SYSTEM_KEY).toBe('discounts_given');
  });
});

describe('response shapes', () => {
  const summary = {
    id,
    number: null,
    studentId: other,
    studentName: 'Ada Obi',
    admissionNumber: 'GF/2026/001',
    armName: 'JSS 2A',
    kind: 'term',
    termId: id,
    termName: 'Second term, 2026/2027',
    forText: 'Second term, 2026/2027',
    feeCount: 3,
    totalMinor: 22_600_000,
    status: 'draft',
    date: '2026-10-16',
  };

  it('accepts a draft round with its charges', () => {
    expect(
      billingRunSchema.safeParse({
        id,
        number: 'BR-2026-0002',
        termId: id,
        termName: 'Second term, 2026/2027',
        scope: 'school',
        scopeLabel: 'Whole school',
        chargeCount: 1,
        totalMinor: 22_600_000,
        createdBy: 'Chika Eze',
        issuedAt: null,
        status: 'draft',
        currency: 'NGN',
        createdAt: '2026-10-16T08:00:00+01:00',
        issuedBy: null,
        cancelledBy: null,
        cancelledAt: null,
        sentCount: 0,
        feesChangedSincePrepared: false,
        charges: [summary],
      }).success
    ).toBe(true);
  });

  it('accepts a draft charge with no number and no journal', () => {
    expect(
      invoiceSchema.safeParse({
        currency: 'NGN',
        id,
        number: null,
        kind: 'term',
        status: 'draft',
        student: {
          id: other,
          name: 'Ada Obi',
          admissionNumber: 'GF/2026/001',
          armName: null,
        },
        termId: id,
        termName: 'Second term, 2026/2027',
        campusId: other,
        campusName: 'Lekki',
        lines: [],
        totalMinor: 0,
        broughtForwardMinor: 0,
        dueAtIssueMinor: 0,
        balanceTodayMinor: 0,
        billingRun: null,
        createdAt: '2026-10-16T08:00:00+01:00',
        issuedAt: null,
        issuedBy: null,
        chargedTo: null,
        journal: null,
        source: null,
      }).success
    ).toBe(true);
  });
});
