import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { HandoverCandidate } from '@eduvault/api-contract';
import {
  AuthClientProvider,
  type EduvaultAuthClient,
} from '@eduvault/auth-client';
import { toast } from '@eduvault/ui';
import { fakeAccess, renderWithApi, starterAccess } from '../test-utils';
import { profile } from '../test-school';
import { DangerZonePage } from './danger-zone-page';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: { success: vi.fn(), error: vi.fn() },
}));

const tunde: HandoverCandidate = {
  userId: 'u-tunde',
  name: 'Tunde Bakare',
  title: 'School administrator',
  heldSenior: ['administrator'],
};
const emeka: HandoverCandidate = {
  userId: 'u-emeka',
  name: 'Emeka Obi',
  title: null,
  heldSenior: [],
};

const authClient = {
  organization: {
    list: vi.fn().mockResolvedValue({ data: [{ id: 'o2' }], error: null }),
    setActive: vi.fn().mockResolvedValue({ data: {}, error: null }),
  },
} as unknown as EduvaultAuthClient;

interface Options {
  access?: ReturnType<typeof fakeAccess>;
  candidates?: HandoverCandidate[];
  deletable?: { ok: boolean; reason?: string };
}

function setup({
  access,
  candidates = [tunde, emeka],
  deletable = { ok: true },
}: Options = {}) {
  const api = {
    school: {
      handoverCandidates: vi.fn().mockResolvedValue(candidates),
      handover: vi.fn().mockResolvedValue({ ownerUserId: tunde.userId }),
      deletable: vi.fn().mockResolvedValue(deletable),
      remove: vi.fn().mockResolvedValue({ id: 'school-1' }),
    },
    schoolAccount: { get: vi.fn().mockResolvedValue(profile()) },
  };
  const onHandedOver = vi.fn();
  const onDeleted = vi.fn();
  renderWithApi(
    <AuthClientProvider authClient={authClient}>
      <DangerZonePage onHandedOver={onHandedOver} onDeleted={onDeleted} />
    </AuthClientProvider>,
    api,
    access
  );
  return { api, onHandedOver, onDeleted };
}

const updateOnly = () =>
  fakeAccess({ roles: ['custom'], permissions: { organization: ['update'] } });

describe('DangerZonePage permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('tells someone with neither permission that only the owner can open it', () => {
    setup({ access: starterAccess('administrator') });

    expect(
      screen.getByText('Only the owner can open this page.')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Handing over or deleting the school is limited to the owner.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByText('Hand over the school')).not.toBeInTheDocument();
    expect(screen.queryByText('Delete the school')).not.toBeInTheDocument();
  });

  it('shows only Hand over the school with organization:update', async () => {
    setup({ access: updateOnly() });

    expect(await screen.findByText('Hand over the school')).toBeInTheDocument();
    expect(screen.queryByText('Delete the school')).not.toBeInTheDocument();
    expect(
      screen.getByText('Serious actions that are hard to undo. Take your time.')
    ).toBeInTheDocument();
  });

  it('shows both sections to an owner', async () => {
    setup();

    expect(await screen.findByText('Hand over the school')).toBeInTheDocument();
    expect(screen.getByText('Delete the school')).toBeInTheDocument();
  });
});

describe('handing the school over', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists the staff by name and title with the first one chosen', async () => {
    setup();

    const select = await screen.findByLabelText('New owner');
    expect(select).toHaveValue('u-tunde');
    expect(
      within(select).getByRole('option', {
        name: 'Tunde Bakare · School administrator',
      })
    ).toBeInTheDocument();
    expect(
      within(select).getByRole('option', { name: 'Emeka Obi' })
    ).toBeInTheDocument();
  });

  it('shows an empty state and disables the button when nobody can take over', async () => {
    setup({ candidates: [] });

    expect(await screen.findByText('Nobody to hand it to')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Hand over the school…' })
    ).toBeDisabled();
  });

  it('confirms with the bullets, then hands over and goes to the dashboard', async () => {
    const { api, onHandedOver } = setup();
    await screen.findByLabelText('New owner');

    fireEvent.click(
      screen.getByRole('button', { name: 'Hand over the school…' })
    );
    const dialog = within(await screen.findByRole('dialog'));
    expect(
      dialog.getByRole('heading', { name: 'Hand the school to Tunde Bakare?' })
    ).toBeInTheDocument();
    expect(
      dialog.getByText(
        /becomes an owner and can do everything, and stops being Administrator\./
      )
    ).toBeInTheDocument();
    expect(
      dialog.getByText(
        'You stay on the staff list, but you are no longer an owner.'
      )
    ).toBeInTheDocument();
    expect(
      dialog.getByText('Only an owner can hand it back.')
    ).toBeInTheDocument();
    expect(
      dialog.getByText(
        'You will lose access to this page as soon as you confirm.'
      )
    ).toBeInTheDocument();
    fireEvent.click(
      dialog.getByRole('button', { name: 'Hand over the school' })
    );

    await waitFor(() => {
      expect(api.school.handover).toHaveBeenCalledWith({
        body: { userId: 'u-tunde' },
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Ownership handed to Tunde Bakare. You are now a member.'
      );
    });
    await waitFor(() => {
      expect(onHandedOver).toHaveBeenCalledOnce();
    });
  });

  it('leaves out the senior-role clause for someone who holds none', async () => {
    setup();
    const select = await screen.findByLabelText('New owner');
    fireEvent.change(select, { target: { value: 'u-emeka' } });

    fireEvent.click(
      screen.getByRole('button', { name: 'Hand over the school…' })
    );
    const dialog = within(await screen.findByRole('dialog'));

    expect(dialog.queryByText(/stops being/)).not.toBeInTheDocument();
    expect(
      dialog.getByRole('heading', { name: 'Hand the school to Emeka Obi?' })
    ).toBeInTheDocument();
  });
});

describe('deleting the school', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('disables Delete school while the school has students', async () => {
    setup({
      deletable: {
        ok: false,
        reason: 'Not allowed: the school has students and money records.',
      },
    });

    expect(
      await screen.findByText('Delete this school now')
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Delete school' })
      ).toBeDisabled();
    });
  });

  it('needs the school’s name typed, then deletes and moves to the next school', async () => {
    const { api, onDeleted } = setup();
    const open = await screen.findByRole('button', { name: 'Delete school' });
    await waitFor(() => {
      expect(open).toBeEnabled();
    });

    fireEvent.click(open);
    const dialog = within(await screen.findByRole('dialog'));
    expect(
      dialog.getByRole('heading', { name: 'Delete Greenfield College?' })
    ).toBeInTheDocument();
    const confirm = dialog.getByRole('button', { name: 'Delete school' });
    expect(confirm).toBeDisabled();
    fireEvent.change(
      dialog.getByLabelText('Type the school’s name to confirm'),
      {
        target: { value: 'Greenfield College' },
      }
    );
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    await waitFor(() => {
      expect(api.school.remove).toHaveBeenCalledWith({
        body: { confirmName: 'Greenfield College' },
      });
    });
    await waitFor(() => {
      expect(authClient.organization.setActive).toHaveBeenCalledWith({
        organizationId: 'o2',
      });
    });
    await waitFor(() => {
      expect(onDeleted).toHaveBeenCalledOnce();
    });
  });
});
