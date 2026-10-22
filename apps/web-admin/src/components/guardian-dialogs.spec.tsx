import { useState } from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError, type MePermissions } from '@eduvault/api-contract';
import { toast } from '@eduvault/ui';
import { toPermissionMap, type Permission } from '@eduvault/policy';
import { fakeAccess, renderWithApi } from '../test-utils';
import {
  GUARDIAN_ID,
  OTHER_GUARDIAN_ID,
  STUDENT_ID,
  THIRD_GUARDIAN_ID,
  TOBI_ID,
  guardianDetail,
  guardianLink,
  preview,
} from '../test-students';
import type { GuardianAction } from './guardian-actions';
import { GuardianDialogs } from './guardian-dialogs';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: { success: vi.fn(), error: vi.fn() },
}));

let user: ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  user = userEvent.setup();
});

const student = {
  id: STUDENT_ID,
  firstName: 'Ada',
  lastName: 'Okeke',
  onRoll: true,
};

const bayo = {
  id: OTHER_GUARDIAN_ID,
  fullName: 'Bayo Adewale',
  phone: '0807',
  outsideScope: false,
};

const accessWith = (...permissions: Permission[]): MePermissions =>
  fakeAccess({
    roles: ['custom'],
    permissions: toPermissionMap(permissions),
    campusScope: 'all',
  });

const ALL: Permission[] = [
  'student:read',
  'student:create',
  'guardian:read',
  'guardian:link',
  'guardian:create',
  'guardian:update',
];

function Harness({ start }: { start: GuardianAction }) {
  const [action, setAction] = useState<GuardianAction | null>(start);
  return (
    <GuardianDialogs
      action={action}
      schoolName="Greenfield College"
      onAction={setAction}
    />
  );
}

function setup(
  start: GuardianAction,
  options: {
    links?: ReturnType<typeof guardianLink>[];
    detail?: ReturnType<typeof guardianDetail>;
    others?: (typeof bayo)[];
    requireGuardian?: boolean;
    access?: MePermissions;
  } = {}
) {
  const api = {
    students: {
      guardians: vi.fn().mockResolvedValue(options.links ?? [guardianLink()]),
      linkGuardian: vi.fn(),
      updateGuardianLink: vi.fn().mockResolvedValue(guardianLink()),
      unlinkGuardian: vi.fn(
        ({ params }: { params: { id: string; guardianId: string } }) =>
          Promise.resolve({
            studentId: params.id,
            guardianId: params.guardianId,
          })
      ),
    },
    guardians: {
      list: vi.fn().mockResolvedValue(options.others ?? []),
      get: vi.fn().mockResolvedValue(options.detail ?? guardianDetail()),
      update: vi.fn().mockResolvedValue(guardianDetail()),
      resetLogin: vi.fn().mockResolvedValue({
        username: 'okeke-father',
        temporaryPassword: 'NewPass2345Xy',
      }),
    },
    admissions: {
      preview: vi
        .fn()
        .mockResolvedValue(
          preview({ requireGuardian: options.requireGuardian ?? true })
        ),
    },
    schoolSettings: { get: vi.fn() },
  };
  renderWithApi(
    <Harness start={start} />,
    api,
    options.access ?? accessWith(...ALL)
  );
  return api;
}

describe('AddGuardianDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens in New guardian mode when every guardian is already linked and offers the title and login copy', async () => {
    setup({ kind: 'add', student }, { links: [] });
    expect(
      await screen.findByText('Add a guardian for Ada Okeke')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Every guardian has their own login, so the family sees this child in the portal.'
      )
    ).toBeInTheDocument();
    expect(await screen.findByLabelText('New guardian')).toBeChecked();
    expect(
      screen.getByLabelText('Pays the school fees (receives the charges)')
    ).toBeChecked();
  });

  it('opens in Existing mode when the school has a guardian not yet linked, and does not tick the payer', async () => {
    setup(
      { kind: 'add', student },
      {
        others: [bayo],
      }
    );
    expect(await screen.findByLabelText('Existing guardian')).toBeChecked();
    expect(
      screen.getByLabelText('Pays the school fees (receives the charges)')
    ).not.toBeChecked();
  });

  it('toasts when Existing is chosen with nobody picked', async () => {
    setup(
      { kind: 'add', student },
      {
        others: [bayo],
      }
    );
    await screen.findByLabelText('Existing guardian');
    await user.click(screen.getByRole('button', { name: 'Add guardian' }));
    expect(toast.error).toHaveBeenCalledWith(
      'Choose the existing guardian, or switch to New guardian.'
    );
  });

  it('links an existing guardian and toasts the PRD copy', async () => {
    const api = setup(
      { kind: 'add', student },
      {
        others: [bayo],
      }
    );
    api.students.linkGuardian.mockImplementation(
      ({ body }: { body: { existingGuardianId: string } }) =>
        Promise.resolve({
          link: guardianLink({
            guardianId: body.existingGuardianId,
            fullName: bayo.fullName,
          }),
        })
    );
    await user.selectOptions(
      await screen.findByLabelText('Guardian'),
      OTHER_GUARDIAN_ID
    );
    await user.click(screen.getByRole('button', { name: 'Add guardian' }));
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Bayo Adewale linked to Ada Okeke.'
      );
    });
    expect(api.students.linkGuardian).toHaveBeenCalledWith({
      params: { id: STUDENT_ID },
      body: {
        existingGuardianId: OTHER_GUARDIAN_ID,
        relationship: 'mother',
        paysFees: false,
      },
    });
  });

  it('adds a new guardian by username, toasts and shows the credentials once', async () => {
    const api = setup({ kind: 'add', student }, { links: [] });
    api.students.linkGuardian.mockResolvedValue({
      link: guardianLink({
        fullName: 'Mrs Udoh',
        loginKind: 'username',
        email: null,
        username: 'udoh-family',
      }),
      login: {
        who: 'guardian',
        name: 'Mrs Udoh',
        guardianId: THIRD_GUARDIAN_ID,
        relationship: 'mother',
        username: 'udoh-family',
        temporaryPassword: 'Abcd2345Wxyz',
        existing: false,
      },
    });
    await user.type(await screen.findByLabelText('Full name'), 'Mrs Udoh');
    await user.type(screen.getByLabelText('Phone'), '08012345678');
    await user.type(screen.getByLabelText('House address'), '4 Palm Close');
    await user.click(screen.getByLabelText(/With a username/));
    await user.click(screen.getByRole('button', { name: 'Add guardian' }));
    expect(await screen.findByText('Logins created')).toBeInTheDocument();
    expect(screen.getAllByText('Abcd2345Wxyz').length).toBeGreaterThan(0);
    expect(toast.success).toHaveBeenCalledWith(
      'Mrs Udoh added with a login. Username udoh-family, shown once.'
    );
  });

  it('shows the server refusal inline', async () => {
    const api = setup({ kind: 'add', student }, { links: [] });
    api.students.linkGuardian.mockRejectedValue(
      new ApiError(400, {
        code: 'BadRequest',
        message: 'A student can have at most 4 guardians.',
      })
    );
    await user.type(await screen.findByLabelText('Full name'), 'Mrs Udoh');
    await user.type(screen.getByLabelText('Phone'), '08012345678');
    await user.type(screen.getByLabelText('House address'), '4 Palm Close');
    await user.type(screen.getByLabelText('Email'), 'udoh@example.test');
    await user.click(screen.getByRole('button', { name: 'Add guardian' }));
    expect(
      await screen.findByText('A student can have at most 4 guardians.')
    ).toBeInTheDocument();
  });
});

describe('EditLinkDialog', () => {
  it('titles the dialog, saves the change and toasts Saved.', async () => {
    const api = setup({ kind: 'edit-link', student, link: guardianLink() });
    expect(
      await screen.findByText('Edit Ngozi Okeke’s link to Ada')
    ).toBeInTheDocument();
    await user.selectOptions(
      screen.getByLabelText('Relationship to this child'),
      'guardian'
    );
    await user.click(
      screen.getByLabelText('Pays the school fees (receives the charges)')
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Saved.');
    });
    expect(api.students.updateGuardianLink).toHaveBeenCalledWith({
      params: { id: STUDENT_ID, guardianId: GUARDIAN_ID },
      body: { relationship: 'guardian', paysFees: false },
    });
  });

  it('shows the no-payer refusal inline', async () => {
    const api = setup({ kind: 'edit-link', student, link: guardianLink() });
    api.students.updateGuardianLink.mockRejectedValue(
      new ApiError(409, {
        code: 'Conflict',
        message: 'At least one guardian must pay the school fees.',
      })
    );
    await user.click(await screen.findByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText('At least one guardian must pay the school fees.')
    ).toBeInTheDocument();
  });
});

const remove = (
  links: ReturnType<typeof guardianLink>[],
  link = links[0]!
) => ({
  start: { kind: 'remove-link', student, link } as GuardianAction,
  links,
});

describe('RemoveLinkDialog', () => {
  it('titles the dialog and removes the link with the PRD toast', async () => {
    const second = guardianLink({
      guardianId: OTHER_GUARDIAN_ID,
      fullName: 'Ifeanyi Okeke',
      paysFees: false,
    });
    const first = guardianLink();
    const { start, links } = remove([first, second], second);
    const api = setup(start, {
      links,
      detail: guardianDetail({
        children: [
          {
            studentId: STUDENT_ID,
            name: 'Ada Okeke',
            relationship: 'father',
            paysFees: false,
          },
          {
            studentId: TOBI_ID,
            name: 'Chidi Okeke',
            relationship: 'father',
            paysFees: false,
          },
        ],
      }),
    });
    expect(
      await screen.findByText('Remove Ifeanyi Okeke from Ada?')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Ifeanyi Okeke will no longer see Ada in the portal or receive their charges/
      )
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Remove' })).toBeEnabled();
    });
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Ifeanyi Okeke removed from Ada Okeke.'
      );
    });
    expect(api.students.unlinkGuardian).toHaveBeenCalledWith({
      params: { id: STUDENT_ID, guardianId: OTHER_GUARDIAN_ID },
    });
  });

  it('disables Remove for the only payer and says to tick another guardian first', async () => {
    const second = guardianLink({
      guardianId: OTHER_GUARDIAN_ID,
      fullName: 'Ifeanyi Okeke',
      paysFees: false,
    });
    const { start, links } = remove([guardianLink(), second]);
    setup(start, { links });
    expect(
      await screen.findByText('Tick another guardian as paying fees first.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled();
  });

  it('disables Remove for the last guardian while one is required', async () => {
    const { start, links } = remove([guardianLink()]);
    setup(start, { links, requireGuardian: true });
    expect(
      await screen.findByText(
        'A student needs at least one guardian. Add another guardian first.'
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled();
  });

  it('lets the last guardian go when a guardian is not required', async () => {
    const { start, links } = remove([guardianLink()]);
    setup(start, { links, requireGuardian: false });
    await screen.findByText('Remove Ngozi Okeke from Ada?');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Remove' })).toBeEnabled();
    });
  });

  it('adds the last-child note naming the school', async () => {
    const { start, links } = remove([
      guardianLink(),
      guardianLink({ guardianId: OTHER_GUARDIAN_ID, paysFees: false }),
    ]);
    setup(start, { links });
    expect(
      await screen.findByText(
        'Ngozi Okeke has no other children here, so they will lose access to Greenfield College in the portal.'
      )
    ).toBeInTheDocument();
  });
});

describe('GuardianProfileDialog', () => {
  it('shows the contact rows and the children the viewer can see', async () => {
    setup({ kind: 'profile', guardianId: GUARDIAN_ID });
    expect(
      await screen.findByText('Ngozi Okeke', { selector: 'h3' })
    ).toBeInTheDocument();
    expect(screen.getByText('0803 456 7890')).toBeInTheDocument();
    expect(screen.getByText('ngozi@example.test')).toBeInTheDocument();
    expect(screen.getByText('12 Admiralty Way')).toBeInTheDocument();
    expect(screen.getByText('Ada Okeke · Mother')).toBeInTheDocument();
    expect(screen.getByText('Email login')).toBeInTheDocument();
  });

  it('shows the username when there is no email and Not recorded for no address', async () => {
    setup(
      { kind: 'profile', guardianId: GUARDIAN_ID },
      {
        detail: guardianDetail({
          email: null,
          username: 'okeke-father',
          address: null,
          children: [],
        }),
      }
    );
    expect(await screen.findByText('okeke-father')).toBeInTheDocument();
    expect(screen.getByText('Not recorded')).toBeInTheDocument();
    expect(screen.getByText('None in your scope')).toBeInTheDocument();
    expect(screen.getByText('Username login')).toBeInTheDocument();
  });

  it('offers Edit details and Reset login with guardian:update only', async () => {
    setup({ kind: 'profile', guardianId: GUARDIAN_ID });
    expect(
      await screen.findByRole('button', { name: 'Edit details' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Reset login' })
    ).toBeInTheDocument();
  });

  it('hides them with guardian:read alone', async () => {
    setup(
      { kind: 'profile', guardianId: GUARDIAN_ID },
      { access: accessWith('student:read', 'guardian:read') }
    );
    await screen.findByText('Ngozi Okeke', { selector: 'h3' });
    expect(
      screen.queryByRole('button', { name: 'Edit details' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Reset login' })
    ).not.toBeInTheDocument();
  });

  it('opens the edit dialog from the card and saves the new details', async () => {
    const api = setup({ kind: 'profile', guardianId: GUARDIAN_ID });
    await user.click(
      await screen.findByRole('button', { name: 'Edit details' })
    );
    expect(
      await screen.findByText('Edit Ngozi Okeke’s details')
    ).toBeInTheDocument();
    const phone = screen.getByLabelText('Phone');
    await user.clear(phone);
    await user.type(phone, '08099990000');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Saved.');
    });
    expect(api.guardians.update).toHaveBeenCalledWith({
      params: { id: GUARDIAN_ID },
      body: {
        fullName: 'Ngozi Okeke',
        phone: '08099990000',
        address: '12 Admiralty Way',
      },
    });
  });

  it('refuses a short phone number in the edit dialog with the PRD copy', async () => {
    const api = setup({ kind: 'profile', guardianId: GUARDIAN_ID });
    await user.click(
      await screen.findByRole('button', { name: 'Edit details' })
    );
    const phone = await screen.findByLabelText('Phone');
    await user.clear(phone);
    await user.type(phone, '12');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(
      await screen.findByText('Enter a phone number.')
    ).toBeInTheDocument();
    expect(api.guardians.update).not.toHaveBeenCalled();
  });

  it('resets the login and shows the new password once', async () => {
    const api = setup({ kind: 'profile', guardianId: GUARDIAN_ID });
    await user.click(
      await screen.findByRole('button', { name: 'Reset login' })
    );
    expect(
      await screen.findByText('Reset Ngozi Okeke’s login?')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /They get a new temporary password and must choose their own the next time they sign in/
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText('Signs in with ngozi@example.test.')
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reset login' }));
    expect(
      await screen.findByText('New login for Ngozi Okeke')
    ).toBeInTheDocument();
    expect(screen.getAllByText('NewPass2345Xy').length).toBeGreaterThan(0);
    expect(api.guardians.resetLogin).toHaveBeenCalledWith({
      params: { id: GUARDIAN_ID },
    });
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByText('NewPass2345Xy')).not.toBeInTheDocument();
  });
});
