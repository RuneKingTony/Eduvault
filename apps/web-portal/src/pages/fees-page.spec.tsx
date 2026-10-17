import { useState } from 'react';
import { fireEvent, screen, within } from '@testing-library/react';
import type { Permission } from '@eduvault/policy';
import {
  calendarCurrent,
  portalChild,
  portalMe,
  portalStatement,
  renderWithApi,
} from '../test-utils';
import { FeesPage } from './fees-page';

const HELD: Permission[] = ['student:readOwn', 'invoice:readOwn'];
const ada = portalChild({ id: 'ada', firstName: 'Ada' });
const tobi = portalChild({ id: 'tobi', firstName: 'Tobi' });
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

const renderFees = (api: ReturnType<typeof apiWith>, childId = 'ada') =>
  renderWithApi(<FeesPage me={guardian} childId={childId} />, api, HELD);

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
    const stat = (await screen.findByText('Still to pay')).closest('div');
    expect(stat).not.toBeNull();
    expect(within(stat as HTMLElement).getByText('Owing')).toBeInTheDocument();
    expect(
      within(stat as HTMLElement).getByText('₦60,000')
    ).toBeInTheDocument();
  });

  it('reads School fees, Paid up and the extra when in credit, with the callout and no refund button', async () => {
    renderFees(apiWith(withBalance(-500_000)));
    const stat = (await screen.findByText('₦5,000 extra')).closest('div');
    expect(
      within(stat as HTMLElement).getByText('School fees')
    ).toBeInTheDocument();
    expect(
      within(stat as HTMLElement).getByText('Paid up')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        '₦5,000 was paid in extra. It is taken off the next fees automatically.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('reads Paid up and Nothing owed at zero', async () => {
    renderFees(apiWith(withBalance(0)));
    const stat = (await screen.findByText('Nothing owed')).closest('div');
    expect(
      within(stat as HTMLElement).getByText('School fees')
    ).toBeInTheDocument();
    expect(
      within(stat as HTMLElement).getByText('Paid up')
    ).toBeInTheDocument();
  });

  it('shows plain rows with no reference note and no links', async () => {
    const { container } = renderFees(apiWith());
    expect(
      await screen.findByText('Term fees, First term')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Payment RCT-0001 from Ngozi Okeke (Bank transfer)')
    ).toBeInTheDocument();
    expect(container.querySelector('.font-mono')).toBeNull();
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
      params: { studentId: 'ada' },
      query: {},
    });
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    await screen.findByRole('heading', { name: 'Fees' });
    expect(api.portal.statement).toHaveBeenCalledWith({
      params: { studentId: 'ada' },
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
            name: params.studentId === 'tobi' ? 'Tobi Okeke' : 'Ada Okeke',
          },
        })
      )
    );
    function Switching() {
      const [childId, setChildId] = useState('ada');
      return (
        <>
          <button
            type="button"
            onClick={() => {
              setChildId('tobi');
            }}
          >
            Switch to Tobi
          </button>
          <FeesPage me={guardian} childId={childId} />
        </>
      );
    }
    renderWithApi(
      <Switching />,
      { portal: { statement }, calendar: apiWith().calendar },
      HELD
    );
    await screen.findByText('Ada Okeke · First term 2026/2027');

    fireEvent.click(screen.getByRole('button', { name: 'Switch to Tobi' }));

    expect(
      await screen.findByText('Tobi Okeke · First term 2026/2027')
    ).toBeInTheDocument();
    expect(statement).toHaveBeenCalledWith({
      params: { studentId: 'tobi' },
      query: {},
    });
    expect(screen.getByRole('heading', { name: 'Fees' })).toBeInTheDocument();
  });

  it('says so when no children are linked', () => {
    renderWithApi(
      <FeesPage me={portalMe({ children: [] })} childId={undefined} />,
      apiWith(),
      HELD
    );
    expect(screen.getByText('No children linked')).toBeInTheDocument();
  });

  it('shows the error when the statement cannot be loaded', async () => {
    renderWithApi(
      <FeesPage me={guardian} childId="ada" />,
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
