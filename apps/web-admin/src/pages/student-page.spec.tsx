import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import {
  ApiError,
  type LoginCredential,
  type MePermissions,
  type StudentDetail,
} from '@eduvault/api-contract';
import { toPermissionMap, type Permission } from '@eduvault/policy';
import { currentCalendar } from '../test-calendar';
import { classSummary } from '../test-classes';
import { actingAccess, fakeAccess, renderWithApi } from '../test-utils';
import { guardianLink, preview, studentDetail } from '../test-students';
import { StudentPage } from './student-page';

const accessWith = (...permissions: Permission[]): MePermissions =>
  fakeAccess({
    roles: ['custom'],
    permissions: toPermissionMap(permissions),
    campusScope: 'all',
  });

function setup(
  options: {
    student?: Partial<StudentDetail>;
    error?: Error;
    access?: MePermissions;
    logins?: LoginCredential[];
    initialDialog?: 'leave';
  } = {}
) {
  const detail = studentDetail(options.student);
  const students = {
    get: options.error
      ? vi.fn().mockRejectedValue(options.error)
      : vi.fn().mockResolvedValue(detail),
    guardians: vi.fn().mockResolvedValue([guardianLink()]),
    markAway: vi.fn().mockResolvedValue(detail),
    backInSchool: vi.fn().mockResolvedValue(detail),
    leave: vi.fn().mockResolvedValue(detail),
    undoLeaving: vi.fn().mockResolvedValue(detail),
    place: vi.fn().mockResolvedValue(detail),
    update: vi.fn().mockResolvedValue(detail),
    resetLogin: vi.fn().mockResolvedValue({
      username: 'greenfield-0123',
      temporaryPassword: 'Temp-Pass-0001',
    }),
  };
  const api = {
    students,
    admissions: { preview: vi.fn().mockResolvedValue(preview()) },
    schoolSettings: {
      get: vi
        .fn()
        .mockResolvedValue({ maxGuardians: 4, requireGuardian: true }),
    },
    guardians: { list: vi.fn().mockResolvedValue([]), get: vi.fn() },
    classes: { list: vi.fn().mockResolvedValue([classSummary()]) },
    calendar: { current: vi.fn().mockResolvedValue(currentCalendar()) },
  };
  const onBack = vi.fn();
  const onOpenTab = vi.fn();
  const onDialogClosed = vi.fn();
  renderWithApi(
    <StudentPage
      studentId="5b0f1e1e-6e53-4c52-9f1c-0a1d7a7f9c11"
      schoolName="Greenfield College"
      logins={options.logins}
      initialDialog={options.initialDialog}
      onDialogClosed={onDialogClosed}
      onOpenTab={onOpenTab}
      onBack={onBack}
    />,
    api,
    options.access
  );
  return { students, api, onBack, onOpenTab, onDialogClosed };
}

describe('StudentPage', () => {
  it('shows the header, the status badge and the class this term with the campus', async () => {
    setup();
    expect(
      await screen.findByRole('heading', { name: /Ada Okeke/ })
    ).toBeInTheDocument();
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
    expect(screen.getByText('GF-0123 · JSS 2 Gold, Lekki')).toBeInTheDocument();
  });

  it('says No class this term without a placement', async () => {
    setup({ student: { currentPlacement: null } });
    expect(
      await screen.findByText('GF-0123 · No class this term')
    ).toBeInTheDocument();
  });

  it('shows the profile card with the portal login', async () => {
    setup();
    await screen.findByText('Admission no.');
    expect(
      screen.getByText('GF-0123', { selector: 'code' })
    ).toBeInTheDocument();
    expect(screen.getByText('3 Mar 2014')).toBeInTheDocument();
    expect(screen.getByText('8 Sep 2025')).toBeInTheDocument();
    expect(screen.getByText('Lekki', { selector: 'dd' })).toBeInTheDocument();
    expect(screen.getByText('greenfield-0123')).toBeInTheDocument();
  });

  it('shows Closed for a closed login and Not created for none', async () => {
    setup({
      student: { portalLogin: { username: 'greenfield-0123', active: false } },
    });
    expect(await screen.findByText('Closed')).toBeInTheDocument();
  });

  it('shows Not created when there is no portal login', async () => {
    setup({ student: { portalLogin: null } });
    expect(await screen.findByText('Not created')).toBeInTheDocument();
  });

  it('lists the history newest year first with the New student badge', async () => {
    setup();
    await screen.findByText('Enrolment and placement history');
    const cells = screen.getAllByRole('row').map((row) => row.textContent);
    expect(cells[1]).toContain('2026/2027');
    expect(cells[2]).toContain('2025/2026');
    expect(cells[2]).toContain('New student');
    expect(cells[1]).toContain('First term: JSS 2 Gold, Lekki');
  });

  it('shows the Not seen since row with its note', async () => {
    setup({
      student: {
        notSeenSince: '2026-10-01',
        notSeenBy: { id: 'u1', name: 'Tunde Bakare' },
        notSeenNote: 'Phone calls unanswered',
        weeksAway: 1,
      },
    });
    expect(
      await screen.findByText('Phone calls unanswered')
    ).toBeInTheDocument();
    expect(
      screen.getByText(/1 Oct 2026 · marked by Tunde Bakare/)
    ).toBeInTheDocument();
  });
});

describe('StudentPage guardians', () => {
  it('hides the Guardians card without guardian:read', async () => {
    setup({ access: accessWith('student:read') });
    await screen.findByText('Admission no.');
    expect(screen.queryByText('Guardians')).not.toBeInTheDocument();
  });

  it('shows the Guardians card with guardian:read and no row menu or Add guardian', async () => {
    setup({ access: accessWith('student:read', 'guardian:read') });
    expect(await screen.findByText('Guardians')).toBeInTheDocument();
    expect(await screen.findByText('Ngozi Okeke')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Add guardian' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Actions for/ })
    ).not.toBeInTheDocument();
  });

  it('offers the row menu and Add guardian with guardian:link', async () => {
    setup({
      access: accessWith('student:read', 'guardian:read', 'guardian:link'),
    });
    expect(
      await screen.findByRole('button', { name: 'Add guardian' })
    ).toBeInTheDocument();
    const menu = await screen.findByRole('button', {
      name: 'Actions for Ngozi Okeke',
    });
    fireEvent.keyDown(menu, { key: 'Enter' });
    expect(await screen.findByText('Edit link…')).toBeInTheDocument();
    expect(screen.getByText('Remove from Ada…')).toBeInTheDocument();
  });

  it('shows an empty state with no guardian', async () => {
    setup({
      access: accessWith('student:read', 'guardian:read'),
      student: { guardians: [] },
    });
    expect(await screen.findByText('No guardian linked')).toBeInTheDocument();
  });
});

const callout = async () =>
  (await screen.findByRole('alert')).querySelector(
    '[data-slot="alert-description"]'
  )?.textContent;

describe('StudentPage lifecycle callouts', () => {
  it('says Left on the last day for a student who left', async () => {
    setup({
      student: {
        life: 'left',
        exit: {
          kind: 'left',
          on: '2026-09-25',
          reason: 'Relocated',
          note: null,
          recordedOn: '2026-09-28',
        },
        archivedBy: { id: 'u1', name: 'Tunde Bakare' },
      },
    });
    expect(await callout()).toBe(
      'Left on 25 Sep 2026. Off the roll and no longer billed; every record is kept.'
    );
    expect(
      screen.getByText(
        /25 Sep 2026 · Relocated · recorded by Tunde Bakare on 28 Sep 2026/
      )
    ).toBeInTheDocument();
  });

  it('warns about a student due to be marked Left', async () => {
    setup({
      student: {
        life: 'inactive',
        dueLeft: true,
        notSeenSince: '2026-05-22',
        weeksAway: 20,
      },
    });
    expect(await callout()).toBe(
      'Not seen since 22 May 2026, 20 weeks ago, and inactive for more than a term. Record the leaving when you are ready.'
    );
  });

  it('warns about an Inactive student with the dates', async () => {
    setup({
      student: { life: 'inactive', notSeenSince: '2026-08-31', weeksAway: 6 },
    });
    expect(await callout()).toBe(
      'Inactive since 5 Oct 2026: not seen since 31 Aug 2026, and not billed for new terms. Due to be marked Left on 11 Jan 2027 if not back.'
    );
  });

  it('warns about an Active student who is marked away', async () => {
    setup({ student: { notSeenSince: '2026-10-01', weeksAway: 1 } });
    expect(await callout()).toBe(
      'Not seen since 1 Oct 2026 (1 weeks). Moves to Inactive on 5 Nov 2026 if the school hears nothing.'
    );
  });

  it('shows no callout for an ordinary student', async () => {
    setup();
    await screen.findByText('Admission no.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('StudentPage states', () => {
  it('shows Student not found for a 404 and goes back', async () => {
    const { onBack } = setup({
      error: new ApiError(404, {
        code: 'NotFound',
        message: 'Student not found',
      }),
    });
    expect(
      await screen.findByRole('heading', { name: 'Student not found' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('We couldn’t find that student')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(onBack).toHaveBeenCalled();
  });

  it('shows the logins dialog once for a new admission and drops it on Done', async () => {
    setup({
      logins: [
        {
          who: 'student',
          name: 'Ada Okeke',
          username: 'greenfield-0123',
          temporaryPassword: 'Abcd2345Wxyz',
          existing: false,
        },
      ],
    });
    expect(await screen.findByText('Logins created')).toBeInTheDocument();
    expect(screen.getAllByText('Abcd2345Wxyz').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByText('Abcd2345Wxyz')).not.toBeInTheDocument();
  });
});

const openMenu = async () => {
  fireEvent.keyDown(
    await screen.findByRole('button', { name: 'More actions' }),
    {
      key: 'Enter',
    }
  );
};

const items = async () =>
  (await screen.findAllByRole('menuitem')).map((item) => item.textContent);

describe('StudentPage menu', () => {
  it('lists the actions the permissions and state allow, with Record leaving last', async () => {
    setup({ student: { canMoveForNextTerm: true } });
    await openMenu();
    expect(await items()).toEqual([
      'Move for next term',
      'Mark not seen since…',
      'Record leaving…',
    ]);
  });

  it('hides the menu without any of the three permissions', async () => {
    setup({ access: accessWith('student:read') });
    await screen.findByText('Admission no.');
    expect(
      screen.queryByRole('button', { name: 'More actions' })
    ).not.toBeInTheDocument();
  });

  it('hides the menu for a read-only acting super admin', async () => {
    setup({ access: actingAccess(false) });
    await screen.findByText('Admission no.');
    expect(
      screen.queryByRole('button', { name: 'More actions' })
    ).not.toBeInTheDocument();
  });

  it('offers only mark away to a holder of student:markAway', async () => {
    setup({ access: accessWith('student:read', 'student:markAway') });
    await openMenu();
    expect(await items()).toEqual(['Mark not seen since…']);
  });

  it('offers Reactivate for an Inactive student and marks them back at once', async () => {
    const { students } = setup({
      student: {
        life: 'inactive',
        notSeenSince: '2026-08-01',
        weeksAway: 9,
      },
    });
    await openMenu();
    fireEvent.click(
      await screen.findByRole('menuitem', {
        name: 'Reactivate: back in school',
      })
    );
    await waitFor(() => {
      expect(students.backInSchool).toHaveBeenCalledWith({
        params: { id: '5b0f1e1e-6e53-4c52-9f1c-0a1d7a7f9c11' },
      });
    });
  });

  it('shows Undo leaving only while the term is still current', async () => {
    const left = {
      life: 'left' as const,
      exit: {
        kind: 'left' as const,
        on: '2026-10-02',
        reason: 'Relocated',
        note: null,
        recordedOn: '2026-10-07',
      },
    };
    const { students } = setup({
      student: { ...left, canUndoLeaving: true },
    });
    await openMenu();
    expect(await items()).toEqual(['Undo leaving…']);
    fireEvent.click(await screen.findByRole('menuitem'));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Undo leaving' })
    );
    await waitFor(() => {
      expect(students.undoLeaving).toHaveBeenCalled();
    });
  });

  it('hides Undo once the term has changed', async () => {
    setup({
      student: {
        life: 'graduated',
        exit: {
          kind: 'graduated',
          on: '2026-07-17',
          reason: 'Completed JSS 3',
          note: null,
          recordedOn: '2026-07-17',
        },
        canUndoLeaving: false,
      },
    });
    await screen.findByText('Admission no.');
    expect(
      screen.queryByRole('button', { name: 'More actions' })
    ).not.toBeInTheDocument();
  });
});

describe('StudentPage Record leaving', () => {
  const due = {
    life: 'inactive' as const,
    dueLeft: true,
    notSeenSince: '2026-05-22',
    weeksAway: 20,
  };

  it('shows the danger callout’s button and opens the leaving dialog from it', async () => {
    setup({ student: due });
    fireEvent.click(
      await screen.findByRole('button', { name: 'Record leaving' })
    );
    expect(
      await screen.findByRole('dialog', { name: 'Record Ada leaving' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Reason')).toHaveValue('did_not_return');
    expect(screen.getByLabelText('Last day attended')).toHaveValue(
      '2026-05-22'
    );
  });

  it('hides the callout’s button without student:archive', async () => {
    setup({
      student: due,
      access: accessWith('student:read', 'student:markAway'),
    });
    await screen.findByRole('alert');
    expect(
      screen.queryByRole('button', { name: 'Record leaving' })
    ).not.toBeInTheDocument();
  });

  it('opens the dialog on arrival for a link from the Inactive tab, and tells the route when it closes', async () => {
    const { onDialogClosed } = setup({ student: due, initialDialog: 'leave' });
    expect(
      await screen.findByRole('dialog', { name: 'Record Ada leaving' })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onDialogClosed).toHaveBeenCalled();
  });

  it('does not open the dialog on arrival for a student who has already left', async () => {
    setup({
      student: {
        life: 'left',
        exit: {
          kind: 'left',
          on: '2026-10-02',
          reason: 'Relocated',
          note: null,
          recordedOn: '2026-10-07',
        },
      },
      initialDialog: 'leave',
    });
    await screen.findByText('Admission no.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

const LEFT = {
  life: 'left',
  exit: {
    kind: 'left',
    on: '2026-10-02',
    reason: 'Relocated',
    note: null,
    recordedOn: '2026-10-07',
  },
} as const;

describe('StudentPage edit details', () => {
  it('shows Edit details and Reset login with student:update', async () => {
    setup({ access: accessWith('student:read', 'student:update') });
    expect(
      await screen.findByRole('button', { name: 'Edit details' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Reset login' })
    ).toBeInTheDocument();
  });

  it('hides both without student:update', async () => {
    setup({ access: accessWith('student:read') });
    await screen.findByText('Admission no.');
    expect(
      screen.queryByRole('button', { name: 'Edit details' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Reset login' })
    ).not.toBeInTheDocument();
  });

  it('hides both for a student who has left', async () => {
    setup({
      student: LEFT,
      access: accessWith('student:read', 'student:update'),
    });
    await screen.findByText('Admission no.');
    expect(
      screen.queryByRole('button', { name: 'Edit details' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Reset login' })
    ).not.toBeInTheDocument();
  });

  it('offers no reset when the student has no active login', async () => {
    setup({
      student: { portalLogin: null },
      access: accessWith('student:read', 'student:update'),
    });
    await screen.findByRole('button', { name: 'Edit details' });
    expect(
      screen.queryByRole('button', { name: 'Reset login' })
    ).not.toBeInTheDocument();
  });

  it('opens with the current values and sends only what changed', async () => {
    const { students } = setup({
      access: accessWith('student:read', 'student:update'),
    });
    fireEvent.click(
      await screen.findByRole('button', { name: 'Edit details' })
    );
    expect(await screen.findByLabelText('First name')).toHaveValue('Ada');
    expect(screen.getByLabelText('Last name')).toHaveValue('Okeke');
    expect(screen.getByLabelText('Gender')).toHaveValue('F');
    expect(screen.getByLabelText('Date of birth')).toHaveValue('2014-03-03');

    fireEvent.change(screen.getByLabelText('Last name'), {
      target: { value: 'Nwosu' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(students.update).toHaveBeenCalledWith({
        params: { id: '5b0f1e1e-6e53-4c52-9f1c-0a1d7a7f9c11' },
        body: { lastName: 'Nwosu' },
      });
    });
    await waitFor(() => {
      expect(screen.queryByLabelText('Last name')).not.toBeInTheDocument();
    });
  });

  it('refuses blanks and a future date of birth with the server copy and sends nothing', async () => {
    const { students } = setup({
      access: accessWith('student:read', 'student:update'),
    });
    fireEvent.click(
      await screen.findByRole('button', { name: 'Edit details' })
    );
    fireEvent.change(await screen.findByLabelText('First name'), {
      target: { value: ' ' },
    });
    fireEvent.change(screen.getByLabelText('Date of birth'), {
      target: { value: '2999-01-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(
      await screen.findByText('Enter the first name.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Choose a date of birth on or before today.')
    ).toBeInTheDocument();
    expect(students.update).not.toHaveBeenCalled();
  });

  it('closes without a call when nothing changed', async () => {
    const { students } = setup({
      access: accessWith('student:read', 'student:update'),
    });
    fireEvent.click(
      await screen.findByRole('button', { name: 'Edit details' })
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Save changes' })
    );

    await waitFor(() => {
      expect(screen.queryByLabelText('First name')).not.toBeInTheDocument();
    });
    expect(students.update).not.toHaveBeenCalled();
  });

  it('shows the server message when the save is refused', async () => {
    const { students } = setup({
      access: accessWith('student:read', 'student:update'),
    });
    students.update.mockRejectedValue(
      new ApiError(409, {
        code: 'Conflict',
        message: 'Ada Okeke is no longer on the roll.',
      })
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Edit details' })
    );
    fireEvent.change(await screen.findByLabelText('First name'), {
      target: { value: 'Adaeze' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(
      await screen.findByText('Ada Okeke is no longer on the roll.')
    ).toBeInTheDocument();
  });
});

describe('StudentPage reset login', () => {
  it('confirms, resets and shows the new password once in the logins dialog', async () => {
    const { students } = setup({
      access: accessWith('student:read', 'student:update'),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Reset login' }));
    expect(
      await screen.findByRole('dialog', { name: 'Reset Ada’s login?' })
    ).toBeInTheDocument();
    expect(students.resetLogin).not.toHaveBeenCalled();

    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Reset login',
      })
    );

    expect(
      await screen.findByRole('dialog', { name: 'New login for Ada Okeke' })
    ).toBeInTheDocument();
    expect(students.resetLogin).toHaveBeenCalledWith({
      params: { id: '5b0f1e1e-6e53-4c52-9f1c-0a1d7a7f9c11' },
    });
    expect(screen.getAllByText('Temp-Pass-0001').length).toBeGreaterThan(0);
    expect(screen.getAllByText('greenfield-0123').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => {
      expect(screen.queryByText('Temp-Pass-0001')).not.toBeInTheDocument();
    });
  });

  it('shows the server message and no password when the reset is refused', async () => {
    const { students } = setup({
      access: accessWith('student:read', 'student:update'),
    });
    students.resetLogin.mockRejectedValue(
      new ApiError(409, {
        code: 'Conflict',
        message: 'This student has no portal login to reset.',
      })
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Reset login' }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Reset login',
      })
    );

    expect(
      await screen.findByText('This student has no portal login to reset.')
    ).toBeInTheDocument();
    expect(screen.queryByText('Logins created')).not.toBeInTheDocument();
  });
});
