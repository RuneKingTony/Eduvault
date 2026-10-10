import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { ApiError } from '@eduvault/api-contract';
import { toast } from '@eduvault/ui';
import {
  ALL_PERMISSIONS,
  toPermissionMap,
  type Permission,
} from '@eduvault/policy';
import { fakeAccess, ownerAccess, renderWithApi } from '../test-utils';
import {
  MEMBER_ROLE_ENTRY,
  OWNER_ROLE_ENTRY,
  ROLE_LIST,
  holder,
  role,
  roleListResponse,
} from '../test-roles';
import { RolePage } from './role-page';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const accessOf = (...permissions: Permission[]) =>
  fakeAccess({ roles: ['custom'], permissions: toPermissionMap(permissions) });

interface Setup {
  slug?: string;
  roles?: ReturnType<typeof role>[];
  access?: ReturnType<typeof fakeAccess>;
  get?: ReturnType<typeof vi.fn>;
  list?: ReturnType<typeof vi.fn>;
  create?: ReturnType<typeof vi.fn>;
  update?: ReturnType<typeof vi.fn>;
  remove?: ReturnType<typeof vi.fn>;
}

function setup({
  slug,
  roles = ROLE_LIST,
  access = ownerAccess(),
  get,
  list = vi.fn().mockResolvedValue(roleListResponse(roles)),
  create = vi.fn().mockResolvedValue(role('cashier', { label: 'Cashier' })),
  update = vi.fn().mockResolvedValue(role('bursar')),
  remove = vi.fn().mockResolvedValue({ slug: 'x' }),
}: Setup = {}) {
  const found = roles.find((entry) => entry.slug === slug);
  const handlers = {
    onBack: vi.fn(),
    onCreated: vi.fn(),
    onDeleted: vi.fn(),
    onAssign: vi.fn(),
    onOpenMember: vi.fn(),
  };
  const api = {
    roles: {
      list,
      get: get ?? vi.fn().mockResolvedValue(found),
      create,
      update,
      remove,
    },
  };
  renderWithApi(<RolePage slug={slug} {...handlers} />, api, access);
  return { ...handlers, create, update, remove, get: api.roles.get };
}

const level = (area: string, name: 'No access' | 'Can see' | 'Can change') =>
  within(screen.getByRole('radiogroup', { name: `${area} access` })).getByRole(
    'radio',
    { name }
  );

const nameField = () => screen.getByLabelText('Name');

describe('RolePage read-only', () => {
  it('lets an ac:read-only viewer look but not change', async () => {
    setup({
      slug: 'bursar',
      roles: [
        ...ROLE_LIST.filter((entry) => entry.slug !== 'bursar'),
        role('bursar', {
          label: 'Bursar',
          source: 'starter',
          held: ['student:read'],
          editable: false,
        }),
      ],
      access: accessOf('ac:read', 'student:read'),
    });
    expect(
      await screen.findByText('You can look at this role but not change it.')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Save changes' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'More actions' })
    ).not.toBeInTheDocument();
    expect(nameField()).toBeDisabled();
    expect(screen.getByLabelText('Description')).toBeDisabled();
    expect(level('Students', 'Can see')).toBeChecked();
    expect(level('Students', 'Can see')).toBeDisabled();
    expect(level('Students', 'Can change')).toBeDisabled();
  });

  it('shows the Owner callout and no controls', async () => {
    setup({ slug: 'owner' });
    expect(
      await screen.findByText(
        'The owner can do everything, including anything added to the app later. It can’t be edited.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText('Everything, including anything added later.', {
        exact: false,
      })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Save changes' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('You can look at this role but not change it.')
    ).not.toBeInTheDocument();
    expect(nameField()).toBeDisabled();
  });

  it('shows the Member callout and no controls', async () => {
    setup({ slug: 'member' });
    expect(
      await screen.findByText(
        'Everyone on the staff list has this role. On its own it allows nothing, and it can’t be edited.'
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'More actions' })
    ).not.toBeInTheDocument();
    expect(nameField()).toBeDisabled();
    expect(MEMBER_ROLE_ENTRY.editable).toBe(false);
    expect(OWNER_ROLE_ENTRY.editable).toBe(false);
  });

  it('says Role not found for a slug the school does not have', async () => {
    const onBack = vi.fn();
    const api = {
      roles: {
        list: vi.fn().mockResolvedValue(roleListResponse()),
        get: vi
          .fn()
          .mockRejectedValue(
            new ApiError(404, { code: 'NotFound', message: 'Role not found' })
          ),
      },
    };
    renderWithApi(
      <RolePage
        slug="ghost"
        onBack={onBack}
        onCreated={vi.fn()}
        onDeleted={vi.fn()}
        onAssign={vi.fn()}
        onOpenMember={vi.fn()}
      />,
      api
    );
    expect(await screen.findByText('Role not found')).toBeInTheDocument();
    expect(
      screen.getByText(/It may have been moved or deleted\./)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});

describe('RolePage levels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('disables a level the editor cannot fully give', async () => {
    setup({ access: accessOf('ac:create', 'student:read') });
    await screen.findByRole('heading', { name: 'New role' });
    expect(level('Students', 'Can see')).toBeEnabled();
    expect(level('Students', 'Can change')).toBeDisabled();
    expect(level('Staff', 'Can see')).toBeDisabled();
    expect(level('Staff', 'No access')).toBeEnabled();
  });

  it('clears the extras with No access', async () => {
    const { create } = setup();
    await screen.findByRole('heading', { name: 'New role' });
    fireEvent.click(level('Campuses', 'Can see'));
    fireEvent.click(screen.getByRole('switch', { name: /Sees every campus/ }));
    expect(
      screen.getByRole('switch', { name: /Sees every campus/ })
    ).toBeChecked();
    fireEvent.click(level('Campuses', 'No access'));
    expect(
      screen.getByRole('switch', { name: /Sees every campus/ })
    ).not.toBeChecked();
    fireEvent.change(nameField(), { target: { value: 'Empty' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create role' }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledWith({
        body: { label: 'Empty', description: null, permissions: {} },
      });
    });
  });

  it('sets Can change with its see permissions', async () => {
    const { create } = setup();
    await screen.findByRole('heading', { name: 'New role' });
    fireEvent.click(level('Students', 'Can change'));
    expect(level('Students', 'Can change')).toBeChecked();
    fireEvent.change(nameField(), { target: { value: 'Admissions' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create role' }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledWith({
        body: expect.objectContaining({
          permissions: { student: ['read', 'create', 'update'] },
        }),
      });
    });
  });

  it('marks an area set by hand as Custom', async () => {
    setup({
      slug: 'cashier',
      roles: [...ROLE_LIST, role('cashier', { held: ['team:update'] })],
    });
    expect(await screen.findByText('Custom')).toBeInTheDocument();
    expect(
      screen.getByText('Some permissions are set by hand')
    ).toBeInTheDocument();
    expect(level('Campuses', 'No access')).not.toBeChecked();
    expect(level('Campuses', 'Can see')).not.toBeChecked();
  });
});

const openGrid = async () => {
  await screen.findByRole('heading', { name: 'New role' });
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Advanced: every permission, one by one',
    })
  );
};

describe('RolePage Advanced grid', () => {
  it('filters by words and says when nothing matches', async () => {
    setup();
    await openGrid();
    const filter = screen.getByLabelText('Filter permissions');
    fireEvent.change(filter, { target: { value: 'fee' } });
    expect(
      screen.getByRole('button', { name: 'Fee schedules: see' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Staff: see' })
    ).not.toBeInTheDocument();
    fireEvent.change(filter, { target: { value: 'approve' } });
    expect(screen.getByText('No permissions match')).toBeInTheDocument();
    expect(
      screen.getByText('Try “approve”, “publish” or a pillar name.')
    ).toBeInTheDocument();
  });

  it('selects everything the editor holds in a pillar and clears it', async () => {
    const { create } = setup({
      access: accessOf('ac:create', 'student:read', 'schoolAccount:read'),
    });
    await openGrid();
    fireEvent.click(screen.getByRole('button', { name: /Foundation/ }));
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Select all I hold' })[1]!
    );
    expect(
      screen.getByRole('button', { name: 'Students: see' })
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: 'School settings: see' })
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: 'Students: add' })
    ).toHaveAttribute('aria-pressed', 'false');
    fireEvent.change(nameField(), { target: { value: 'Looker' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create role' }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledWith({
        body: expect.objectContaining({
          permissions: { schoolAccount: ['read'], student: ['read'] },
        }),
      });
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Clear' })[1]!);
    expect(
      screen.getByRole('button', { name: 'Students: see' })
    ).toHaveAttribute('aria-pressed', 'false');
  });

  it('strikes through and disables a permission the editor does not hold', async () => {
    setup({ access: accessOf('ac:create', 'student:read') });
    await openGrid();
    fireEvent.click(screen.getByRole('button', { name: /Foundation/ }));
    const unheld = screen.getByRole('button', { name: 'Students: add' });
    expect(unheld).toBeDisabled();
    expect(unheld.className).toContain('line-through');
    expect(screen.getByRole('button', { name: 'Students: see' })).toBeEnabled();
  });

  it('counts held permissions and marks sensitive ones', async () => {
    setup({
      slug: 'cashier',
      roles: [
        ...ROLE_LIST,
        role('cashier', { held: ['student:read', 'ac:create'] }),
      ],
    });
    await screen.findByRole('heading', { name: /^Cashier/ });
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Advanced: every permission, one by one',
      })
    );
    expect(screen.getByText(`2/${ALL_PERMISSIONS.length}`)).toBeInTheDocument();
    expect(screen.getByText('1 important')).toBeInTheDocument();
  });
});

describe('RolePage copy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fills the permissions the editor holds, names the copy and warns about what was skipped', async () => {
    const { create } = setup({
      access: accessOf('ac:create', 'student:read'),
    });
    fireEvent.change(await screen.findByLabelText('Or copy'), {
      target: { value: 'administrator' },
    });
    expect(toast.warning).toHaveBeenCalledOnce();
    const message = vi.mocked(toast.warning).mock.calls[0]?.[0] as string;
    expect(message).toMatch(/^Skipped \d+ you don’t hold: /);
    expect(message).toContain('Staff');
    expect(message).not.toContain('member:read');
    expect(nameField()).toHaveValue('Administrator (copy)');
    expect(level('Students', 'Can see')).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Create role' }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledWith({
        body: expect.objectContaining({
          label: 'Administrator (copy)',
          permissions: { student: ['read'] },
        }),
      });
    });
  });

  it('keeps a name that was already typed and does not warn when nothing is skipped', async () => {
    setup();
    const select = await screen.findByLabelText('Or copy');
    fireEvent.change(nameField(), { target: { value: 'Mine' } });
    fireEvent.change(select, { target: { value: 'teacher' } });
    expect(nameField()).toHaveValue('Mine');
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('offers neither Owner nor Member, and a select past four roles', async () => {
    setup();
    const select = await screen.findByLabelText('Or copy');
    const options = within(select)
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(options).toEqual([
      'Choose a role',
      'Administrator',
      'Teacher',
      'Bursar',
      'Principal',
      'Student',
      'Guardian',
    ]);
    fireEvent.change(select, { target: { value: 'teacher' } });
    expect(level('Students', 'Can see')).toBeChecked();
  });

  it('offers one button per role while there are four or fewer', async () => {
    setup({
      roles: [
        OWNER_ROLE_ENTRY,
        MEMBER_ROLE_ENTRY,
        role('teacher', { label: 'Teacher', held: ['student:read'] }),
        role('bursar', { label: 'Bursar', held: ['student:read'] }),
      ],
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Bursar' }));
    expect(screen.getByRole('button', { name: 'Teacher' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Owner' })
    ).not.toBeInTheDocument();
    expect(nameField()).toHaveValue('Bursar (copy)');
  });

  it('does not offer Or copy on an existing role', async () => {
    setup({ slug: 'bursar' });
    await screen.findByRole('heading', { name: /^Bursar/ });
    expect(screen.queryByText('Or copy')).not.toBeInTheDocument();
  });
});

describe('RolePage create and save', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps Create role disabled until the role has a name', async () => {
    setup();
    expect(
      await screen.findByRole('button', { name: 'Create role' })
    ).toBeDisabled();
    fireEvent.change(nameField(), { target: { value: 'Cashier' } });
    expect(screen.getByRole('button', { name: 'Create role' })).toBeEnabled();
  });

  it('creates the role, tells the owner and opens it', async () => {
    const { create, onCreated, onAssign } = setup();
    await screen.findByRole('heading', { name: 'New role' });
    fireEvent.change(nameField(), { target: { value: '  Cashier ' } });
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Takes cash' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create role' }));
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith('cashier');
    });
    expect(create).toHaveBeenCalledWith({
      body: { label: 'Cashier', description: 'Takes cash', permissions: {} },
    });
    const [message, options] = vi.mocked(toast.success).mock.calls[0] ?? [];
    render(<div>{message as React.ReactNode}</div>);
    expect(screen.getByText('Cashier').tagName).toBe('STRONG');
    expect(options).toMatchObject({
      action: { label: 'Assign it to someone' },
    });
    (
      options as unknown as { action: { onClick: () => void } }
    ).action.onClick();
    expect(onAssign).toHaveBeenCalledOnce();
  });

  it('offers Assign it to someone only with member:update', async () => {
    const { onCreated } = setup({ access: accessOf('ac:create') });
    await screen.findByRole('heading', { name: 'New role' });
    fireEvent.change(nameField(), { target: { value: 'Cashier' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create role' }));
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalled();
    });
    expect(vi.mocked(toast.success).mock.calls[0]?.[1]).toBeUndefined();
  });

  it('shows the name error inline once the name field is left empty', async () => {
    setup();
    await screen.findByRole('heading', { name: 'New role' });
    expect(
      screen.queryByText('Give the role a name first.')
    ).not.toBeInTheDocument();
    fireEvent.blur(nameField());
    expect(screen.getByText('Give the role a name first.')).toBeInTheDocument();
    expect(nameField()).toHaveAttribute('aria-invalid', 'true');
    fireEvent.change(nameField(), { target: { value: 'Cashier' } });
    expect(
      screen.queryByText('Give the role a name first.')
    ).not.toBeInTheDocument();
  });

  it('shows the name error inline once Create is tried with a taken name', async () => {
    const create = vi.fn().mockRejectedValue(
      new ApiError(409, {
        code: 'ROLE_LABEL_TAKEN',
        message: 'A role called Bursar already exists.',
      })
    );
    setup({ create });
    await screen.findByRole('heading', { name: 'New role' });
    fireEvent.change(nameField(), { target: { value: 'Bursar' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create role' }));
    expect(
      await screen.findByText('A role called Bursar already exists.')
    ).toBeInTheDocument();
    expect(nameField()).toHaveAttribute('aria-invalid', 'true');
  });

  it('keeps Save changes disabled until something changes, then saves and says when holders get it', async () => {
    const { update } = setup({ slug: 'bursar' });
    expect(
      await screen.findByRole('button', { name: 'Save changes' })
    ).toBeDisabled();
    fireEvent.change(nameField(), { target: { value: 'Fees clerk' } });
    const save = screen.getByRole('button', { name: 'Save changes' });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => {
      expect(update).toHaveBeenCalledWith({
        params: { slug: 'bursar' },
        body: expect.objectContaining({ label: 'Fees clerk' }),
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Role saved. Holders get the change on their next request.'
      );
    });
  });

  it('shows a refusal as a callout with the API message', async () => {
    const update = vi.fn().mockRejectedValue(
      new ApiError(403, {
        code: 'ROLE_ESCALATION',
        message:
          'You can’t give access you don’t have yourself. Switch those parts off and save again.',
      })
    );
    setup({ slug: 'bursar', update });
    fireEvent.change(await screen.findByLabelText('Name'), {
      target: { value: 'Other' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(
      await screen.findByText(
        'You can’t give access you don’t have yourself. Switch those parts off and save again.'
      )
    ).toBeInTheDocument();
  });
});

describe('RolePage holders', () => {
  const holders = [holder('Kemi Adeyemi', ['member', 'bursar'])];
  const withHolders = [
    ...ROLE_LIST.filter((entry) => entry.slug !== 'bursar'),
    role('bursar', {
      label: 'Bursar',
      source: 'starter',
      held: ['student:read'],
      holders,
      holderCount: 1,
    }),
  ];

  it('lists holders and opens their member page', async () => {
    const { onOpenMember } = setup({ slug: 'bursar', roles: withHolders });
    fireEvent.click(
      await screen.findByRole('button', { name: /Kemi Adeyemi/ })
    );
    expect(onOpenMember).toHaveBeenCalledWith(holders[0]?.memberId);
  });

  it('says what each holder gains or loses if the changes are saved', async () => {
    setup({ slug: 'bursar', roles: withHolders });
    await screen.findByRole('heading', { name: /^Bursar/ });
    expect(screen.queryByText('If you save now')).not.toBeInTheDocument();
    fireEvent.click(level('Students', 'Can change'));
    expect(screen.getByText('If you save now')).toBeInTheDocument();
    expect(screen.getByText('+1')).toBeInTheDocument();
    fireEvent.click(level('Students', 'No access'));
    expect(screen.getByText('−1')).toBeInTheDocument();
  });

  it('waits for the roles list before it says what a save would change', async () => {
    let resolveList: (value: ReturnType<typeof roleListResponse>) => void =
      vi.fn();
    const list = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveList = resolve;
      })
    );
    setup({ slug: 'bursar', roles: withHolders, list });
    await waitFor(() => {
      expect(list).toHaveBeenCalled();
    });
    expect(screen.queryByText('Kemi Adeyemi')).not.toBeInTheDocument();
    resolveList(roleListResponse(withHolders));
    await screen.findByRole('heading', { name: /^Bursar/ });
    fireEvent.click(level('Students', 'No access'));
    expect(screen.getByText('−1')).toBeInTheDocument();
    expect(screen.queryByText('no change')).not.toBeInTheDocument();
  });

  it('says how many holders are on campuses the viewer cannot see', async () => {
    setup({
      slug: 'bursar',
      roles: [
        ...ROLE_LIST.filter((entry) => entry.slug !== 'bursar'),
        role('bursar', {
          holders: [holder('Kemi Adeyemi', ['member', 'bursar'])],
          holderCount: 3,
        }),
      ],
    });
    expect(
      await screen.findByText(
        '2 more people hold this role on campuses you don’t look after.'
      )
    ).toBeInTheDocument();
  });

  it('counts holders instead of saying nobody when none is in view', async () => {
    setup({
      slug: 'bursar',
      roles: [
        ...ROLE_LIST.filter((entry) => entry.slug !== 'bursar'),
        role('bursar', { holders: [], holderCount: 2 }),
      ],
    });
    expect(
      await screen.findByText('2 people hold this role.')
    ).toBeInTheDocument();
  });

  it('says nobody holds a role, and that a new one can be assigned later', async () => {
    setup({ slug: 'bursar' });
    expect(
      await screen.findByText('Nobody yet. Assign it from a member’s page.')
    ).toBeInTheDocument();
  });

  it('says to assign a new role once it exists', async () => {
    setup();
    expect(
      await screen.findByText('Assign it from a member’s page once it exists.')
    ).toBeInTheDocument();
  });

  it('shows only a count without holder names', async () => {
    setup({
      slug: 'bursar',
      roles: [
        ...ROLE_LIST.filter((entry) => entry.slug !== 'bursar'),
        role('bursar', { holders: undefined, holderCount: 3 }),
      ],
    });
    expect(
      await screen.findByText('3 people hold this role.')
    ).toBeInTheDocument();
  });
});
