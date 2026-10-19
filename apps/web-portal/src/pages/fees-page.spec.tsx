import { useState } from 'react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Permission } from '@eduvault/policy';
import {
  ADA_ID,
  TOBI_ID,
  calendarCurrent,
  portalChild,
  portalMe,
  portalStatement,
  renderWithApi,
  testId,
} from '../test-utils';
import { FeesPage } from './fees-page';

const HELD: Permission[] = ['student:readOwn', 'invoice:readOwn'];
const ada = portalChild({ id: ADA_ID, firstName: 'Ada' });
const tobi = portalChild({ id: TOBI_ID, firstName: 'Tobi' });
const guardian = portalMe({ children: [ada, tobi] });

type Statement = ReturnType<typeof portalStatement>;

const apiWith = (statement: Statement = portalStatement()) => ({
  portal: {
    statement: vi.fn().mockResolvedValue(statement),
  },
  calendar: { current: vi.fn().mockResolvedValue(calendarCurrent()) },
});

const withBalance = (balanceMinor: number) =>
  portalStatement({
    totals: {
      balanceMinor,
      totalMinor: 10_000_000,
      paidMinor: 4_000_000,
      reducedMinor: 0,
    },
  });

const renderFees = (api: ReturnType<typeof apiWith>, childId = ADA_ID) =>
  renderWithApi(
    <FeesPage
      me={guardian}
      childId={childId}
      term={undefined}
      onTerm={vi.fn()}
    />,
    api,
    HELD
  );

let user: ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  user = userEvent.setup();
});

describe('FeesPage', () => {
  it('names the child and the term under the Fees heading', async () => {
    renderFees(apiWith());
    expect(
      await screen.findByRole('heading', { name: 'Fees' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('Ada Okeke · First term 2026/2027')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Statement' })
    ).toBeInTheDocument();
  });

  it('reads Owing, the amount and Still to pay when owing', async () => {
    renderFees(apiWith());
    const stat = await screen.findByRole('group', { name: 'Owing' });
    expect(within(stat).getByText('₦60,000')).toBeInTheDocument();
    expect(within(stat).getByText('Still to pay')).toBeInTheDocument();
  });

  it('reads School fees, Paid up and the extra when in credit, with the callout and no refund button', async () => {
    renderFees(apiWith(withBalance(-500_000)));
    const stat = await screen.findByRole('group', { name: 'School fees' });
    expect(within(stat).getByText('Paid up')).toBeInTheDocument();
    expect(within(stat).getByText('₦5,000 extra')).toBeInTheDocument();
    expect(
      screen.getByText(
        '₦5,000 was paid in extra. It is taken off the next fees automatically.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('reads Paid up and Nothing owed at zero', async () => {
    renderFees(apiWith(withBalance(0)));
    const stat = await screen.findByRole('group', { name: 'School fees' });
    expect(within(stat).getByText('Paid up')).toBeInTheDocument();
    expect(within(stat).getByText('Nothing owed')).toBeInTheDocument();
  });

  it('shows plain rows with no reference note and no links', async () => {
    renderFees(apiWith());
    expect(
      await screen.findByText('Term fees, First term')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Payment RCT-0001 from Ngozi Okeke (Bank transfer)')
    ).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('CHG-0001 · ₦60,000')).toBeInTheDocument();
  });

  it('shows the archived suffix for a child who has left', async () => {
    const statement = portalStatement();
    renderFees(
      apiWith({
        ...statement,
        student: { ...statement.student, archived: true },
      })
    );
    expect(
      await screen.findByText('GF-0123 · JSS 1 Gold · Lekki · archived')
    ).toBeInTheDocument();
  });

  it('asks for the last page first and pages on request', async () => {
    const api = apiWith({
      ...portalStatement(),
      total: 24,
      page: 3,
    });
    renderFees(api);
    await screen.findByText('Showing 21 to 24 of 24');
    expect(api.portal.statement).toHaveBeenCalledWith({
      params: { studentId: ADA_ID },
      query: {},
    });
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    await screen.findByRole('heading', { name: 'Fees' });
    expect(api.portal.statement).toHaveBeenCalledWith({
      params: { studentId: ADA_ID },
      query: { page: 2 },
    });
  });

  it('re-queries for another child without leaving the page', async () => {
    const statement = vi.fn(({ params }: { params: { studentId: string } }) =>
      Promise.resolve(
        portalStatement({
          student: {
            ...portalStatement().student,
            id: params.studentId,
            name: params.studentId === TOBI_ID ? 'Tobi Okeke' : 'Ada Okeke',
          },
        })
      )
    );
    function Switching() {
      const [childId, setChildId] = useState(ADA_ID);
      return (
        <>
          <button
            type="button"
            onClick={() => {
              setChildId(TOBI_ID);
            }}
          >
            Switch to Tobi
          </button>
          <FeesPage
            me={guardian}
            childId={childId}
            term={undefined}
            onTerm={vi.fn()}
          />
        </>
      );
    }
    renderWithApi(
      <Switching />,
      { portal: { statement }, calendar: apiWith().calendar },
      HELD
    );
    await screen.findByText('Ada Okeke · First term 2026/2027');

    await user.click(screen.getByRole('button', { name: 'Switch to Tobi' }));

    expect(
      await screen.findByText('Tobi Okeke · First term 2026/2027')
    ).toBeInTheDocument();
    expect(statement).toHaveBeenCalledWith({
      params: { studentId: TOBI_ID },
      query: {},
    });
    expect(screen.getByRole('heading', { name: 'Fees' })).toBeInTheDocument();
  });

  it('says so when no children are linked', () => {
    renderWithApi(
      <FeesPage
        me={portalMe({ children: [] })}
        childId={undefined}
        term={undefined}
        onTerm={vi.fn()}
      />,
      apiWith(),
      HELD
    );
    expect(screen.getByText('No children linked')).toBeInTheDocument();
  });

  it('shows the error when the statement cannot be loaded', async () => {
    renderWithApi(
      <FeesPage
        me={guardian}
        childId={ADA_ID}
        term={undefined}
        onTerm={vi.fn()}
      />,
      {
        portal: {
          statement: vi.fn().mockRejectedValue(new Error('The school is away')),
        },
        calendar: apiWith().calendar,
      },
      HELD
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The school is away'
    );
  });
});

describe('FeesPage term filter', () => {
  const TERM_1 = testId(101);
  const TERM_2 = testId(102);
  const OPTIONS = [
    { id: TERM_2, label: 'Second term, 2026/2027' },
    { id: TERM_1, label: 'First term, 2026/2027' },
  ];
  const filtered = (toOn: string | null) =>
    portalStatement({
      termOptions: OPTIONS,
      term: {
        id: TERM_1,
        label: 'First term, 2026/2027',
        fromOn: '2026-09-07',
        toOn,
      },
      broughtForward: { amountMinor: 1_500_000 },
      closingMinor: 6_000_000,
    });

  it('offers Whole history and the terms from the response', async () => {
    renderWithApi(
      <FeesPage
        me={guardian}
        childId={ADA_ID}
        term={undefined}
        onTerm={vi.fn()}
      />,
      apiWith(portalStatement({ termOptions: OPTIONS })),
      HELD
    );

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

  it('asks for the chosen term and shows Brought forward first with the term-end footer', async () => {
    const api = apiWith(filtered('2026-12-18'));
    renderWithApi(
      <FeesPage
        me={guardian}
        childId={ADA_ID}
        term={TERM_1}
        onTerm={vi.fn()}
      />,
      api,
      HELD
    );

    const row = await screen.findByRole('row', { name: /Brought forward/ });

    expect(row).toBe(screen.getAllByRole('row')[1]);
    expect(within(row).getByText('₦15,000')).toBeInTheDocument();
    expect(screen.getByText('Owing at end of term')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Term' })).toHaveValue(TERM_1);
    expect(api.portal.statement).toHaveBeenCalledWith({
      params: { studentId: ADA_ID },
      query: { termId: TERM_1 },
    });
  });

  it('keeps the usual footer for the latest term', async () => {
    renderWithApi(
      <FeesPage
        me={guardian}
        childId={ADA_ID}
        term={TERM_1}
        onTerm={vi.fn()}
      />,
      apiWith(filtered(null)),
      HELD
    );

    expect(await screen.findByText('Owing now')).toBeInTheDocument();
  });

  it('reports the picked term and the whole history', async () => {
    const onTerm = vi.fn();
    renderWithApi(
      <FeesPage me={guardian} childId={ADA_ID} term={TERM_1} onTerm={onTerm} />,
      apiWith(filtered(null)),
      HELD
    );
    const select = await screen.findByRole('combobox', { name: 'Term' });

    await user.selectOptions(select, TERM_2);
    expect(onTerm).toHaveBeenLastCalledWith(TERM_2);
    await user.selectOptions(select, '');
    expect(onTerm).toHaveBeenLastCalledWith(undefined);
  });
});
