import type { INestApplication } from '@nestjs/common';
import type { ClassSummary, Subject } from '@eduvault/api-contract';
import { SubjectTeacherService } from '../../../src/app/modules/subject/subject-teacher.service';
import { SubjectService } from '../../../src/app/modules/subject/subject.service';
import { orgContextFor } from './org-context';

export const MATHS = { code: 'MTH', name: 'Mathematics' };

export async function createSubject(
  app: INestApplication,
  actor: { cookie: string },
  input: { code: string; name: string }
): Promise<Subject> {
  const ctx = await orgContextFor(app, actor);
  return app.get(SubjectService, { strict: false }).create(ctx, input);
}

/** Replaces the class level's subject list with this one subject. */
export async function assignSubjectTeacher(
  app: INestApplication,
  actor: { cookie: string },
  input: { arm: ClassSummary; subjectId: string; userId: string }
): Promise<void> {
  const ctx = await orgContextFor(app, actor);
  await app
    .get(SubjectService, { strict: false })
    .replaceLevelSubjects(ctx, input.arm.level.id, {
      subjects: [{ subjectId: input.subjectId, kind: 'core' }],
    });
  await app
    .get(SubjectTeacherService, { strict: false })
    .assign(
      ctx,
      { classId: input.arm.id, subjectId: input.subjectId },
      { userId: input.userId }
    );
}
