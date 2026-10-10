import { fireEvent, screen } from '@testing-library/react';
import {
  ApiError,
  type MePermissions,
  type MemberDetail,
} from '@eduvault/api-contract';
import { renderWithApi, starterAccess } from '../test-utils';
import { CATALOGUE, IKEJA, LEKKI, detail } from '../test-members';
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
    await screen.findByRole('heading', { name: 'Ada Obi' });
    expect(
      screen.queryByRole('button', { name: 'More actions' })
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

  it('hides Remove without member:delete', async () => {
    setup({ access: starterAccess('administrator') });
    await screen.findByRole('heading', { name: 'Ada Obi' });
    expect(
      screen.queryByRole('button', { name: 'More actions' })
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
});
