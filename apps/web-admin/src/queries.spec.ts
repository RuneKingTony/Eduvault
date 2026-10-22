import { QueryClient, QueryObserver } from '@tanstack/react-query';
import type { Api } from './api';
import { detail } from './test-members';
import {
  ME_PERMISSIONS_KEY,
  campusSummaryQueryOptions,
  classLevelsQueryOptions,
  classQueryOptions,
  classesQueryOptions,
  currentTermQueryOptions,
  daysOffQueryOptions,
  forgetMember,
  adjustmentsQueryOptions,
  approvalsSummaryQueryOptions,
  balancesQueryOptions,
  familyStatementQueryOptions,
  feeTypesQueryOptions,
  invalidateApprovals,
  invalidateFees,
  invalidatePayments,
  ledgerAccountsQueryOptions,
  moneyAccountsQueryOptions,
  paymentsQueryOptions,
  statementQueryOptions,
  invalidateCalendar,
  invalidateAfterRemoval,
  invalidateCharges,
  billingRunQueryOptions,
  billingRunsQueryOptions,
  invoiceQueryOptions,
  invoicesQueryOptions,
  dashboardChargedQueryOptions,
  dashboardTasksQueryOptions,
  feePreviewQueryOptions,
  invalidateClassTeachers,
  invalidateClasses,
  invalidateLevels,
  mePermissionsQueryOptions,
  invalidateRoles,
  memberQueryOptions,
  membersQueryOptions,
  roleQueryOptions,
  rolesQueryOptions,
  schoolRolesQueryOptions,
  schoolYearsQueryOptions,
  teacherCandidatesQueryOptions,
  invalidateStudents,
  studentQueryOptions,
  studentsQueryOptions,
} from './queries';

describe('member removal', () => {
  it('refreshes the list and roles but not the removed member’s own query', async () => {
    const list = vi.fn().mockResolvedValue({ items: [], total: 0 });
    const get = vi.fn().mockResolvedValue(detail());
    const api = { members: { list, get } } as unknown as Api;
    const queryClient = new QueryClient();
    const unsubscribe = [
      new QueryObserver(queryClient, membersQueryOptions(api, {})),
      new QueryObserver(queryClient, memberQueryOptions(api, 'm1')),
    ].map((observer) => observer.subscribe(() => undefined));
    await vi.waitFor(() => {
      expect(queryClient.isFetching()).toBe(0);
      expect(list).toHaveBeenCalledTimes(1);
      expect(get).toHaveBeenCalledTimes(1);
    });

    await invalidateAfterRemoval(queryClient, 'm1');

    expect(list).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenCalledTimes(1);

    for (const stop of unsubscribe) {
      stop();
    }
    forgetMember(queryClient, 'm1');
    expect(
      queryClient.getQueryData(memberQueryOptions(api, 'm1').queryKey)
    ).toBeUndefined();
    expect(
      queryClient.getQueryData(membersQueryOptions(api, {}).queryKey)
    ).toBeDefined();
  });
});

describe('role writes', () => {
  it('refreshes the roles, one role and the members role catalogue', async () => {
    const list = vi.fn().mockResolvedValue({ items: [] });
    const get = vi.fn().mockResolvedValue({ slug: 'cashier' });
    const catalogue = vi.fn().mockResolvedValue([]);
    const api = {
      roles: { list, get },
      members: { roles: catalogue },
    } as unknown as Api;
    const queryClient = new QueryClient();
    const unsubscribe = [
      new QueryObserver(queryClient, rolesQueryOptions(api)),
      new QueryObserver(queryClient, roleQueryOptions(api, 'cashier')),
      new QueryObserver(queryClient, schoolRolesQueryOptions(api)),
    ].map((observer) => observer.subscribe(() => undefined));
    await vi.waitFor(() => {
      expect(queryClient.isFetching()).toBe(0);
      expect(list).toHaveBeenCalledTimes(1);
      expect(get).toHaveBeenCalledTimes(1);
      expect(catalogue).toHaveBeenCalledTimes(1);
    });

    await invalidateRoles(queryClient);

    expect(list).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenCalledTimes(2);
    expect(catalogue).toHaveBeenCalledTimes(2);
    for (const stop of unsubscribe) {
      stop();
    }
  });

  it('keys one role by its slug', () => {
    const api = {} as Api;
    expect(roleQueryOptions(api, 'a').queryKey).not.toEqual(
      roleQueryOptions(api, 'b').queryKey
    );
  });
});

describe('calendar writes', () => {
  it('refreshes the school years, the current term and the days off', async () => {
    const list = vi.fn().mockResolvedValue({ items: [], total: 0 });
    const current = vi.fn().mockResolvedValue({});
    const daysOff = vi.fn().mockResolvedValue([]);
    const api = {
      schoolYears: { list },
      calendar: { current, daysOff },
    } as unknown as Api;
    const queryClient = new QueryClient();
    const unsubscribe = [
      new QueryObserver(queryClient, schoolYearsQueryOptions(api, 1)),
      new QueryObserver(queryClient, currentTermQueryOptions(api)),
      new QueryObserver(queryClient, daysOffQueryOptions(api, 4)),
    ].map((observer) => observer.subscribe(() => undefined));
    await vi.waitFor(() => {
      expect(queryClient.isFetching()).toBe(0);
      expect(list).toHaveBeenCalledTimes(1);
    });

    await invalidateCalendar(queryClient);

    expect(list).toHaveBeenCalledTimes(2);
    expect(current).toHaveBeenCalledTimes(2);
    expect(daysOff).toHaveBeenCalledTimes(2);
    for (const stop of unsubscribe) {
      stop();
    }
  });

  it('keys each page of school years separately', () => {
    const api = { schoolYears: { list: vi.fn() } } as unknown as Api;
    expect(schoolYearsQueryOptions(api, 1).queryKey).not.toEqual(
      schoolYearsQueryOptions(api, 2).queryKey
    );
  });
});

describe('class queries', () => {
  const api = {} as Api;

  it('keys the lists by status and the class and its candidates by id', () => {
    expect(classesQueryOptions(api, 'active').queryKey).not.toEqual(
      classesQueryOptions(api, 'archived').queryKey
    );
    expect(classQueryOptions(api, 'a').queryKey).not.toEqual(
      classQueryOptions(api, 'b').queryKey
    );
    expect(teacherCandidatesQueryOptions(api, 'a').queryKey).not.toEqual(
      classQueryOptions(api, 'a').queryKey
    );
  });

  async function observe() {
    const fns = {
      levels: vi.fn().mockResolvedValue([]),
      classes: vi.fn().mockResolvedValue([]),
      one: vi.fn().mockResolvedValue({}),
      summary: vi.fn().mockResolvedValue([]),
      permissions: vi.fn().mockResolvedValue({}),
    };
    const wired = {
      classLevels: { list: fns.levels },
      classes: { list: fns.classes, get: fns.one },
      campuses: { summary: fns.summary },
      me: { permissions: fns.permissions },
    } as unknown as Api;
    const queryClient = new QueryClient();
    const unsubscribe = [
      new QueryObserver(queryClient, classLevelsQueryOptions(wired)),
      new QueryObserver(queryClient, classesQueryOptions(wired, 'active')),
      new QueryObserver(queryClient, classQueryOptions(wired, 'c1')),
      new QueryObserver(queryClient, campusSummaryQueryOptions(wired)),
      new QueryObserver(queryClient, mePermissionsQueryOptions(wired)),
    ].map((observer) => observer.subscribe(() => undefined));
    await vi.waitFor(() => {
      expect(queryClient.isFetching()).toBe(0);
      expect(fns.permissions).toHaveBeenCalledTimes(1);
    });
    return {
      fns,
      queryClient,
      stop: () => {
        for (const unsubscribeOne of unsubscribe) {
          unsubscribeOne();
        }
      },
    };
  }

  it('refreshes the levels and the classes after a level change', async () => {
    const { fns, queryClient, stop } = await observe();
    await invalidateLevels(queryClient);
    expect(fns.levels).toHaveBeenCalledTimes(2);
    expect(fns.classes).toHaveBeenCalledTimes(2);
    expect(fns.one).toHaveBeenCalledTimes(2);
    expect(fns.summary).toHaveBeenCalledTimes(1);
    stop();
  });

  it('refreshes the classes and the campus counts after a class change', async () => {
    const { fns, queryClient, stop } = await observe();
    await invalidateClasses(queryClient);
    expect(fns.classes).toHaveBeenCalledTimes(2);
    expect(fns.summary).toHaveBeenCalledTimes(2);
    expect(fns.levels).toHaveBeenCalledTimes(1);
    expect(fns.permissions).toHaveBeenCalledTimes(1);
    stop();
  });

  it('refreshes the caller’s own permissions after a class teacher change', async () => {
    const { fns, queryClient, stop } = await observe();
    await invalidateClassTeachers(queryClient);
    expect(fns.classes).toHaveBeenCalledTimes(2);
    expect(fns.permissions).toHaveBeenCalledTimes(2);
    expect(queryClient.getQueryState(ME_PERMISSIONS_KEY)).toBeDefined();
    stop();
  });
});

describe('students queries', () => {
  it('keys the list by every search parameter and keeps the last page while the next loads', () => {
    const api = {} as Api;
    const first = studentsQueryOptions(api, { tab: 'left', q: 'ada', page: 2 });
    const other = studentsQueryOptions(api, { tab: 'left', q: 'ada', page: 3 });
    const plain = studentsQueryOptions(api, {});

    expect(first.queryKey).not.toEqual(other.queryKey);
    expect(plain.queryKey).toEqual(
      studentsQueryOptions(api, { tab: 'active', page: 1 }).queryKey
    );
  });

  it('keeps the last page on screen while the next one loads', async () => {
    const pageTwo = { items: [{ id: 'a' }], total: 30 };
    const list = vi
      .fn()
      .mockResolvedValueOnce(pageTwo)
      .mockReturnValueOnce(new Promise(() => undefined));
    const api = { students: { list } } as unknown as Api;
    const observer = new QueryObserver(
      new QueryClient(),
      studentsQueryOptions(api, { page: 2 })
    );
    const stop = observer.subscribe(() => undefined);
    await vi.waitFor(() => {
      expect(observer.getCurrentResult().data).toEqual(pageTwo);
    });

    observer.setOptions(studentsQueryOptions(api, { page: 3 }));

    expect(observer.getCurrentResult().data).toEqual(pageTwo);
    expect(observer.getCurrentResult().isPlaceholderData).toBe(true);
    stop();
  });

  it('refreshes the list, one student and the guardians after a student write', async () => {
    const list = vi.fn().mockResolvedValue({ items: [], total: 0 });
    const get = vi.fn().mockResolvedValue({ id: 's1' });
    const guardians = vi.fn().mockResolvedValue([]);
    const api = {
      students: { list, get },
      guardians: { list: guardians },
    } as unknown as Api;
    const queryClient = new QueryClient();
    const unsubscribe = [
      new QueryObserver(queryClient, studentsQueryOptions(api, {})),
      new QueryObserver(queryClient, studentQueryOptions(api, 's1')),
    ].map((observer) => observer.subscribe(() => undefined));
    await vi.waitFor(() => {
      expect(queryClient.isFetching()).toBe(0);
      expect(list).toHaveBeenCalledTimes(1);
    });

    await invalidateStudents(queryClient);

    expect(list).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenCalledTimes(2);
    for (const stop of unsubscribe) {
      stop();
    }
  });
});

const observedFamily = async (guardianId: string) => {
  const family = { currency: 'NGN', children: [] };
  const guardianStatement = vi
    .fn()
    .mockResolvedValueOnce(family)
    .mockReturnValueOnce(new Promise(() => undefined));
  const api = {
    studentAccounts: { guardianStatement },
  } as unknown as Api;
  const observer = new QueryObserver(
    new QueryClient(),
    familyStatementQueryOptions(api, guardianId)
  );
  const stop = observer.subscribe(() => undefined);
  await vi.waitFor(() => {
    expect(observer.getCurrentResult().data).toEqual(family);
  });
  return { api, observer, stop };
};

describe('family statement queries', () => {
  it('keeps the family on screen while another term loads', async () => {
    const { api, observer, stop } = await observedFamily('g1');

    observer.setOptions(
      familyStatementQueryOptions(api, 'g1', { termId: 't1' })
    );

    expect(observer.getCurrentResult().isPlaceholderData).toBe(true);
    stop();
  });

  it('never shows one guardian’s family while another guardian’s loads', async () => {
    const { api, observer, stop } = await observedFamily('g1');

    observer.setOptions(familyStatementQueryOptions(api, 'g2'));

    expect(observer.getCurrentResult().data).toBeUndefined();
    stop();
  });
});

describe('billing queries', () => {
  it('asks for the page of rounds, one round, and the charges with their filters', async () => {
    const api = {
      billingRuns: {
        list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
        get: vi.fn().mockResolvedValue({}),
      },
      invoices: {
        list: vi.fn().mockResolvedValue({ items: [] }),
        get: vi.fn().mockResolvedValue({}),
      },
    } as unknown as Api;
    const queryClient = new QueryClient();
    await queryClient.query(billingRunsQueryOptions(api, 2));
    await queryClient.query(billingRunQueryOptions(api, 'r1', 3));
    await queryClient.query(
      invoicesQueryOptions(api, { q: '', kind: 'term', status: 'draft' })
    );
    await queryClient.query(invoiceQueryOptions(api, 'i1'));
    expect(api.billingRuns.list).toHaveBeenCalledWith({ query: { page: 2 } });
    expect(api.billingRuns.get).toHaveBeenCalledWith({
      params: { id: 'r1' },
      query: { page: 3 },
    });
    expect(api.invoices.list).toHaveBeenCalledWith({
      query: { q: undefined, kind: 'term', status: 'draft', page: 1 },
    });
    expect(api.invoices.get).toHaveBeenCalledWith({ params: { id: 'i1' } });
  });

  it('refreshes the rounds, charges, preview, home tasks and charged figure after a change', async () => {
    const api = {
      billingRuns: { list: vi.fn().mockResolvedValue({ items: [], total: 0 }) },
      invoices: { list: vi.fn().mockResolvedValue({ items: [] }) },
      feeLines: { preview: vi.fn().mockResolvedValue({}) },
      dashboard: {
        tasks: vi.fn().mockResolvedValue([]),
        charged: vi.fn().mockResolvedValue(null),
      },
    } as unknown as Api;
    const queryClient = new QueryClient();
    const unsubscribe = [
      new QueryObserver(queryClient, billingRunsQueryOptions(api, 1)),
      new QueryObserver(queryClient, invoicesQueryOptions(api)),
      new QueryObserver(queryClient, feePreviewQueryOptions(api, 't', 's')),
      new QueryObserver(queryClient, dashboardTasksQueryOptions(api)),
      new QueryObserver(queryClient, dashboardChargedQueryOptions(api)),
    ].map((observer) => observer.subscribe(() => undefined));
    await vi.waitFor(() => {
      expect(api.billingRuns.list).toHaveBeenCalledTimes(1);
      expect(api.invoices.list).toHaveBeenCalledTimes(1);
      expect(api.feeLines.preview).toHaveBeenCalledTimes(1);
      expect(api.dashboard.tasks).toHaveBeenCalledTimes(1);
      expect(api.dashboard.charged).toHaveBeenCalledTimes(1);
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    await invalidateCharges(queryClient);

    await vi.waitFor(() => {
      expect(api.billingRuns.list).toHaveBeenCalledTimes(2);
      expect(api.invoices.list).toHaveBeenCalledTimes(2);
      expect(api.feeLines.preview).toHaveBeenCalledTimes(2);
      expect(api.dashboard.tasks).toHaveBeenCalledTimes(2);
      expect(api.dashboard.charged).toHaveBeenCalledTimes(2);
    });
    for (const stop of unsubscribe) {
      stop();
    }
  });
});

async function observeMoney() {
  const fns = {
    balances: vi.fn().mockResolvedValue({ items: [] }),
    statement: vi.fn().mockResolvedValue({ items: [] }),
    payments: vi.fn().mockResolvedValue({ items: [] }),
    adjustments: vi.fn().mockResolvedValue({ items: [] }),
    invoices: vi.fn().mockResolvedValue({ items: [] }),
    moneyAccounts: vi.fn().mockResolvedValue({ items: [] }),
    ledger: vi.fn().mockResolvedValue({ items: [] }),
    approvals: vi.fn().mockResolvedValue({ items: [] }),
    feeTypes: vi.fn().mockResolvedValue([]),
    levels: vi.fn().mockResolvedValue([]),
  };
  const api = {
    studentAccounts: { balances: fns.balances, statement: fns.statement },
    payments: { list: fns.payments },
    adjustments: { list: fns.adjustments },
    invoices: { list: fns.invoices },
    moneyAccounts: { list: fns.moneyAccounts },
    ledgerAccounts: { list: fns.ledger },
    approvals: { summary: fns.approvals },
    feeTypes: { list: fns.feeTypes },
    classLevels: { list: fns.levels },
  } as unknown as Api;
  const queryClient = new QueryClient();
  const unsubscribe = [
    new QueryObserver(queryClient, balancesQueryOptions(api)),
    new QueryObserver(queryClient, statementQueryOptions(api, 's1')),
    new QueryObserver(queryClient, paymentsQueryOptions(api)),
    new QueryObserver(queryClient, adjustmentsQueryOptions(api, 1)),
    new QueryObserver(queryClient, invoicesQueryOptions(api)),
    new QueryObserver(queryClient, moneyAccountsQueryOptions(api)),
    new QueryObserver(queryClient, ledgerAccountsQueryOptions(api)),
    new QueryObserver(queryClient, approvalsSummaryQueryOptions(api)),
    new QueryObserver(queryClient, feeTypesQueryOptions(api)),
    new QueryObserver(queryClient, classLevelsQueryOptions(api)),
  ].map((observer) => observer.subscribe(() => undefined));
  await vi.waitFor(() => {
    expect(queryClient.isFetching()).toBe(0);
    for (const fn of Object.values(fns)) {
      expect(fn).toHaveBeenCalledTimes(1);
    }
  });
  const { feeTypes, levels, ...money } = fns;
  return {
    money: Object.values(money),
    feeTypes,
    levels,
    queryClient,
    stop: () => {
      for (const unsubscribeOne of unsubscribe) {
        unsubscribeOne();
      }
    },
  };
}

describe('money invalidators', () => {
  it('refetches every money view after a payment and leaves unrelated queries alone', async () => {
    const { money, levels, queryClient, stop } = await observeMoney();
    await invalidatePayments(queryClient);
    for (const fn of money) {
      expect(fn).toHaveBeenCalledTimes(2);
    }
    expect(levels).toHaveBeenCalledTimes(1);
    stop();
  });

  it('refetches every money view and the fees after an approval decision, but not unrelated queries', async () => {
    const { money, feeTypes, levels, queryClient, stop } = await observeMoney();
    await invalidateApprovals(queryClient);
    for (const fn of money) {
      expect(fn).toHaveBeenCalledTimes(2);
    }
    expect(feeTypes).toHaveBeenCalledTimes(2);
    expect(levels).toHaveBeenCalledTimes(1);
    stop();
  });

  it('refetches the fees after a fee change and leaves the money views and unrelated queries alone', async () => {
    const { money, feeTypes, levels, queryClient, stop } = await observeMoney();
    await invalidateFees(queryClient);
    expect(feeTypes).toHaveBeenCalledTimes(2);
    for (const fn of money) {
      expect(fn).toHaveBeenCalledTimes(1);
    }
    expect(levels).toHaveBeenCalledTimes(1);
    stop();
  });
});
