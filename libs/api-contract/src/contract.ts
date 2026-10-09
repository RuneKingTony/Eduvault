import { z } from 'zod';
import { defineContract, defineRoute } from './route';
import {
  campusFilterSchema,
  campusSchema,
  createCampusSchema,
  createFeeScheduleSchema,
  createSchoolAccountSchema,
  createStudentSchema,
  feeScheduleSchema,
  healthSchema,
  idParamsSchema,
  meSchema,
  schoolAccountSchema,
  studentSchema,
  updateCampusSchema,
  updateFeeScheduleSchema,
  updateSchoolAccountSchema,
  updateStudentSchema,
} from './schemas';

const removed = z.object({ id: z.uuid() });

const crud = <
  Item extends z.ZodType,
  Create extends z.ZodType,
  Update extends z.ZodType,
>({
  base,
  item,
  create,
  update,
}: {
  base: string;
  item: Item;
  create: Create;
  update: Update;
}) => ({
  list: defineRoute({
    method: 'GET',
    path: base,
    query: campusFilterSchema,
    response: z.array(item),
  }),
  get: defineRoute({
    method: 'GET',
    path: `${base}/:id`,
    params: idParamsSchema,
    response: item,
  }),
  create: defineRoute({
    method: 'POST',
    path: base,
    body: create,
    response: item,
  }),
  update: defineRoute({
    method: 'PATCH',
    path: `${base}/:id`,
    params: idParamsSchema,
    body: update,
    response: item,
  }),
  remove: defineRoute({
    method: 'DELETE',
    path: `${base}/:id`,
    params: idParamsSchema,
    response: removed,
  }),
});

export const contract = defineContract({
  health: defineRoute({
    method: 'GET',
    path: '/health',
    response: healthSchema,
  }),
  me: defineRoute({ method: 'GET', path: '/me', response: meSchema }),
  campuses: {
    ...crud({
      base: '/campuses',
      item: campusSchema,
      create: createCampusSchema,
      update: updateCampusSchema,
    }),
    list: defineRoute({
      method: 'GET',
      path: '/campuses',
      response: z.array(campusSchema),
    }),
  },
  feeSchedules: crud({
    base: '/fee-schedules',
    item: feeScheduleSchema,
    create: createFeeScheduleSchema,
    update: updateFeeScheduleSchema,
  }),
  students: crud({
    base: '/students',
    item: studentSchema,
    create: createStudentSchema,
    update: updateStudentSchema,
  }),
  schoolAccount: {
    get: defineRoute({
      method: 'GET',
      path: '/school-account',
      response: schoolAccountSchema,
    }),
    create: defineRoute({
      method: 'POST',
      path: '/school-account',
      body: createSchoolAccountSchema,
      response: schoolAccountSchema,
    }),
    update: defineRoute({
      method: 'PATCH',
      path: '/school-account',
      body: updateSchoolAccountSchema,
      response: schoolAccountSchema,
    }),
    remove: defineRoute({
      method: 'DELETE',
      path: '/school-account',
      response: removed,
    }),
  },
});

export type AppContract = typeof contract;
