import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { Subject } from '@eduvault/api-contract';
import { SUBJECT_IDS, arm, subject, subjectTeachers } from '../test-subjects';
import { actingAccess, ownerAccess, renderWithApi } from '../test-utils';
import { SubjectsPage } from './subjects-page';

const LEVEL_JSS2 = '00000000-0000-4000-8000-000000000201';

const apiFor = (overrides: Record<string, unknown> = {}) => ({
  subjects: {
    list: vi.fn().mockResolvedValue({
      items: [
        subject(),
        subject({
          id: SUBJECT_IDS.agr,
          code: 'AGR',
          name: 'Agricultural Science',
          retiredAt: '2025-07-20T09:00:00.000Z',
          levelCodes: [],
        }),
        subject({
          id: SUBJECT_IDS.english,
          code: 'ENG',
          name: 'English Language',
          levelCodes: ['P4', 'JSS1', 'JSS2', 'JSS3', 'SS1', 'SS2'],
        }),
      ] satisfies Subject[],
      total: 3,
    }),
    create: vi.fn(),
    update: vi.fn(),
  },
  classLevels: {
    list: vi.fn().mockResolvedValue([
      {
        id: LEVEL_JSS2,
        code: 'JSS2',
        name: 'JSS 2',
        sequence: 1,
        nextLevelId: null,
        isFinalYear: true,
      },
    ]),
  },
  levelSubjects: {
    list: vi.fn().mockResolvedValue([
      {
        classLevelId: LEVEL_JSS2,
        subjectId: SUBJECT_IDS.maths,
        subjectCode: 'MTH',
        subjectName: 'Mathematics',
        kind: 'core',
        sequence: 1,
      },
      {
        classLevelId: LEVEL_JSS2,
        subjectId: SUBJECT_IDS.english,
        subjectCode: 'FRE',
        subjectName: 'French',
        kind: 'elective',
        sequence: 2,
      },
    ]),
  },
  subjectTeachers: {
    list: vi.fn().mockResolvedValue(subjectTeachers()),
    assign: vi.fn(),
    remove: vi.fn(),
    copyFromPreviousTerm: vi.fn(),
  },
  classes: { teacherCandidates: vi.fn().mockResolvedValue([]) },
  ...overrides,
});

const me = {
  user: {
    id: SUBJECT_IDS.emeka,
    email: 'e@greenfield.test',
    name: 'Emeka Obi',
  },
  activeOrganizationId: 'org-1',
  activeCampusId: null,
  mustChangePassword: false,
  platformRole: null,
  schoolCount: 1,
  suspendedSchool: null,
};

const withMe = (api: ReturnType<typeof apiFor>) => ({
  ...api,
  me: { get: vi.fn().mockResolvedValue(me) },
});

const page = (tab: 'catalogue' | 'by-level' | 'teachers') => (
  <SubjectsPage tab={tab} page={1} onTab={vi.fn()} onPage={vi.fn()} />
);

describe('SubjectsPage catalogue', () => {
  it('counts the three tabs and shows Archived with its tooltip date', async () => {
    renderWithApi(page('catalogue'), apiFor());
    expect(
      await screen.findByRole('tab', { name: 'Catalogue 3' })
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('tab', { name: 'By level 1' })
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('tab', { name: 'Subject teachers 1' })
    ).toBeInTheDocument();
    expect(screen.getByText('3 subjects.')).toBeInTheDocument();
    expect(screen.getByText('Archived')).toBeInTheDocument();
    expect(screen.getByText('Not on any level')).toBeInTheDocument();
  });

  it('shows four level badges and a +n badge for the rest', async () => {
    renderWithApi(page('catalogue'), apiFor());
    const row = (await screen.findByText('English Language')).closest('tr');
    expect(row).not.toBeNull();
    const cells = within(row!);
    expect(cells.getByText('P4')).toBeInTheDocument();
    expect(cells.getByText('JSS3')).toBeInTheDocument();
    expect(cells.queryByText('SS1')).not.toBeInTheDocument();
    expect(cells.getByText('+2')).toBeInTheDocument();
  });

  it('offers Edit, Retire and Restore to a holder of subject:update', async () => {
    renderWithApi(page('catalogue'), apiFor());
    await screen.findByText('Mathematics');
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(3);
    expect(screen.getAllByRole('button', { name: 'Retire' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument();
  });

  it('hides every write control while acting without a reason', async () => {
    renderWithApi(page('teachers'), apiFor(), actingAccess(false));
    await screen.findByText(/JSS 2 Gold/);
    expect(
      screen.queryByRole('button', { name: 'Add subject' })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Assign' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Change' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });

  it('sends a trimmed upper-case code from the new subject sheet', async () => {
    const api = apiFor();
    api.subjects.create.mockResolvedValue(
      subject({ code: 'GEO', name: 'Geography', levelCodes: [] })
    );
    renderWithApi(page('catalogue'), api, ownerAccess());
    fireEvent.click(await screen.findByRole('button', { name: 'Add subject' }));
    fireEvent.change(await screen.findByLabelText('Code'), {
      target: { value: ' geo ' },
    });
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Geography' },
    });
    const buttons = screen.getAllByRole('button', { name: 'Add subject' });
    fireEvent.click(buttons.at(-1)!);
    await waitFor(() => {
      expect(api.subjects.create).toHaveBeenCalledWith({
        body: { code: 'GEO', name: 'Geography' },
      });
    });
  });

  it('keeps the sheet open with the message for a bad code', async () => {
    const api = apiFor();
    renderWithApi(page('catalogue'), api);
    fireEvent.click(await screen.findByRole('button', { name: 'Add subject' }));
    fireEvent.change(await screen.findByLabelText('Code'), {
      target: { value: 'AB1' },
    });
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Art' },
    });
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Add subject' }).at(-1)!
    );
    expect(
      await screen.findByText('Use up to 5 letters for the code.')
    ).toBeInTheDocument();
    expect(api.subjects.create).not.toHaveBeenCalled();
  });
});

describe('SubjectsPage by level', () => {
  it('lists each level with its subjects in sequence and Core or Elective', async () => {
    renderWithApi(page('by-level'), apiFor());
    expect(await screen.findByText('JSS 2')).toBeInTheDocument();
    expect(screen.getByText('Core')).toBeInTheDocument();
    expect(screen.getByText('Elective')).toBeInTheDocument();
    expect(screen.getByText('French')).toBeInTheDocument();
  });
});

describe('SubjectsPage subject teachers', () => {
  it('shows a You badge on the viewer’s rows, Unassigned and the unassigned count', async () => {
    renderWithApi(page('teachers'), withMe(apiFor()));
    expect(await screen.findByText('You')).toBeInTheDocument();
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
    expect(screen.getByText('1 unassigned')).toBeInTheDocument();
    expect(screen.getByText('JSS 2 Gold · Lekki')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Assign' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument();
  });

  it('shows the empty state when no arm is listed', async () => {
    const api = apiFor();
    api.subjectTeachers.list.mockResolvedValue(subjectTeachers({ arms: [] }));
    renderWithApi(page('teachers'), withMe(api));
    expect(
      await screen.findByText('No classes assigned to you')
    ).toBeInTheDocument();
  });

  it('offers Copy from last term only when last term has teachers', async () => {
    const api = apiFor();
    renderWithApi(page('teachers'), withMe(api));
    await screen.findByText('JSS 2 Gold · Lekki');
    expect(
      screen.queryByRole('button', { name: 'Copy from last term' })
    ).not.toBeInTheDocument();
  });

  it('copies last term’s teachers after a confirmation and reports the skipped ones', async () => {
    const api = apiFor();
    api.subjectTeachers.list.mockResolvedValue(
      subjectTeachers({
        copyFrom: { id: SUBJECT_IDS.previous, name: 'Third term' },
      })
    );
    api.subjectTeachers.copyFromPreviousTerm.mockResolvedValue({
      copied: 8,
      skipped: [
        {
          classId: SUBJECT_IDS.gold,
          subjectId: SUBJECT_IDS.maths,
          reason: 'notCandidate',
        },
      ],
      from: { id: SUBJECT_IDS.previous, name: 'Third term' },
    });
    renderWithApi(page('teachers'), withMe(api));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Copy from last term' })
    );
    expect(
      await screen.findByText('Copy last term’s subject teachers?')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy teachers' }));
    await waitFor(() => {
      expect(api.subjectTeachers.copyFromPreviousTerm).toHaveBeenCalledTimes(1);
    });
  });

  it('shows a closed second card until opened and counts all subjects when none are unassigned', async () => {
    const api = apiFor();
    const full = arm({
      classId: SUBJECT_IDS.silver,
      displayName: 'JSS 2 Silver',
    });
    full.subjects = full.subjects.map((row) => ({
      ...row,
      teacher: { userId: SUBJECT_IDS.ayo, name: 'Ayo Bassey' },
    }));
    api.subjectTeachers.list.mockResolvedValue(
      subjectTeachers({ arms: [arm(), full] })
    );
    renderWithApi(page('teachers'), withMe(api));
    expect(await screen.findByText('2 subjects')).toBeInTheDocument();
  });

  it('names the current term above the arm cards', async () => {
    renderWithApi(page('teachers'), withMe(apiFor()));
    expect(await screen.findByText('First term')).toBeInTheDocument();
  });

  it('defaults the assign dialog to the current teacher and disables Save with no candidates', async () => {
    const api = apiFor();
    api.classes.teacherCandidates.mockResolvedValue([
      { userId: SUBJECT_IDS.ayo, name: 'Ayo Bassey' },
      { userId: SUBJECT_IDS.emeka, name: 'Emeka Obi' },
    ]);
    renderWithApi(page('teachers'), withMe(api));
    fireEvent.click(await screen.findByRole('button', { name: 'Change' }));
    const select = await screen.findByLabelText('Teacher');
    await waitFor(() => {
      expect(select).toHaveValue(SUBJECT_IDS.emeka);
    });
    expect(
      screen.getByRole('button', { name: 'Remove teacher' })
    ).toBeInTheDocument();
    expect(api.classes.teacherCandidates).toHaveBeenCalledWith({
      params: { id: SUBJECT_IDS.gold },
      query: { for: 'subject' },
    });
  });

  it('shows the no-candidate hint and disables Save teacher', async () => {
    renderWithApi(page('teachers'), withMe(apiFor()));
    fireEvent.click(await screen.findByRole('button', { name: 'Assign' }));
    expect(await screen.findByText(/ · First term$/)).toBeInTheDocument();
    expect(
      await screen.findByText(
        'No teachers on the Lekki campus yet. Add one under People first.'
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save teacher' })).toBeDisabled();
  });
});
