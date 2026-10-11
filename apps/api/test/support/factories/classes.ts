import type { INestApplication } from '@nestjs/common';
import type {
  ClassSummary,
  ClassTeacher,
  ClassTeacherRole,
} from '@eduvault/api-contract';
import { ClassLevelService } from '../../../src/app/modules/class/class-level.service';
import { ClassService } from '../../../src/app/modules/class/class.service';
import { orgContextFor } from './org-context';

interface ClassInput {
  campusId: string;
  levelCode?: string;
  name?: string;
}

let sequence = 0;

export async function createClass(
  app: INestApplication,
  actor: { cookie: string },
  input: ClassInput
): Promise<ClassSummary> {
  sequence += 1;
  const ctx = await orgContextFor(app, actor);
  const levels = await app.get(ClassLevelService, { strict: false }).list(ctx);
  const code = input.levelCode ?? 'JSS1';
  const level = levels.find((candidate) => candidate.code === code);
  if (level === undefined) {
    throw new Error(`The school has no level ${code}`);
  }
  return app.get(ClassService, { strict: false }).create(ctx, {
    levelId: level.id,
    campusId: input.campusId,
    name: input.name ?? `Arm ${sequence}`,
  });
}

export async function assignClassTeacher(
  app: INestApplication,
  actor: { cookie: string },
  input: { classId: string; userId: string; role?: ClassTeacherRole }
): Promise<ClassTeacher> {
  const ctx = await orgContextFor(app, actor);
  return app
    .get(ClassService, { strict: false })
    .assignTeacher(ctx, input.classId, {
      userId: input.userId,
      role: input.role ?? 'assistant',
    });
}
