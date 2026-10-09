import { render, screen } from '@testing-library/react';
import { parseColor } from '@eduvault/ui';
import { ContrastTable, pairRatio, type ReadToken } from './contrast-table';

const tokens: Record<string, string> = {
  card: '#ffffff',
  foreground: '#000000',
  muted: '#767676',
  destructive: '#ff0000',
};
const read: ReadToken = (token) => parseColor(tokens[token] ?? '');

describe('pairRatio', () => {
  it('computes the WCAG ratio of a token on a surface', () => {
    expect(
      pairRatio({ label: 'x', text: ['foreground'], surface: ['card'] }, read)
    ).toBeCloseTo(21, 1);
  });

  it('paints a translucent surface over the card first', () => {
    const plain = pairRatio(
      { label: 'x', text: ['destructive'], surface: ['card'] },
      read
    );
    const tinted = pairRatio(
      { label: 'x', text: ['destructive'], surface: ['destructive', 0.3] },
      read
    );
    expect(tinted).toBeLessThan(plain ?? 0);
  });

  it('has no ratio when a token cannot be read', () => {
    expect(
      pairRatio({ label: 'x', text: ['missing'], surface: ['card'] }, read)
    ).toBeUndefined();
  });
});

describe('ContrastTable', () => {
  it('shows each ratio with an AA verdict', () => {
    render(
      <ContrastTable
        read={read}
        pairs={[
          { label: 'Body', text: ['foreground'], surface: ['card'] },
          { label: 'Pale', text: ['card'], surface: ['card'] },
          { label: 'Unknown', text: ['missing'], surface: ['card'] },
        ]}
      />
    );
    expect(screen.getByText('21.00:1')).toBeInTheDocument();
    expect(screen.getByText('Pass')).toBeInTheDocument();
    expect(screen.getByText('1.00:1')).toBeInTheDocument();
    expect(screen.getByText('Below AA')).toBeInTheDocument();
    expect(screen.getByText('n/a')).toBeInTheDocument();
  });
});
