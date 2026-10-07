import { mkdirSync, writeFileSync } from 'node:fs';
import type {
  FullResult,
  Reporter,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';
import { artifactDir, ledgerPath } from './env';
import { Ledger } from './ledger';

const resultPath = `${artifactDir}/result.txt`;

/**
 * Writes result.txt with the verdict on its first line, and reverses the created-record
 * ledger after a run with no failure. A BLOCKED run exits non-zero: it is never a pass. A failed run keeps its records for inspection.
 */
export default class LedgerReporter implements Reporter {
  private passed: string[] = [];
  private failed: string[] = [];
  private blocked: string[] = [];
  private errors: string[] = [];

  onTestEnd(test: TestCase, result: TestResult): void {
    const title = `${test.parent.project()?.name ?? ''} ${test.title}`.trim();
    const block = test.annotations.find((a) => a.type === 'BLOCKED');
    if (block) this.blocked.push(`${title}: ${block.description ?? ''}`);
    else if (result.status === 'passed') this.passed.push(title);
    else if (result.status !== 'skipped')
      this.failed.push(`${title}: ${result.status}`);
  }

  onError(error: { message?: string }): void {
    this.errors.push(error.message ?? 'unknown error');
  }

  async onEnd(
    result: FullResult
  ): Promise<{ status: FullResult['status'] } | undefined> {
    const ran = this.passed.length + this.failed.length + this.blocked.length;
    if (ran === 0 && this.errors.length === 0) this.errors.push('no tests ran');
    const environment = this.errors.filter((e) =>
      e.includes('BLOCKED (environment)')
    );
    const otherErrors = this.errors.filter(
      (e) => !e.includes('BLOCKED (environment)')
    );
    const verdict =
      this.failed.length > 0 ||
      otherErrors.length > 0 ||
      (result.status !== 'passed' && environment.length === 0)
        ? 'FAIL'
        : this.blocked.length > 0 || environment.length > 0
          ? 'BLOCKED'
          : 'PASS';

    const lines = [`VERDICT: ${verdict}`, `artefacts: ${artifactDir}`];
    if (verdict === 'BLOCKED') lines.push('cause: environment');
    if (verdict !== 'PASS') {
      lines.push(...this.failed.map((f) => `failed: ${f}`));
      lines.push(...otherErrors.map((e) => `error: ${e.split('\n')[0]}`));
      lines.push(...this.blocked.map((b) => `blocked: ${b}`));
      lines.push(...environment.map((e) => `blocked: ${e.split('\n')[0]}`));
    }
    lines.push(
      `passed ${this.passed.length}, failed ${this.failed.length}, blocked ${this.blocked.length}`
    );
    lines.push(...this.passed.map((p) => `ok: ${p}`));

    const ledger = new Ledger(ledgerPath);
    if (ledger.entries.length > 0) {
      if (result.status === 'passed') {
        lines.push(...(await ledger.reverse()).map((l) => `ledger: ${l}`));
      } else {
        lines.push(
          `ledger kept: ${ledgerPath}`,
          `reverse with: pnpm --filter @eduvault/web-e2e cleanup ${ledgerPath}`
        );
      }
    }
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(resultPath, `${lines.join('\n')}\n`);
    console.log(lines.join('\n'));
    return verdict === 'BLOCKED' ? { status: 'failed' } : undefined;
  }
}
