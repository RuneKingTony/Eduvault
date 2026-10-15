import {
  campusLabel,
  endingText,
  hiddenAccountsText,
  hiddenFooterText,
  scopeText,
  tileSubline,
} from './money-text';

describe('money text', () => {
  it('names a campus or says school-wide', () => {
    expect(campusLabel('Lekki')).toBe('Lekki');
    expect(campusLabel(null)).toBe('School-wide');
  });

  it('adds the last 4 digits only when there are some', () => {
    expect(endingText('4417')).toBe(' · ending 4417');
    expect(endingText(null)).toBe('');
    expect(tileSubline({ campusName: null, last4: '4417' })).toBe(
      'School-wide · ending 4417'
    );
    expect(tileSubline({ campusName: 'Lekki', last4: null })).toBe('Lekki');
  });

  it('words the hidden accounts callout for one and for many', () => {
    expect(hiddenAccountsText(1)).toBe(
      '1 school-wide account is hidden. Seeing it needs access to every campus.'
    );
    expect(hiddenAccountsText(3)).toBe(
      '3 school-wide accounts are hidden. Seeing them needs access to every campus.'
    );
  });

  it('words the dashboard footer for one and for many', () => {
    expect(hiddenFooterText(1)).toBe(
      '1 school-wide account not shown for your campus.'
    );
    expect(hiddenFooterText(2)).toBe(
      '2 school-wide accounts not shown for your campus.'
    );
  });

  it('names the campuses a scoped member sees', () => {
    expect(scopeText(['Lekki'])).toBe('Showing Lekki campus only.');
    expect(scopeText(['Lekki', 'Ikeja'])).toBe(
      'Showing Lekki and Ikeja campuses only.'
    );
    expect(scopeText(['Lekki', 'Ikeja', 'Yaba'])).toBe(
      'Showing Lekki, Ikeja and Yaba campuses only.'
    );
  });
});
