import { fireEvent, screen, waitFor } from '@testing-library/react';
import {
  ApiError,
  type MePermissions,
  type MemberDetail,
} from '@eduvault/api-contract';
import { toPermissionMap } from '@eduvault/policy';
import {
  actingAccess,
  fakeAccess,
  renderWithApi,
  starterAccess,
} from '../test-utils';
import { CATALOGUE, IKEJA, LEKKI, detail } from '../test-members';
import { approvedLeave, leaveDto } from '../test-leave';
import { MemberPage, type NewAccountNotice } from './member-page';

interface Options {
  member?: MemberDetail | Error;
  notice?: NewAccountNotice;
  access?: MePermissions;
}

function setup({ member = detail(), notice, access }: Options = {}) {
  const onBack = vi.fn();
  const onRemoved = vi.fn().mockResolvedValue(undefined);
  const api = {
    members: {
      get:
        member instanceof Error
          ? vi.fn().mockRejectedValue(member)
          : vi.fn().mockResolvedValue(member),
      roles: vi.fn().mockResolvedValue(CATALOGUE),
    },
    campuses: { list: vi.fn().mockResolvedValue([LEKKI, IKEJA]) },
    me: { get: vi.fn().mockResolvedValue({ user: { id: 'someone-else' } }) },
    leave: {
      list: vi.fn().mockResolvedValue([
        approvedLeave({ reason: 'Private reason' }),
        leaveDto({
          id: 'two',
          startsOn: '2026-10-20',
          endsOn: '2026-10-20',
          days: 1,
        }),
      ]),
    },
  };
  renderWithApi(
    <MemberPage
      memberId="m1"
      schoolName="Greenfield College"
      notice={notice}
      onBack={onBack}
      onRemoved={onRemoved}
    />,
    api,
    access
  );
  return { onBack, onRemoved, api };
}

async function openMenu() {
  const trigger = await screen.findByRole('button', { name: 'More actions' });
  fireEvent.keyDown(trigger, { key: 'Enter' });
}

describe('MemberPage', () => {
  it('shows the name, title and email with the cards', async () => {
    setup();
    expect(
      await screen.findByRole('heading', { name: 'Ada Obi' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('Head of maths · ada@example.test')
    ).toBeInTheDocument();
    expect(screen.getByText('What they can do')).toBeInTheDocument();
    expect(
      screen.getByText('Nothing yet. Give them a role to get started.')
    ).toBeInTheDocument();
  });

  it('shows the classes a class teacher teaches', async () => {
    setup({
      member: detail({
        permissions: toPermissionMap(['class:read']),
        classScope: ['arm-1'],
        classes: [{ id: 'arm-1', displayName: 'JSS 1 Gold' }],
      }),
    });
    expect(
      await screen.findByText('JSS 1 Gold (classes they teach)')
    ).toBeInTheDocument();
  });

  it('shows the temporary password callout only when it is passed', async () => {
    setup({ notice: { temporaryPassword: 'placeholder-only' } });
    expect(await screen.findByText(/Account created\./)).toBeInTheDocument();
    expect(screen.getByText('placeholder-only')).toBeInTheDocument();
  });

  it('says an existing account keeps its password', async () => {
    setup({ notice: { temporaryPassword: null } });
    expect(
      await screen.findByText(
        'Ada Obi already has an Eduvault account. They sign in with their existing password.'
      )
    ).toBeInTheDocument();
  });

  it('has no callout without a notice', async () => {
    setup();
    await screen.findByRole('heading', { name: 'Ada Obi' });
    expect(screen.queryByText(/Account created/)).not.toBeInTheDocument();
  });

  it('offers the More actions menu for a member who is not the last owner', async () => {
    setup({ member: detail({ roles: ['member', 'teacher'] }) });
    expect(
      await screen.findByRole('button', { name: 'More actions' })
    ).toBeInTheDocument();
  });

  it('hides Remove for the school’s last owner', async () => {
    setup({
      member: detail({ roles: ['member', 'owner'], lastOwner: true }),
    });
    await openMenu();
    expect(
      screen.queryByRole('menuitem', { name: 'Remove from school…' })
    ).not.toBeInTheDocument();
  });

  it('shows Remove for an owner when there is a second owner', async () => {
    setup({
      member: detail({ roles: ['member', 'owner'], lastOwner: false }),
    });
    expect(
      await screen.findByRole('button', { name: 'More actions' })
    ).toBeInTheDocument();
  });

  it('hides Remove without member:delete but still offers a reset', async () => {
    setup({ access: starterAccess('administrator') });
    await openMenu();
    expect(
      screen.getByRole('menuitem', { name: 'Reset password…' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: 'Remove from school…' })
    ).not.toBeInTheDocument();
  });

  it('offers a reset to an editor and opens its confirmation', async () => {
    setup({ member: detail({ roles: ['member', 'teacher'] }) });
    await openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reset password…' }));
    expect(
      await screen.findByRole('heading', { name: 'Reset Ada Obi’s password?' })
    ).toBeInTheDocument();
  });

  it('offers no reset without member:update', async () => {
    setup({
      member: detail({ roles: ['member', 'teacher'] }),
      access: fakeAccess({
        permissions: toPermissionMap(['member:read', 'member:delete']),
      }),
    });
    await openMenu();
    expect(
      screen.queryByRole('menuitem', { name: 'Reset password…' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Remove from school…' })
    ).toBeInTheDocument();
  });

  it('offers no reset for your own page', async () => {
    setup({
      member: detail({ roles: ['member', 'teacher'], userId: 'someone-else' }),
    });
    await openMenu();
    expect(
      screen.queryByRole('menuitem', { name: 'Reset password…' })
    ).not.toBeInTheDocument();
  });

  it('shows a not found state with Go back', async () => {
    const { onBack } = setup({
      member: new ApiError(404, {
        code: 'NotFound',
        message: 'Member not found',
      }),
    });
    expect(await screen.findByText('Member not found')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(onBack).toHaveBeenCalled();
  });

  describe('acting', () => {
    it('renders read-only for a super admin without a reason', async () => {
      setup({
        member: detail({ roles: ['member', 'teacher'] }),
        access: actingAccess(false),
      });
      await screen.findByRole('heading', { name: 'Ada Obi' });
      expect(
        screen.queryByRole('button', { name: 'More actions' })
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/^1\. Roles/)).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Next' })
      ).not.toBeInTheDocument();
      expect(screen.getAllByRole('switch').length).toBeGreaterThan(0);
      for (const control of [
        ...screen.getAllByRole('switch'),
        ...screen.getAllByRole('checkbox'),
      ]) {
        expect(control).toBeDisabled();
      }
    });

    it('offers the controls once the super admin has given a reason', async () => {
      setup({
        member: detail({ roles: ['member', 'teacher'] }),
        access: actingAccess(true),
      });
      expect(
        await screen.findByRole('button', { name: 'More actions' })
      ).toBeInTheDocument();
      expect(screen.getByText(/^1\. Roles/)).toBeInTheDocument();
    });
  });

  it('offers Edit job title to an editor and opens its dialog', async () => {
    setup();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Edit job title' })
    );
    expect(
      await screen.findByRole('heading', { name: 'Edit Ada Obi’s job title' })
    ).toBeInTheDocument();
  });

  it('hides Edit job title without member:update', async () => {
    setup({
      access: fakeAccess({ permissions: toPermissionMap(['member:read']) }),
    });
    await screen.findByRole('heading', { name: 'Ada Obi' });
    expect(
      screen.queryByRole('button', { name: 'Edit job title' })
    ).not.toBeInTheDocument();
  });
});

describe('MemberPage leave card', () => {
  it('lists the member’s leave, with no reasons, for a leave approver', async () => {
    const { api } = setup({
      access: starterAccess('principal'),
      member: detail({ userId: 'user-emeka' }),
    });

    expect(await screen.findByText('Leave')).toBeVisible();
    expect(await screen.findAllByText('Sick leave')).toHaveLength(2);
    expect(
      screen.getByText('12 Oct 2026 – 13 Oct 2026 · 2 days')
    ).toBeVisible();
    expect(screen.getByText('Approved')).toBeVisible();
    expect(screen.getByText('Waiting')).toBeVisible();
    expect(screen.queryByText('Private reason')).toBeNull();
    expect(api.leave.list).toHaveBeenCalledWith({
      query: { status: 'all', userId: 'user-emeka' },
    });
  });

  it('leaves the card, and the request, out for someone who cannot approve leave', async () => {
    const { api } = setup({ access: starterAccess('administrator') });
    await screen.findByRole('heading', { name: 'Ada Obi' });
    await waitFor(() => {
      expect(screen.queryByText('Sick leave')).toBeNull();
    });
    expect(api.leave.list).not.toHaveBeenCalled();
  });
});
