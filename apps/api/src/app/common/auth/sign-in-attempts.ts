interface SignInAttemptsOptions {
  max?: number;
  windowMs?: number;
  now?: () => number;
  pruneAbove?: number;
}

const keyOf = (email: string) => email.trim().toLowerCase();

export class SignInAttempts {
  private readonly max: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly pruneAbove: number;
  private readonly seen = new Map<string, number[]>();

  constructor({
    max = 5,
    windowMs = 60_000,
    now = Date.now,
    pruneAbove = 1000,
  }: SignInAttemptsOptions = {}) {
    this.max = max;
    this.windowMs = windowMs;
    this.now = now;
    this.pruneAbove = pruneAbove;
  }

  allow(email: string): boolean {
    const key = keyOf(email);
    const cutoff = this.now() - this.windowMs;
    if (this.seen.size > this.pruneAbove) {
      this.prune(cutoff);
    }
    const recent = (this.seen.get(key) ?? []).filter((at) => at > cutoff);
    if (recent.length >= this.max) {
      this.seen.set(key, recent);
      return false;
    }
    this.seen.set(key, [...recent, this.now()]);
    return true;
  }

  get trackedAccounts(): number {
    return this.seen.size;
  }

  reset(email: string): void {
    this.seen.delete(keyOf(email));
  }

  private prune(cutoff: number): void {
    for (const [key, stamps] of this.seen) {
      if ((stamps.at(-1) ?? 0) <= cutoff) {
        this.seen.delete(key);
      }
    }
  }
}
