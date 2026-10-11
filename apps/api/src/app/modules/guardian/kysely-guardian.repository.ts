import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import {
  guardianRelationshipSchema,
  type GuardianDetail,
  type GuardianLink,
  type GuardianSummary,
} from '@eduvault/api-contract';
import { ActivityWriter } from '../../common/activity';
import { Clock, schoolToday } from '../../common/clock';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import {
  KyselyGuardianTx,
  type GuardianTx,
  type StudentFacts,
} from '../../common/people';
import { visibleStudentsCte } from '../../common/students';
import type { StudentScope } from '../student/visibility';
import {
  GuardianRepository,
  type GuardianPickerQuery,
  type PhotoChange,
  type VisibleGuardian,
} from './guardian.repository';

interface PickerRow {
  id: string;
  full_name: string;
  phone: string | null;
  children: string[] | null;
  outside_scope: boolean;
}

interface LinkRow {
  guardian_id: string;
  full_name: string;
  phone: string;
  relationship: string;
  pays_fees: boolean;
  email: string | null;
  username: string | null;
  photo_file_id: string | null;
}

interface DetailRow {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  username: string | null;
  address: string | null;
  photo_file_id: string | null;
}

interface ChildRow {
  student_id: string;
  name: string;
  relationship: string;
  pays_fees: boolean;
}

const photoUrl = (fileId: string | null): string | null =>
  fileId === null ? null : `/files/${fileId}`;

const toSummary = (row: PickerRow): GuardianSummary => ({
  id: row.id,
  fullName: row.full_name,
  outsideScope: row.outside_scope,
  ...(row.phone === null ? {} : { phone: row.phone }),
  ...(row.children === null ? {} : { childFirstNames: row.children }),
});

const toLink = (row: LinkRow): GuardianLink => ({
  guardianId: row.guardian_id,
  fullName: row.full_name,
  phone: row.phone,
  relationship: guardianRelationshipSchema.parse(row.relationship),
  paysFees: row.pays_fees,
  loginKind: row.email === null ? 'username' : 'email',
  email: row.email,
  username: row.username,
  photoUrl: photoUrl(row.photo_file_id),
});

@Injectable()
export class KyselyGuardianRepository extends GuardianRepository {
  constructor(
    @Inject(KYSELY_TOKEN) private readonly db: Database,
    private readonly activity: ActivityWriter,
    private readonly clock: Clock
  ) {
    super();
  }

  private today(organizationId: string): string {
    return schoolToday({ organizationId }, this.clock);
  }

  async list(
    organizationId: string,
    scope: StudentScope,
    query: GuardianPickerQuery
  ): Promise<GuardianSummary[]> {
    const q = query.q ?? '';
    const excluded =
      query.excludeStudentId === undefined
        ? sql``
        : sql`AND NOT EXISTS (
            SELECT 1 FROM guardian_student x
            WHERE x.guardian_id = g.id AND x.student_id = ${query.excludeStudentId}
          )`;
    const match =
      q === ''
        ? sql`TRUE`
        : sql`(strpos(lower(g.full_name), lower(${q})) > 0
            OR strpos(lower(g.phone), lower(${q})) > 0
            OR strpos(lower(COALESCE(g.email, '')), lower(${q})) > 0)`;
    const exact =
      q === ''
        ? sql`FALSE`
        : sql`(regexp_replace(g.phone, '[ -]', '', 'g') = regexp_replace(${q}, '[ -]', '', 'g')
            OR lower(g.email) = lower(${q}))`;
    const { rows } = await sql<PickerRow>`
      WITH ${visibleStudentsCte({ organizationId, ...scope, today: this.today(organizationId) })},
      seen AS (
        SELECT g.id, g.full_name, g.phone, g.email,
          array_agg(v.first_name ORDER BY v.first_name) AS children
        FROM guardian g
        JOIN guardian_student gs
          ON gs.guardian_id = g.id AND gs.organization_id = g.organization_id
        JOIN visible v ON v.id = gs.student_id
        WHERE g.organization_id = ${organizationId} ${excluded}
        GROUP BY g.id
      )
      SELECT id, full_name, phone, children, FALSE AS outside_scope
      FROM seen g
      WHERE ${match}
      UNION ALL
      SELECT g.id, g.full_name, NULL, NULL, TRUE
      FROM guardian g
      WHERE g.organization_id = ${organizationId} ${excluded}
        AND ${exact}
        AND NOT EXISTS (SELECT 1 FROM seen WHERE seen.id = g.id)
      ORDER BY full_name, id`.execute(this.db);
    return rows.map((row) => toSummary(row));
  }

  async findDetail(
    organizationId: string,
    scope: StudentScope,
    input: { id: string }
  ): Promise<GuardianDetail | undefined> {
    const { rows } = await sql<DetailRow>`
      WITH ${visibleStudentsCte({ organizationId, ...scope, today: this.today(organizationId) })}
      SELECT g.id, g.full_name, g.phone, g.email, u.username, g.address, g.photo_file_id
      FROM guardian g
      JOIN "user" u ON u.id = g.user_id
      WHERE g.id = ${input.id} AND g.organization_id = ${organizationId}
        AND EXISTS (
          SELECT 1 FROM guardian_student gs JOIN visible v ON v.id = gs.student_id
          WHERE gs.guardian_id = g.id
        )`.execute(this.db);
    const [row] = rows;
    if (row === undefined) {
      return undefined;
    }
    const children = await sql<ChildRow>`
      WITH ${visibleStudentsCte({ organizationId, ...scope, today: this.today(organizationId) })}
      SELECT v.id AS student_id, v.first_name || ' ' || v.last_name AS name,
        gs.relationship, gs.pays_fees
      FROM guardian_student gs
      JOIN visible v ON v.id = gs.student_id
      WHERE gs.guardian_id = ${input.id} AND gs.organization_id = ${organizationId}
      ORDER BY v.last_name, v.first_name, v.id`.execute(this.db);
    return {
      id: row.id,
      fullName: row.full_name,
      phone: row.phone,
      email: row.email,
      username: row.username,
      address: row.address,
      photoUrl: photoUrl(row.photo_file_id),
      paysFees: children.rows.some((child) => child.pays_fees),
      children: children.rows.map((child) => ({
        studentId: child.student_id,
        name: child.name,
        relationship: guardianRelationshipSchema.parse(child.relationship),
        paysFees: child.pays_fees,
      })),
    };
  }

  async findVisible(
    organizationId: string,
    scope: StudentScope,
    input: { id: string }
  ): Promise<VisibleGuardian | undefined> {
    const { rows } = await sql<{
      id: string;
      user_id: string;
      full_name: string;
      email: string | null;
      username: string | null;
    }>`
      WITH ${visibleStudentsCte({ organizationId, ...scope, today: this.today(organizationId) })}
      SELECT g.id, g.user_id, g.full_name, g.email, u.username
      FROM guardian g
      JOIN "user" u ON u.id = g.user_id
      WHERE g.id = ${input.id} AND g.organization_id = ${organizationId}
        AND EXISTS (
          SELECT 1 FROM guardian_student gs JOIN visible v ON v.id = gs.student_id
          WHERE gs.guardian_id = g.id
        )`.execute(this.db);
    const [row] = rows;
    return (
      row && {
        id: row.id,
        userId: row.user_id,
        fullName: row.full_name,
        email: row.email,
        username: row.username,
      }
    );
  }

  async linksOf(
    organizationId: string,
    scope: StudentScope,
    input: { studentId: string }
  ): Promise<GuardianLink[] | undefined> {
    const student = await this.findStudent(organizationId, scope, input);
    if (student === undefined) {
      return undefined;
    }
    const { rows } = await sql<LinkRow>`
      SELECT g.id AS guardian_id, g.full_name, g.phone, gs.relationship,
        gs.pays_fees, g.email, u.username, g.photo_file_id
      FROM guardian_student gs
      JOIN guardian g ON g.id = gs.guardian_id AND g.organization_id = gs.organization_id
      JOIN "user" u ON u.id = g.user_id
      WHERE gs.student_id = ${input.studentId} AND gs.organization_id = ${organizationId}
      ORDER BY gs.created_at, g.full_name, g.id`.execute(this.db);
    return rows.map((row) => toLink(row));
  }

  async findStudent(
    organizationId: string,
    scope: StudentScope,
    input: { studentId: string }
  ): Promise<StudentFacts | undefined> {
    const { rows } = await sql<{
      id: string;
      first_name: string;
      last_name: string;
      exit_kind: string | null;
      campus_id: string;
    }>`
      WITH ${visibleStudentsCte({
        organizationId,
        ...scope,
        today: this.today(organizationId),
        studentId: input.studentId,
      })}
      SELECT id, first_name, last_name, exit_kind, campus_id FROM visible`.execute(
      this.db
    );
    const [row] = rows;
    return (
      row && {
        id: row.id,
        firstName: row.first_name,
        lastName: row.last_name,
        onRoll: row.exit_kind === null,
        campusId: row.campus_id,
      }
    );
  }

  async updateDetails(
    organizationId: string,
    id: string,
    patch: { fullName?: string; phone?: string; address?: string }
  ): Promise<void> {
    await this.db
      .updateTable('guardian')
      .set({
        ...(patch.fullName === undefined ? {} : { full_name: patch.fullName }),
        ...(patch.phone === undefined ? {} : { phone: patch.phone }),
        ...(patch.address === undefined ? {} : { address: patch.address }),
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .where('organization_id', '=', organizationId)
      .execute();
  }

  setPhoto(
    organizationId: string,
    id: string,
    fileId: string | null
  ): Promise<PhotoChange> {
    return this.db.transaction().execute(async (trx) => {
      const current = await trx
        .selectFrom('guardian')
        .select('photo_file_id')
        .where('id', '=', id)
        .where('organization_id', '=', organizationId)
        .forUpdate()
        .executeTakeFirst();
      if (current === undefined) {
        return { status: 'no-guardian' };
      }
      if (fileId !== null && current.photo_file_id !== fileId) {
        const tx = new KyselyGuardianTx(trx, this.activity);
        if (!(await tx.photoIsFree(organizationId, fileId))) {
          return { status: 'unusable' };
        }
      }
      await trx
        .updateTable('guardian')
        .set({ photo_file_id: fileId, updated_at: new Date() })
        .where('id', '=', id)
        .where('organization_id', '=', organizationId)
        .execute();
      return {
        status: 'changed',
        previousFileId:
          current.photo_file_id === fileId ? null : current.photo_file_id,
      };
    });
  }

  transaction<T>(fn: (tx: GuardianTx) => Promise<T>): Promise<T> {
    return this.db
      .transaction()
      .execute((trx) => fn(new KyselyGuardianTx(trx, this.activity)));
  }
}
