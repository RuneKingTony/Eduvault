import { splitRoles } from '@eduvault/policy';
import type { ActivityInput } from '../activity';
import type { NewPortalLogin } from '../auth/portal-login';
import type {
  GuardianRecord,
  GuardianTx,
  LinkKey,
  LoginHolds,
  LinkPatch,
  LinkRecord,
  NewGuardianRow,
  NewLinkRow,
  SchoolRules,
  StudentFacts,
} from './guardian-tx';

interface FakeUser {
  id: string;
  email: string;
  username: string | null;
  passwordHash: string | null;
  platformRole?: string;
}

interface FakeLink extends NewLinkRow {
  id: number;
}

export class FakeGuardianTx implements GuardianTx {
  students = new Map<string, StudentFacts>();
  guardians = new Map<string, NewGuardianRow & { id: string }>();
  links: FakeLink[] = [];
  users = new Map<string, FakeUser>();
  members = new Map<string, string[]>();
  files = new Map<string, { organizationId: string }>();
  activity: ActivityInput[] = [];
  schoolRules: SchoolRules = { maxGuardians: 4, requireGuardian: true };
  private counter = 0;

  nextId(prefix: string): string {
    this.counter += 1;
    return `${prefix}-${this.counter}`;
  }

  rolesOf(organizationId: string, userId: string): string[] | undefined {
    return this.members.get(`${organizationId}:${userId}`);
  }

  lockStudent(organizationId: string, studentId: string) {
    return Promise.resolve(this.students.get(`${organizationId}:${studentId}`));
  }

  rules() {
    return Promise.resolve(this.schoolRules);
  }

  linksOf(organizationId: string, studentId: string): Promise<LinkRecord[]> {
    return Promise.resolve(
      this.links
        .filter(
          (link) =>
            link.organizationId === organizationId &&
            link.studentId === studentId
        )
        .map((link) => ({
          guardianId: link.guardianId,
          paysFees: link.paysFees,
        }))
    );
  }

  private toRecord(row: NewGuardianRow & { id: string }): GuardianRecord {
    return {
      id: row.id,
      fullName: row.fullName,
      userId: row.userId,
      email: row.email,
    };
  }

  findGuardian(organizationId: string, guardianId: string) {
    const row = this.guardians.get(guardianId);
    return Promise.resolve(
      row?.organizationId === organizationId ? this.toRecord(row) : undefined
    );
  }

  findGuardianByEmail(organizationId: string, email: string) {
    const row = [...this.guardians.values()].find(
      (candidate) =>
        candidate.organizationId === organizationId &&
        candidate.email?.toLowerCase() === email.toLowerCase()
    );
    return Promise.resolve(row && this.toRecord(row));
  }

  findUserByEmail(email: string) {
    const user = [...this.users.values()].find(
      (candidate) => candidate.email === email.toLowerCase()
    );
    return Promise.resolve(user && { id: user.id });
  }

  lockLogin(userId: string): Promise<LoginHolds | undefined> {
    const user = this.users.get(userId);
    if (user === undefined) {
      return Promise.resolve(undefined);
    }
    const memberships = [...this.members]
      .filter(([key]) => key.endsWith(`:${userId}`))
      .map(([key, roles]) => ({
        organizationId: key.slice(0, key.length - userId.length - 1),
        roles,
      }));
    for (const guardian of this.guardians.values()) {
      if (
        guardian.userId === userId &&
        !memberships.some((m) => m.organizationId === guardian.organizationId)
      ) {
        memberships.push({
          organizationId: guardian.organizationId,
          roles: [],
        });
      }
    }
    return Promise.resolve({
      platformRole: user.platformRole ?? null,
      memberships,
    });
  }

  resetPassword(userId: string, passwordHash: string): Promise<void> {
    const user = this.users.get(userId);
    if (user !== undefined) {
      user.passwordHash = passwordHash;
    }
    return Promise.resolve();
  }

  takenUsernames(base: string): Promise<ReadonlySet<string>> {
    return Promise.resolve(
      new Set(
        [...this.users.values()].flatMap((user) =>
          user.username?.startsWith(base) === true ? [user.username] : []
        )
      )
    );
  }

  createLogin(input: NewPortalLogin): Promise<string> {
    const id = this.nextId('user');
    this.users.set(id, {
      id,
      email: (input.email ?? `${id}@users.eduvault.invalid`).toLowerCase(),
      username: input.username,
      passwordHash: input.passwordHash,
    });
    this.members.set(`${input.organizationId}:${id}`, [input.role]);
    return Promise.resolve(id);
  }

  addRole(organizationId: string, userId: string, role: string) {
    const key = `${organizationId}:${userId}`;
    const roles = this.members.get(key) ?? [];
    if (!roles.includes(role)) {
      this.members.set(key, [...roles, role]);
    }
    return Promise.resolve();
  }

  stripRole(organizationId: string, userId: string, role: string) {
    const key = `${organizationId}:${userId}`;
    const rest = splitRoles((this.members.get(key) ?? []).join(',')).filter(
      (held) => held !== role
    );
    if (rest.length === 0) {
      this.members.delete(key);
    } else {
      this.members.set(key, rest);
    }
    return Promise.resolve(rest);
  }

  insertGuardian(row: NewGuardianRow): Promise<string> {
    const id = this.nextId('guardian');
    this.guardians.set(id, { ...row, id });
    return Promise.resolve(id);
  }

  insertLink(row: NewLinkRow): Promise<void> {
    this.links.push({ ...row, id: this.links.length + 1 });
    return Promise.resolve();
  }

  updateLink(key: LinkKey, patch: LinkPatch): Promise<void> {
    for (const link of this.links) {
      if (
        link.studentId === key.studentId &&
        link.guardianId === key.guardianId
      ) {
        Object.assign(link, patch);
      }
    }
    return Promise.resolve();
  }

  deleteLink(key: LinkKey): Promise<void> {
    this.links = this.links.filter(
      (link) =>
        !(
          link.studentId === key.studentId && link.guardianId === key.guardianId
        )
    );
    return Promise.resolve();
  }

  countLinksOfGuardian(organizationId: string, guardianId: string) {
    return Promise.resolve(
      this.links.filter(
        (link) =>
          link.organizationId === organizationId &&
          link.guardianId === guardianId
      ).length
    );
  }

  photoIsFree(organizationId: string, fileId: string) {
    const file = this.files.get(fileId);
    const attached = [...this.guardians.values()].some(
      (guardian) => guardian.photoFileId === fileId
    );
    return Promise.resolve(
      file?.organizationId === organizationId && !attached
    );
  }

  recordActivity(input: ActivityInput): Promise<void> {
    this.activity.push(input);
    return Promise.resolve();
  }
}
