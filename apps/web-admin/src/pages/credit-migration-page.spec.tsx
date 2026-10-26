import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ApiError,
  CREDIT_MIGRATION_CHANGED_MESSAGE,
} from '@eduvault/api-contract';
import { toast } from '@eduvault/ui';
import {
  NO_PAYER_CHILD,
  creditFamily,
  creditReport,
  creditResult,
  renderWallets,
} from '../test-wallets';
import { CreditMigrationPage } from './credit-migration-page';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  }),
}));

const emptyReport = creditReport({
  families: [],
  totals: { familyCount: 0, childCount: 0, movableMinor: 0, notMovedMinor: 0 },
});

const stuckReport = creditReport({
  notMoved: [
    {
      studentId: NO_PAYER_CHILD,
      name: 'Bola Ade',
      admissionNumber: 'GF-0009',
      amountMinor: 1_200_000,
      reason: 'no_paying_guardian',
    },
  ],
  totals: {
    familyCount: 1,
    childCount: 2,
    movableMinor: 8_000_000,
    notMovedMinor: 1_200_000,
  },
});

function setup(
  options: {
    creditMigration?: ReturnType<typeof vi.fn>;
    migrateCredit?: ReturnType<typeof vi.fn>;
  } = {}
) {
  const api = {
    wallets: {
      creditMigration:
        options.creditMigration ?? vi.fn().mockResolvedValue(creditReport()),
      migrateCredit:
        options.migrateCredit ?? vi.fn().mockResolvedValue(creditResult()),
    },
  };
  renderWallets(<CreditMigrationPage />, api, {
    path: '/finance/wallets/credit-migration',
  });
  return api;
}

let user: ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  user = userEvent.setup();
  vi.clearAllMocks();
});

const openConfirm = async () => {
  await user.click(await screen.findByRole('button', { name: 'Move credit' }));
  return screen.findByRole('dialog');
};

describe('CreditMigrationPage', () => {
  it('shows a loading state while the report is read', async () => {
    setup({
      creditMigration: vi.fn().mockReturnValue(new Promise(() => null)),
    });
    expect(
      await screen.findByRole('status', { name: 'Loading' })
    ).toBeInTheDocument();
  });

  it('shows the refusal when the report cannot be read', async () => {
    setup({
      creditMigration: vi
        .fn()
        .mockRejectedValue(
          new ApiError(500, { code: 'InternalError', message: 'Report failed' })
        ),
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Report failed');
  });

  it('titles the screen and sums up what moves and what cannot', async () => {
    setup({ creditMigration: vi.fn().mockResolvedValue(stuckReport) });
    expect(
      await screen.findByRole('heading', { name: 'Move existing credit' })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Credit families paid ahead on a child’s fee account moves to the family wallet. Debts and history stay as they are.'
      )
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        '1 family · 2 children · ₦80,000.00 to move · ₦12,000.00 can’t be moved'
      )
    ).toBeInTheDocument();
  });

  it('lists each family with its total and opens to its children, tagging a leaver', async () => {
    setup();
    const card = await screen.findByRole('group', { name: 'Families to move' });
    const family = within(card).getByRole('button', { name: /Ngozi Okeke/ });
    expect(family).toHaveTextContent('2 children');
    expect(family).toHaveTextContent('₦80,000.00');
    expect(within(card).queryByText('Tobi Okeke')).not.toBeInTheDocument();

    await user.click(family);

    const tobi = within(card).getByRole('row', { name: /Tobi Okeke/ });
    expect(tobi).toHaveTextContent('Left');
    expect(tobi).toHaveTextContent('Ikeja');
    expect(tobi).toHaveTextContent('₦30,000.00');
    expect(
      within(card).getByRole('row', { name: /Ada Okeke/ })
    ).not.toHaveTextContent('Left');
  });

  it('lists a child nobody pays for under Can’t be moved, with the reason', async () => {
    setup({ creditMigration: vi.fn().mockResolvedValue(stuckReport) });
    const card = await screen.findByRole('group', { name: 'Can’t be moved' });
    const row = within(card).getByRole('row', { name: /Bola Ade/ });
    expect(row).toHaveTextContent('GF-0009');
    expect(row).toHaveTextContent('No guardian pays fees for this child');
    expect(row).toHaveTextContent('₦12,000.00');
  });

  it('leaves out the Can’t be moved card when every child can move', async () => {
    setup();
    await screen.findByRole('group', { name: 'Families to move' });
    expect(
      screen.queryByRole('group', { name: 'Can’t be moved' })
    ).not.toBeInTheDocument();
  });

  it('says No credit to move and cannot be confirmed when nothing is left', async () => {
    setup({ creditMigration: vi.fn().mockResolvedValue(emptyReport) });
    expect(await screen.findByText('No credit to move')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move credit' })).toBeDisabled();
  });

  it('asks before posting, naming the families, children and total, and posts the figures that were read', async () => {
    const api = setup();
    const dialog = await openConfirm();
    expect(within(dialog).getByText('1 family')).toBeInTheDocument();
    expect(within(dialog).getByText('2 children')).toBeInTheDocument();
    expect(within(dialog).getByText('₦80,000.00')).toBeInTheDocument();
    expect(api.wallets.migrateCredit).not.toHaveBeenCalled();

    await user.click(
      within(dialog).getByRole('button', { name: 'Move credit' })
    );

    await waitFor(() => {
      expect(api.wallets.migrateCredit).toHaveBeenCalledWith({
        body: { expectedFamilies: 1, expectedTotalMinor: 8_000_000 },
      });
    });
  });

  it('toasts the amount moved and refreshes the report once it is posted', async () => {
    const creditMigration = vi
      .fn()
      .mockResolvedValueOnce(creditReport())
      .mockResolvedValue(emptyReport);
    setup({ creditMigration });
    const dialog = await openConfirm();
    await user.click(
      within(dialog).getByRole('button', { name: 'Move credit' })
    );

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        '₦80,000.00 moved into 1 family wallet.'
      );
    });
    expect(await screen.findByText('No credit to move')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('warns instead of celebrating when nothing was left to move', async () => {
    setup({
      migrateCredit: vi.fn().mockResolvedValue(
        creditResult({
          replayed: true,
          familyCount: 0,
          childCount: 0,
          movedMinor: 0,
        })
      ),
    });
    const dialog = await openConfirm();
    await user.click(
      within(dialog).getByRole('button', { name: 'Move credit' })
    );

    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalledWith(
        'There was no credit left to move.'
      );
    });
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('on a 409 shows the report it carries with a note that the figures changed, without reading it again', async () => {
    const changed = creditReport({
      families: [
        creditFamily({
          totalMinor: 6_000_000,
          children: [creditFamily().children[0]!],
        }),
      ],
      totals: {
        familyCount: 1,
        childCount: 1,
        movableMinor: 6_000_000,
        notMovedMinor: 0,
      },
    });
    const creditMigration = vi.fn().mockResolvedValue(creditReport());
    const migrateCredit = vi.fn().mockRejectedValue(
      new ApiError(409, {
        code: 'CreditMigrationChanged',
        message: CREDIT_MIGRATION_CHANGED_MESSAGE,
        report: changed,
      })
    );
    setup({ creditMigration, migrateCredit });
    const dialog = await openConfirm();
    await user.click(
      within(dialog).getByRole('button', { name: 'Move credit' })
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      CREDIT_MIGRATION_CHANGED_MESSAGE
    );
    expect(
      await screen.findByText(
        '1 family · 1 child · ₦60,000.00 to move · ₦0.00 can’t be moved'
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(creditMigration).toHaveBeenCalledTimes(1);
    expect(migrateCredit).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('on a 409 without a report reads the figures again', async () => {
    const changed = creditReport({
      families: [],
      totals: {
        familyCount: 0,
        childCount: 0,
        movableMinor: 0,
        notMovedMinor: 0,
      },
    });
    const creditMigration = vi
      .fn()
      .mockResolvedValueOnce(creditReport())
      .mockResolvedValue(changed);
    const migrateCredit = vi.fn().mockRejectedValue(
      new ApiError(409, {
        code: 'CreditMigrationChanged',
        message: CREDIT_MIGRATION_CHANGED_MESSAGE,
      })
    );
    setup({ creditMigration, migrateCredit });
    const dialog = await openConfirm();
    await user.click(
      within(dialog).getByRole('button', { name: 'Move credit' })
    );

    expect(await screen.findByText('No credit to move')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      CREDIT_MIGRATION_CHANGED_MESSAGE
    );
    expect(creditMigration).toHaveBeenCalledTimes(2);
  });

  it('keeps the confirmation open and shows any other refusal', async () => {
    setup({
      migrateCredit: vi
        .fn()
        .mockRejectedValue(
          new ApiError(403, { code: 'Forbidden', message: 'No permission' })
        ),
    });
    const dialog = await openConfirm();
    await user.click(
      within(dialog).getByRole('button', { name: 'Move credit' })
    );

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'No permission'
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
