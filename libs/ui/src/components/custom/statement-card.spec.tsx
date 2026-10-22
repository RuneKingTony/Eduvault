import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StatementCard, type StatementCardProps } from './statement-card';

const base: StatementCardProps = {
  heading: {
    avatar: <span>AO</span>,
    name: 'Ada Okeke',
    detail: 'GF-0001 · JSS 1 Gold · Lekki',
  },
  tiles: [
    { label: 'Owing', value: '₦60,000' },
    { label: 'Paid', value: '₦40,000' },
    { label: 'Total', value: '₦100,000' },
  ],
  rows: [
    {
      key: 'one',
      date: '1 Sep 2026',
      what: <span>Term fees, First term</span>,
      status: 'Charged',
      tone: 'owe',
      amount: '₦100,000',
    },
    {
      key: 'two',
      date: '2 Sep 2026',
      what: <span>Payment RCT-1</span>,
      note: 'RCT-1',
      status: 'Paid',
      tone: 'paid',
      amount: '₦40,000',
    },
  ],
  footer: { label: 'Owing now', value: '₦60,000' },
  unpaid: [],
  emptyText: 'No entries yet',
};

let user: ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  user = userEvent.setup();
});

describe('StatementCard', () => {
  it('shows the heading, tiles, rows with their status and the footer', () => {
    render(<StatementCard {...base} />);
    expect(screen.getByText('Ada Okeke')).toBeInTheDocument();
    expect(
      screen.getByText('GF-0001 · JSS 1 Gold · Lekki')
    ).toBeInTheDocument();
    expect(
      screen.getByText('₦60,000', { selector: 'span.text-lg' })
    ).toBeInTheDocument();
    expect(screen.getByText('Charged')).toBeInTheDocument();
    expect(
      screen.getByText('Paid', { selector: '[data-slot="badge"]' })
    ).toBeInTheDocument();
    expect(screen.getByText('Owing now')).toBeInTheDocument();
    expect(screen.getByText('RCT-1')).toBeInTheDocument();
  });

  it('shows a reduced tile only when one is passed', () => {
    const { rerender } = render(<StatementCard {...base} />);
    expect(screen.queryByText('Reduced')).not.toBeInTheDocument();
    rerender(
      <StatementCard
        {...base}
        tiles={[...base.tiles, { label: 'Reduced', value: '₦5,000' }]}
      />
    );
    expect(screen.getByText('Reduced')).toBeInTheDocument();
  });

  it('shows a credit callout without an action when none is given', () => {
    render(
      <StatementCard
        {...base}
        callout={{ text: '₦5,000 was paid in extra.' }}
      />
    );
    expect(screen.getByText('₦5,000 was paid in extra.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows the action beside the callout when one is given', () => {
    render(
      <StatementCard
        {...base}
        callout={{
          text: '₦5,000 was paid in extra.',
          action: <button type="button">Pay it back</button>,
        }}
      />
    );
    expect(
      screen.getByRole('button', { name: 'Pay it back' })
    ).toBeInTheDocument();
  });

  it('lists unpaid charges oldest first as badges', () => {
    render(
      <StatementCard
        {...base}
        unpaid={[
          { key: 'a', label: 'INV-1 · ₦60,000' },
          { key: 'b', label: 'INV-2 · ₦10,000' },
        ]}
      />
    );
    expect(
      screen.getByText('Unpaid charges, oldest first')
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('listitem').map((item) => item.textContent)
    ).toEqual(['INV-1 · ₦60,000', 'INV-2 · ₦10,000']);
  });

  it('shows the empty text and no table when there are no rows', () => {
    render(<StatementCard {...base} rows={[]} />);
    expect(screen.getByText('No entries yet')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('pages only when the entries outgrow a page', async () => {
    const onPage = vi.fn();
    const { rerender } = render(
      <StatementCard
        {...base}
        pager={{ page: 1, total: 8, pageSize: 10, onPage }}
      />
    );
    expect(
      screen.queryByRole('navigation', { name: 'Pages' })
    ).not.toBeInTheDocument();
    rerender(
      <StatementCard
        {...base}
        pager={{ page: 1, total: 24, pageSize: 10, onPage }}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPage).toHaveBeenCalledWith(2);
  });

  describe('brought forward', () => {
    const brought = {
      date: '1 Sep 2026',
      label: 'Brought forward',
      tip: 'What the family already owed before this term.',
      amount: '₦15,000',
      tone: 'owe' as const,
    };

    it('starts the table with the row, its tip and amount, ahead of the entries', () => {
      render(<StatementCard {...base} broughtForward={brought} />);
      const rows = screen.getAllByRole('row');
      expect(rows[1]).toHaveTextContent('Brought forward');
      expect(rows[1]).toHaveTextContent(
        'What the family already owed before this term.'
      );
      expect(rows[1]).toHaveTextContent('₦15,000');
      expect(rows[2]).toHaveTextContent('Term fees, First term');
    });

    it('is left out when none is passed', () => {
      render(<StatementCard {...base} />);
      expect(screen.queryByText('Brought forward')).not.toBeInTheDocument();
    });

    it('shows on page 1 only', () => {
      const onPage = vi.fn();
      const { rerender } = render(
        <StatementCard
          {...base}
          broughtForward={brought}
          pager={{ page: 1, total: 24, pageSize: 10, onPage }}
        />
      );
      expect(screen.getByText('Brought forward')).toBeInTheDocument();
      rerender(
        <StatementCard
          {...base}
          broughtForward={brought}
          pager={{ page: 2, total: 24, pageSize: 10, onPage }}
        />
      );
      expect(screen.queryByText('Brought forward')).not.toBeInTheDocument();
    });

    it('keeps the row and footer when the term has no entries', () => {
      render(
        <StatementCard
          {...base}
          rows={[]}
          broughtForward={{ ...brought, amount: '₦0', tone: 'paid' }}
        />
      );
      expect(screen.getByText('Brought forward')).toBeInTheDocument();
      expect(screen.getByText('₦0')).toBeInTheDocument();
      expect(screen.getByText('Owing now')).toBeInTheDocument();
      expect(screen.queryByText('No entries yet')).not.toBeInTheDocument();
    });

    it('colours a credit in the paid tone', () => {
      render(
        <StatementCard
          {...base}
          broughtForward={{ ...brought, amount: '₦500 credit', tone: 'paid' }}
        />
      );
      expect(screen.getByText('₦500 credit')).toHaveClass('text-success');
    });
  });
});
