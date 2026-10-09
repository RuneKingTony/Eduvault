import { SignInAttempts } from './sign-in-attempts';

describe('SignInAttempts', () => {
  it('allows five attempts in a minute and refuses the sixth', () => {
    const attempts = new SignInAttempts({ now: () => 0 });
    const answers = Array.from({ length: 6 }, () =>
      attempts.allow('ada@example.test')
    );
    expect(answers).toEqual([true, true, true, true, true, false]);
  });

  it('allows again once the window has passed', () => {
    let clock = 0;
    const attempts = new SignInAttempts({ now: () => clock });
    for (let run = 0; run < 5; run += 1) {
      attempts.allow('ada@example.test');
    }
    expect(attempts.allow('ada@example.test')).toBe(false);
    clock = 60_001;
    expect(attempts.allow('ada@example.test')).toBe(true);
  });

  it('keys on the lowercased email', () => {
    const attempts = new SignInAttempts({ now: () => 0 });
    for (const email of [
      'Ada@Example.test',
      'ADA@example.test',
      'ada@example.test',
    ]) {
      attempts.allow(email);
      attempts.allow(email);
    }
    expect(attempts.allow(' ada@EXAMPLE.test ')).toBe(false);
  });

  it('counts each account on its own', () => {
    const attempts = new SignInAttempts({ now: () => 0 });
    for (let run = 0; run < 5; run += 1) {
      attempts.allow('ada@example.test');
    }
    expect(attempts.allow('bola@example.test')).toBe(true);
  });

  it('forgets an account once it is reset', () => {
    const attempts = new SignInAttempts({ now: () => 0 });
    for (let run = 0; run < 5; run += 1) {
      attempts.allow('ada@example.test');
    }
    attempts.reset(' Ada@example.test ');
    expect(attempts.allow('ada@example.test')).toBe(true);
  });

  it('drops expired accounts once the map grows past its limit', () => {
    let clock = 0;
    const attempts = new SignInAttempts({
      now: () => clock,
      pruneAbove: 2,
    });
    for (const email of ['a@x.test', 'b@x.test', 'c@x.test']) {
      attempts.allow(email);
    }
    clock = 60_001;
    attempts.allow('d@x.test');
    expect(attempts.trackedAccounts).toBe(1);
  });
});
