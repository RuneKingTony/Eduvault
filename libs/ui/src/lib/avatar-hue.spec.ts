import { avatarHueClass } from './avatar-hue';

describe('avatarHueClass', () => {
  it('gives each name the same class every time', () => {
    expect(avatarHueClass('Funmi Adeyemi')).toBe('avatar-h-19');
    expect(avatarHueClass('Chika Eze')).toBe('avatar-h-15');
    expect(avatarHueClass('A')).toBe('avatar-h-4');
  });

  it('stays inside the 24 generated buckets', () => {
    const names = ['', 'A', 'Ada Obi', 'Ngozi Okeke', 'Tunde Bakare', '李雷'];
    for (const name of names) {
      const bucket = Number(avatarHueClass(name).replace('avatar-h-', ''));
      expect(Number.isInteger(bucket)).toBe(true);
      expect(bucket).toBeGreaterThanOrEqual(0);
      expect(bucket).toBeLessThanOrEqual(23);
    }
  });

  it('spreads different names across several buckets', () => {
    const buckets = new Set(
      ['Ada', 'Ngozi', 'Chika', 'Tunde', 'Kemi', 'Emeka', 'Grace', 'Femi'].map(
        (name) => avatarHueClass(name)
      )
    );
    expect(buckets.size).toBeGreaterThan(3);
  });

  it('puts the empty name on the first bucket', () => {
    expect(avatarHueClass('')).toBe('avatar-h-0');
  });
});
