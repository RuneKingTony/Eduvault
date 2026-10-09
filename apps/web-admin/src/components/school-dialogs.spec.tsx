import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import {
  ApiError,
  type PlatformSchool,
  type PlatformSchoolMember,
} from '@eduvault/api-contract';
import { notify } from '@eduvault/ui';
import { PlatformSchoolPage } from '../pages/platform-school-page';
import { auditRow, platformSchool, renderWithApi } from '../test-utils';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  notify: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

const members: PlatformSchoolMember[] = [
  {
    memberId: 'm1',
    userId: 'o1',
    name: 'Funmi Adeyemi',
    email: 'funmi@greenfield.test',
    roles: ['owner'],
  },
  {
    memberId: 'm2',
    userId: 'u2',
    name: 'Kola Ade',
    email: 'kola@greenfield.test',
    roles: ['administrator'],
  },
];

function setup(school: PlatformSchool = platformSchool()) {
  const platform = {
    schools: {
      get: vi.fn().mockResolvedValue(school),
      members: vi.fn().mockResolvedValue({ items: members }),
      suspend: vi.fn().mockResolvedValue({ ...school, status: 'suspended' }),
      reactivate: vi.fn().mockResolvedValue({ ...school, status: 'active' }),
      replaceOwner: vi.fn().mockResolvedValue({
        school,
        temporaryPassword: null,
      }),
    },
    audit: {
      list: vi
        .fn()
        .mockResolvedValue({ items: [auditRow()], nextCursor: null }),
    },
  };
  renderWithApi(
    <PlatformSchoolPage
      schoolId="s1"
      onActInSchool={vi.fn()}
      onBack={vi.fn()}
    />,
    { platform }
  );
  return platform.schools;
}

async function openAction(name: string) {
  fireEvent.keyDown(
    await screen.findByRole('button', { name: /More actions/ }),
    { key: 'Enter' }
  );
  fireEvent.click(await screen.findByRole('menuitem', { name }));
  return screen.findByRole('dialog');
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Act in this school', () => {
  it('says what it does in a tooltip', async () => {
    setup();
    fireEvent.focus(
      await screen.findByRole('button', { name: 'Act in this school' })
    );
    expect(
      (
        await screen.findAllByText(
          'Opens web-admin read-only; every request is audited'
        )
      ).length
    ).toBeGreaterThan(0);
  });
});

describe('Suspend dialog', () => {
  it('uses the PRD copy and suspends with a warning toast', async () => {
    const schools = setup();
    const dialog = await openAction('Suspend school…');
    expect(
      within(dialog).getByText('Suspend Greenfield College?')
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        'Staff, students and guardians can’t sign in while the school is suspended. No data changes.'
      )
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        'Use this for unpaid subscriptions or a security incident. The audit log records who suspended it.'
      )
    ).toBeInTheDocument();

    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Suspend school' })
    );
    await waitFor(() => {
      expect(schools.suspend).toHaveBeenCalledWith({ params: { id: 's1' } });
    });
    await waitFor(() => {
      expect(notify.warning).toHaveBeenCalledWith(
        'Greenfield College suspended.'
      );
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('cancels without calling the server', async () => {
    const schools = setup();
    const dialog = await openAction('Suspend school…');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(schools.suspend).not.toHaveBeenCalled();
  });

  it('shows a 409 and stays open', async () => {
    const schools = setup();
    schools.suspend.mockRejectedValue(
      new ApiError(409, {
        code: 'Conflict',
        message: 'This school is already suspended.',
      })
    );
    const dialog = await openAction('Suspend school…');
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Suspend school' })
    );
    expect(
      await within(dialog).findByText('This school is already suspended.')
    ).toBeInTheDocument();
    expect(notify.warning).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('Reactivate dialog', () => {
  it('uses the PRD copy and reactivates with a success toast', async () => {
    const schools = setup(platformSchool({ status: 'suspended' }));
    const dialog = await openAction('Reactivate…');
    expect(
      within(dialog).getByText('Reactivate Greenfield College?')
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText('Everyone can sign in again.')
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText('Reactivating is immediate.')
    ).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Reactivate' }));
    await waitFor(() => {
      expect(schools.reactivate).toHaveBeenCalledWith({ params: { id: 's1' } });
    });
    await waitFor(() => {
      expect(notify.success).toHaveBeenCalledWith(
        'Greenfield College reactivated.'
      );
    });
  });

  it('shows a 409 when the school is not suspended', async () => {
    const schools = setup(platformSchool({ status: 'suspended' }));
    schools.reactivate.mockRejectedValue(
      new ApiError(409, {
        code: 'Conflict',
        message: 'This school is not suspended.',
      })
    );
    const dialog = await openAction('Reactivate…');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reactivate' }));
    expect(
      await within(dialog).findByText('This school is not suspended.')
    ).toBeInTheDocument();
  });
});

describe('Replace owner dialog', () => {
  it('explains itself and lists only members who are not owners', async () => {
    setup();
    const dialog = await openAction('Replace owner…');
    expect(
      within(dialog).getByText('Replace the owner of Greenfield College')
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        'The new owner is added first, then the old owner loses the owner role. The school is never without an owner.'
      )
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText('What happens to Funmi Adeyemi')
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('radio', {
        name: 'Stays as a member with no roles',
      })
    ).toBeChecked();
    expect(
      within(dialog).getByRole('radio', { name: 'Is removed from the school' })
    ).not.toBeChecked();
    expect(
      await within(dialog).findByRole('option', { name: /Kola Ade/ })
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole('option', { name: /Funmi Adeyemi/ })
    ).not.toBeInTheDocument();
  });

  it('replaces the owner with an existing member and says so', async () => {
    const schools = setup();
    const dialog = await openAction('Replace owner…');
    await within(dialog).findByRole('option', { name: /Kola Ade/ });

    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Replace owner' })
    );
    expect(
      await within(dialog).findByText('Choose who becomes the owner.')
    ).toBeInTheDocument();
    expect(schools.replaceOwner).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText('Member'), {
      target: { value: 'm2' },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Replace owner' })
    );
    await waitFor(() => {
      expect(schools.replaceOwner).toHaveBeenCalledWith({
        params: { id: 's1' },
        body: { newOwner: { memberId: 'm2' }, previousOwner: 'member' },
      });
    });
    await waitFor(() => {
      expect(notify.success).toHaveBeenCalledWith(
        'Kola Ade is now the owner of Greenfield College.'
      );
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('removes the old owner when asked', async () => {
    const schools = setup();
    const dialog = await openAction('Replace owner…');
    await within(dialog).findByRole('option', { name: /Kola Ade/ });
    fireEvent.change(within(dialog).getByLabelText('Member'), {
      target: { value: 'm2' },
    });
    fireEvent.click(
      within(dialog).getByRole('radio', { name: 'Is removed from the school' })
    );
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Replace owner' })
    );
    await waitFor(() => {
      expect(schools.replaceOwner).toHaveBeenCalledWith({
        params: { id: 's1' },
        body: { newOwner: { memberId: 'm2' }, previousOwner: 'remove' },
      });
    });
  });

  it('adds a new person and shows their temporary password once', async () => {
    const schools = setup();
    schools.replaceOwner.mockResolvedValue({
      school: platformSchool(),
      temporaryPassword: 'Tmp9Pass2Word',
    });
    const dialog = await openAction('Replace owner…');
    fireEvent.click(
      within(dialog).getByRole('radio', { name: 'A new person' })
    );

    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Replace owner' })
    );
    expect(
      await within(dialog).findByText('Enter the new owner’s name and email.')
    ).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText('Name'), {
      target: { value: 'Ngozi Eze' },
    });
    fireEvent.change(within(dialog).getByLabelText('Email'), {
      target: { value: 'ngozi@greenfield.test' },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Replace owner' })
    );

    await waitFor(() => {
      expect(schools.replaceOwner).toHaveBeenCalledWith({
        params: { id: 's1' },
        body: {
          newOwner: { name: 'Ngozi Eze', email: 'ngozi@greenfield.test' },
          previousOwner: 'member',
        },
      });
    });
    const password = await screen.findByRole('dialog', {
      name: 'New owner of Greenfield College',
    });
    expect(within(password).getByText('Tmp9Pass2Word')).toBeInTheDocument();
    expect(
      within(password).getByText('ngozi@greenfield.test')
    ).toBeInTheDocument();
    expect(
      within(password).getByText(/It won’t be shown again/)
    ).toBeInTheDocument();
    expect(notify.success).toHaveBeenCalledWith(
      'Ngozi Eze is now the owner of Greenfield College.'
    );

    fireEvent.click(within(password).getByRole('button', { name: 'Done' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(screen.queryByText('Tmp9Pass2Word')).not.toBeInTheDocument();
  });

  it('shows a 409 from the server', async () => {
    const schools = setup();
    schools.replaceOwner.mockRejectedValue(
      new ApiError(409, {
        code: 'Conflict',
        message: 'That person is already the only owner.',
      })
    );
    const dialog = await openAction('Replace owner…');
    await within(dialog).findByRole('option', { name: /Kola Ade/ });
    fireEvent.change(within(dialog).getByLabelText('Member'), {
      target: { value: 'm2' },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Replace owner' })
    );
    expect(
      await within(dialog).findByText('That person is already the only owner.')
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
