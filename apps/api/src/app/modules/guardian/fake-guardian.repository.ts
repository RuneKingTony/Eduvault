import type {
  GuardianDetail,
  GuardianLink,
  GuardianSummary,
} from '@eduvault/api-contract';
import { FakeGuardianTx } from '../../common/people/fake-guardian-tx';
import type { GuardianTx, StudentFacts } from '../../common/people';
import {
  GuardianRepository,
  type GuardianPickerQuery,
  type PhotoChange,
  type VisibleGuardian,
} from './guardian.repository';

export class FakeGuardianRepository extends GuardianRepository {
  tx = new FakeGuardianTx();
  visibleStudentIds = new Set<string>();
  visibleGuardianIds = new Set<string>();
  pickerAnswer: GuardianSummary[] = [];
  pickerQueries: GuardianPickerQuery[] = [];
  photoStatus: PhotoChange = { status: 'changed', previousFileId: null };
  updated: Record<string, unknown>[] = [];

  list(
    _org: string,
    _scope: unknown,
    query: GuardianPickerQuery
  ): Promise<GuardianSummary[]> {
    this.pickerQueries.push(query);
    return Promise.resolve(this.pickerAnswer);
  }

  findDetail(
    _org: string,
    _scope: unknown,
    input: { id: string }
  ): Promise<GuardianDetail | undefined> {
    const guardian = this.tx.guardians.get(input.id);
    return Promise.resolve(
      guardian !== undefined && this.visibleGuardianIds.has(input.id)
        ? {
            id: guardian.id,
            fullName: guardian.fullName,
            phone: guardian.phone,
            email: guardian.email,
            username: null,
            address: guardian.address,
            photoUrl: null,
            paysFees: false,
            children: [],
          }
        : undefined
    );
  }

  findVisible(
    _org: string,
    _scope: unknown,
    input: { id: string }
  ): Promise<VisibleGuardian | undefined> {
    const guardian = this.tx.guardians.get(input.id);
    const user = guardian && this.tx.users.get(guardian.userId);
    return Promise.resolve(
      guardian !== undefined && this.visibleGuardianIds.has(input.id)
        ? {
            id: guardian.id,
            userId: guardian.userId,
            fullName: guardian.fullName,
            email: guardian.email,
            username: user?.username ?? null,
          }
        : undefined
    );
  }

  linksOf(
    _organizationId: string,
    _scope: unknown,
    input: { studentId: string }
  ): Promise<GuardianLink[] | undefined> {
    return Promise.resolve(
      this.visibleStudentIds.has(input.studentId)
        ? this.linksFor(input.studentId)
        : undefined
    );
  }

  private linksFor(studentId: string): GuardianLink[] {
    const links: GuardianLink[] = [];
    for (const link of this.tx.links) {
      const guardian = this.tx.guardians.get(link.guardianId);
      if (link.studentId === studentId && guardian !== undefined) {
        links.push({
          guardianId: link.guardianId,
          fullName: guardian.fullName,
          phone: guardian.phone,
          relationship: link.relationship,
          paysFees: link.paysFees,
          loginKind: guardian.email === null ? 'username' : 'email',
          email: guardian.email,
          username: this.tx.users.get(guardian.userId)?.username ?? null,
          photoUrl: null,
        });
      }
    }
    return links;
  }

  findStudent(
    organizationId: string,
    _scope: unknown,
    input: { studentId: string }
  ): Promise<StudentFacts | undefined> {
    return this.visibleStudentIds.has(input.studentId)
      ? this.tx.lockStudent(organizationId, input.studentId)
      : Promise.resolve(undefined);
  }

  updateDetails(
    _org: string,
    _id: string,
    patch: Record<string, unknown>
  ): Promise<void> {
    this.updated.push(patch);
    return Promise.resolve();
  }

  setPhoto(): Promise<PhotoChange> {
    return Promise.resolve(this.photoStatus);
  }

  transaction<T>(fn: (tx: GuardianTx) => Promise<T>): Promise<T> {
    return fn(this.tx);
  }
}
