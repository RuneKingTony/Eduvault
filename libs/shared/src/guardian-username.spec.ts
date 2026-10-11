import { firstFreeUsername, guardianUsernameBase } from './guardian-username';

describe('guardianUsernameBase', () => {
  it('drops a leading title and adds -family', () => {
    expect(guardianUsernameBase('Mrs Udoh')).toBe('udoh-family');
    expect(guardianUsernameBase('Emmanuel Etim')).toBe('emmanuel-etim-family');
  });

  it('drops every title in the list, dotted or not', () => {
    for (const title of [
      'Mr',
      'Mrs',
      'Ms',
      'Dr',
      'Chief',
      'Alhaji',
      'Alhaja',
    ]) {
      expect(guardianUsernameBase(`${title} Bello`)).toBe('bello-family');
      expect(guardianUsernameBase(`${title}. Bello`)).toBe('bello-family');
      expect(guardianUsernameBase(`${title}.Bello`)).toBe('bello-family');
    }
  });

  it('keeps a name that only starts with the letters of a title', () => {
    expect(guardianUsernameBase('Drake Obi')).toBe('drake-obi-family');
    expect(guardianUsernameBase('Mrsa Eze')).toBe('mrsa-eze-family');
  });

  it('turns runs of other characters into one hyphen and trims them', () => {
    expect(guardianUsernameBase("  Grace   O'Brien-Johnson ")).toBe(
      'grace-o-brien-johnson-family'
    );
    expect(guardianUsernameBase('Ngozi 2nd')).toBe('ngozi-nd-family');
  });

  it('falls back when no letters are left', () => {
    expect(guardianUsernameBase('1234')).toBe('guardian-family');
    expect(guardianUsernameBase('Mr')).toBe('guardian-family');
  });

  it('stays short enough for a username', () => {
    expect(guardianUsernameBase('a'.repeat(200)).length).toBeLessThanOrEqual(
      68
    );
  });
});

describe('firstFreeUsername', () => {
  it('uses the base when it is free', () => {
    expect(firstFreeUsername('udoh-family', new Set())).toBe('udoh-family');
  });

  it('adds 2, 3, and so on after the base', () => {
    expect(firstFreeUsername('udoh-family', new Set(['udoh-family']))).toBe(
      'udoh-family2'
    );
    expect(
      firstFreeUsername(
        'udoh-family',
        new Set(['udoh-family', 'udoh-family2', 'udoh-family3'])
      )
    ).toBe('udoh-family4');
  });

  it('fills a gap before growing', () => {
    expect(
      firstFreeUsername('udoh-family', new Set(['udoh-family', 'udoh-family3']))
    ).toBe('udoh-family2');
  });
});
