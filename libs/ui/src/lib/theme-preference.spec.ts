import { stubMatchMedia } from '../testing/match-media';

const DARK = '(prefers-color-scheme: dark)';

async function loadTheme() {
  vi.resetModules();
  return import('./theme-preference');
}

const isDark = () => document.documentElement.classList.contains('dark');

describe('theme preference', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('follows a dark device when nothing was chosen', async () => {
    stubMatchMedia({ [DARK]: true });
    const { initTheme } = await loadTheme();
    initTheme();
    expect(isDark()).toBe(true);
  });

  it('stays light on a light device', async () => {
    stubMatchMedia({ [DARK]: false });
    const { initTheme } = await loadTheme();
    initTheme();
    expect(isDark()).toBe(false);
  });

  it('prefers a stored choice over the device', async () => {
    stubMatchMedia({ [DARK]: true });
    localStorage.setItem('eduvault-theme', 'light');
    const { initTheme } = await loadTheme();
    initTheme();
    expect(isDark()).toBe(false);
  });

  it('stores the choice it is given', async () => {
    stubMatchMedia({ [DARK]: false });
    const { initTheme, setThemeChoice } = await loadTheme();
    initTheme();
    setThemeChoice('dark');
    expect(isDark()).toBe(true);
    expect(localStorage.getItem('eduvault-theme')).toBe('dark');
  });

  it('follows the device while on system and stops once a choice is made', async () => {
    const media = stubMatchMedia({ [DARK]: false });
    const { initTheme, setThemeChoice } = await loadTheme();
    initTheme();
    media.set(DARK, true);
    expect(isDark()).toBe(true);
    setThemeChoice('light');
    media.set(DARK, true);
    expect(isDark()).toBe(false);
  });

  it('falls back to the device when reading storage throws', async () => {
    stubMatchMedia({ [DARK]: true });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { initTheme } = await loadTheme();
    initTheme();
    expect(isDark()).toBe(true);
  });

  it('still applies a choice when writing storage throws', async () => {
    stubMatchMedia({ [DARK]: false });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { initTheme, setThemeChoice } = await loadTheme();
    initTheme();
    expect(() => {
      setThemeChoice('dark');
    }).not.toThrow();
    expect(isDark()).toBe(true);
  });

  it('ignores a stored value it does not know', async () => {
    stubMatchMedia({ [DARK]: false });
    localStorage.setItem('eduvault-theme', 'sepia');
    const { initTheme } = await loadTheme();
    initTheme();
    expect(isDark()).toBe(false);
  });
});
