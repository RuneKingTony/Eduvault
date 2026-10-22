import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Permission } from '@eduvault/policy';
import {
  ADA_ID,
  EFE_ID,
  NNE_ID,
  TOBI_ID,
  portalChild,
  portalFamilyStatement,
  portalMe,
  portalStatement,
  renderWithApi,
} from '../test-utils';
import { ChildrenPage } from './children-page';

const ada = portalChild({ id: ADA_ID, firstName: 'Ada' });
const tobi = portalChild({
  id: TOBI_ID,
  firstName: 'Tobi',
  className: null,
  campusName: 'Ikeja',
});
const efe = portalChild({
  id: EFE_ID,
  firstName: 'Efe',
  campusName: 'Lekki',
  archived: true,
});

const apiWith = (children: ReturnType<typeof portalChild>[]) => ({
  portal: { children: vi.fn().mockResolvedValue(children) },
});

describe('ChildrenPage', () => {
  it('greets the guardian and counts the children at the school', async () => {
    renderWithApi(
      <ChildrenPage
        me={portalMe()}
        term={undefined}
        onTerm={vi.fn()}
        onOpenChild={vi.fn()}
        onSeeFees={vi.fn()}
      />,
      apiWith([ada, tobi])
    );
    expect(
      await screen.findByRole('heading', { name: 'Hello, Ngozi' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('2 children at Greenfield College.')
    ).toBeInTheDocument();
  });

  it('uses the singular for one child', async () => {
    renderWithApi(
      <ChildrenPage
        me={portalMe()}
        term={undefined}
        onTerm={vi.fn()}
        onOpenChild={vi.fn()}
        onSeeFees={vi.fn()}
      />,
      apiWith([ada])
    );
    expect(
      await screen.findByText('1 child at Greenfield College.')
    ).toBeInTheDocument();
  });

  it('shows a card per child with class and campus, a dash when unplaced, and archived', async () => {
    renderWithApi(
      <ChildrenPage
        me={portalMe()}
        term={undefined}
        onTerm={vi.fn()}
        onOpenChild={vi.fn()}
        onSeeFees={vi.fn()}
      />,
      apiWith([ada, tobi, efe])
    );
    expect(
      await screen.findByRole('button', {
        name: 'Ada Okeke JSS 1 Gold · Lekki',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Tobi Okeke — · Ikeja' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Efe Okeke JSS 1 Gold · Lekki · archived',
      })
    ).toBeInTheDocument();
  });

  it('opens Home for the chosen child', async () => {
    const user = userEvent.setup();
    const onOpenChild = vi.fn();
    renderWithApi(
      <ChildrenPage
        me={portalMe()}
        term={undefined}
        onTerm={vi.fn()}
        onOpenChild={onOpenChild}
        onSeeFees={vi.fn()}
      />,
      apiWith([ada, tobi])
    );
    await user.click(await screen.findByRole('button', { name: /Tobi Okeke/ }));
    expect(onOpenChild).toHaveBeenCalledWith(TOBI_ID);
  });

  it('says so when no children are linked', async () => {
    renderWithApi(
      <ChildrenPage
        me={portalMe()}
        term={undefined}
        onTerm={vi.fn()}
        onOpenChild={vi.fn()}
        onSeeFees={vi.fn()}
      />,
      apiWith([])
    );
    expect(await screen.findByText('No children linked')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Your login still works. Ask the school office to link your children.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('0 children at Greenfield College.')).toBeVisible();
  });

  it('shows a skeleton while loading', () => {
    renderWithApi(
      <ChildrenPage
        me={portalMe()}
        term={undefined}
        onTerm={vi.fn()}
        onOpenChild={vi.fn()}
        onSeeFees={vi.fn()}
      />,
      {
        portal: {
          children: vi.fn().mockReturnValue(new Promise(() => undefined)),
        },
      }
    );
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('shows the error when the children cannot be loaded', async () => {
    renderWithApi(
      <ChildrenPage
        me={portalMe()}
        term={undefined}
        onTerm={vi.fn()}
        onOpenChild={vi.fn()}
        onSeeFees={vi.fn()}
      />,
      {
        portal: {
          children: vi.fn().mockRejectedValue(new Error('The school is away')),
        },
      }
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The school is away'
    );
  });
});

const WITH_FEES: Permission[] = ['student:readOwn', 'invoice:readOwn'];

const owing = (balanceMinor: number) => ({ balanceMinor });

const adaOwes = portalChild({
  id: ADA_ID,
  firstName: 'Ada',
  ...owing(6_000_000),
});
const tobiCredit = portalChild({
  id: TOBI_ID,
  firstName: 'Tobi',
  ...owing(-2_000_000),
});
const efeLeft = portalChild({
  id: EFE_ID,
  firstName: 'Efe',
  archived: true,
  ...owing(4_000_000),
});
const paidUp = portalChild({ id: NNE_ID, firstName: 'Nne', ...owing(0) });

interface FamilyTotals {
  totalOwedMinor: number;
  creditMinor: number;
}

const THREE_CHILD_TOTALS: FamilyTotals = {
  totalOwedMinor: 10_000_000,
  creditMinor: 2_000_000,
};

const familyOf = (
  children: ReturnType<typeof portalChild>[],
  totals: FamilyTotals = THREE_CHILD_TOTALS
) =>
  portalFamilyStatement({
    ...totals,
    children: children.map((child) => ({
      studentId: child.id,
      name: `${child.firstName} ${child.lastName}`,
      className: child.className,
      campusName: child.campusName,
      archived: child.archived,
      balanceMinor: child.balanceMinor ?? 0,
    })),
  });

const TERM_1 = '00000000-0000-4000-8000-0000000c0001';
const TERM_2 = '00000000-0000-4000-8000-0000000c0002';
const TERM_OPTIONS = [
  { id: TERM_2, label: 'Second term, 2026/2027' },
  { id: TERM_1, label: 'First term, 2026/2027' },
];
const FIRST_TERM = {
  id: TERM_1,
  label: 'First term, 2026/2027',
  fromOn: '2026-09-07',
  toOn: null,
};

const feesApi = (
  children: ReturnType<typeof portalChild>[],
  totals?: FamilyTotals
) => ({
  portal: {
    children: vi.fn().mockResolvedValue(children),
    familyStatement: vi.fn(({ query }: { query: { termId?: string } }) =>
      Promise.resolve({
        ...familyOf(children, totals),
        termOptions: TERM_OPTIONS,
        term: query.termId === TERM_1 ? FIRST_TERM : null,
      })
    ),
    statement: vi.fn(
      ({
        params,
        query,
      }: {
        params: { studentId: string };
        query: { termId?: string };
      }) => {
        const child = children.find((item) => item.id === params.studentId);
        const base = portalStatement();
        return Promise.resolve({
          ...base,
          student: {
            ...base.student,
            id: params.studentId,
            name: `${child?.firstName} Okeke`,
            archived: child?.archived ?? false,
          },
          ...(query.termId === TERM_1
            ? {
                term: FIRST_TERM,
                broughtForward: { amountMinor: 1_500_000 },
                closingMinor: 6_000_000,
                termOptions: TERM_OPTIONS,
              }
            : {}),
        });
      }
    ),
  },
});

const showFees = (
  children: ReturnType<typeof portalChild>[],
  props: {
    onSeeFees?: (id: string) => void;
    held?: Permission[];
    totals?: FamilyTotals;
    term?: string;
    onTerm?: (term: string | undefined) => void;
  } = {}
) => {
  const api = feesApi(children, props.totals);
  renderWithApi(
    <ChildrenPage
      me={portalMe()}
      term={props.term}
      onTerm={props.onTerm ?? vi.fn()}
      onOpenChild={vi.fn()}
      onSeeFees={props.onSeeFees ?? vi.fn()}
    />,
    api,
    props.held ?? WITH_FEES
  );
  return api;
};

const cardOf = (name: string) => {
  const card = screen.getAllByRole('listitem').find(
    (item) =>
      within(item).queryByRole('button', {
        name: new RegExp(`^${name} Okeke`),
      }) !== null
  );
  if (card === undefined) {
    throw new Error(`No card for ${name}`);
  }
  return within(card);
};

describe('ChildrenPage fees', () => {
  it('adds Here is what each one owes to the description', async () => {
    showFees([adaOwes, tobiCredit]);
    expect(
      await screen.findByText(
        '2 children at Greenfield College. Here is what each one owes.'
      )
    ).toBeInTheDocument();
  });

  it('gives each card a School fees row for owing, credit and zero', async () => {
    showFees([adaOwes, tobiCredit, paidUp]);
    await screen.findByRole('heading', { name: 'Family statement' });
    expect(cardOf('Ada').getByText('₦60,000 owed')).toBeInTheDocument();
    expect(cardOf('Tobi').getByText('₦20,000 in credit')).toBeInTheDocument();
    expect(cardOf('Nne').getByText('Paid up')).toBeInTheDocument();
    expect(cardOf('Ada').getByText('School fees')).toBeInTheDocument();
  });

  it('keeps the cards and their balances when the family statement fails', async () => {
    const api = feesApi([adaOwes, tobiCredit]);
    api.portal.familyStatement.mockRejectedValue(new Error('boom'));
    renderWithApi(
      <ChildrenPage
        me={portalMe()}
        term={undefined}
        onTerm={vi.fn()}
        onOpenChild={vi.fn()}
        onSeeFees={vi.fn()}
      />,
      api,
      WITH_FEES
    );
    expect(await screen.findByText('₦60,000 owed')).toBeInTheDocument();
    expect(cardOf('Tobi').getByText('₦20,000 in credit')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Family statement' })
    ).not.toBeInTheDocument();
  });

  it('opens Fees for the child from See fees', async () => {
    const user = userEvent.setup();
    const onSeeFees = vi.fn();
    showFees([adaOwes, tobiCredit], { onSeeFees });
    await screen.findByRole('heading', { name: 'Family statement' });
    await user.click(cardOf('Tobi').getByRole('button', { name: 'See fees' }));
    expect(onSeeFees).toHaveBeenCalledWith(TOBI_ID);
  });

  it('shows the family total and credit the server reports', async () => {
    showFees([adaOwes, tobiCredit, efeLeft]);
    expect(
      await screen.findByRole('heading', { name: 'Family statement' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('₦100,000', { selector: 'strong' })
    ).toBeInTheDocument();
    expect(screen.getByText('Family total')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Owed across all children · ₦20,000 extra paid kept separately'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('₦20,000 paid ahead')).toBeInTheDocument();
  });

  it('shows a statement card per child', async () => {
    showFees([adaOwes, tobiCredit]);
    expect(
      await screen.findByText('GF-0123 · JSS 1 Gold · Lekki')
    ).toBeInTheDocument();
    expect(screen.getAllByText('Unpaid charges, oldest first')).toHaveLength(2);
  });

  it('lists a child who left with their debt as archived', async () => {
    showFees([adaOwes, efeLeft]);
    await screen.findByRole('heading', { name: 'Family statement' });
    expect(
      screen.getByRole('button', {
        name: 'Efe Okeke JSS 1 Gold · Lekki · archived',
      })
    ).toBeInTheDocument();
    expect(cardOf('Efe').getByText('₦40,000 owed')).toBeInTheDocument();
    expect(
      await screen.findByText('GF-0123 · JSS 1 Gold · Lekki · archived')
    ).toBeInTheDocument();
  });

  it('shows only Total owed, with no tiles, for a single child', async () => {
    showFees([adaOwes], {
      totals: { totalOwedMinor: 6_000_000, creditMinor: 0 },
    });
    await screen.findByRole('heading', { name: 'Family statement' });
    expect(screen.queryByText('Family total')).not.toBeInTheDocument();
    expect(
      screen.getByText('₦60,000', { selector: 'strong' })
    ).toBeInTheDocument();
  });

  it('shows no fee rows, See fees or family statement without invoice:readOwn', async () => {
    const api = feesApi([adaOwes, tobiCredit]);
    renderWithApi(
      <ChildrenPage
        me={portalMe()}
        term={undefined}
        onTerm={vi.fn()}
        onOpenChild={vi.fn()}
        onSeeFees={vi.fn()}
      />,
      api,
      ['student:readOwn']
    );
    expect(
      await screen.findByText('2 children at Greenfield College.')
    ).toBeInTheDocument();
    expect(screen.queryByText('School fees')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'See fees' })
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Family statement')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Here is what each one owes/)
    ).not.toBeInTheDocument();
    expect(api.portal.familyStatement).not.toHaveBeenCalled();
    expect(api.portal.statement).not.toHaveBeenCalled();
  });
});

describe('ChildrenPage term filter', () => {
  it('offers Whole history and the response’s terms, with the whole history picked', async () => {
    showFees([adaOwes, tobiCredit]);

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

  it('asks for the family statement and each child’s statement with the term', async () => {
    const api = showFees([adaOwes, tobiCredit], { term: TERM_1 });

    expect(await screen.findByRole('combobox', { name: 'Term' })).toHaveValue(
      TERM_1
    );
    expect(api.portal.familyStatement).toHaveBeenCalledWith({
      query: { termId: TERM_1 },
    });
    for (const studentId of [ADA_ID, TOBI_ID]) {
      expect(api.portal.statement).toHaveBeenCalledWith({
        params: { studentId },
        query: { termId: TERM_1 },
      });
    }
  });

  it('sends no term for the whole history', async () => {
    const api = showFees([adaOwes, tobiCredit]);

    await screen.findByRole('combobox', { name: 'Term' });

    expect(api.portal.familyStatement).toHaveBeenCalledWith({ query: {} });
    expect(api.portal.statement).toHaveBeenCalledWith({
      params: { studentId: ADA_ID },
      query: {},
    });
  });

  it('shows Brought forward first on each child’s card under a term', async () => {
    showFees([adaOwes, tobiCredit], { term: TERM_1 });

    await waitFor(() => {
      expect(
        screen.getAllByRole('row', { name: /Brought forward/ })
      ).toHaveLength(2);
    });
    for (const table of screen.getAllByRole('table')) {
      expect(within(table).getAllByRole('row')[1]).toHaveAccessibleName(
        /Brought forward/
      );
    }
  });

  it('keeps Total owed, the tiles and the card balances whole-account under a term', async () => {
    showFees([adaOwes, tobiCredit, efeLeft], { term: TERM_1 });

    await screen.findAllByRole('row', { name: /Brought forward/ });

    expect(
      screen.getByText('₦100,000', { selector: 'strong' })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Owed across all children · ₦20,000 extra paid kept separately'
      )
    ).toBeInTheDocument();
    expect(cardOf('Ada').getByText('₦60,000 owed')).toBeInTheDocument();
  });

  it('reports the picked term and the whole history', async () => {
    const user = userEvent.setup();
    const onTerm = vi.fn();
    showFees([adaOwes, tobiCredit], { onTerm, term: TERM_1 });

    const select = await screen.findByRole('combobox', { name: 'Term' });
    await user.selectOptions(select, TERM_2);
    await user.selectOptions(select, '');

    expect(onTerm).toHaveBeenNthCalledWith(1, TERM_2);
    expect(onTerm).toHaveBeenNthCalledWith(2, undefined);
  });

  it('has no Term select without invoice:readOwn', async () => {
    showFees([adaOwes], { held: ['student:readOwn'] });

    await screen.findByText('1 child at Greenfield College.');

    expect(
      screen.queryByRole('combobox', { name: 'Term' })
    ).not.toBeInTheDocument();
  });
});
