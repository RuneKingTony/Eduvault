import { render, screen, within } from '@testing-library/react';
import { WalletFigure } from './wallet-figure';

describe('WalletFigure', () => {
  it('is a labelled group with the value and its hint', () => {
    render(
      <WalletFigure
        title="Free to use"
        hint="Can pay any of the children’s charges."
        value="₦0.00"
      />
    );
    const figure = screen.getByRole('group', { name: 'Free to use' });
    expect(within(figure).getByText('₦0.00')).toBeInTheDocument();
    expect(
      within(figure).getByText('Can pay any of the children’s charges.')
    ).toBeInTheDocument();
  });
});
