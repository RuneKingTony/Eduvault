import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MePermissions } from '@eduvault/api-contract';
import { toPermissionMap } from '@eduvault/policy';
import { toast } from '@eduvault/ui';
import { currentCalendar } from '../test-calendar';
import { IDS } from '../test-classes';
import { fakeAccess, renderWithApi } from '../test-utils';
import { ARM_ID, TERM_SECOND_ID, studentDetail } from '../test-students';
import {
  LeaveDialog,
  MarkAwayDialog,
  MoveDialog,
  UndoLeavingDialog,
} from './student-lifecycle-dialogs';

const student = studentDetail();
const lekki = { id: IDS.lekki, name: 'Lekki' };
const ikeja = { id: IDS.ikeja, name: 'Ikeja' };

function api(overrides: Record<string, unknown> = {}) {
  return {
    students: {
      markAway: vi.fn().mockResolvedValue(student),
      leave: vi.fn().mockResolvedValue(student),
      undoLeaving: vi.fn().mockResolvedValue(student),
      place: vi.fn().mockResolvedValue(student),
      nextTermClasses: vi.fn().mockResolvedValue([
        { id: ARM_ID, name: 'JSS 2 Gold', campus: lekki },
        { id: IDS.silver, name: 'JSS 2 Emerald', campus: ikeja },
      ]),
    },
    calendar: { current: vi.fn().mockResolvedValue(currentCalendar()) },
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-07T09:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('MarkAwayDialog', () => {
  const setup = (target = student) => {
    const mocks = api();
    const onClose = vi.fn();
    renderWithApi(<MarkAwayDialog student={target} onClose={onClose} />, mocks);
    return { ...mocks, onClose };
  };

  it('defaults the date to seven days ago and limits it to today', () => {
    setup();
    const date = screen.getByLabelText('Not seen since');
    expect(date).toHaveValue('2026-09-30');
    expect(date).toHaveAttribute('max', '2026-10-07');
    expect(
      screen.getByText('Optional. Shown on the student’s record.')
    ).toBeInTheDocument();
  });

  it('saves the date and the trimmed note, then toasts the Inactive date', async () => {
    const user = userEvent.setup();
    const success = vi.spyOn(toast, 'success').mockReturnValue(1);
    const { students, onClose } = setup();
    await user.type(screen.getByLabelText('Note'), '  Phone unanswered  ');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(students.markAway).toHaveBeenCalledWith({
        params: { id: student.id },
        body: { date: '2026-09-30', note: 'Phone unanswered' },
      });
    });
    await waitFor(() => {
      expect(success).toHaveBeenCalledWith(
        'Saved. Ada becomes Inactive on 4 Nov 2026 if the school hears nothing.'
      );
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('warns when the date is over 5 weeks ago', async () => {
    const user = userEvent.setup();
    const warning = vi.spyOn(toast, 'warning').mockReturnValue(1);
    setup();
    const date = screen.getByLabelText('Not seen since');
    await user.clear(date);
    await user.type(date, '2026-08-20');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(warning).toHaveBeenCalledWith(
        'Over 5 weeks away, so Ada is now Inactive and won’t be billed for new terms.'
      );
    });
  });

  it('toasts the server refusal for a future date', async () => {
    const user = userEvent.setup();
    const failure = vi.spyOn(toast, 'error').mockReturnValue(1);
    const mocks = api();
    mocks.students.markAway.mockRejectedValue(
      new Error('Choose a date on or before today.')
    );
    renderWithApi(
      <MarkAwayDialog student={student} onClose={vi.fn()} />,
      mocks
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(failure).toHaveBeenCalledWith('Choose a date on or before today.');
    });
  });
});

describe('LeaveDialog', () => {
  const setup = (target = student) => {
    const mocks = api();
    const onOpenTab = vi.fn();
    const onClose = vi.fn();
    renderWithApi(
      <LeaveDialog student={target} onClose={onClose} onOpenTab={onOpenTab} />,
      mocks
    );
    return { ...mocks, onOpenTab, onClose };
  };

  it('defaults to Relocated and today for an active student', () => {
    setup();
    expect(screen.getByLabelText('Reason')).toHaveValue('relocated');
    expect(screen.getByLabelText('Last day attended')).toHaveValue(
      '2026-10-07'
    );
  });

  it('defaults to Did not return and the not-seen date for an inactive student', () => {
    setup(
      studentDetail({
        life: 'inactive',
        notSeenSince: '2026-08-20',
        weeksAway: 7,
      })
    );
    expect(screen.getByLabelText('Reason')).toHaveValue('did_not_return');
    expect(screen.getByLabelText('Last day attended')).toHaveValue(
      '2026-08-20'
    );
  });

  it('warns that the balance stays in Who owes when something is owed', () => {
    setup(studentDetail({ balanceMinor: 500_000, currency: 'NGN' }));
    expect(
      screen.getByText(
        '₦5,000 is still owed. It stays in Who owes under “owed by leavers”.'
      )
    ).toBeInTheDocument();
  });

  it.each([
    ['nothing is owed', { balanceMinor: 0, currency: 'NGN' }],
    ['the student is in credit', { balanceMinor: -100_000, currency: 'NGN' }],
    ['the detail carries no balance', {}],
  ])('shows no owed warning when %s', (_name, finance) => {
    setup(studentDetail(finance));
    expect(screen.queryByText(/is still owed/)).not.toBeInTheDocument();
  });

  it('lists the six reasons', () => {
    setup();
    expect(
      within(screen.getByLabelText('Reason'))
        .getAllByRole('option')
        .map((option) => option.textContent)
    ).toEqual([
      'Did not return',
      'Relocated',
      'Transferred to another school',
      'Fees',
      'Expelled',
      'Other',
    ]);
  });

  it('records the leaving and toasts with a Left tab action', async () => {
    const user = userEvent.setup();
    const success = vi.spyOn(toast, 'success').mockReturnValue(1);
    const { students, onOpenTab, onClose } = setup();
    await user.selectOptions(screen.getByLabelText('Reason'), 'transferred');
    const lastDay = screen.getByLabelText('Last day attended');
    await user.clear(lastDay);
    await user.type(lastDay, '2026-10-02');
    await user.click(screen.getByRole('button', { name: 'Record leaving' }));
    await waitFor(() => {
      expect(students.leave).toHaveBeenCalledWith({
        params: { id: student.id },
        body: { reason: 'transferred', lastDay: '2026-10-02' },
      });
    });
    await waitFor(() => {
      expect(success).toHaveBeenCalled();
    });
    const [message, options] = success.mock.calls[0] ?? [];
    expect(message).toBe('Recorded as left. Nothing was deleted.');
    const action = (
      options as { action: { label: string; onClick: () => void } }
    ).action;
    expect(action.label).toBe('Left tab');
    action.onClick();
    expect(onOpenTab).toHaveBeenCalledWith('left');
    expect(onClose).toHaveBeenCalled();
  });
});

describe('UndoLeavingDialog', () => {
  const left = studentDetail({
    life: 'left',
    exit: {
      kind: 'left',
      on: '2026-10-02',
      reason: 'Relocated',
      note: null,
      recordedOn: '2026-10-07',
    },
    archivedBy: { id: 'u1', name: 'Tunde Bakare' },
    canUndoLeaving: true,
  });

  it('shows the recorded line and undoes the leaving', async () => {
    const user = userEvent.setup();
    const success = vi.spyOn(toast, 'success').mockReturnValue(1);
    const mocks = api();
    renderWithApi(
      <UndoLeavingDialog student={left} onClose={vi.fn()} />,
      mocks
    );
    expect(screen.getByText('Undo Ada’s leaving?')).toBeInTheDocument();
    expect(
      screen.getByText(
        '2 Oct 2026 · Relocated · recorded by Tunde Bakare on 7 Oct 2026'
      )
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo leaving' }));
    await waitFor(() => {
      expect(success).toHaveBeenCalledWith('Ada is back on the roll.');
    });
  });

  it('toasts a refusal instead of showing it inline', async () => {
    const user = userEvent.setup();
    const error = vi.spyOn(toast, 'error').mockReturnValue(1);
    const mocks = api();
    mocks.students.undoLeaving.mockRejectedValue(
      new Error('The undo window has closed.')
    );
    renderWithApi(
      <UndoLeavingDialog student={left} onClose={vi.fn()} />,
      mocks
    );
    await user.click(screen.getByRole('button', { name: 'Undo leaving' }));
    await waitFor(() => {
      expect(error).toHaveBeenCalledWith('The undo window has closed.');
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('calls a graduation by its name', () => {
    renderWithApi(
      <UndoLeavingDialog
        student={{
          ...left,
          life: 'graduated',
          exit: left.exit && { ...left.exit, kind: 'graduated' },
        }}
        onClose={vi.fn()}
      />,
      api()
    );
    expect(screen.getByText('Undo Ada’s graduation?')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Undo graduation' })
    ).toBeInTheDocument();
  });
});

const campusAccess = (campusScope: 'all' | string[]): MePermissions =>
  fakeAccess({
    roles: ['custom'],
    permissions: toPermissionMap(['enrollment:place', 'session:read']),
    campusScope,
  });

describe('MoveDialog', () => {
  const movable = studentDetail({
    nextTerm: { id: TERM_SECOND_ID, name: 'Second term' },
    canMoveForNextTerm: true,
  });

  it('describes the two terms and defaults to the current class', async () => {
    renderWithApi(
      <MoveDialog student={movable} onClose={vi.fn()} />,
      api(),
      campusAccess('all')
    );
    expect(
      await screen.findByText(
        'First term stays in JSS 2 Gold; Second term gets a new placement.'
      )
    ).toBeInTheDocument();
    const select = await screen.findByLabelText('Second term class');
    await waitFor(() => {
      expect(select).toHaveValue(ARM_ID);
    });
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent)
    ).toEqual(['JSS 2 Gold · Lekki', 'JSS 2 Emerald · Ikeja']);
  });

  it('warns that the student leaves the list when the class is on another campus', async () => {
    const user = userEvent.setup();
    renderWithApi(
      <MoveDialog student={movable} onClose={vi.fn()} />,
      api(),
      campusAccess([IDS.lekki])
    );
    const select = await screen.findByLabelText('Second term class');
    await waitFor(() => {
      expect(select).toHaveValue(ARM_ID);
    });
    expect(
      screen.queryByText(/will no longer appear in your list/)
    ).not.toBeInTheDocument();
    await user.selectOptions(select, IDS.silver);
    expect(
      await screen.findByText(
        'Ada will no longer appear in your list from Second term.'
      )
    ).toBeInTheDocument();
  });

  it('adds the placement for the next term and toasts both terms', async () => {
    const user = userEvent.setup();
    const success = vi.spyOn(toast, 'success').mockReturnValue(1);
    const mocks = api();
    const onClose = vi.fn();
    renderWithApi(
      <MoveDialog student={movable} onClose={onClose} />,
      mocks,
      campusAccess('all')
    );
    const select = await screen.findByLabelText('Second term class');
    await waitFor(() => {
      expect(select).toHaveValue(ARM_ID);
    });
    await user.selectOptions(select, IDS.silver);
    await user.click(screen.getByRole('button', { name: 'Add placement' }));
    await waitFor(() => {
      expect(mocks.students.place).toHaveBeenCalledWith({
        params: { id: student.id },
        body: { termId: TERM_SECOND_ID, classArmId: IDS.silver },
      });
    });
    await waitFor(() => {
      expect(success).toHaveBeenCalledWith(
        'Second term placement added. First term is unchanged.'
      );
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('renders nothing without a next term', () => {
    renderWithApi(
      <MoveDialog student={student} onClose={vi.fn()} />,
      api(),
      campusAccess('all')
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
