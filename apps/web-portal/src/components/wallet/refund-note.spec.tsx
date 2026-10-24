import { render, screen } from '@testing-library/react';
import { RefundNote } from './refund-note';

describe('RefundNote', () => {
  it('names the school email as a link when the school has one', () => {
    render(<RefundNote email="bursar@greenfield.test" />);
    expect(
      screen.getByText(/Sent money to the wrong account\?/)
    ).toHaveTextContent(
      'Sent money to the wrong account? Email bursar@greenfield.test with the reference and we will look into a refund.'
    );
    expect(
      screen.getByRole('link', { name: 'bursar@greenfield.test' })
    ).toHaveAttribute('href', 'mailto:bursar@greenfield.test');
  });

  it('reads without an address when the school has none', () => {
    render(<RefundNote email={null} />);
    expect(
      screen.getByText(
        'Sent money to the wrong account? Contact the school with the reference and we will look into a refund.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
