import type { INestApplicationContext } from '@nestjs/common';
import { sql } from 'kysely';
import { KYSELY_TOKEN, type Database } from '../../src/app/common/db/tokens';
import { AnnouncementService } from '../../src/app/modules/announcement/announcement.service';
import { CalendarService } from '../../src/app/modules/calendar/calendar.service';
import { CampusService } from '../../src/app/modules/campus/campus.service';
import { ClassService } from '../../src/app/modules/class/class.service';
import { BillingService } from '../../src/app/modules/billing/billing.service';
import { FeePreviewService } from '../../src/app/modules/fee-line/fee-preview.service';
import { InvoiceService } from '../../src/app/modules/invoice/invoice.service';
import { LedgerService } from '../../src/app/modules/ledger/ledger.service';
import { MoneyAccountService } from '../../src/app/modules/money-account/money-account.service';
import { StudentService } from '../../src/app/modules/student/student.service';
import { SubjectService } from '../../src/app/modules/subject/subject.service';
import { SubjectTeacherService } from '../../src/app/modules/subject/subject-teacher.service';
import { orgContextFor } from './actors';
import { SEEDED_ACTING_REASON } from './acting-requests';
import { SEED_ANNOUNCEMENTS } from './announcements';
import { CURRENT_CLASS_TEACHERS, SEED_CLASSES } from './classes';
import {
  OPENING_CREDIT_MINOR,
  OPENING_DEBT_MINOR,
  SEED_MONEY_ACCOUNTS,
  SEED_OPENING_BALANCES,
} from './finance';
import { shiftDate } from './date-shift';
import { SEED_STORE_ENTRIES } from './store';
import {
  CURRENT_SUBJECT_TEACHERS,
  RETIRED_SUBJECT,
  SEED_LEVEL_SUBJECTS,
  SEED_SUBJECTS,
} from './subjects';
import { emailOf, SUPER_ADMIN_EMAIL } from './members';
import {
  GREENFIELD_SLUG,
  HILLTOP_SLUG,
  SUSPENDED_SLUG,
  schools,
} from './schools';
import {
  SEED_ENROLMENTS,
  SEED_GUARDIANS,
  SEED_PLACEMENTS,
  seedLife,
  students,
} from './students';

// Bola Johnson (JSS 3 Gold) has left and is only on the Left tab.
export const visibleStudents: Record<string, number> = {
  funmi: 21,
  tunde: 21,
  grace: 21,
  chika: 18,
  yemi: 3,
  emeka: 7,
  kola: 0,
};

type Check = (
  label: string,
  actual: number | string,
  expected: number | string
) => void;

async function checkSuperAdmin(db: Database, check: Check) {
  const expected = (
    process.env['BOOTSTRAP_ADMIN_EMAIL'] ?? SUPER_ADMIN_EMAIL
  ).toLowerCase();
  const superAdmin = await db
    .selectFrom('user')
    .select('email')
    .where('role', '=', 'superadmin')
    .where('email', '=', expected)
    .executeTakeFirst();
  check('super admin', superAdmin?.email ?? 'missing', expected);
}

function checkSchoolState(
  check: Check,
  {
    school,
    offsetDays,
    account,
  }: {
    school: (typeof schools)[number];
    offsetDays: number;
    account: { createdAt: Date | string; suspended_at: unknown } | undefined;
  }
) {
  check(
    `${school.slug} created on`,
    account
      ? new Date(account.createdAt).toISOString().slice(0, 10)
      : 'missing',
    shiftDate(school.createdOn, offsetDays)
  );
  check(
    `${school.slug} suspended`,
    account?.suspended_at === null ? 'no' : 'yes',
    school.slug === SUSPENDED_SLUG ? 'yes' : 'no'
  );
}

async function checkSchool(
  db: Database,
  check: Check,
  {
    school,
    offsetDays,
  }: { school: (typeof schools)[number]; offsetDays: number }
) {
  const account = await db
    .selectFrom('school_account')
    .innerJoin(
      'organization',
      'organization.id',
      'school_account.organization_id'
    )
    .select([
      'school_account.admission_prefix',
      'school_account.suspended_at',
      'organization.id',
      'organization.createdAt',
    ])
    .where('organization.slug', '=', school.slug)
    .executeTakeFirst();
  check(
    `${school.slug} admission prefix`,
    account?.admission_prefix ?? 'missing',
    school.admissionPrefix
  );
  checkSchoolState(check, { school, offsetDays, account });
  const levels = await db
    .selectFrom('class_level')
    .select(['code', 'next_level_id'])
    .where('organization_id', '=', account?.id ?? '')
    .orderBy('sequence')
    .execute();
  check(`${school.slug} levels`, levels.length, 12);
  check(
    `${school.slug} final level`,
    levels.filter((level) => level.next_level_id === null).length === 1
      ? (levels.at(-1)?.code ?? 'none')
      : 'several',
    'SS3'
  );
}

async function checkSupportActivity(db: Database, check: Check) {
  const rows = await db
    .selectFrom('audit_log')
    .innerJoin('organization', 'organization.id', 'audit_log.organization_id')
    .select(['audit_log.method', 'audit_log.reason'])
    .where('audit_log.kind', '=', 'acting')
    .where('organization.slug', '=', HILLTOP_SLUG)
    .execute();
  check('Hilltop acting requests', rows.length, 3);
  check(
    'Hilltop acting writes',
    rows
      .filter((row) => row.method !== 'GET')
      .map((row) => row.reason ?? '')
      .join(','),
    SEEDED_ACTING_REASON
  );
}

async function checkCalendar(
  app: INestApplicationContext,
  db: Database,
  check: Check
) {
  const count = async (
    table: 'academic_session' | 'term' | 'school_holiday'
  ) => {
    const row = await db
      .selectFrom(table)
      .innerJoin('organization', 'organization.id', `${table}.organization_id`)
      .where('organization.slug', '=', GREENFIELD_SLUG)
      .select((eb) => eb.fn.countAll<string>().as('total'))
      .executeTakeFirstOrThrow();
    return Number(row.total);
  };
  check('Greenfield school years', await count('academic_session'), 2);
  check('Greenfield terms', await count('term'), 6);
  check('Greenfield holidays', await count('school_holiday'), 11);
  const current = await db
    .selectFrom('term')
    .select((eb) => eb.fn.countAll<string>().as('total'))
    .where('is_current', '=', true)
    .executeTakeFirstOrThrow();
  check('current terms', Number(current.total), 1);

  const funmi = await orgContextFor(app, emailOf('funmi'));
  const now = await app.get(CalendarService, { strict: false }).current(funmi);
  check('Greenfield current term', now.term?.name ?? 'none', 'First term');
  check('Greenfield school days', now.schoolDays, 67);
}

const byName = (a: string, b: string) => a.localeCompare(b);

type CountedTable =
  | 'level_subject'
  | 'student_subject'
  | 'student_enrollment'
  | 'enrollment_placement'
  | 'guardian'
  | 'guardian_student';

async function countRows(
  db: Database,
  table: CountedTable,
  organizationId: string
): Promise<number> {
  const row = await db
    .selectFrom(table)
    .where('organization_id', '=', organizationId)
    .select((eb) => eb.fn.countAll<string>().as('total'))
    .executeTakeFirstOrThrow();
  return Number(row.total);
}

async function checkClasses(
  app: INestApplicationContext,
  db: Database,
  check: Check
) {
  const funmi = await orgContextFor(app, emailOf('funmi'));
  const classes = app.get(ClassService, { strict: false });
  const everyClass = await classes.list(funmi, { status: 'all' });
  check('Greenfield classes', everyClass.length, SEED_CLASSES.length);
  check(
    'Greenfield archived classes',
    everyClass.filter((row) => row.retiredAt !== null).length,
    1
  );
  const teachers = await db
    .selectFrom('class_arm_teacher')
    .innerJoin('term', (join) =>
      join
        .onRef('term.session_id', '=', 'class_arm_teacher.session_id')
        .on('term.is_current', '=', true)
    )
    .select((eb) => eb.fn.countAll<string>().as('total'))
    .where('class_arm_teacher.organization_id', '=', funmi.organizationId)
    .executeTakeFirstOrThrow();
  check(
    'Greenfield current class teachers',
    Number(teachers.total),
    CURRENT_CLASS_TEACHERS.length
  );

  const emeka = await orgContextFor(app, emailOf('emeka'));
  const taught = ['JSS 2 Gold', 'JSS 3 Gold'].map(
    (name) =>
      everyClass.find((row) => row.displayName === name)?.id ?? 'missing'
  );
  check(
    'Emeka class scope',
    emeka.classScope === 'all'
      ? 'all'
      : emeka.classScope.toSorted(byName).join(','),
    taught.toSorted(byName).join(',')
  );
}

async function checkSubjects(
  app: INestApplicationContext,
  db: Database,
  check: Check
) {
  const funmi = await orgContextFor(app, emailOf('funmi'));
  const organizationId = funmi.organizationId;
  const subjects = await app
    .get(SubjectService, { strict: false })
    .list(funmi, { page: 1, includeRetired: true });
  check('Greenfield subjects', subjects.total, SEED_SUBJECTS.length);
  const retired = subjects.items.filter((row) => row.retiredAt !== null);
  check(
    'Greenfield retired subjects',
    retired.map((row) => row.code).join(','),
    RETIRED_SUBJECT.code
  );
  const count = (table: 'level_subject' | 'student_subject') =>
    countRows(db, table, organizationId);
  check(
    'Greenfield level subjects',
    await count('level_subject'),
    Object.values(SEED_LEVEL_SUBJECTS).reduce(
      (total, list) => total + list.length,
      0
    )
  );
  check(
    'Greenfield French takers',
    (await count('student_subject')) > 0 ? 'some' : 'none',
    'some'
  );
  const teachers = await app
    .get(SubjectTeacherService, { strict: false })
    .list(funmi);
  const assigned = teachers.arms
    .flatMap((arm) => arm.subjects)
    .filter((row) => row.teacher !== null).length;
  check(
    'Greenfield subject teachers',
    assigned,
    CURRENT_SUBJECT_TEACHERS.length
  );
}

async function checkRoll(
  app: INestApplicationContext,
  db: Database,
  check: Check
) {
  const funmi = await orgContextFor(app, emailOf('funmi'));
  const organizationId = funmi.organizationId;
  const count = (
    table:
      | 'student_enrollment'
      | 'enrollment_placement'
      | 'guardian'
      | 'guardian_student'
  ) => countRows(db, table, organizationId);
  check(
    'Greenfield enrolments',
    await count('student_enrollment'),
    SEED_ENROLMENTS
  );
  check(
    'Greenfield placements',
    await count('enrollment_placement'),
    SEED_PLACEMENTS
  );
  check('Greenfield guardians', await count('guardian'), SEED_GUARDIANS.length);
  check(
    'Greenfield guardian links',
    await count('guardian_student'),
    students.reduce((total, row) => total + row.guardians.length, 0)
  );

  const listed = await app
    .get(StudentService, { strict: false })
    .list(funmi, { tab: 'new', page: 1, pageSize: 100 });
  const tabs = (life: ReturnType<typeof seedLife>) =>
    students.filter((row) => seedLife(row) === life).length;
  check(
    'Greenfield tab counts',
    JSON.stringify(listed.counts),
    JSON.stringify({
      active: tabs('active'),
      new: students.filter((row) => row.isNewIntake).length,
      inactive: tabs('inactive'),
      left: tabs('left'),
      graduated: tabs('graduated'),
    })
  );
  check(
    'Greenfield new intakes',
    listed.items
      .map((row) => row.firstName)
      .toSorted(byName)
      .join(','),
    students
      .filter((row) => row.isNewIntake)
      .map((row) => row.firstName)
      .toSorted(byName)
      .join(',')
  );
}

async function checkLogins(organizationId: string, db: Database, check: Check) {
  const ada = await db
    .selectFrom('student')
    .innerJoin('user', 'user.id', 'student.user_id')
    .select(['student.admission_number', 'user.username'])
    .where('student.organization_id', '=', organizationId)
    .where('student.first_name', '=', 'Ada')
    .executeTakeFirst();
  check('Ada admission number', ada?.admission_number ?? 'missing', 'GF-0123');
  check('Ada username', ada?.username ?? 'missing', 'greenfield-0123');

  await checkGuardianLogins(organizationId, db, check);
}

async function checkGuardianLogins(
  organizationId: string,
  db: Database,
  check: Check
) {
  for (const guardian of SEED_GUARDIANS) {
    const row = await db
      .selectFrom('guardian')
      .innerJoin('user', 'user.id', 'guardian.user_id')
      .select(['user.username', 'user.email'])
      .where('guardian.organization_id', '=', organizationId)
      .where('guardian.full_name', '=', guardian.fullName)
      .executeTakeFirst();
    check(
      `${guardian.fullName} login`,
      (guardian.login.kind === 'email' ? row?.email : row?.username) ??
        'missing',
      guardian.login.kind === 'email'
        ? guardian.login.email
        : guardian.login.username
    );
  }
}

async function checkStudents(
  app: INestApplicationContext,
  db: Database,
  check: Check
) {
  await checkRoll(app, db, check);
  const funmi = await orgContextFor(app, emailOf('funmi'));
  await checkLogins(funmi.organizationId, db, check);
}

async function checkPlatform(db: Database, check: Check, offsetDays: number) {
  await checkSuperAdmin(db, check);
  for (const school of schools) {
    await checkSchool(db, check, { school, offsetDays });
  }
  await checkSupportActivity(db, check);
}

async function checkAnnouncements(app: INestApplicationContext, check: Check) {
  const funmi = await orgContextFor(app, emailOf('funmi'));
  const service = app.get(AnnouncementService, { strict: false });
  const count = (status: string) =>
    SEED_ANNOUNCEMENTS.filter((item) => item.status === status).length;
  for (const status of ['published', 'draft', 'withdrawn'] as const) {
    const listed = await service.list(funmi, { status, page: 1, pageSize: 50 });
    check(`${status} announcements`, listed.total, count(status));
  }
  const published = await service.list(funmi, {
    status: 'published',
    page: 1,
    pageSize: 50,
  });
  check(
    'pinned announcements',
    published.items.filter((item) => item.pinned).length,
    SEED_ANNOUNCEMENTS.filter((item) => item.pinned).length
  );
  check(
    'announcement audiences',
    published.items.filter((item) => item.campusId === null).length,
    SEED_ANNOUNCEMENTS.filter(
      (item) => item.status === 'published' && item.campus === null
    ).length
  );
}

async function checkFinance(app: INestApplicationContext, check: Check) {
  const funmi = await orgContextFor(app, emailOf('funmi'));
  const { items: accounts } = await app
    .get(MoneyAccountService, { strict: false })
    .list(funmi);
  check('money accounts', accounts.length, SEED_MONEY_ACCOUNTS.length);
  check(
    'money account names',
    accounts.map((account) => account.name).join(', '),
    SEED_MONEY_ACCOUNTS.map((account) => account.name).join(', ')
  );
  check(
    'school-wide money accounts',
    accounts.filter((account) => account.campusId === null).length,
    SEED_MONEY_ACCOUNTS.filter((account) => account.campus === null).length
  );

  const ledger = app.get(LedgerService, { strict: false });
  const chart = await ledger.listAccounts(funmi);
  const balanceOf = (code: number) =>
    chart.items.find((item) => item.code === code)?.balanceMinor;
  const charges = await checkCharges(app, funmi, check);
  const db = app.get<Database>(KYSELY_TOKEN, { strict: false });
  const openingStock = await openingStockMinor(db, funmi.organizationId);
  check(
    'fees owed to the school',
    balanceOf(1100) ?? 'missing',
    OPENING_DEBT_MINOR - OPENING_CREDIT_MINOR + charges.chargedMinor
  );
  check(
    'opening balance',
    balanceOf(3000) ?? 'missing',
    OPENING_DEBT_MINOR - OPENING_CREDIT_MINOR + openingStock
  );
  check('fee income', balanceOf(4000) ?? 'missing', charges.feesMinor);
  check('discounts given', balanceOf(5000) ?? 'missing', charges.discountMinor);
  const journal = await ledger.journal(funmi, { page: 1, pageSize: 50 });
  check(
    'journal entries',
    journal.total,
    SEED_OPENING_BALANCES.length + charges.sentCount + SEED_STORE_ENTRIES
  );
}

async function openingStockMinor(
  db: Database,
  organizationId: string
): Promise<number> {
  const row = await db
    .selectFrom('stock_movement')
    .select(sql<string>`coalesce(sum(value_minor), 0)`.as('total'))
    .where('organization_id', '=', organizationId)
    .where('kind', '=', 'opening')
    .executeTakeFirstOrThrow();
  return Number(row.total);
}

async function checkStore(db: Database, check: Check) {
  const campuses = await db
    .selectFrom('campus')
    .select(['team_id', 'organization_id'])
    .execute();
  const stores = await db
    .selectFrom('store')
    .select(['campus_id', sql<string>`count(*)`.as('total')])
    .groupBy('campus_id')
    .execute();
  const perCampus = new Map(stores.map((row) => [row.campus_id, row.total]));
  for (const campus of campuses) {
    check(
      `store of campus ${campus.team_id}`,
      perCampus.get(campus.team_id) ?? '0',
      '1'
    );
  }
  const stock = await db
    .selectFrom('stock_movement')
    .innerJoin('store', 'store.id', 'stock_movement.store_id')
    .select([
      'store.campus_id',
      sql<string>`sum(stock_movement.value_minor)`.as('total'),
    ])
    .groupBy('store.campus_id')
    .execute();
  const ledger = await db
    .selectFrom('journal_line')
    .innerJoin('ledger_account', (join) =>
      join
        .onRef('ledger_account.id', '=', 'journal_line.ledger_account_id')
        .onRef(
          'ledger_account.organization_id',
          '=',
          'journal_line.organization_id'
        )
    )
    .select([
      'journal_line.campus_id',
      sql<string>`sum(journal_line.debit_minor - journal_line.credit_minor)`.as(
        'total'
      ),
    ])
    .where('ledger_account.code', '=', 1300)
    .groupBy('journal_line.campus_id')
    .execute();
  const ledgerOf = new Map(ledger.map((row) => [row.campus_id, row.total]));
  check('campuses with stock', stock.length, 2);
  for (const row of stock) {
    check(
      `Store stock (1300) of campus ${row.campus_id}`,
      ledgerOf.get(row.campus_id) ?? '0',
      row.total
    );
  }
}

type OwnerContext = Awaited<ReturnType<typeof orgContextFor>>;

async function checkRound(
  app: INestApplicationContext,
  funmi: OwnerContext,
  check: Check
) {
  const runs = await app
    .get(BillingService, { strict: false })
    .list(funmi, { page: 1, pageSize: 10 });
  check('charge rounds', runs.total, 1);
  const run = runs.items[0];
  check('round is sent', run?.status ?? 'missing', 'issued');
  check('round prepared by', run?.createdBy ?? 'missing', 'Chika Eze');
  check(
    'round number',
    /^BR-\d{4}-0001$/.test(run?.number ?? '') ? 'BR-…-0001' : 'wrong',
    'BR-…-0001'
  );
}

async function checkPreview(
  app: INestApplicationContext,
  funmi: OwnerContext,
  check: Check
) {
  const terms = await app.get(BillingService, { strict: false }).terms(funmi);
  const pending = await app
    .get(FeePreviewService, { strict: false })
    .preview(funmi, {
      termId: terms[1]?.termId ?? '',
      studentId: await studentIdOf(app, funmi, 'GF-0158'),
    });
  check(
    'Halima pending scholarship',
    pending.pendingDiscounts.join(', '),
    'Academic scholarship, top of JSS 1'
  );
}

async function checkCharges(
  app: INestApplicationContext,
  funmi: OwnerContext,
  check: Check
) {
  await checkRound(app, funmi, check);
  await checkPreview(app, funmi, check);
  const invoices = app.get(InvoiceService, { strict: false });
  const list = await invoices.list(funmi, {
    kind: 'term',
    page: 1,
    pageSize: 50,
  });
  check('sent charges', list.summary.sentCount, list.total);
  check('prepared charges', list.summary.draftCount, 0);
  const ada = list.items.find((item) => item.admissionNumber === 'GF-0123');
  const adaCharge = await invoices.get(funmi, ada?.id ?? '');
  check(
    'Ada sibling discount',
    adaCharge.lines.find((line) => line.amountMinor < 0)?.amountMinor ?? 0,
    -(adaCharge.lines[0]?.amountMinor ?? 0) / 20
  );
  const details = await Promise.all(
    list.items.map((item) => invoices.get(funmi, item.id))
  );
  const amounts = details.flatMap((invoice) =>
    invoice.lines.map((line) => line.amountMinor)
  );
  return {
    sentCount: list.total,
    chargedMinor: list.summary.sentTotalMinor,
    feesMinor: amounts
      .filter((amount) => amount > 0)
      .reduce((sum, amount) => sum + amount, 0),
    discountMinor: -amounts
      .filter((amount) => amount < 0)
      .reduce((sum, amount) => sum + amount, 0),
  };
}

async function studentIdOf(
  app: INestApplicationContext,
  funmi: OwnerContext,
  admissionNumber: string
): Promise<string> {
  const db = app.get<Database>(KYSELY_TOKEN, { strict: false });
  const row = await db
    .selectFrom('student')
    .select('id')
    .where('organization_id', '=', funmi.organizationId)
    .where('admission_number', '=', admissionNumber)
    .executeTakeFirstOrThrow();
  return row.id;
}

export async function runSeedCheck(
  app: INestApplicationContext,
  offsetDays: number
): Promise<string[]> {
  const failures: string[] = [];
  const check: Check = (label, actual, expected) => {
    if (actual !== expected) {
      failures.push(`${label}: expected ${expected}, got ${actual}`);
    }
  };

  const db = app.get<Database>(KYSELY_TOKEN, { strict: false });
  await checkPlatform(db, check, offsetDays);
  const organizations = await db
    .selectFrom('organization')
    .select('slug')
    .execute();
  check('schools', organizations.length, schools.length);

  const campusService = app.get(CampusService, { strict: false });
  const studentService = app.get(StudentService, { strict: false });

  const funmi = await orgContextFor(app, emailOf('funmi'));
  const campuses = await campusService.list(funmi);
  check('Greenfield campuses', campuses.length, 2);
  for (const campus of campuses) {
    const expected = students.filter(
      (s) => s.campus === campus.name && seedLife(s) === 'active'
    ).length;
    const listed = await studentService.list(funmi, {
      tab: 'active',
      page: 1,
      pageSize: 100,
      campusId: campus.id,
    });
    check(`${campus.name} students`, listed.total, expected);
  }

  await checkCalendar(app, db, check);
  await checkClasses(app, db, check);
  await checkSubjects(app, db, check);
  await checkStudents(app, db, check);
  await checkAnnouncements(app, check);
  await checkFinance(app, check);
  await checkStore(db, check);

  for (const [key, expected] of Object.entries(visibleStudents)) {
    const ctx = await orgContextFor(app, emailOf(key));
    const listed = await studentService.list(ctx, {
      tab: 'active',
      page: 1,
      pageSize: 100,
    });
    check(`${key} sees students`, listed.total, expected);
  }
  return failures;
}
