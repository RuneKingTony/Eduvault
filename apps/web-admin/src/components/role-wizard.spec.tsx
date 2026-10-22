import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SchoolRole } from '@eduvault/api-contract';
import { renderWithApi } from '../test-utils';
import { CATALOGUE, IKEJA, LEKKI, detail } from '../test-members';
import { RoleWizard } from './role-wizard';

function setup({
  member = detail(),
  roles = CATALOGUE,
  canEdit = true,
  updateRoles = vi
    .fn()
    .mockResolvedValue(detail({ roles: ['member', 'teacher'] })),
}: {
  member?: ReturnType<typeof detail>;
  roles?: SchoolRole[];
  canEdit?: boolean;
  updateRoles?: ReturnType<typeof vi.fn>;
} = {}) {
  renderWithApi(
    <RoleWizard
      member={member}
      roles={roles}
      campuses={[LEKKI, IKEJA]}
      canEdit={canEdit}
      isSelf={false}
    />,
    { members: { updateRoles } }
  );
  return { updateRoles };
}

let user: ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  user = userEvent.setup();
});

const tick = (name: RegExp) =>
  user.click(screen.getByRole('checkbox', { name }));
const next = () => user.click(screen.getByRole('button', { name: /^Next/ }));
const stepper = () =>
  screen
    .getAllByRole('listitem')
    .filter(
      (item) =>
        item.hasAttribute('aria-current') || /^\d\./.test(item.textContent)
    )
    .map((item) => item.textContent);

describe('RoleWizard', () => {
  it('goes roles, campuses, review when the draft needs a campus', async () => {
    const { updateRoles } = setup();
    await tick(/Teacher/);
    expect(stepper().join(' ')).toContain('2. Campuses');
    expect(
      screen.getByText('1 more, 0 fewer things they can do')
    ).toBeInTheDocument();
    await next();
    expect(screen.getByText(/Where will Ada work\?/)).toBeInTheDocument();
    await next();
    expect(screen.getByText('Will be able to')).toBeInTheDocument();
    expect(screen.getByText('Campuses: Lekki')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Review and save' }));
    await waitFor(() => {
      expect(updateRoles).toHaveBeenCalledWith({
        params: { id: detail().id },
        body: { roles: ['teacher'], campusIds: [LEKKI.id] },
      });
    });
  });

  it('shows No roles on the review step when the draft holds none', async () => {
    setup({ member: detail({ roles: ['member', 'teacher'] }) });
    await tick(/Teacher/);
    await next();
    await next();
    expect(screen.getByText('No roles')).toBeInTheDocument();
    expect(screen.getByText('Removing Teacher')).toBeInTheDocument();
  });

  it('marks the campuses line Changed only when the campus step changed them', async () => {
    setup();
    await tick(/Teacher/);
    await next();
    await next();
    expect(screen.getByText(/Campuses: Lekki$/)).toBeInTheDocument();
    expect(screen.queryByText('Changed')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByRole('switch', { name: 'Ikeja' }));
    await next();
    expect(screen.getByText(/Campuses: Lekki, Ikeja/)).toBeInTheDocument();
    expect(screen.getByText('Changed')).toBeInTheDocument();
  });

  it('skips the campus step when a role reaches every campus', async () => {
    setup();
    await tick(/Administrator/);
    expect(stepper().join(' ')).not.toContain('Campuses');
    await next();
    expect(screen.queryByText(/Where will Ada work/)).not.toBeInTheDocument();
    expect(
      screen.getByText('These roles see every campus.')
    ).toBeInTheDocument();
  });

  it('blocks Next on the campus step until one campus is on', async () => {
    setup({ member: detail({ campusIds: [] }) });
    await tick(/Teacher/);
    await next();
    expect(screen.getByText('Choose at least one campus.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Next/ })).toBeDisabled();
    await user.click(screen.getByRole('switch', { name: 'Lekki' }));
    expect(screen.getByRole('button', { name: /^Next/ })).toBeEnabled();
  });

  it('shows a held role the editor cannot grant as checked and disabled', () => {
    const roles = CATALOGUE.map((role) =>
      role.slug === 'front-desk' ? { ...role, grantable: false } : role
    );
    setup({ member: detail({ roles: ['member', 'front-desk'] }), roles });
    const box = screen.getByRole('checkbox', { name: /Front desk/ });
    expect(box).toBeChecked();
    expect(box).toBeDisabled();
  });

  it('lists roles the editor cannot assign behind a disclosure', async () => {
    const roles = CATALOGUE.map((role) =>
      role.slug === 'front-desk' ? { ...role, grantable: false } : role
    );
    setup({ roles });
    expect(
      screen.queryByRole('checkbox', { name: /Front desk/ })
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: /1 roles you can’t assign/ })
    );
    expect(screen.getByRole('checkbox', { name: /Front desk/ })).toBeDisabled();
    expect(
      screen.getByText(
        'You can only give someone a role if you can already do everything it allows.'
      )
    ).toBeInTheDocument();
  });

  it('shows a combination error and disables Next', async () => {
    setup({ member: detail({ roles: ['member', 'guardian'] }) });
    await tick(/Teacher/);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Ada Obi is a portal user (student or guardian) and can’t be given Teacher.'
    );
    expect(screen.getByRole('button', { name: /^Next/ })).toBeDisabled();
  });

  it('discards the draft', async () => {
    setup();
    await tick(/Teacher/);
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.getByRole('checkbox', { name: /Teacher/ })).not.toBeChecked();
    expect(
      screen.queryByRole('button', { name: 'Discard' })
    ).not.toBeInTheDocument();
  });

  it('renders read-only with no stepper or footer', () => {
    setup({ member: detail({ roles: ['member', 'teacher'] }), canEdit: false });
    const box = screen.getByRole('checkbox', { name: /Teacher/ });
    expect(box).toBeChecked();
    expect(box).toBeDisabled();
    expect(
      screen.queryByRole('checkbox', { name: /Administrator/ })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Next/ })
    ).not.toBeInTheDocument();
    expect(screen.queryByText('1. Roles →')).not.toBeInTheDocument();
  });

  it('shows the built-in roles with the note', () => {
    setup({ member: detail({ roles: ['member', 'owner'] }) });
    expect(screen.getByText('Owner')).toBeInTheDocument();
    expect(screen.getByText('Member')).toBeInTheDocument();
    expect(
      screen.getByText('Built-in roles can’t be removed here.')
    ).toBeInTheDocument();
  });
});
