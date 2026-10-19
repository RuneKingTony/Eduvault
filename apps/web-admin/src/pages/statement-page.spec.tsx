import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@eduvault/api-contract';
import { starterAccess } from '../test-utils';
import {
  ADA,
  CHIDI,
  NGOZI,
  TOBI,
  guardianStatement,
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

const familyChildren = () => [
  childStatement(ADA, 'Ada Okeke', 6_000_000),
  childStatement(CHIDI, 'Chidi Okeke', 2_000_000),
  childStatement(TOBI, 'Tobi Ade', -500_000),
];

function setup(
  options: {
    statement?: ReturnType<typeof statement>;
    family?: ReturnType<typeof guardianStatement>;
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
        .mockImplementation(({ params }: { params: { studentId: string } }) =>
          options.failWith === undefined
            ? Promise.resolve(
                options.family?.children.find(
                  (child) => child.student.id === params.studentId
                ) ??
                  options.statement ??
                  statement()
              )
            : Promise.reject(options.failWith)
        ),
      guardianStatement: vi
        .fn()
        .mockResolvedValue(
          options.family ?? guardianStatement(familyChildren())
        ),
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

let user: ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  user = userEvent.setup();
});

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
    const charge = await screen.findByRole('row', {
      name: /Term fees, First term, 2026\/2027/,
    });
    expect(within(charge).getByText('CHG-2026-00001')).toBeVisible();
    expect(within(charge).getByText('Charged')).toBeVisible();
    const paid = screen.getByRole('row', {
      name: /Payment RCT-2026-00088 from Ngozi Okeke/,
    });
    expect(within(paid).getByText('Paid')).toBeVisible();
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
    await user.click(await screen.findByRole('button', { name: 'Page 2' }));
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
    await user.click(
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

describe('StatementPage term filter', () => {
  const TERM_ID = '00000000-0000-4000-8000-0000000c0001';
  const OPTIONS = [
    {
      id: '00000000-0000-4000-8000-0000000c0002',
      label: 'Second term, 2026/2027',
    },
    { id: TERM_ID, label: 'First term, 2026/2027' },
  ];
  const filtered = (toOn: string | null) =>
    statement({
      termOptions: OPTIONS,
      term: {
        id: TERM_ID,
        label: 'First term, 2026/2027',
        fromOn: '2026-09-07',
        toOn,
      },
      broughtForward: { amountMinor: 1_500_000 },
      closingMinor: 18_000_000,
    });

  it('offers Whole history and each term from the response, with the whole history picked', async () => {
    setup({ statement: statement({ termOptions: OPTIONS }) });

    const select = await screen.findByRole('combobox', { name: 'Term' });

    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent)
    ).toEqual([
      'Whole history',
      'Second term, 2026/2027',
      'First term, 2026/2027',
    ]);
    expect(select).toHaveValue('');
    expect(screen.queryByText('Brought forward')).not.toBeInTheDocument();
  });

  it('asks the API for the term in the search and shows the picked term', async () => {
    const { api } = setup({
      statement: filtered(null),
      search: { term: TERM_ID },
    });

    expect(await screen.findByRole('combobox', { name: 'Term' })).toHaveValue(
      TERM_ID
    );
    expect(api.studentAccounts.statement).toHaveBeenCalledWith({
      params: { studentId: ADA },
      query: { page: undefined, termId: TERM_ID },
    });
  });

  it('puts the Brought forward row, with its tip and amount, first on page 1', async () => {
    setup({ statement: filtered(null), search: { term: TERM_ID } });

    const row = await screen.findByRole('row', { name: /Brought forward/ });

    expect(row).toBe(screen.getAllByRole('row')[1]);
    expect(
      within(row).getByText('What the family already owed before this term.')
    ).toBeVisible();
    expect(within(row).getByText('₦15,000')).toBeVisible();
  });

  it('reads Owing at end of term in the footer of a term that has ended', async () => {
    setup({ statement: filtered('2026-12-18'), search: { term: TERM_ID } });

    expect(await screen.findByText('Owing at end of term')).toBeVisible();
    expect(screen.getAllByText('₦180,000').length).toBeGreaterThan(0);
  });

  it('keeps the usual Owing now footer for the latest term', async () => {
    setup({ statement: filtered(null), search: { term: TERM_ID } });

    expect(await screen.findByText('Owing now')).toBeVisible();
    expect(screen.queryByText('Owing at end of term')).not.toBeInTheDocument();
  });

  it('goes back to the whole history from the select, dropping the page', async () => {
    const { onSearchChange } = setup({
      statement: filtered(null),
      search: { term: TERM_ID, page: 3 },
    });

    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Term' }),
      ''
    );

    expect(onSearchChange).toHaveBeenCalledWith({
      term: undefined,
      page: undefined,
    });
  });

  it('picks a term from the select, dropping the page', async () => {
    const { onSearchChange } = setup({
      statement: statement({ termOptions: OPTIONS }),
      search: { page: 2 },
    });

    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Term' }),
      TERM_ID
    );

    expect(onSearchChange).toHaveBeenCalledWith({
      term: TERM_ID,
      page: undefined,
    });
  });
});

describe('StatementPage family term filter', () => {
  const TERM_ID = '00000000-0000-4000-8000-0000000c0001';
  const OPTIONS = [
    {
      id: '00000000-0000-4000-8000-0000000c0002',
      label: 'Second term, 2026/2027',
    },
    { id: TERM_ID, label: 'First term, 2026/2027' },
  ];
  const TERM = {
    id: TERM_ID,
    label: 'First term, 2026/2027',
    fromOn: '2026-09-07',
    toOn: null,
  };
  const inTerm = () =>
    guardianStatement(
      familyChildren().map((child) => ({
        ...child,
        rows: statement().rows.slice(0, 1),
        total: 1,
        term: TERM,
        termOptions: OPTIONS,
        broughtForward: { amountMinor: 1_500_000 },
        closingMinor: child.totals.balanceMinor,
      })),
      { term: TERM, termOptions: OPTIONS }
    );

  it('offers Whole history and each term from the family response, with the whole history picked', async () => {
    setup({
      search: { view: 'family' },
      family: guardianStatement(familyChildren(), { termOptions: OPTIONS }),
    });

    const select = await screen.findByRole('combobox', { name: 'Term' });

    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent)
    ).toEqual([
      'Whole history',
      'Second term, 2026/2027',
      'First term, 2026/2027',
    ]);
    expect(select).toHaveValue('');
    expect(screen.queryByText('Brought forward')).not.toBeInTheDocument();
  });

  it('asks the API for the guardian statement and each child’s statement with the searched term', async () => {
    const { api } = setup({
      search: { view: 'family', term: TERM_ID },
      family: inTerm(),
    });

    expect(await screen.findByRole('combobox', { name: 'Term' })).toHaveValue(
      TERM_ID
    );
    expect(api.studentAccounts.guardianStatement).toHaveBeenCalledWith({
      params: { guardianId: NGOZI },
      query: { termId: TERM_ID },
    });
    await waitFor(() => {
      for (const studentId of [ADA, CHIDI, TOBI]) {
        expect(api.studentAccounts.statement).toHaveBeenCalledWith({
          params: { studentId },
          query: { page: undefined, termId: TERM_ID },
        });
      }
    });
  });

  it('shows each child’s Brought forward row first under a term', async () => {
    setup({ search: { view: 'family', term: TERM_ID }, family: inTerm() });

    await screen.findByText('Family total');

    const tables = await screen.findAllByRole('table');
    expect(tables).toHaveLength(3);
    for (const table of tables) {
      expect(within(table).getAllByRole('row')[1]).toHaveAccessibleName(
        /Brought forward/
      );
    }
  });

  it('keeps the Family total and the child tiles whole-account under a term', async () => {
    setup({ search: { view: 'family', term: TERM_ID }, family: inTerm() });

    expect(await screen.findByText('Family total')).toBeVisible();
    expect(screen.getByText('₦80,000')).toBeVisible();
    expect(
      screen.getByText(
        'Owed across all children · ₦5,000 extra paid kept separately'
      )
    ).toBeVisible();
    expect(screen.getByText('Owing ₦60,000')).toBeVisible();
    expect(screen.getByText('Extra paid ₦5,000')).toBeVisible();
  });

  it('picks a term from the select, staying in the family view and dropping the page', async () => {
    const { onSearchChange } = setup({
      search: { view: 'family', page: 2 },
      family: guardianStatement(familyChildren(), { termOptions: OPTIONS }),
    });

    fireEvent.change(await screen.findByRole('combobox', { name: 'Term' }), {
      target: { value: TERM_ID },
    });

    expect(onSearchChange).toHaveBeenCalledWith({
      view: 'family',
      term: TERM_ID,
      page: undefined,
    });
  });

  it('goes back to the whole history from the select, staying in the family view', async () => {
    const { onSearchChange } = setup({
      search: { view: 'family', term: TERM_ID },
      family: inTerm(),
    });

    fireEvent.change(await screen.findByRole('combobox', { name: 'Term' }), {
      target: { value: '' },
    });

    expect(onSearchChange).toHaveBeenCalledWith({
      view: 'family',
      term: undefined,
      page: undefined,
    });
  });

  it('keeps the term when switching between One child and the family view', async () => {
    setup({ search: { view: 'family', term: TERM_ID }, family: inTerm() });

    expect(
      await screen.findByRole('link', { name: 'One child' })
    ).toHaveAttribute('href', expect.stringContaining(`term=${TERM_ID}`));
  });
});
