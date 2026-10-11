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
  invalidateCalendar,
  invalidateAfterRemoval,
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
    expect(classLevelsQueryOptions(api).queryKey).toEqual(['class-levels']);
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
    expect(plain.queryKey).toEqual([
      'students',
      'list',
      {
        tab: 'active',
        q: undefined,
        campusId: undefined,
        levelId: undefined,
        page: 1,
      },
    ]);
    expect(first.placeholderData).toBeDefined();
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
