import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { ApiError } from '@eduvault/api-contract';
import { starterAccess } from '../test-utils';
import {
  ADA,
  CHIDI,
  NGOZI,
  TOBI,
  recordingOptions,
  renderPayments,
  statement,
} from '../test-payments';
import { StatementPage } from './statement-page';

function childStatement(id: string, name: string, balanceMinor: number) {
  return statement({
    student: {
      id,
      name,
      admissionNumber: `GF-${name}`,
      className: 'JSS 1',
      campusName: 'Lekki',
      archived: false,
    },
    totals: {
      balanceMinor,
      totalMinor: Math.max(balanceMinor, 0),
      paidMinor: 0,
      reducedMinor: 0,
    },
    rows: [],
    total: 0,
    unpaid: [],
  });
}

function setup(
  options: {
    statement?: ReturnType<typeof statement>;
    failWith?: Error;
    search?: Parameters<typeof StatementPage>[0]['search'];
    access?: ReturnType<typeof starterAccess>;
  } = {}
) {
  const onSearchChange = vi.fn();
  const api = {
    studentAccounts: {
      statement: vi
        .fn()
        .mockImplementation(() =>
          options.failWith === undefined
            ? Promise.resolve(options.statement ?? statement())
            : Promise.reject(options.failWith)
        ),
      guardianStatement: vi.fn().mockResolvedValue({
        currency: 'NGN',
        guardian: { id: NGOZI, name: 'Ngozi Okeke' },
        familyTotalMinor: 8_000_000,
        creditMinor: 500_000,
        children: [
          childStatement(ADA, 'Ada Okeke', 6_000_000),
          childStatement(CHIDI, 'Chidi Okeke', 2_000_000),
          childStatement(TOBI, 'Tobi Ade', -500_000),
        ],
      }),
    },
    payments: {
      recordingOptions: vi.fn().mockResolvedValue(recordingOptions()),
    },
  };
  renderPayments(
    <StatementPage
      studentId={ADA}
      search={options.search ?? {}}
      onSearchChange={onSearchChange}
    />,
    api,
    { path: `/finance/accounts/${ADA}`, access: options.access }
  );
  return { api, onSearchChange };
}

describe('StatementPage (one child)', () => {
  it('titles the page with the student and shows the card heading', async () => {
    setup();
    expect(
      await screen.findByRole('heading', { name: 'Ada Okeke' })
    ).toBeVisible();
    expect(
      screen.getByText('What was charged and what was paid.')
    ).toBeVisible();
    expect(screen.getByText('GF-0001 · JSS 1 Gold · Lekki')).toBeVisible();
  });

  it('shows the Owing, Paid and Total tiles and leaves Reduced out at zero', async () => {
    setup();
    await screen.findByText('Owing');
    expect(screen.getAllByText('₦180,000').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Paid').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Total').length).toBeGreaterThan(0);
    expect(screen.queryByText('Reduced')).not.toBeInTheDocument();
  });

  it('shows the Reduced tile once something was reduced', async () => {
    const base = statement();
    setup({
      statement: statement({
        totals: { ...base.totals, reducedMinor: 1_100_000 },
      }),
    });
    expect(await screen.findByText('Reduced')).toBeVisible();
    expect(screen.getByText('₦11,000')).toBeVisible();
  });

  it('lists the entries with their status, link and reference, and the footer', async () => {
    setup();
    const charge = (
      await screen.findByRole('link', {
        name: 'Term fees, First term, 2026/2027',
      })
    ).closest('tr');
    expect(
      within(charge as HTMLElement).getByText('CHG-2026-00001')
    ).toBeVisible();
    expect(within(charge as HTMLElement).getByText('Charged')).toBeVisible();
    const paid = screen
      .getByRole('link', { name: /Payment RCT-2026-00088 from Ngozi Okeke/ })
      .closest('tr');
    expect(within(paid as HTMLElement).getByText('Paid')).toBeVisible();
    expect(screen.getByText('Owing now')).toBeVisible();
  });

  it('lists the unpaid charges oldest first at the foot', async () => {
    setup();
    expect(
      await screen.findByText('Unpaid charges, oldest first')
    ).toBeVisible();
    expect(screen.getByText('CHG-2026-00001 · ₦180,000')).toBeVisible();
  });

  it('shows the credit callout and offers Pay the extra back to someone who can ask for a refund', async () => {
    const base = statement();
    setup({
      statement: statement({
        totals: { ...base.totals, balanceMinor: -500_000 },
        unpaid: [],
      }),
    });
    expect(
      await screen.findByText(
        '₦5,000 was paid in extra. It is taken off the next fees automatically, or you can pay it back.'
      )
    ).toBeVisible();
    expect(screen.getAllByText('Extra paid').length).toBeGreaterThan(0);
    const link = screen.getByRole('link', { name: 'Pay the extra back' });
    const target = new URL(
      link.getAttribute('href') ?? '',
      'http://school.test'
    );
    expect(target.pathname).toBe('/finance/adjustments');
    expect(Object.fromEntries(target.searchParams)).toEqual({
      new: '1',
      kind: 'refund',
      student: ADA,
      amount: '500000',
    });
  });

  it('keeps the credit callout but offers no refund to a member who cannot ask for one', async () => {
    const base = statement();
    setup({
      access: starterAccess('principal'),
      statement: statement({
        totals: { ...base.totals, balanceMinor: -500_000 },
        unpaid: [],
      }),
    });
    expect(await screen.findByText(/was paid in extra/)).toBeVisible();
    expect(
      screen.queryByRole('link', { name: 'Pay the extra back' })
    ).not.toBeInTheDocument();
  });

  it('says No entries yet for an account with no history', async () => {
    setup({ statement: statement({ rows: [], total: 0, unpaid: [] }) });
    expect(await screen.findByText('No entries yet')).toBeVisible();
  });

  it('marks an archived student', async () => {
    const base = statement();
    setup({
      statement: statement({ student: { ...base.student, archived: true } }),
    });
    expect(await screen.findByText(/· archived/)).toBeVisible();
  });

  it('pages back through the entries', async () => {
    const { onSearchChange } = setup({
      statement: statement({ total: 25, page: 3 }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Page 2' }));
    expect(onSearchChange).toHaveBeenCalledWith({ page: 2 });
  });

  it('says No student account here when the student is out of reach', async () => {
    setup({
      failWith: new ApiError(404, { code: 'NotFound', message: 'x' }),
    });
    expect(await screen.findByText('No student account here')).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Back to who owes' })
    ).toBeVisible();
  });
});

describe('StatementPage actions', () => {
  it('offers the family view when the paying guardian has more than one child', async () => {
    setup();
    expect(
      await screen.findByRole('link', { name: 'Family view (3)' })
    ).toHaveAttribute('href', expect.stringContaining('view=family'));
  });

  it('has no family view for a single child or a student with no paying guardian', async () => {
    setup({
      statement: statement({
        family: { guardianId: NGOZI, guardianName: 'Ngozi', childCount: 1 },
      }),
    });
    await screen.findByRole('heading', { name: 'Ada Okeke' });
    expect(
      screen.queryByRole('link', { name: /Family view/ })
    ).not.toBeInTheDocument();
  });

  it('shows Record payment to a bursar, opening the sheet in place', async () => {
    setup({ access: starterAccess('bursar') });
    fireEvent.click(
      await screen.findByRole('button', { name: 'Record payment' })
    );
    expect(
      await screen.findByRole('heading', { name: 'Record a payment' })
    ).toBeVisible();
    await waitFor(() => {
      expect(screen.getByLabelText('Payer')).toHaveValue(NGOZI);
    });
  });

  it('hides Record payment from a reader', async () => {
    setup({ access: starterAccess('administrator') });
    await screen.findByRole('heading', { name: 'Ada Okeke' });
    expect(
      screen.queryByRole('button', { name: 'Record payment' })
    ).not.toBeInTheDocument();
  });
});

describe('StatementPage (family)', () => {
  it('titles the page after the guardian and gives a tile per child and the family total', async () => {
    setup({ search: { view: 'family' } });

    expect(
      await screen.findByRole('heading', {
        name: 'Family statement: Ngozi Okeke',
      })
    ).toBeVisible();
    expect(
      screen.getByText(
        '3 children. Each keeps their own account; this view combines them.'
      )
    ).toBeVisible();
    expect(await screen.findByText('Family total')).toBeVisible();
    expect(screen.getByText('₦80,000')).toBeVisible();
    expect(
      screen.getByText(
        'Owed across all children · ₦5,000 extra paid kept separately'
      )
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'One child' })).toBeVisible();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('shows each child’s own card, including credit, and no family view button', async () => {
    setup({ search: { view: 'family' } });
    await screen.findByText('Family total');
    expect(screen.getAllByText('Chidi Okeke').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Extra paid').length).toBeGreaterThan(0);
    expect(
      screen.queryByRole('link', { name: /Family view/ })
    ).not.toBeInTheDocument();
  });
});
