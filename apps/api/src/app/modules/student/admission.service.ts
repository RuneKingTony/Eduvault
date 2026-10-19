import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ADMIT_DOB_MESSAGE,
  ADMIT_NO_TERM_MESSAGE,
  ADMIT_TERM_MESSAGE,
  ADMIT_REQUIRE_GUARDIAN_MESSAGE,
  CLASS_NOT_FOUND_MESSAGE,
  GUARDIAN_NOT_FOUND_MESSAGE,
  GUARDIAN_TWICE_MESSAGE,
  maxGuardiansMessage,
  type AdmissionDuplicates,
  type AdmissionDuplicatesQuery,
  type AdmissionPreview,
  type AdmitStudent,
  type AdmitStudentResult,
  type GuardianDraft,
  type LoginCredential,
} from '@eduvault/api-contract';
import {
  AccountService,
  generateTemporaryPassword,
  requirePermission,
  type OrgContext,
} from '../../common/auth';
import { defaultPayer, type SchoolRules } from '../../common/people';
import { admitStudent } from './admit-student';
import { formatAdmissionNumber, formatStudentUsername } from './admission-ids';
import {
  AdmissionRepository,
  type AdmissionGuardian,
  type AdmissionOutcome,
  type CurrentTerm,
  type DuplicateMatch,
} from './admission.repository';
import { isDueToBeLeft, lifeOf } from './lifecycle';
import { StudentService } from './student.service';
import { campusClassScopeOf } from '../../common/scope';

type Existing = Extract<GuardianDraft, { existingGuardianId: string }>;

const isExisting = (draft: GuardianDraft): draft is Existing =>
  'existingGuardianId' in draft;

const flat = (draft: GuardianDraft) =>
  isExisting(draft)
    ? { ...draft, paysFees: draft.paysFees }
    : { ...draft.new, paysFees: draft.new.paysFees };

const STATE_LABELS = {
  active: 'Active',
  inactive: 'Inactive',
  left: 'Left',
  graduated: 'Graduated',
} as const;

function stateOf(match: DuplicateMatch, today: string): string {
  const facts = {
    notSeenSince: match.notSeenSince,
    exitKind: match.exitKind,
    today,
  };
  return isDueToBeLeft(facts)
    ? 'Due to be marked Left'
    : STATE_LABELS[lifeOf(facts)];
}

@Injectable()
export class AdmissionService {
  constructor(
    private readonly admissions: AdmissionRepository,
    private readonly students: StudentService,
    private readonly accounts: AccountService
  ) {}

  async preview(ctx: OrgContext): Promise<AdmissionPreview> {
    const term = await this.currentTermOrThrow(ctx);
    const [rules, school, next, classes, nextTerm] = await Promise.all([
      this.admissions.rules(ctx.organizationId),
      this.admissions.school(ctx.organizationId),
      this.admissions.nextNumber(ctx.organizationId),
      this.admissions.classes(ctx.organizationId, ctx.campusScope),
      this.admissions.nextTerm(ctx.organizationId, term.termId),
    ]);
    return {
      nextAdmissionNumber: formatAdmissionNumber(school.prefix, next),
      nextStudentUsername: formatStudentUsername(school.slug, next),
      currentTerm: { id: term.termId, name: term.termName },
      currentSession: { id: term.sessionId, name: term.sessionName },
      nextTerm: nextTerm ?? null,
      maxGuardians: rules.maxGuardians,
      requireGuardian: rules.requireGuardian,
      classes: classes.map((arm) => ({
        id: arm.id,
        label: `${arm.levelName} ${arm.name} · ${arm.campusName}`,
        campusId: arm.campusId,
      })),
    };
  }

  async duplicates(
    ctx: OrgContext,
    query: AdmissionDuplicatesQuery
  ): Promise<AdmissionDuplicates> {
    const today = this.admissions.today(ctx.organizationId);
    const matches = await this.admissions.duplicates(
      ctx.organizationId,
      campusClassScopeOf(ctx),
      query
    );
    return {
      matches: matches.map((match) => ({
        name: `${match.firstName} ${match.lastName}`,
        state: stateOf(match, today),
        ...(match.inScope
          ? {
              studentId: match.studentId,
              admissionNumber: match.admissionNumber,
            }
          : {}),
      })),
    };
  }

  async admit(
    ctx: OrgContext,
    input: AdmitStudent
  ): Promise<AdmitStudentResult> {
    if (input.dateOfBirth > this.admissions.today(ctx.organizationId)) {
      throw new BadRequestException(ADMIT_DOB_MESSAGE);
    }
    const current = await this.currentTermOrThrow(ctx);
    const term = await this.chosenTerm(ctx, current, input.termId);
    const arm = await this.admissions.findClass(ctx.organizationId, {
      campusScope: ctx.campusScope,
      classArmId: input.classArmId,
    });
    if (arm === undefined) {
      throw new NotFoundException(CLASS_NOT_FOUND_MESSAGE);
    }
    const rules = await this.admissions.rules(ctx.organizationId);
    this.checkGuardianCount(input.guardians.length, rules);
    this.checkGuardianPermissions(ctx, input.guardians);
    await this.checkExistingGuardians(ctx, input.guardians);
    const school = await this.admissions.school(ctx.organizationId);
    const studentPassword = generateTemporaryPassword();
    const drafts = await this.prepareGuardians(input.guardians);
    const outcome = await admitStudent(this.admissions, {
      organizationId: ctx.organizationId,
      actor: { id: ctx.user.id, name: ctx.user.name },
      student: {
        firstName: input.firstName,
        lastName: input.lastName,
        gender: input.gender,
        dateOfBirth: input.dateOfBirth,
      },
      arm,
      term,
      startsLater: term.termId !== current.termId,
      school,
      studentPasswordHash: await this.accounts.hashPassword(studentPassword),
      guardians: drafts.map((draft) => draft.write),
    });
    return {
      student: await this.students.getAdmitted(ctx, outcome.studentId),
      logins: this.credentials({
        outcome,
        studentName: `${input.firstName} ${input.lastName}`,
        studentPassword,
        guardianPasswords: drafts.map((draft) => draft.plain),
      }),
    };
  }

  private async chosenTerm(
    ctx: OrgContext,
    current: CurrentTerm,
    termId: string | undefined
  ): Promise<CurrentTerm> {
    if (termId === undefined || termId === current.termId) {
      return current;
    }
    const next = await this.admissions.nextTerm(
      ctx.organizationId,
      current.termId
    );
    if (next?.id !== termId) {
      throw new BadRequestException(ADMIT_TERM_MESSAGE);
    }
    return {
      termId: next.id,
      termName: next.name,
      sessionId: current.sessionId,
      sessionName: current.sessionName,
    };
  }

  private async currentTermOrThrow(ctx: OrgContext): Promise<CurrentTerm> {
    const term = await this.admissions.currentTerm(ctx.organizationId);
    if (term === undefined) {
      throw new ConflictException(ADMIT_NO_TERM_MESSAGE);
    }
    return term;
  }

  private checkGuardianCount(count: number, rules: SchoolRules): void {
    if (count > rules.maxGuardians) {
      throw new BadRequestException(maxGuardiansMessage(rules.maxGuardians));
    }
    if (count === 0 && rules.requireGuardian) {
      throw new BadRequestException(ADMIT_REQUIRE_GUARDIAN_MESSAGE);
    }
  }

  private checkGuardianPermissions(
    ctx: OrgContext,
    guardians: readonly GuardianDraft[]
  ): void {
    if (guardians.length === 0) {
      return;
    }
    requirePermission(ctx, 'guardian:link');
    if (guardians.some((draft) => !isExisting(draft))) {
      requirePermission(ctx, 'guardian:create');
    }
  }

  private async checkExistingGuardians(
    ctx: OrgContext,
    guardians: readonly GuardianDraft[]
  ): Promise<void> {
    const ids = guardians
      .filter((draft) => isExisting(draft))
      .map((draft) => draft.existingGuardianId);
    const found = new Set(
      await this.admissions.guardiansInSchool(ctx.organizationId, ids)
    );
    if (ids.some((id) => !found.has(id))) {
      throw new NotFoundException(GUARDIAN_NOT_FOUND_MESSAGE);
    }
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException(GUARDIAN_TWICE_MESSAGE);
    }
  }

  private async prepareGuardians(
    guardians: readonly GuardianDraft[]
  ): Promise<{ write: AdmissionGuardian; plain: string | undefined }[]> {
    const paying = defaultPayer(guardians.map((draft) => flat(draft)));
    return Promise.all(
      guardians.map(async (draft, index) => {
        const paysFees = paying[index]?.paysFees ?? false;
        if (isExisting(draft)) {
          return {
            write: {
              kind: 'existing' as const,
              guardianId: draft.existingGuardianId,
              relationship: draft.relationship,
              paysFees,
            },
            plain: undefined,
          };
        }
        const plain = generateTemporaryPassword();
        return {
          write: {
            kind: 'new' as const,
            guardian: { ...draft.new, paysFees },
            passwordHash: await this.accounts.hashPassword(plain),
          },
          plain,
        };
      })
    );
  }

  private credentials(input: {
    outcome: AdmissionOutcome;
    studentName: string;
    studentPassword: string;
    guardianPasswords: readonly (string | undefined)[];
  }): LoginCredential[] {
    const { outcome } = input;
    const student: LoginCredential = {
      who: 'student',
      name: input.studentName,
      username: outcome.studentUsername,
      temporaryPassword: input.studentPassword,
      existing: false,
    };
    const guardians = outcome.guardians.flatMap((guardian, index) => {
      if (!guardian.isNew) {
        return [];
      }
      const password = input.guardianPasswords[index];
      return [
        {
          who: 'guardian' as const,
          name: guardian.name,
          guardianId: guardian.guardianId,
          relationship: guardian.relationship,
          existing: !guardian.newLogin,
          ...(guardian.email === null ? {} : { email: guardian.email }),
          ...(guardian.username === null
            ? {}
            : { username: guardian.username }),
          ...(guardian.newLogin && password !== undefined
            ? { temporaryPassword: password }
            : {}),
        },
      ];
    });
    return [student, ...guardians];
  }
}
