import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import {
  ApiError,
  type ClassDetail,
  type MePermissions,
} from '@eduvault/api-contract';
import { toast } from '@eduvault/ui';
import { currentCalendar, noCalendar } from '../test-calendar';
import { IDS, classDetail, teacher } from '../test-classes';
import { actingAccess, renderWithApi, starterAccess } from '../test-utils';
import { ClassPage } from './class-page';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: { success: vi.fn(), error: vi.fn() },
}));

type Access = MePermissions;

const GOLD = classDetail({
  displayName: 'JSS 2 Gold',
  name: 'Gold',
  studentCount: 8,
  classTeachers: [teacher('Ayo Bassey'), teacher('Claire Ade', 'assistant')],
  roster: [
    { studentId: IDS.p1, name: 'Ada Obi', admissionNumber: 'GF-0123' },
    { studentId: IDS.jss1, name: 'Bola Ade', admissionNumber: 'GF-0124' },
  ],
});

interface Options {
  access?: Access;
  row?: ClassDetail;
  failure?: Error;
  calendar?: ReturnType<typeof currentCalendar>;
}

function setup({
  access = starterAccess('administrator'),
  row = GOLD,
  failure,
  calendar = currentCalendar(),
}: Options = {}) {
  const api = {
    classes: {
      get:
        failure === undefined
          ? vi.fn().mockResolvedValue(row)
          : vi.fn().mockRejectedValue(failure),
      update: vi.fn().mockResolvedValue(row),
      removeTeacher: vi
        .fn()
        .mockResolvedValue({ classId: IDS.gold, userId: IDS.ayo }),
      teacherCandidates: vi.fn().mockResolvedValue([]),
    },
    calendar: { current: vi.fn().mockResolvedValue(calendar) },
  };
  const onBack = vi.fn();
  renderWithApi(<ClassPage classId={IDS.gold} onBack={onBack} />, api, access);
  return { api, onBack };
}

const openMenu = async () => {
  fireEvent.keyDown(
    await screen.findByRole('button', { name: 'Actions for JSS 2 Gold' }),
    { key: 'Enter' }
  );
};

const card = async (title: string) => {
  const heading = await screen.findByText(title, {
    selector: '[data-slot="card-title"]',
  });
  return within(heading.closest<HTMLElement>('[data-slot="card"]')!);
};

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
    fireEvent.click(screen.getByRole('button', { name: 'Classes' }));
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
      const teachers = await card('Teachers');
      expect(teachers.getByText('Class teachers')).toBeInTheDocument();
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
        teachers.getByRole('button', { name: 'Add class teacher' })
      ).toBeInTheDocument();
    });

    it('shows the empty state with the add button when nobody teaches the class', async () => {
      setup({
        row: classDetail({ displayName: 'JSS 2 Gold', classTeachers: [] }),
      });
      const teachers = await card('Teachers');
      expect(teachers.getByText('No class teacher yet')).toBeInTheDocument();
      expect(
        teachers.getByText(
          'Add a lead teacher so the class has someone responsible.'
        )
      ).toBeInTheDocument();
      expect(
        teachers.getByRole('button', { name: 'Add class teacher' })
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
      const teachers = await card('Teachers');
      expect(teachers.getByText('No class teacher yet')).toBeInTheDocument();
      expect(
        teachers.queryByRole('button', { name: 'Add class teacher' })
      ).not.toBeInTheDocument();
    });

    it('hides Add on an archived class that has teachers', async () => {
      setup({ row: { ...GOLD, retiredAt: '2026-07-24T09:00:00.000Z' } });
      const teachers = await card('Teachers');
      expect(teachers.getByText('Ayo Bassey')).toBeInTheDocument();
      expect(
        teachers.queryByRole('button', { name: 'Add class teacher' })
      ).not.toBeInTheDocument();
    });

    it('opens the add dialog', async () => {
      setup();
      fireEvent.click(
        (await card('Teachers')).getByRole('button', {
          name: 'Add class teacher',
        })
      );
      expect(
        await screen.findByText('Add class teacher', {
          selector: '[data-slot="dialog-title"]',
        })
      ).toBeInTheDocument();
    });

    it('removes a teacher and toasts', async () => {
      const { api } = setup();
      fireEvent.click(
        (await card('Teachers')).getByRole('button', {
          name: 'Remove Ayo Bassey',
        })
      );
      await waitFor(() => {
        expect(api.classes.removeTeacher).toHaveBeenCalledWith({
          params: { id: IDS.gold, userId: IDS.ayo },
        });
        expect(toast.success).toHaveBeenCalledWith(
          'Ayo Bassey removed as class teacher of JSS 2 Gold.'
        );
      });
    });

    it.each([
      ['a reader without class:assignTeacher', starterAccess('principal')],
      ['a read-only acting super admin', actingAccess(false)],
    ])('hides Add and Remove for %s', async (_label, access) => {
      setup({ access });
      const teachers = await card('Teachers');
      expect(teachers.getByText('Ayo Bassey')).toBeInTheDocument();
      expect(
        teachers.queryByRole('button', { name: 'Add class teacher' })
      ).not.toBeInTheDocument();
      expect(
        teachers.queryByRole('button', { name: /^Remove / })
      ).not.toBeInTheDocument();
    });
  });

  describe('roster', () => {
    it('shows the students with their admission numbers and a count', async () => {
      setup();
      const roster = await card('Roster');
      expect(roster.getByText('2')).toBeInTheDocument();
      expect(roster.getByText('Ada Obi')).toBeInTheDocument();
      expect(roster.getByText('GF-0123')).toHaveClass('font-mono');
      expect(
        roster.getByRole('columnheader', { name: 'Adm. no.' })
      ).toBeInTheDocument();
    });

    it('says Nothing here yet for an empty roster', async () => {
      setup({ row: classDetail({ displayName: 'JSS 2 Gold', roster: [] }) });
      expect(
        (await card('Roster')).getByText('Nothing here yet')
      ).toBeInTheDocument();
    });

    it('is not shown without student:read', async () => {
      setup({ row: { ...GOLD, roster: null } });
      await card('Teachers');
      expect(
        screen.queryByText('Roster', { selector: '[data-slot="card-title"]' })
      ).not.toBeInTheDocument();
    });
  });

  describe('archive and restore', () => {
    it('archives with no confirmation and toasts the PRD copy', async () => {
      const { api } = setup();
      await openMenu();
      fireEvent.click(
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
      fireEvent.click(
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
      fireEvent.click(
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
      await card('Teachers');
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
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
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
});
