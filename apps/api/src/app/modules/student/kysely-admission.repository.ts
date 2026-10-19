import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { ActivityWriter } from '../../common/activity';
import { Clock, schoolToday } from '../../common/clock';
import type { CampusScope } from '../../common/campus-scope';
import { inCampusScope } from '../../common/db/in-campus-scope';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import { peekDocumentNumber } from '../../common/documents';
import { readSchoolRules, type SchoolRules } from '../../common/people';
import { visibleStudentsCte } from '../../common/students';
import type { AdmissionTx } from './admission-tx';
import {
  AdmissionRepository,
  UsernameTakenError,
  type AdmissionClass,
  type CurrentTerm,
  type DuplicateMatch,
  type SchoolNaming,
} from './admission.repository';
import type { CampusClassScope } from '../../common/scope';
import { KyselyAdmissionTx } from './kysely-admission-tx.repository';

const PG_UNIQUE_VIOLATION = '23505';
const USERNAME_INDEX = 'user_username_uidx';

const isUsernameClash = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === PG_UNIQUE_VIOLATION &&
  'constraint' in error &&
  error.constraint === USERNAME_INDEX;

interface ArmRow {
  id: string;
  class_level_id: string;
  level_name: string;
  name: string;
  campus_id: string;
  campus_name: string;
}

const toClass = (row: ArmRow): AdmissionClass => ({
  id: row.id,
  levelId: row.class_level_id,
  levelName: row.level_name,
  name: row.name,
  campusId: row.campus_id,
  campusName: row.campus_name,
});

@Injectable()
export class KyselyAdmissionRepository extends AdmissionRepository {
  constructor(
    @Inject(KYSELY_TOKEN) private readonly db: Database,
    private readonly activity: ActivityWriter,
    private readonly clock: Clock
  ) {
    super();
  }

  today(organizationId: string): string {
    return schoolToday({ organizationId }, this.clock);
  }

  async currentTerm(organizationId: string): Promise<CurrentTerm | undefined> {
    const row = await this.db
      .selectFrom('term')
      .innerJoin('academic_session', 'academic_session.id', 'term.session_id')
      .select([
        'term.id as term_id',
        'term.name as term_name',
        'academic_session.id as session_id',
        'academic_session.name as session_name',
      ])
      .where('term.organization_id', '=', organizationId)
      .where('term.is_current', '=', true)
      .executeTakeFirst();
    return (
      row && {
        termId: row.term_id,
        termName: row.term_name,
        sessionId: row.session_id,
        sessionName: row.session_name,
      }
    );
  }

  async nextTerm(
    organizationId: string,
    termId: string
  ): Promise<{ id: string; name: string } | undefined> {
    const { rows } = await sql<{ id: string; name: string }>`
      SELECT nxt.id, nxt.name
      FROM term cur
      JOIN term nxt
        ON nxt.organization_id = cur.organization_id
        AND nxt.session_id = cur.session_id
        AND nxt.sequence = cur.sequence + 1
      WHERE cur.id = ${termId}::uuid AND cur.organization_id = ${organizationId}`.execute(
      this.db
    );
    return rows[0];
  }

  rules(organizationId: string): Promise<SchoolRules> {
    return readSchoolRules(this.db, organizationId);
  }

  async school(organizationId: string): Promise<SchoolNaming> {
    const row = await this.db
      .selectFrom('school_account')
      .innerJoin(
        'organization',
        'organization.id',
        'school_account.organization_id'
      )
      .select(['school_account.admission_prefix', 'organization.slug'])
      .where('school_account.organization_id', '=', organizationId)
      .executeTakeFirstOrThrow();
    return { prefix: row.admission_prefix, slug: row.slug };
  }

  nextNumber(organizationId: string): Promise<number> {
    return peekDocumentNumber(this.db, {
      organizationId,
      kind: 'admission',
      year: null,
    });
  }

  private arms(organizationId: string, campusScope: CampusScope) {
    return this.db
      .selectFrom('class_arm')
      .innerJoin('class_level', 'class_level.id', 'class_arm.class_level_id')
      .innerJoin('team', 'team.id', 'class_arm.campus_id')
      .select([
        'class_arm.id',
        'class_arm.class_level_id',
        'class_arm.name',
        'class_arm.campus_id',
        'class_level.name as level_name',
        'team.name as campus_name',
      ])
      .where('class_arm.organization_id', '=', organizationId)
      .where('class_arm.retired_at', 'is', null)
      .where((eb) =>
        inCampusScope(eb, 'class_arm.campus_id', { scope: campusScope })
      );
  }

  async classes(
    organizationId: string,
    campusScope: CampusScope
  ): Promise<AdmissionClass[]> {
    const rows = await this.arms(organizationId, campusScope)
      .orderBy('class_level.sequence')
      .orderBy('team.name')
      .orderBy('class_arm.name')
      .orderBy('class_arm.id')
      .execute();
    return rows.map((row) => toClass(row));
  }

  async findClass(
    organizationId: string,
    input: { campusScope: CampusScope; classArmId: string }
  ): Promise<AdmissionClass | undefined> {
    const row = await this.arms(organizationId, input.campusScope)
      .where('class_arm.id', '=', input.classArmId)
      .executeTakeFirst();
    return row && toClass(row);
  }

  async guardiansInSchool(
    organizationId: string,
    ids: readonly string[]
  ): Promise<string[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.db
      .selectFrom('guardian')
      .select('id')
      .where('organization_id', '=', organizationId)
      .where('id', 'in', [...ids])
      .execute();
    return rows.map((row) => row.id);
  }

  async duplicates(
    organizationId: string,
    scope: CampusClassScope,
    input: {
      firstName: string;
      lastName: string;
      dateOfBirth: string;
    }
  ): Promise<DuplicateMatch[]> {
    const today = this.today(organizationId);
    const { rows } = await sql<{
      id: string;
      first_name: string;
      last_name: string;
      admission_number: string;
      not_seen_since: string | null;
      exit_kind: 'left' | 'graduated' | null;
      in_scope: boolean;
    }>`
      WITH ${visibleStudentsCte({ organizationId, ...scope, today })}
      SELECT s.id, s.first_name, s.last_name, s.admission_number,
        to_char(s.not_seen_since, 'YYYY-MM-DD') AS not_seen_since,
        s.exit_kind,
        EXISTS (SELECT 1 FROM visible v WHERE v.id = s.id) AS in_scope
      FROM student s
      WHERE s.organization_id = ${organizationId}
        AND lower(s.last_name) = lower(${input.lastName})
        AND lower(s.first_name) = lower(${input.firstName})
        AND s.date_of_birth = ${input.dateOfBirth}::date
      ORDER BY s.admission_number`.execute(this.db);
    return rows.map((row) => ({
      studentId: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      admissionNumber: row.admission_number,
      notSeenSince: row.not_seen_since,
      exitKind: row.exit_kind,
      inScope: row.in_scope,
    }));
  }

  async transaction<T>(fn: (tx: AdmissionTx) => Promise<T>): Promise<T> {
    try {
      return await this.db
        .transaction()
        .execute((trx) => fn(new KyselyAdmissionTx(trx, this.activity)));
    } catch (error) {
      throw isUsernameClash(error) ? new UsernameTakenError() : error;
    }
  }
}
