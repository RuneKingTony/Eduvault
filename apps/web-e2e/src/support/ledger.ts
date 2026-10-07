import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { ApiClient } from './api';

export type PersonaKey = 'owner' | 'admin' | 'teacher' | 'student' | 'foreign';

interface LedgerEntry {
  kind: 'student' | 'campus' | 'school';
  id: string;
  schoolId: string;
  actor: { email: string; password: string };
}

/** Records are written as they are created so a crashed run can still be reversed. */
export class Ledger {
  readonly entries: LedgerEntry[] = [];

  constructor(private readonly path: string) {
    if (existsSync(path)) {
      this.entries.push(
        ...(JSON.parse(readFileSync(path, 'utf8')) as LedgerEntry[])
      );
    }
  }

  add(entry: LedgerEntry): void {
    this.entries.push(entry);
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(this.entries, null, 2));
  }

  /**
   * Deletes what this run created through the API: students, then schools. A campus goes
   * with its school, because deleting one on its own answered 403 when tried. User accounts
   * cannot be removed through the API and stay.
   */
  async reverse(): Promise<string[]> {
    const order = { student: 0, campus: 1, school: 2 } as const;
    const log: string[] = [];
    const sorted = [...this.entries].sort(
      (a, b) => order[a.kind] - order[b.kind]
    );
    const schools = new Set(
      this.entries.filter((e) => e.kind === 'school').map((e) => e.id)
    );
    for (const entry of sorted) {
      if (entry.kind === 'campus' && schools.has(entry.schoolId)) {
        log.push(`campus ${entry.id}: removed with its school`);
        continue;
      }
      const client = await ApiClient.create();
      try {
        const signIn = await client.post(
          '/api/auth/sign-in/email',
          entry.actor
        );
        if (!signIn.ok()) {
          log.push(
            `skip ${entry.kind} ${entry.id}: sign-in ${signIn.status()}`
          );
          continue;
        }
        await client.post('/api/auth/organization/set-active', {
          organizationId: entry.schoolId,
        });
        const res =
          entry.kind === 'school'
            ? await client.post('/api/auth/organization/delete', {
                organizationId: entry.id,
              })
            : await client.delete(
                `/${entry.kind === 'student' ? 'students' : 'campuses'}/${entry.id}`
              );
        log.push(
          `${res.ok() ? 'deleted' : `FAILED ${res.status()} ${await res.text()}`} ${entry.kind} ${entry.id}`
        );
      } finally {
        await client.dispose();
      }
    }
    return log;
  }
}
