import { z } from 'zod';
import { defineContract, defineRoute } from './route';
import {
  campusFilterSchema,
  campusSchema,
  campusSummarySchema,
  createCampusSchema,
  createFeeScheduleSchema,
  createMemberResultSchema,
  createMemberSchema,
  createRoleSchema,
  createSchoolResultSchema,
  createSchoolSchema,
  createStudentSchema,
  deletableSchema,
  deleteSchoolSchema,
  fileRefSchema,
  handoverCandidateSchema,
  handoverResultSchema,
  handoverSchema,
  schoolProfileSchema,
  schoolSettingsSchema,
  setLogoSchema,
  updateSchoolProfileSchema,
  updateSchoolSettingsSchema,
  uploadFileBodySchema,
  auditListQuerySchema,
  auditListSchema,
  feeScheduleSchema,
  healthSchema,
  idParamsSchema,
  mePermissionsSchema,
  meSchema,
  platformSchoolIdParamsSchema,
  platformSchoolListQuerySchema,
  memberDetailSchema,
  memberListQuerySchema,
  memberListSchema,
  platformSchoolListSchema,
  platformSchoolMembersSchema,
  platformSchoolOptionsSchema,
  platformSchoolSchema,
  replaceOwnerResultSchema,
  resetMemberPasswordResultSchema,
  removedRoleSchema,
  replaceOwnerSchema,
  roleListSchema,
  roleSchema,
  roleSlugParamsSchema,
  schoolRoleSchema,
  setPasswordSchema,
  studentSchema,
  updateCampusSchema,
  updateFeeScheduleSchema,
  updateMemberCampusesSchema,
  updateMemberRolesSchema,
  updateMemberTitleSchema,
  updateRoleSchema,
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
    setPassword: defineRoute({
      method: 'POST',
      path: '/me/password',
      body: setPasswordSchema,
      response: z.void(),
    }),
  },
  platform: {
    schools: {
      list: defineRoute({
        method: 'GET',
        path: '/platform/schools',
        query: platformSchoolListQuerySchema,
        response: platformSchoolListSchema,
      }),
      options: defineRoute({
        method: 'GET',
        path: '/platform/schools/options',
        response: platformSchoolOptionsSchema,
      }),
      get: defineRoute({
        method: 'GET',
        path: '/platform/schools/:id',
        params: platformSchoolIdParamsSchema,
        response: platformSchoolSchema,
      }),
      members: defineRoute({
        method: 'GET',
        path: '/platform/schools/:id/members',
        params: platformSchoolIdParamsSchema,
        response: platformSchoolMembersSchema,
      }),
      suspend: defineRoute({
        method: 'POST',
        path: '/platform/schools/:id/suspend',
        params: platformSchoolIdParamsSchema,
        response: platformSchoolSchema,
      }),
      reactivate: defineRoute({
        method: 'POST',
        path: '/platform/schools/:id/reactivate',
        params: platformSchoolIdParamsSchema,
        response: platformSchoolSchema,
      }),
      replaceOwner: defineRoute({
        method: 'PUT',
        path: '/platform/schools/:id/owner',
        params: platformSchoolIdParamsSchema,
        body: replaceOwnerSchema,
        response: replaceOwnerResultSchema,
      }),
      create: defineRoute({
        method: 'POST',
        path: '/platform/schools',
        body: createSchoolSchema,
        response: createSchoolResultSchema,
      }),
    },
    audit: {
      list: defineRoute({
        method: 'GET',
        path: '/platform/audit',
        query: auditListQuerySchema,
        response: auditListSchema,
      }),
    },
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
    summary: defineRoute({
      method: 'GET',
      path: '/campuses/summary',
      response: z.array(campusSummarySchema),
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
  members: {
    list: defineRoute({
      method: 'GET',
      path: '/members',
      query: memberListQuerySchema,
      response: memberListSchema,
    }),
    roles: defineRoute({
      method: 'GET',
      path: '/members/roles',
      response: z.array(schoolRoleSchema),
    }),
    get: defineRoute({
      method: 'GET',
      path: '/members/:id',
      params: idParamsSchema,
      response: memberDetailSchema,
    }),
    create: defineRoute({
      method: 'POST',
      path: '/members',
      body: createMemberSchema,
      response: createMemberResultSchema,
    }),
    updateRoles: defineRoute({
      method: 'PUT',
      path: '/members/:id/roles',
      params: idParamsSchema,
      body: updateMemberRolesSchema,
      response: memberDetailSchema,
    }),
    updateTitle: defineRoute({
      method: 'PUT',
      path: '/members/:id/title',
      params: idParamsSchema,
      body: updateMemberTitleSchema,
      response: memberDetailSchema,
    }),
    updateCampuses: defineRoute({
      method: 'PUT',
      path: '/members/:id/campuses',
      params: idParamsSchema,
      body: updateMemberCampusesSchema,
      response: memberDetailSchema,
    }),
    resetPassword: defineRoute({
      method: 'POST',
      path: '/members/:id/reset-password',
      params: idParamsSchema,
      response: resetMemberPasswordResultSchema,
    }),
    remove: defineRoute({
      method: 'DELETE',
      path: '/members/:id',
      params: idParamsSchema,
      response: removed,
    }),
  },
  roles: {
    list: defineRoute({
      method: 'GET',
      path: '/roles',
      response: roleListSchema,
    }),
    get: defineRoute({
      method: 'GET',
      path: '/roles/:slug',
      params: roleSlugParamsSchema,
      response: roleSchema,
    }),
    create: defineRoute({
      method: 'POST',
      path: '/roles',
      body: createRoleSchema,
      response: roleSchema,
    }),
    update: defineRoute({
      method: 'PATCH',
      path: '/roles/:slug',
      params: roleSlugParamsSchema,
      body: updateRoleSchema,
      response: roleSchema,
    }),
    remove: defineRoute({
      method: 'DELETE',
      path: '/roles/:slug',
      params: roleSlugParamsSchema,
      response: removedRoleSchema,
    }),
  },
  schoolAccount: {
    get: defineRoute({
      method: 'GET',
      path: '/school-account',
      response: schoolProfileSchema,
    }),
    update: defineRoute({
      method: 'PATCH',
      path: '/school-account',
      body: updateSchoolProfileSchema,
      response: schoolProfileSchema,
    }),
    setLogo: defineRoute({
      method: 'PUT',
      path: '/school-account/logo',
      body: setLogoSchema,
      response: schoolProfileSchema,
    }),
    removeLogo: defineRoute({
      method: 'DELETE',
      path: '/school-account/logo',
      response: schoolProfileSchema,
    }),
  },
  schoolSettings: {
    get: defineRoute({
      method: 'GET',
      path: '/school-settings',
      response: schoolSettingsSchema,
    }),
    update: defineRoute({
      method: 'PATCH',
      path: '/school-settings',
      body: updateSchoolSettingsSchema,
      response: schoolSettingsSchema,
    }),
  },
  files: {
    upload: defineRoute({
      method: 'POST',
      path: '/files',
      body: uploadFileBodySchema,
      response: fileRefSchema,
    }),
    remove: defineRoute({
      method: 'DELETE',
      path: '/files/:id',
      params: idParamsSchema,
      response: z.void(),
    }),
  },
  school: {
    handoverCandidates: defineRoute({
      method: 'GET',
      path: '/school/handover-candidates',
      response: z.array(handoverCandidateSchema),
    }),
    handover: defineRoute({
      method: 'POST',
      path: '/school/handover',
      body: handoverSchema,
      response: handoverResultSchema,
    }),
    deletable: defineRoute({
      method: 'GET',
      path: '/school/deletable',
      response: deletableSchema,
    }),
    remove: defineRoute({
      method: 'DELETE',
      path: '/school',
      body: deleteSchoolSchema,
      response: removed,
    }),
  },
});

export type AppContract = typeof contract;
