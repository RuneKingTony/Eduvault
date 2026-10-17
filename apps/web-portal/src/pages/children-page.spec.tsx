import { fireEvent, screen, within } from '@testing-library/react';
import type { Permission } from '@eduvault/policy';
import {
  portalChild,
  portalFamilyStatement,
  portalMe,
  portalStatement,
  renderWithApi,
} from '../test-utils';
import { ChildrenPage } from './children-page';

const ada = portalChild({ id: 'ada', firstName: 'Ada' });
const tobi = portalChild({
  id: 'tobi',
  firstName: 'Tobi',
  className: null,
  campusName: 'Ikeja',
});
const efe = portalChild({
  id: 'efe',
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
    const onOpenChild = vi.fn();
    renderWithApi(
      <ChildrenPage
        me={portalMe()}
        onOpenChild={onOpenChild}
        onSeeFees={vi.fn()}
      />,
      apiWith([ada, tobi])
    );
    fireEvent.click(await screen.findByRole('button', { name: /Tobi Okeke/ }));
    expect(onOpenChild).toHaveBeenCalledWith('tobi');
  });

  it('says so when no children are linked', async () => {
    renderWithApi(
      <ChildrenPage
        me={portalMe()}
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
  id: 'ada',
  firstName: 'Ada',
  ...owing(6_000_000),
});
const tobiCredit = portalChild({
  id: 'tobi',
  firstName: 'Tobi',
  ...owing(-2_000_000),
});
const efeLeft = portalChild({
  id: 'efe',
  firstName: 'Efe',
  archived: true,
  ...owing(4_000_000),
});
const paidUp = portalChild({ id: 'nne', firstName: 'Nne', ...owing(0) });

const familyOf = (children: ReturnType<typeof portalChild>[]) => {
  const balances = children.map((child) => child.balanceMinor ?? 0);
  return portalFamilyStatement({
    totalOwedMinor: balances.reduce((sum, b) => sum + Math.max(0, b), 0),
    creditMinor: balances.reduce((sum, b) => sum + Math.max(0, -b), 0),
    children: children.map((child) => ({
      studentId: child.id,
      name: `${child.firstName} ${child.lastName}`,
      className: child.className,
      campusName: child.campusName,
      archived: child.archived,
      balanceMinor: child.balanceMinor ?? 0,
    })),
  });
};

const feesApi = (children: ReturnType<typeof portalChild>[]) => ({
  portal: {
    children: vi.fn().mockResolvedValue(children),
    familyStatement: vi.fn().mockResolvedValue(familyOf(children)),
    statement: vi.fn(({ params }: { params: { studentId: string } }) => {
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
      });
    }),
  },
});

const renderFees = (
  children: ReturnType<typeof portalChild>[],
  props: { onSeeFees?: (id: string) => void; held?: Permission[] } = {}
) =>
  renderWithApi(
    <ChildrenPage
      me={portalMe()}
      onOpenChild={vi.fn()}
      onSeeFees={props.onSeeFees ?? vi.fn()}
    />,
    feesApi(children),
    props.held ?? WITH_FEES
  );

const cardOf = (name: string) =>
  within(
    screen
      .getByRole('button', { name: new RegExp(`^${name} Okeke`) })
      .closest('li') as HTMLElement
  );

describe('ChildrenPage fees', () => {
  it('adds Here is what each one owes to the description', async () => {
    renderFees([adaOwes, tobiCredit]);
    expect(
      await screen.findByText(
        '2 children at Greenfield College. Here is what each one owes.'
      )
    ).toBeInTheDocument();
  });

  it('gives each card a School fees row for owing, credit and zero', async () => {
    renderFees([adaOwes, tobiCredit, paidUp]);
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
    const onSeeFees = vi.fn();
    renderFees([adaOwes, tobiCredit], { onSeeFees });
    await screen.findByRole('heading', { name: 'Family statement' });
    fireEvent.click(cardOf('Tobi').getByRole('button', { name: 'See fees' }));
    expect(onSeeFees).toHaveBeenCalledWith('tobi');
  });

  it('adds only the positive balances to Total owed and shows credit apart', async () => {
    renderFees([adaOwes, tobiCredit, efeLeft]);
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
    renderFees([adaOwes, tobiCredit]);
    expect(
      await screen.findByText('GF-0123 · JSS 1 Gold · Lekki')
    ).toBeInTheDocument();
    expect(screen.getAllByText('Unpaid charges, oldest first')).toHaveLength(2);
  });

  it('lists a child who left with their debt as archived', async () => {
    renderFees([adaOwes, efeLeft]);
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
    renderFees([adaOwes]);
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
