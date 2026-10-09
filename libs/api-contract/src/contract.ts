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
  mePermissionsSchema,
  meSchema,
  schoolAccountSchema,
  studentSchema,
  updateCampusSchema,
  updateFeeScheduleSchema,
  updateSchoolAccountSchema,
  updateStudentSchema,
} from './schemas';

const removed = z.object({ id: z.uuid() });

const crudWithoutRemove = <
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
});

const crud = <
  Item extends z.ZodType,
  Create extends z.ZodType,
  Update extends z.ZodType,
>(options: {
  base: string;
  item: Item;
  create: Create;
  update: Update;
}) => ({
  ...crudWithoutRemove(options),
  remove: defineRoute({
    method: 'DELETE',
    path: `${options.base}/:id`,
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
  me: {
    get: defineRoute({ method: 'GET', path: '/me', response: meSchema }),
    permissions: defineRoute({
      method: 'GET',
      path: '/me/permissions',
      response: mePermissionsSchema,
    }),
  },
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
  students: crudWithoutRemove({
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
