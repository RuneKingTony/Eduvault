import { useState } from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import {
  ApiError,
  type FeeOption,
  type LoginCredential,
  type MePermissions,
  type StudentDetail,
  type StudentStatement,
} from '@eduvault/api-contract';
import { toPermissionMap, type Permission } from '@eduvault/policy';
import { toast } from '@eduvault/ui';
import { testId } from '../test-api';
import { currentCalendar } from '../test-calendar';
import { classSummary } from '../test-classes';
import { renderPayments, statement } from '../test-payments';
import { actingAccess, fakeAccess } from '../test-utils';
import {
  STUDENT_ID,
  guardianLink,
  preview,
  studentDetail,
} from '../test-students';
import { StudentPage } from './student-page';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: { success: vi.fn(), error: vi.fn() },
}));

const accessWith = (...permissions: Permission[]): MePermissions =>
  fakeAccess({
    roles: ['custom'],
    permissions: toPermissionMap(permissions),
    campusScope: 'all',
  });

const BUS_ID = testId(0x3_00_01);
const TUNDE_ID = testId(0x3_00_02);

type PageProps = Parameters<typeof StudentPage>[0];

function StatefulPage({ tab: initial, onTabChange, ...props }: PageProps) {
  const [tab, setTab] = useState(initial);
  return (
    <StudentPage
      {...props}
      tab={tab}
      onTabChange={(next) => {
        setTab(next);
        onTabChange(next);
      }}
    />
  );
}

const openFees = async () => {
  fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Fees' }));
};

function setup(
  options: {
    student?: Partial<StudentDetail>;
    error?: Error;
    access?: MePermissions;
    logins?: LoginCredential[];
    initialDialog?: 'leave';
    feeOptions?: FeeOption[];
    tab?: 'fees';
    statement?: Partial<StudentStatement>;
    statementError?: Error;
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
    feeOptions: {
      list: vi.fn().mockResolvedValue(options.feeOptions ?? []),
      set: vi
        .fn()
        .mockImplementation(
          (request: {
            params: { feeTypeId: string };
            body: { optedIn: boolean };
          }) =>
            Promise.resolve({
              feeTypeId: request.params.feeTypeId,
              optedIn: request.body.optedIn,
            })
        ),
    },
    studentAccounts: {
      statement: options.statementError
        ? vi.fn().mockRejectedValue(options.statementError)
        : vi.fn().mockResolvedValue(statement(options.statement)),
    },
  };
  const onBack = vi.fn();
  const onOpenTab = vi.fn();
  const onDialogClosed = vi.fn();
  const onTabChange = vi.fn();
  renderPayments(
    <StatefulPage
      studentId={STUDENT_ID}
      schoolName="Greenfield College"
      logins={options.logins}
      initialDialog={options.initialDialog}
      tab={options.tab}
      onTabChange={onTabChange}
      onDialogClosed={onDialogClosed}
      onOpenTab={onOpenTab}
      onBack={onBack}
    />,
    api,
    { access: options.access }
  );
  return { students, api, onBack, onOpenTab, onDialogClosed, onTabChange };
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
        notSeenBy: { id: TUNDE_ID, name: 'Tunde Bakare' },
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

const busOption = (optedIn: boolean): FeeOption => ({
  feeTypeId: BUS_ID,
  name: 'School bus',
  optedIn,
});

describe('StudentPage optional fees', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists the optional fee types with a switch for each', async () => {
    setup({ feeOptions: [busOption(true)] });
    await openFees();
    const row = await screen.findByRole('switch', { name: 'School bus' });
    expect(row).toBeChecked();
    expect(screen.getByText('Optional fees')).toBeInTheDocument();
  });

  it('is not on Overview any more', async () => {
    const { api } = setup({ feeOptions: [busOption(true)] });
    await screen.findByText('Admission no.');
    expect(screen.queryByText('Optional fees')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(api.feeOptions.list).not.toHaveBeenCalled();
  });

  it('has no card when the student’s level has no optional fee', async () => {
    const { api } = setup({ feeOptions: [] });
    await openFees();
    await screen.findByText('Open statement');
    await waitFor(() => {
      expect(api.feeOptions.list).toHaveBeenCalledWith({
        params: { studentId: STUDENT_ID },
        query: {},
      });
    });
    expect(screen.queryByText('Optional fees')).not.toBeInTheDocument();
  });

  it('switches a fee on and toasts in the student’s first name', async () => {
    const { api } = setup({ feeOptions: [busOption(false)] });
    await openFees();
    fireEvent.click(await screen.findByRole('switch', { name: 'School bus' }));
    await waitFor(() => {
      expect(api.feeOptions.set).toHaveBeenCalledWith({
        params: { studentId: STUDENT_ID, feeTypeId: BUS_ID },
        body: { optedIn: true },
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Ada now takes School bus from the next round of charges.'
      );
    });
  });

  it('says no longer takes when switched off', async () => {
    setup({ feeOptions: [busOption(true)] });
    await openFees();
    fireEvent.click(await screen.findByRole('switch', { name: 'School bus' }));
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Ada no longer takes School bus from the next round of charges.'
      );
    });
  });

  it('shows the switches read-only without feeLine:update', async () => {
    setup({
      feeOptions: [busOption(true)],
      access: accessWith('student:read', 'feeLine:read'),
    });
    await openFees();
    expect(
      await screen.findByRole('switch', { name: 'School bus' })
    ).toBeDisabled();
  });

  it('hides the card without feeLine:read', async () => {
    const { api } = setup({
      feeOptions: [busOption(true)],
      access: accessWith('student:read'),
    });
    await screen.findByRole('heading', { name: /Ada Okeke/ });
    expect(screen.queryByText('Optional fees')).not.toBeInTheDocument();
    expect(api.feeOptions.list).not.toHaveBeenCalled();
  });
});

describe('StudentPage Fees tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the money tiles and the Open statement link with invoice:read', async () => {
    const { api } = setup({
      access: accessWith('student:read', 'invoice:read'),
    });
    await openFees();
    expect(await screen.findByText('Owing')).toBeInTheDocument();
    expect(screen.getByText('₦180,000')).toBeInTheDocument();
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(screen.getByText('₦40,000')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('₦220,000')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Open statement' })
    ).toHaveAttribute('href', `/finance/accounts/${STUDENT_ID}`);
    expect(api.studentAccounts.statement).toHaveBeenCalledWith({
      params: { studentId: STUDENT_ID },
      query: { page: undefined },
    });
  });

  it('shows the tiles with payment:read alone', async () => {
    setup({ access: accessWith('student:read', 'payment:read') });
    await openFees();
    expect(await screen.findByText('₦180,000')).toBeInTheDocument();
  });

  it('shows Extra paid for a credit balance', async () => {
    setup({
      statement: {
        totals: {
          balanceMinor: -500_000,
          paidMinor: 22_500_000,
          reducedMinor: 0,
          totalMinor: 22_000_000,
        },
      },
    });
    await openFees();
    expect(await screen.findByText('Extra paid')).toBeInTheDocument();
    expect(screen.getByText('₦5,000')).toBeInTheDocument();
    expect(screen.queryByText('Owing')).not.toBeInTheDocument();
  });

  it('shows Owing Nothing for a zero balance', async () => {
    setup({
      statement: {
        totals: {
          balanceMinor: 0,
          paidMinor: 22_000_000,
          reducedMinor: 0,
          totalMinor: 22_000_000,
        },
      },
    });
    await openFees();
    expect(await screen.findByText('Owing')).toBeInTheDocument();
    expect(screen.getByText('Nothing')).toBeInTheDocument();
  });

  it('shows Reduced only when something was reduced', async () => {
    setup({
      statement: {
        totals: {
          balanceMinor: 17_000_000,
          paidMinor: 4_000_000,
          reducedMinor: 1_000_000,
          totalMinor: 22_000_000,
        },
      },
    });
    await openFees();
    expect(await screen.findByText('Reduced')).toBeInTheDocument();
    expect(screen.getByText('₦10,000')).toBeInTheDocument();
  });

  it('leaves Reduced out when nothing was reduced', async () => {
    setup();
    await openFees();
    await screen.findByText('Owing');
    expect(screen.queryByText('Reduced')).not.toBeInTheDocument();
  });

  it('shows no tab strip and no money with student:read only', async () => {
    const { api } = setup({ access: accessWith('student:read') });
    await screen.findByText('Admission no.');
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByText('Open statement')).not.toBeInTheDocument();
    expect(screen.queryByText('Owing')).not.toBeInTheDocument();
    expect(api.studentAccounts.statement).not.toHaveBeenCalled();
  });

  it('falls back to Overview for tab=fees without a Fees tab', async () => {
    setup({ tab: 'fees', access: accessWith('student:read') });
    expect(await screen.findByText('Admission no.')).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('shows the Optional fees card but no money with feeLine:read only', async () => {
    const { api } = setup({
      feeOptions: [busOption(true)],
      access: accessWith('student:read', 'feeLine:read'),
    });
    await openFees();
    expect(await screen.findByText('Optional fees')).toBeInTheDocument();
    expect(screen.queryByText('Owing')).not.toBeInTheDocument();
    expect(screen.queryByText('Open statement')).not.toBeInTheDocument();
    expect(api.studentAccounts.statement).not.toHaveBeenCalled();
  });

  it('says No fees to show when there is nothing the viewer can see', async () => {
    setup({
      feeOptions: [],
      access: accessWith('student:read', 'feeLine:read'),
    });
    await openFees();
    expect(await screen.findByText('No fees to show')).toBeInTheDocument();
  });

  it('opens on Fees for tab=fees', async () => {
    setup({ tab: 'fees', feeOptions: [busOption(true)] });
    expect(
      await screen.findByRole('switch', { name: 'School bus' })
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Fees' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.queryByText('Admission no.')).not.toBeInTheDocument();
  });

  it('calls onTabChange when the tab changes', async () => {
    const { onTabChange } = setup();
    await openFees();
    expect(onTabChange).toHaveBeenLastCalledWith('fees');
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Overview' }));
    expect(onTabChange).toHaveBeenLastCalledWith(undefined);
    expect(await screen.findByText('Admission no.')).toBeInTheDocument();
  });

  it('shows the statement error inside the tab', async () => {
    setup({
      statementError: new ApiError(500, {
        code: 'UnknownError',
        message: 'The statement could not be loaded.',
      }),
    });
    await openFees();
    expect(
      await screen.findByText('The statement could not be loaded.')
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open statement' })).toBeVisible();
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
        archivedBy: { id: TUNDE_ID, name: 'Tunde Bakare' },
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

describe('StudentPage Statement button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(['invoice:read', 'payment:read'] as const)(
    'shows the header link to the statement and the Fees tab with %s',
    async (permission) => {
      setup({ access: accessWith('student:read', permission) });
      const link = await screen.findByRole('link', { name: 'Statement' });
      expect(link).toHaveAttribute('href', `/finance/accounts/${STUDENT_ID}`);
      expect(screen.getByRole('tab', { name: 'Fees' })).toBeInTheDocument();
    }
  );

  it('shows neither the button nor the money tiles without finance read', async () => {
    setup({ access: accessWith('student:read', 'feeLine:read') });
    await screen.findByText('Admission no.');
    expect(
      screen.queryByRole('link', { name: 'Statement' })
    ).not.toBeInTheDocument();
    await openFees();
    expect(screen.queryByText('Owing')).not.toBeInTheDocument();
  });

  it('keeps the button for a read-only acting super admin', async () => {
    setup({ access: actingAccess(false) });
    expect(
      await screen.findByRole('link', { name: 'Statement' })
    ).toBeInTheDocument();
  });
});
