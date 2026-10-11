import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { LoginCredential } from '@eduvault/api-contract';
import { toast } from '@eduvault/ui';
import { LoginsDialog } from './logins-dialog';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: { success: vi.fn(), error: vi.fn() },
}));

const student: LoginCredential = {
  who: 'student',
  name: 'Peace Udoh',
  username: 'greenfield-0234',
  temporaryPassword: 'Abcd2345Wxyz',
  existing: false,
};
const guardian: LoginCredential = {
  who: 'guardian',
  name: 'Mrs Udoh',
  guardianId: 'g1',
  relationship: 'mother',
  email: 'udoh@example.test',
  temporaryPassword: 'Efgh6789Jklm',
  existing: false,
};
const reused: LoginCredential = {
  who: 'guardian',
  name: 'Shared Parent',
  guardianId: 'g2',
  relationship: 'father',
  email: 'shared@example.test',
  existing: true,
};

function setup(logins: LoginCredential[] = [student, guardian]) {
  const onDone = vi.fn();
  render(
    <LoginsDialog
      open
      studentFirstName="Peace"
      logins={logins}
      schoolName="Greenfield College"
      onDone={onDone}
    />
  );
  return { onDone };
}

describe('LoginsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('lists the student first, then the guardians, with who they are and the once-only note', () => {
    setup();
    expect(screen.getByText('Logins created')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Write these down or print them now. Temporary passwords are not shown again.'
      )
    ).toBeInTheDocument();
    const names = screen.getAllByText(/Peace Udoh|Mrs Udoh/, {
      selector: 'span.font-semibold',
    });
    expect(names.map((name) => name.textContent)).toEqual([
      'Peace Udoh',
      'Mrs Udoh',
    ]);
    expect(screen.getByText('Student')).toBeInTheDocument();
    expect(screen.getByText('Mother of Peace')).toBeInTheDocument();
    expect(
      screen.getByText(
        'They choose their own password the first time they sign in to the portal.'
      )
    ).toBeInTheDocument();
  });

  it('shows a username or an email and the temporary password', () => {
    setup();
    expect(screen.getAllByText('greenfield-0234').length).toBeGreaterThan(0);
    expect(screen.getAllByText('udoh@example.test').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Abcd2345Wxyz').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Username').length).toBe(1);
    expect(screen.getAllByText('Email').length).toBe(1);
  });

  it('copies a value and toasts Copied.', async () => {
    setup();
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Copy temporary password' })[0]!
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Abcd2345Wxyz');
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Copied.');
    });
  });

  it('says a reused login keeps its own sign-in and shows no password for it', () => {
    setup([reused]);
    expect(
      screen.getByText('They sign in with their existing login.')
    ).toBeInTheDocument();
    expect(screen.queryByText('Temporary password')).not.toBeInTheDocument();
  });

  it('prints one slip per new login with the portal address and the change-password line', () => {
    const print = vi
      .spyOn(globalThis, 'print')
      .mockImplementation(() => undefined);
    setup([student, guardian, reused]);
    fireEvent.click(screen.getByRole('button', { name: 'Print slip' }));
    expect(print).toHaveBeenCalled();
    const slips = document.querySelector('[data-print-slips]');
    expect(slips?.querySelectorAll('section')).toHaveLength(2);
    expect(slips?.textContent).toContain('Portal login for Peace Udoh');
    expect(slips?.textContent).toContain('Greenfield College');
    expect(slips?.textContent).toContain('Go to http://localhost:4201');
    expect(slips?.textContent).toContain(
      'Change this password the first time you sign in.'
    );
  });

  it('closes with Done', () => {
    const { onDone } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onDone).toHaveBeenCalled();
  });
});
