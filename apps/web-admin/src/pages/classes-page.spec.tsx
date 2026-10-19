import { fireEvent, screen, within } from '@testing-library/react';
import type {
  ClassStatus,
  ClassSummary,
  MePermissions,
} from '@eduvault/api-contract';
import { toPermissionMap } from '@eduvault/policy';
import { currentCalendar, noCalendar } from '../test-calendar';
import { testId } from '../test-api';
import { IDS, classSummary, teacher } from '../test-classes';
import {
  actingAccess,
  fakeAccess,
  renderWithApi,
  starterAccess,
} from '../test-utils';
import { ClassesPage, describeClasses } from './classes-page';

vi.mock('../components/no-current-term-callout', () => ({
  NoCurrentTermCallout: () => <p>Create the first school year</p>,
}));

type Access = MePermissions;

const SS3_GOLD = testId(0x2_20_01);
const RUBY_ID = testId(0x2_20_02);

const ACTIVE = [
  classSummary({
    id: IDS.gold,
    displayName: 'JSS 1 Gold',
    name: 'Gold',
    classTeachers: [teacher('Ayo Bassey')],
  }),
  classSummary({
    id: IDS.silver,
    displayName: 'JSS 1 Silver',
    name: 'Silver',
    campus: { id: IDS.ikeja, name: 'Ikeja' },
    classTeachers: [teacher('Ayo Bassey'), teacher('Claire Ade', 'assistant')],
  }),
  classSummary({
    id: SS3_GOLD,
    displayName: 'SS 3 Gold',
    name: 'Gold',
    level: { id: IDS.ss3, code: 'SS3', name: 'SS 3' },
    studentCount: 4,
  }),
];

const RUBY = classSummary({
  id: RUBY_ID,
  displayName: 'JSS 1 Ruby',
  name: 'Ruby',
  retiredAt: '2026-07-24T09:00:00.000Z',
});

interface Options {
  access?: Access;
  byStatus?: Partial<Record<ClassStatus, ClassSummary[]>>;
  calendar?: ReturnType<typeof currentCalendar>;
  status?: ClassStatus;
}

function setup({
  access = starterAccess('administrator'),
  byStatus = {},
  calendar = currentCalendar(),
  status = 'active',
}: Options = {}) {
  const lists: Record<ClassStatus, ClassSummary[]> = {
    active: ACTIVE,
    archived: [RUBY],
    all: [...ACTIVE, RUBY],
    ...byStatus,
  };
  const api = {
    classes: {
      list: vi.fn(({ query }: { query: { status: ClassStatus } }) =>
        Promise.resolve(lists[query.status])
      ),
    },
    calendar: { current: vi.fn().mockResolvedValue(calendar) },
    classLevels: { list: vi.fn().mockResolvedValue([]) },
    campuses: { list: vi.fn().mockResolvedValue([]) },
    me: { get: vi.fn().mockResolvedValue({ activeCampusId: null }) },
  };
  const handlers = { onStatusChange: vi.fn(), onOpenClass: vi.fn() };
  renderWithApi(<ClassesPage status={status} {...handlers} />, api, access);
  return { api, ...handlers };
}

const cardOf = async (title: string) => {
  const heading = await screen.findByText(title, {
    selector: '[data-slot="card-title"]',
  });
  const card = heading.closest<HTMLElement>('[data-slot="card"]');
  if (card === null) {
    throw new Error(`no card for ${title}`);
  }
  return within(card);
};

describe('describeClasses', () => {
  it('counts active classes in the year, or names the classes a scoped caller teaches', () => {
    expect(describeClasses(ACTIVE, false, '2026/2027')).toBe(
      '3 classes in 2026/2027'
    );
    expect(describeClasses(ACTIVE.slice(0, 1), false, '2026/2027')).toBe(
      '1 class in 2026/2027'
    );
    expect(describeClasses(ACTIVE, false, null)).toBe('3 classes');
    expect(describeClasses(ACTIVE.slice(0, 2), true, '2026/2027')).toBe(
      'Classes you teach: JSS 1 Gold, JSS 1 Silver'
    );
    expect(describeClasses([], true, '2026/2027')).toBeNull();
  });
});

describe('ClassesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('counts only active classes in the description even while showing archived ones', async () => {
    setup({ status: 'archived' });
    expect(
      await screen.findByText('3 classes in 2026/2027')
    ).toBeInTheDocument();
    const card = await cardOf('JSS 1');
    expect(card.getByText('JSS 1 Ruby')).toBeInTheDocument();
    expect(card.queryByText('JSS 1 Gold')).not.toBeInTheDocument();
  });

  it('shows a card per level in order with its classes, campus, teachers, students and status', async () => {
    setup();
    expect(
      await screen.findByText('3 classes in 2026/2027')
    ).toBeInTheDocument();
    const titles = screen
      .getAllByText(/^(JSS 1|SS 3)$/, { selector: '[data-slot="card-title"]' })
      .map((title) => title.textContent);
    expect(titles).toEqual(['JSS 1', 'SS 3']);

    const jss = await cardOf('JSS 1');
    expect(jss.getByText('2 classes')).toBeInTheDocument();
    for (const header of ['Class', 'Class teacher', 'Students', 'Status']) {
      expect(
        jss.getByRole('columnheader', { name: header })
      ).toBeInTheDocument();
    }
    const gold = within(
      jss.getByText('JSS 1 Gold').closest('tr') as HTMLElement
    );
    expect(gold.getByText('Lekki')).toBeInTheDocument();
    expect(gold.getByText('Ayo Bassey')).toBeInTheDocument();
    expect(gold.getByText('Active')).toBeInTheDocument();
    const last = await cardOf('SS 3');
    expect(last.getByText('1 class')).toBeInTheDocument();
    expect(last.getByText('Not assigned')).toBeInTheDocument();
    expect(last.getByText('4')).toHaveClass('text-right');
  });

  it('shows several teachers as a count with the roles in a tooltip', async () => {
    setup();
    const silver = within(
      (await screen.findByText('JSS 1 Silver')).closest('tr') as HTMLElement
    );
    expect(silver.getByText('Ikeja')).toBeInTheDocument();
    fireEvent.focus(silver.getByRole('button', { name: '2 teachers' }));
    expect(
      (await screen.findAllByText('Ayo Bassey (Lead), Claire Ade (Assistant)'))
        .length
    ).toBeGreaterThan(0);
  });

  it('shows Archived on an archived class', async () => {
    setup({ status: 'all' });
    const row = within(
      (await screen.findByText('JSS 1 Ruby')).closest('tr') as HTMLElement
    );
    expect(row.getByText('Archived')).toBeInTheDocument();
  });

  it('defaults the Show filter to Active classes and reports a change', async () => {
    const { onStatusChange } = setup();
    const show = await screen.findByLabelText<HTMLSelectElement>('Show');
    expect(show).toHaveValue('active');
    expect(
      within(show)
        .getAllByRole('option')
        .map((option) => option.textContent)
    ).toEqual(['Active classes', 'Archived', 'All']);
    fireEvent.change(show, { target: { value: 'archived' } });
    expect(onStatusChange).toHaveBeenCalledWith('archived');
  });

  it('explains the classes for a school-wide caller in the tooltip', async () => {
    setup();
    fireEvent.focus(
      await screen.findByRole('button', { name: 'About classes' })
    );
    expect(
      (
        await screen.findAllByText(
          'A level is a year group, like JSS 1. Every campus uses the same levels. A class belongs to one campus and carries over each school year. Classes are archived, never deleted.'
        )
      ).length
    ).toBeGreaterThan(0);
  });

  describe('for a class-scoped teacher', () => {
    const scoped = fakeAccess({
      permissions: toPermissionMap(['class:read', 'student:read']),
      campusScope: [IDS.lekki],
      classScope: [IDS.gold],
    });

    it('describes the classes they teach, hides the Show filter and the New class button', async () => {
      setup({
        access: scoped,
        byStatus: { active: ACTIVE.slice(0, 1) },
      });
      expect(
        await screen.findByText('Classes you teach: JSS 1 Gold')
      ).toBeInTheDocument();
      expect(screen.queryByLabelText('Show')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'New class' })
      ).not.toBeInTheDocument();
      fireEvent.focus(screen.getByRole('button', { name: 'About classes' }));
      expect(
        (
          await screen.findAllByText(
            'Class scope: you see only the classes you teach or are class teacher of.'
          )
        ).length
      ).toBeGreaterThan(0);
    });

    it('shows the empty state instead of an empty "Classes you teach:" line', async () => {
      setup({ access: scoped, byStatus: { active: [] } });
      expect(
        await screen.findByText('No classes in your scope')
      ).toBeInTheDocument();
      expect(screen.queryByText(/Classes you teach/)).not.toBeInTheDocument();
    });
  });

  describe('New class', () => {
    it('is offered to a class:create holder and opens the sheet', async () => {
      setup();
      fireEvent.click(await screen.findByRole('button', { name: 'New class' }));
      expect(
        await screen.findByText('New class', {
          selector: '[data-slot="sheet-title"]',
        })
      ).toBeInTheDocument();
    });

    it.each([
      ['a reader with class:read only', starterAccess('principal')],
      ['a read-only acting super admin', actingAccess(false)],
    ])('is hidden for %s', async (_label, access) => {
      setup({ access });
      expect(
        await screen.findByText('3 classes in 2026/2027')
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'New class' })
      ).not.toBeInTheDocument();
    });
  });

  it('opens a class from its row and from its name', async () => {
    const { onOpenClass } = setup();
    const name = await screen.findByRole('button', { name: 'JSS 1 Gold' });
    fireEvent.click(name);
    expect(onOpenClass).toHaveBeenCalledWith(IDS.gold);
    onOpenClass.mockClear();
    const row = (await screen.findByText('JSS 1 Silver')).closest('tr');
    fireEvent.click(row as HTMLElement);
    expect(onOpenClass).toHaveBeenCalledWith(IDS.silver);
  });

  it('shows the empty state when the school has no classes', async () => {
    setup({ byStatus: { active: [] } });
    expect(
      await screen.findByText('No classes in your scope')
    ).toBeInTheDocument();
    expect(screen.getByText('0 classes in 2026/2027')).toBeInTheDocument();
  });

  it('shows the set-up callout and no student counts when no term is current', async () => {
    setup({ calendar: noCalendar() });
    expect(
      await screen.findByText('Create the first school year')
    ).toBeInTheDocument();
    expect(screen.getByText('3 classes')).toBeInTheDocument();
    const last = await cardOf('SS 3');
    expect(last.queryByText('4')).not.toBeInTheDocument();
    expect(last.getByText('—')).toBeInTheDocument();
  });

  it('pages a level of more than ten classes', async () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      classSummary({
        id: `00000000-0000-4000-8000-0000000001${String(index).padStart(2, '0')}`,
        displayName: `JSS 1 Arm ${index + 1}`,
        name: `Arm ${index + 1}`,
      })
    );
    setup({ byStatus: { active: many } });
    const card = await cardOf('JSS 1');
    expect(card.getAllByRole('row')).toHaveLength(11);
    expect(card.getByText('Showing 1 to 10 of 12')).toBeInTheDocument();
    fireEvent.click(card.getByRole('button', { name: 'Page 2' }));
    expect(card.getAllByRole('row')).toHaveLength(3);
    expect(card.getByText('JSS 1 Arm 12')).toBeInTheDocument();
  });
});
