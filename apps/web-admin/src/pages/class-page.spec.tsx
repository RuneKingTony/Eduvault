import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ApiError,
  type ClassDetail,
  type GraduateClassInput,
  type MePermissions,
  type UpdateClassInput,
} from '@eduvault/api-contract';
import { toast } from '@eduvault/ui';
import { currentCalendar, noCalendar } from '../test-calendar';
import { testId } from '../test-api';
import { IDS, classDetail, teacher } from '../test-classes';
import { actingAccess, renderWithApi, starterAccess } from '../test-utils';
import { ClassPage } from './class-page';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: { success: vi.fn(), error: vi.fn() },
}));

type Access = MePermissions;

const ADA_OBI = testId(0x2_10_01);
const BOLA_ADE = testId(0x2_10_02);
const ZAINAB_BELLO = testId(0x2_10_03);
const ADA_ADAMS = testId(0x2_10_04);
const TOBI_BELLO = testId(0x2_10_05);

const GOLD = classDetail({
  displayName: 'JSS 2 Gold',
  name: 'Gold',
  studentCount: 8,
  classTeachers: [teacher('Ayo Bassey'), teacher('Claire Ade', 'assistant')],
  roster: [
    {
      studentId: ADA_OBI,
      name: 'Ada Obi',
      admissionNumber: 'GF-0123',
      electives: ['French', 'Music'],
    },
    {
      studentId: BOLA_ADE,
      name: 'Bola Ade',
      admissionNumber: 'GF-0124',
      electives: [],
    },
  ],
});

interface Options {
  access?: Access;
  row?: ClassDetail;
  failure?: Error;
  calendar?: ReturnType<typeof currentCalendar> | 'pending';
}

const retiredAfter = (row: ClassDetail, body: UpdateClassInput) => {
  if (body.archived === undefined) {
    return row.retiredAt;
  }
  return body.archived ? '2026-07-24T09:00:00.000Z' : null;
};

function setup({
  access = starterAccess('administrator'),
  row = GOLD,
  failure,
  calendar = currentCalendar(),
}: Options = {}) {
  const api = {
    classes: {
      graduate: vi.fn(({ body }: { body: GraduateClassInput }) => ({
        graduated: body.studentIds.length,
      })),
      get:
        failure === undefined
          ? vi.fn().mockResolvedValue(row)
          : vi.fn().mockRejectedValue(failure),
      update: vi.fn(({ body }: { body: UpdateClassInput }) => ({
        ...row,
        name: body.name ?? row.name,
        retiredAt: retiredAfter(row, body),
      })),
      removeTeacher: vi
        .fn()
        .mockResolvedValue({ classId: IDS.gold, userId: IDS.ayo }),
      teacherCandidates: vi.fn().mockResolvedValue([]),
    },
    calendar: {
      current:
        calendar === 'pending'
          ? vi.fn().mockReturnValue(new Promise(() => undefined))
          : vi.fn().mockResolvedValue(calendar),
    },
  };
  const onBack = vi.fn();
  const onOpenGraduated = vi.fn();
  const onOpenStartYear = vi.fn();
  renderWithApi(
    <ClassPage
      classId={IDS.gold}
      onBack={onBack}
      onOpenGraduated={onOpenGraduated}
      onOpenStartYear={onOpenStartYear}
    />,
    api,
    access
  );
  return { api, onBack, onOpenGraduated, onOpenStartYear };
}

let user: ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  user = userEvent.setup();
});

const openMenu = async () => {
  await user.click(
    await screen.findByRole('button', { name: 'Actions for JSS 2 Gold' })
  );
};

const cardTitle = (title: string) =>
  screen.findByText(title, { selector: '[data-slot="card-title"]' });

const teacherList = async () => {
  await screen.findByText('Ayo Bassey', { selector: 'span' });
  const list = screen
    .getAllByRole('list')
    .find((candidate) => within(candidate).queryByText('Ayo Bassey') !== null);
  if (list === undefined) {
    throw new Error('no class teacher list');
  }
  return list;
};

const rosterTable = async () => {
  await screen.findByRole('columnheader', { name: 'Adm. no.' });
  const table = screen
    .getAllByRole('table')
    .find(
      (candidate) =>
        within(candidate).queryByRole('columnheader', { name: 'Adm. no.' }) !==
        null
    );
  if (table === undefined) {
    throw new Error('no roster table');
  }
  return table;
};

const TERM_NAMES = ['First term', 'Second term', 'Third term'];

const calendarIn = (sequence: number) => {
  const calendar = currentCalendar();
  return {
    ...calendar,
    term: calendar.term && {
      ...calendar.term,
      sequence,
      name: TERM_NAMES[sequence - 1] ?? 'First term',
    },
  };
};

const graduateButton = () =>
  screen.findByRole('button', { name: 'Graduate class' });

describe('ClassPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the class with its campus, students, term and a breadcrumb back to Classes', async () => {
    const { onBack } = setup();
    expect(
      await screen.findByRole('heading', { name: 'JSS 2 Gold' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('Lekki campus · 8 students · First term')
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Classes' }));
    expect(onBack).toHaveBeenCalled();
  });

  it('marks a final-year class and an archived one in the description', async () => {
    setup({
      row: classDetail({
        displayName: 'JSS 2 Gold',
        studentCount: 1,
        isFinalYear: true,
        retiredAt: '2026-07-24T09:00:00.000Z',
      }),
    });
    expect(
      await screen.findByText(
        'Lekki campus · 1 student · First term · final year · archived'
      )
    ).toBeInTheDocument();
  });

  it('leaves the term out of the description when none is current', async () => {
    setup({ calendar: noCalendar() });
    expect(
      await screen.findByText('Lekki campus · 8 students')
    ).toBeInTheDocument();
  });

  describe('teachers', () => {
    it('lists them lead first with role badges', async () => {
      setup();
      const teachers = within(await teacherList());
      expect(screen.getByText('Class teachers')).toBeInTheDocument();
      const rows = teachers.getAllByRole('listitem');
      expect(within(rows[0]!).getByText('Ayo Bassey')).toBeInTheDocument();
      expect(within(rows[0]!).getByText('Lead')).toHaveAttribute(
        'data-variant',
        'default'
      );
      expect(within(rows[1]!).getByText('Assistant')).toHaveAttribute(
        'data-variant',
        'secondary'
      );
      expect(
        screen.getByRole('button', { name: 'Add class teacher' })
      ).toBeInTheDocument();
    });

    it('shows the empty state with the add button when nobody teaches the class', async () => {
      setup({
        row: classDetail({ displayName: 'JSS 2 Gold', classTeachers: [] }),
      });
      expect(
        await screen.findByText('No class teacher yet')
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          'Add a lead teacher so the class has someone responsible.'
        )
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Add class teacher' })
      ).toBeInTheDocument();
    });

    it('hides Add on an archived class, in both states', async () => {
      const archived = '2026-07-24T09:00:00.000Z';
      setup({
        row: classDetail({
          displayName: 'JSS 2 Gold',
          classTeachers: [],
          retiredAt: archived,
        }),
      });
      expect(
        await screen.findByText('No class teacher yet')
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Add class teacher' })
      ).not.toBeInTheDocument();
    });

    it('hides Add on an archived class that has teachers', async () => {
      setup({ row: { ...GOLD, retiredAt: '2026-07-24T09:00:00.000Z' } });
      const teachers = within(await teacherList());
      expect(teachers.getByText('Ayo Bassey')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Add class teacher' })
      ).not.toBeInTheDocument();
    });

    it('opens the add dialog', async () => {
      setup();
      await user.click(
        await screen.findByRole('button', { name: 'Add class teacher' })
      );
      expect(
        await screen.findByText('Add class teacher', {
          selector: '[data-slot="dialog-title"]',
        })
      ).toBeInTheDocument();
    });

    it('removes a teacher and toasts', async () => {
      const { api } = setup();
      await user.click(
        await screen.findByRole('button', { name: 'Remove Ayo Bassey' })
      );
      await user.click(
        within(
          await screen.findByRole('dialog', {
            name: 'Remove this class teacher?',
          })
        ).getByRole('button', { name: 'Remove teacher' })
      );
      await waitFor(() => {
        expect(api.classes.removeTeacher).toHaveBeenCalledWith({
          params: { id: IDS.gold, userId: IDS.ayo },
        });
        expect(toast.success).toHaveBeenCalledWith(
          'Ayo Bassey removed as class teacher of JSS 2 Gold.'
        );
      });
      expect(api.classes.removeTeacher).toHaveBeenCalledTimes(1);
    });

    it('keeps the teacher when the removal is cancelled', async () => {
      const { api } = setup();
      await user.click(
        await screen.findByRole('button', { name: 'Remove Ayo Bassey' })
      );
      await user.click(
        within(
          await screen.findByRole('dialog', {
            name: 'Remove this class teacher?',
          })
        ).getByRole('button', { name: 'Cancel' })
      );
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(api.classes.removeTeacher).not.toHaveBeenCalled();
    });

    it.each([
      ['a reader without class:assignTeacher', starterAccess('principal')],
      ['a read-only acting super admin', actingAccess(false)],
    ])('hides Add and Remove for %s', async (_label, access) => {
      setup({ access });
      const teachers = within(await teacherList());
      expect(teachers.getByText('Ayo Bassey')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Add class teacher' })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /^Remove / })
      ).not.toBeInTheDocument();
    });
  });

  describe('roster', () => {
    it('shows the students with their admission numbers and a count', async () => {
      setup();
      const roster = within(await rosterTable());
      expect(await cardTitle('Roster')).toHaveTextContent('Roster2');
      expect(roster.getByText('Ada Obi')).toBeInTheDocument();
      expect(roster.getByText('GF-0123')).toHaveClass('font-mono');
    });

    it('shows each student’s electives, or a dash for none', async () => {
      setup();
      const roster = within(await rosterTable());
      expect(
        roster.getByRole('columnheader', { name: 'Electives' })
      ).toBeInTheDocument();
      expect(roster.getByText('French, Music')).toBeInTheDocument();
      expect(roster.getByText('—')).toBeInTheDocument();
    });

    it('says Nothing here yet for an empty roster', async () => {
      setup({ row: classDetail({ displayName: 'JSS 2 Gold', roster: [] }) });
      expect(await screen.findByText('Nothing here yet')).toBeInTheDocument();
    });

    it('is not shown without student:read', async () => {
      setup({ row: { ...GOLD, roster: null } });
      await cardTitle('Teachers');
      expect(
        screen.queryByText('Roster', { selector: '[data-slot="card-title"]' })
      ).not.toBeInTheDocument();
    });
  });

  describe('archive and restore', () => {
    it('archives with no confirmation and toasts the PRD copy', async () => {
      const { api } = setup();
      await openMenu();
      await user.click(
        await screen.findByRole('menuitem', { name: 'Archive class' })
      );
      await waitFor(() => {
        expect(api.classes.update).toHaveBeenCalledWith({
          params: { id: IDS.gold },
          body: { archived: true },
        });
        expect(toast.success).toHaveBeenCalledWith(
          'JSS 2 Gold archived. It stays on file and can be restored.'
        );
      });
    });

    it('restores an archived class', async () => {
      const { api } = setup({
        row: { ...GOLD, retiredAt: '2026-07-24T09:00:00.000Z' },
      });
      await openMenu();
      expect(
        screen.queryByRole('menuitem', { name: 'Archive class' })
      ).not.toBeInTheDocument();
      await user.click(
        await screen.findByRole('menuitem', { name: 'Restore class' })
      );
      await waitFor(() => {
        expect(api.classes.update).toHaveBeenCalledWith({
          params: { id: IDS.gold },
          body: { archived: false },
        });
        expect(toast.success).toHaveBeenCalledWith('JSS 2 Gold restored.');
      });
    });

    it('shows the refusal as a danger toast', async () => {
      const { api } = setup();
      const message =
        'Students are placed in JSS 2 Gold this term or later, so it can’t be archived yet.';
      api.classes.update.mockRejectedValue(
        new ApiError(409, { code: 'Conflict', message })
      );
      await openMenu();
      await user.click(
        await screen.findByRole('menuitem', { name: 'Archive class' })
      );
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(message);
      });
      expect(toast.success).not.toHaveBeenCalled();
    });

    it.each([
      ['a reader without class:update', starterAccess('principal')],
      ['a read-only acting super admin', actingAccess(false)],
    ])('is not offered to %s', async (_label, access) => {
      setup({ access });
      await cardTitle('Teachers');
      expect(
        screen.queryByRole('button', { name: 'Actions for JSS 2 Gold' })
      ).not.toBeInTheDocument();
    });
  });

  it('shows Class not found with a way back for a 404', async () => {
    const { onBack } = setup({
      failure: new ApiError(404, {
        code: 'NotFound',
        message: 'Class not found',
      }),
    });
    expect(
      await screen.findByRole('heading', { name: 'Class not found' })
    ).toBeInTheDocument();
    expect(screen.getByText('We couldn’t find that class')).toBeInTheDocument();
    expect(
      screen.getByText(
        'It may have been moved, or it may belong to a campus or class you don’t look after.'
      )
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Go back' }));
    expect(onBack).toHaveBeenCalled();
  });

  it('shows another failure as an error, not as not found', async () => {
    setup({
      failure: new ApiError(500, {
        code: 'InternalError',
        message: 'Something broke',
      }),
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something broke'
    );
    expect(screen.queryByText('Class not found')).not.toBeInTheDocument();
  });

  describe('Graduate class', () => {
    const FINAL = classDetail({
      displayName: 'SS 3 Gold',
      name: 'Gold',
      isFinalYear: true,
      studentCount: 3,
      roster: [
        {
          studentId: ZAINAB_BELLO,
          name: 'Zainab Bello',
          admissionNumber: 'GF-0131',
          electives: [],
        },
        {
          studentId: ADA_ADAMS,
          name: 'Ada Adams',
          admissionNumber: 'GF-0123',
          electives: [],
        },
        {
          studentId: TOBI_BELLO,
          name: 'Tobi Bello',
          admissionNumber: 'GF-0124',
          electives: [],
        },
      ],
    });
    it('is offered for a final-year class with students to a holder of student:archive', async () => {
      setup({ row: FINAL });
      expect(await graduateButton()).toBeInTheDocument();
    });

    it('is hidden for a class that is not final year, an empty roster or without the permission', async () => {
      setup({ row: { ...FINAL, isFinalYear: false } });
      await screen.findByRole('heading', { name: 'SS 3 Gold' });
      expect(
        screen.queryByRole('button', { name: 'Graduate class' })
      ).not.toBeInTheDocument();
    });

    it('is hidden when the roster is empty', async () => {
      setup({ row: { ...FINAL, roster: [], studentCount: 0 } });
      await screen.findByRole('heading', { name: 'SS 3 Gold' });
      expect(
        screen.queryByRole('button', { name: 'Graduate class' })
      ).not.toBeInTheDocument();
    });

    it('is hidden without student:archive and for a read-only acting super admin', async () => {
      setup({ row: FINAL, access: starterAccess('principal') });
      await screen.findByRole('heading', { name: 'SS 3 Gold' });
      expect(
        screen.queryByRole('button', { name: 'Graduate class' })
      ).not.toBeInTheDocument();
    });

    it('lists the roster by last name, all ticked, with the Start note', async () => {
      const { onOpenStartYear } = setup({ row: FINAL });
      await user.click(await graduateButton());
      expect(await screen.findByText('Graduate SS 3 Gold')).toBeInTheDocument();
      const boxes = screen.getAllByRole('checkbox');
      expect(boxes).toHaveLength(3);
      for (const box of boxes) {
        expect(box).toBeChecked();
      }
      const names = within(screen.getByRole('dialog'))
        .getAllByText(/^(Ada Adams|Tobi Bello|Zainab Bello)$/)
        .map((node) => node.textContent);
      expect(names).toEqual(['Ada Adams', 'Tobi Bello', 'Zainab Bello']);
      await user.click(
        screen.getByRole('button', { name: 'Start new school year' })
      );
      expect(onOpenStartYear).toHaveBeenCalled();
    });

    it('graduates the ticked students straight away in the last term and toasts with a Graduated tab action', async () => {
      const { api, onOpenGraduated } = setup({
        row: FINAL,
        calendar: calendarIn(3),
      });
      await user.click(await graduateButton());
      await user.click(await screen.findByLabelText(/Tobi Bello/));
      await user.click(
        screen.getByRole('button', { name: 'Graduate ticked students' })
      );
      await waitFor(() => {
        expect(api.classes.graduate).toHaveBeenCalledWith({
          params: { id: IDS.gold },
          body: { studentIds: [ZAINAB_BELLO, ADA_ADAMS] },
        });
      });
      await waitFor(() => {
        expect(toast.success).toHaveBeenCalled();
      });
      const [message, options] = vi.mocked(toast.success).mock.calls[0] ?? [];
      expect(message).toBe('2 students graduated.');
      (
        options as { action: { label: string; onClick: () => void } }
      ).action.onClick();
      expect(onOpenGraduated).toHaveBeenCalled();
    });

    it('asks for a second confirmation before the last term and writes nothing until Graduate now', async () => {
      const { api } = setup({ row: FINAL, calendar: calendarIn(1) });
      await screen.findByText('First term', { exact: false });
      await user.click(await graduateButton());
      await user.click(
        await screen.findByRole('button', { name: 'Graduate ticked students' })
      );
      expect(
        await screen.findByText('Graduate during First term?')
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          'It is still First term. Graduates leave the roll today and won’t be billed for the rest of 2026/2027.'
        )
      ).toBeInTheDocument();
      expect(api.classes.graduate).not.toHaveBeenCalled();

      await user.click(screen.getByRole('button', { name: 'Go back' }));
      expect(await screen.findByText('Graduate SS 3 Gold')).toBeInTheDocument();
      await user.click(
        screen.getByRole('button', { name: 'Graduate ticked students' })
      );
      await user.click(
        await screen.findByRole('button', { name: 'Graduate now' })
      );
      await waitFor(() => {
        expect(api.classes.graduate).toHaveBeenCalledTimes(1);
      });
    });

    it('asks for the second confirmation while the current term is still loading', async () => {
      const { api } = setup({ row: FINAL, calendar: 'pending' });
      await user.click(await graduateButton());
      await user.click(
        await screen.findByRole('button', { name: 'Graduate ticked students' })
      );
      expect(
        await screen.findByText('Graduate during this term?')
      ).toBeInTheDocument();
      expect(api.classes.graduate).not.toHaveBeenCalled();
    });

    it('cannot graduate with nobody ticked', async () => {
      setup({ row: FINAL });
      await user.click(await graduateButton());
      for (const box of await screen.findAllByRole('checkbox')) {
        await user.click(box);
      }
      expect(
        screen.getByRole('button', { name: 'Graduate ticked students' })
      ).toBeDisabled();
    });
  });
});
