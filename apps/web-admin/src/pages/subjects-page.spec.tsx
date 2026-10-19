import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { SetElectiveTakersInput, Subject } from '@eduvault/api-contract';
import { toast } from '@eduvault/ui';
import {
  SUBJECT_IDS,
  arm,
  electiveList,
  levelRow,
  subject,
  subjectTeachers,
} from '../test-subjects';
import {
  actingAccess,
  ownerAccess,
  renderWithApi,
  starterAccess,
} from '../test-utils';
import { SubjectsPage } from './subjects-page';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: { success: vi.fn(), error: vi.fn() },
}));

const LEVEL_JSS2 = SUBJECT_IDS.jss2;

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
        id: SUBJECT_IDS.jss1,
        code: 'JSS1',
        name: 'JSS 1',
        sequence: 1,
        nextLevelId: LEVEL_JSS2,
        isFinalYear: false,
      },
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
      levelRow(),
      levelRow({
        subjectId: SUBJECT_IDS.french,
        subjectCode: 'FRE',
        subjectName: 'French',
        kind: 'elective',
        sequence: 2,
        takerCount: 3,
      }),
      levelRow({
        subjectId: SUBJECT_IDS.music,
        subjectCode: 'MUS',
        subjectName: 'Music',
        kind: 'elective',
        sequence: 3,
      }),
    ]),
    replace: vi.fn().mockResolvedValue([]),
  },
  electives: {
    list: vi.fn().mockResolvedValue(electiveList()),
    set: vi.fn(),
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
    const cells = within(
      await screen.findByRole('row', { name: /English Language/ })
    );
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
    const rows = screen.getAllByRole('row').slice(1);
    expect(
      rows.map((row) =>
        within(row)
          .getAllByRole('cell')
          .map((cell) => cell.textContent)
      )
    ).toEqual([
      ['1', 'Mathematics', 'Core'],
      ['2', 'French', 'Elective'],
      ['3', 'Music', 'Elective'],
    ]);
  });

  it('gives an empty level a card that reads No subjects yet', async () => {
    renderWithApi(page('by-level'), apiFor());
    expect(await screen.findByText('JSS 1')).toBeInTheDocument();
    expect(screen.getByText('No subjects yet')).toBeInTheDocument();
    expect(screen.getAllByRole('table')).toHaveLength(1);
  });
});

const LEVELS_IN_ORDER = ['JSS 1', 'JSS 2'];

const openEditor = async (level: 'JSS 1' | 'JSS 2' = 'JSS 2') => {
  const buttons = await screen.findAllByRole('button', {
    name: 'Edit subjects',
  });
  fireEvent.click(buttons[LEVELS_IN_ORDER.indexOf(level)]!);
  await screen.findByText(`Subjects for ${level}`);
};

const save = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Save subjects' }));
};

describe('SubjectsPage level subjects sheet', () => {
  it('reorders with Move up and Move down and saves that order', async () => {
    const api = apiFor();
    renderWithApi(page('by-level'), api);
    await openEditor();
    expect(
      screen.getByRole('button', { name: 'Move Mathematics up' })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Move Music down' })
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Move Music up' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Move Mathematics down' })
    );
    save();
    await waitFor(() => {
      expect(api.levelSubjects.replace).toHaveBeenCalledWith({
        params: { id: LEVEL_JSS2 },
        body: {
          subjects: [
            { subjectId: SUBJECT_IDS.music, kind: 'elective' },
            { subjectId: SUBJECT_IDS.maths, kind: 'core' },
            { subjectId: SUBJECT_IDS.french, kind: 'elective' },
          ],
        },
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('JSS 2 subjects saved.');
    });
  });

  it('sends a changed kind and a subject added last as Core', async () => {
    const api = apiFor();
    renderWithApi(page('by-level'), api);
    await openEditor();
    fireEvent.change(screen.getByLabelText('Kind of Mathematics'), {
      target: { value: 'elective' },
    });
    await waitFor(() => {
      expect(
        screen.getByRole('option', { name: 'English Language' })
      ).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText('Add a subject'), {
      target: { value: SUBJECT_IDS.english },
    });
    expect(
      screen.queryByRole('option', { name: 'English Language' })
    ).not.toBeInTheDocument();
    save();
    await waitFor(() => {
      expect(api.levelSubjects.replace).toHaveBeenCalledWith({
        params: { id: LEVEL_JSS2 },
        body: {
          subjects: [
            { subjectId: SUBJECT_IDS.maths, kind: 'elective' },
            { subjectId: SUBJECT_IDS.french, kind: 'elective' },
            { subjectId: SUBJECT_IDS.music, kind: 'elective' },
            { subjectId: SUBJECT_IDS.english, kind: 'core' },
          ],
        },
      });
    });
  });

  it('says when the Add a subject select is not showing every active subject', async () => {
    const api = apiFor();
    api.subjects.list.mockResolvedValue({ items: [subject()], total: 120 });
    renderWithApi(page('by-level'), api);
    await openEditor();
    expect(
      await screen.findByText('Showing 1 of 120 active subjects.')
    ).toBeInTheDocument();
  });

  it('asks before removing an elective that has takers, and keeps the row on Cancel', async () => {
    const api = apiFor();
    renderWithApi(page('by-level'), api);
    await openEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Remove French' }));
    expect(
      await screen.findByText(
        '3 students take French as an elective this session. Remove it anyway?'
      )
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(
        screen.queryByText(/take French as an elective/)
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole('button', { name: 'Remove French' })
    ).toBeInTheDocument();
    expect(api.levelSubjects.replace).not.toHaveBeenCalled();
  });

  it('removes the row from the draft once the confirmation is accepted', async () => {
    const api = apiFor();
    renderWithApi(page('by-level'), api);
    await openEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Remove French' }));
    await screen.findByText(/take French as an elective/);
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: 'Remove French' })
      ).not.toBeInTheDocument();
    });
    save();
    await waitFor(() => {
      expect(api.levelSubjects.replace).toHaveBeenCalledWith({
        params: { id: LEVEL_JSS2 },
        body: {
          subjects: [
            { subjectId: SUBJECT_IDS.maths, kind: 'core' },
            { subjectId: SUBJECT_IDS.music, kind: 'elective' },
          ],
        },
      });
    });
  });

  it('asks before making an elective with takers core, and keeps it elective on Cancel', async () => {
    const api = apiFor();
    renderWithApi(page('by-level'), api);
    await openEditor();
    fireEvent.change(screen.getByLabelText('Kind of French'), {
      target: { value: 'core' },
    });
    expect(
      await screen.findByText(
        '3 students take French as an elective this session. Making it core clears those choices. Continue?'
      )
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(
        screen.queryByText(/Making it core clears/)
      ).not.toBeInTheDocument();
    });
    expect(screen.getByLabelText('Kind of French')).toHaveValue('elective');
    expect(api.levelSubjects.replace).not.toHaveBeenCalled();
  });

  it('makes the elective core in the draft once the confirmation is accepted', async () => {
    const api = apiFor();
    renderWithApi(page('by-level'), api);
    await openEditor();
    fireEvent.change(screen.getByLabelText('Kind of French'), {
      target: { value: 'core' },
    });
    await screen.findByText(/Making it core clears/);
    fireEvent.click(screen.getByRole('button', { name: 'Make core' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Kind of French')).toHaveValue('core');
    });
    save();
    await waitFor(() => {
      expect(api.levelSubjects.replace).toHaveBeenCalledWith({
        params: { id: LEVEL_JSS2 },
        body: {
          subjects: [
            { subjectId: SUBJECT_IDS.maths, kind: 'core' },
            { subjectId: SUBJECT_IDS.french, kind: 'core' },
            { subjectId: SUBJECT_IDS.music, kind: 'elective' },
          ],
        },
      });
    });
  });

  it('removes an elective without takers straight away', async () => {
    renderWithApi(page('by-level'), apiFor());
    await openEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Music' }));
    expect(
      screen.queryByRole('button', { name: 'Remove Music' })
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Remove it anyway/)).not.toBeInTheDocument();
  });

  it('toasts the API message when the save is refused', async () => {
    const api = apiFor();
    api.levelSubjects.replace.mockRejectedValue(
      new Error('Each subject can be on a level once.')
    );
    renderWithApi(page('by-level'), api);
    await openEditor();
    save();
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Each subject can be on a level once.'
      );
    });
    expect(screen.getByText('Subjects for JSS 2')).toBeInTheDocument();
  });
});

describe('SubjectsPage electives card', () => {
  it('shows an avatar per taker and Nobody yet for an elective with none', async () => {
    renderWithApi(page('by-level'), apiFor());
    expect(
      await screen.findByRole('button', {
        name: 'Electives taken this session 2',
      })
    ).toBeInTheDocument();
    const lineOf = (name: string) =>
      within(
        screen
          .getAllByRole('listitem')
          .find((item) => within(item).queryByText(name) !== null)!
      );
    expect(await screen.findByText('AO')).toBeInTheDocument();
    expect(lineOf('French').getByText('AO')).toBeInTheDocument();
    expect(lineOf('Music').getByText('Nobody yet')).toBeInTheDocument();
    expect(lineOf('Music').queryByText('AO')).not.toBeInTheDocument();
  });

  it('says No electives. when the school has none', async () => {
    const api = apiFor();
    api.electives.list.mockResolvedValue(electiveList({ electives: [] }));
    renderWithApi(page('by-level'), api);
    expect(await screen.findByText('No electives.')).toBeInTheDocument();
  });

  it('filters the picker by name and by GF number and saves the ticked students', async () => {
    const api = apiFor();
    api.electives.set.mockImplementation(
      ({
        params,
        body,
      }: {
        params: { subjectId: string };
        body: SetElectiveTakersInput;
      }) => ({ subjectId: params.subjectId, studentIds: body.studentIds })
    );
    renderWithApi(page('by-level'), api);
    fireEvent.click(
      (await screen.findAllByRole('button', { name: 'Choose students' }))[0]!
    );
    expect(await screen.findByText('French · 2026/2027')).toBeInTheDocument();
    expect(
      screen.getByText('Students at levels where French is an elective.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/Chi Ude/)).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Ada Obi/ })).toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: /Bola Ade/ })
    ).not.toBeChecked();

    const search = screen.getByPlaceholderText('Search name or GF number');
    fireEvent.change(search, { target: { value: 'GF-0124' } });
    expect(screen.queryByText(/Ada Obi/)).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'ada' } });
    expect(screen.queryByText(/Bola Ade/)).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: '' } });

    fireEvent.click(screen.getByRole('checkbox', { name: /Bola Ade/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(api.electives.set).toHaveBeenCalledWith({
        params: { subjectId: SUBJECT_IDS.french },
        body: {
          sessionId: SUBJECT_IDS.session,
          studentIds: [SUBJECT_IDS.ada, SUBJECT_IDS.bola],
        },
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        '2 students take French this session.'
      );
    });
  });
});

describe('SubjectsPage by level without write access', () => {
  it.each([
    ['a teacher', starterAccess('teacher')],
    ['a super admin acting without a reason', actingAccess(false)],
  ])('hides Edit subjects and Choose students for %s', async (_who, access) => {
    renderWithApi(page('by-level'), apiFor(), access);
    await screen.findByText('Electives taken this session');
    await screen.findByText('Nobody yet');
    expect(screen.queryByRole('button', { name: 'Edit subjects' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Choose students' })
    ).toBeNull();
  });

  it('shows both controls to a holder of subject:update', async () => {
    renderWithApi(page('by-level'), apiFor(), starterAccess('administrator'));
    expect(
      await screen.findAllByRole('button', { name: 'Edit subjects' })
    ).toHaveLength(2);
    expect(
      screen.getAllByRole('button', { name: 'Choose students' })
    ).toHaveLength(2);
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
