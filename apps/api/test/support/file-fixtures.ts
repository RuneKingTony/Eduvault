import type { FileRef, SchoolProfile } from '@eduvault/api-contract';
import { baseTest, type TestUser } from './base-test';
import {
  twoSchoolsWithoutStudents,
  type TwoSchoolsWithoutStudents,
} from './two-schools';

export const filesTest = baseTest.extend<{
  schools: TwoSchoolsWithoutStudents;
  upload: (user: TestUser, bytes: Buffer, name?: string) => Promise<FileRef>;
  attach: (user: TestUser, file: FileRef) => Promise<SchoolProfile>;
}>({
  schools: async (
    { createUser, createOrganization, createCampus, addMember },
    use
  ) => {
    await use(
      await twoSchoolsWithoutStudents({
        createUser,
        createOrganization,
        createCampus,
        addMember,
      })
    );
  },
  upload: async ({ api }, use) => {
    await use(async (user, bytes, name = 'logo.png') => {
      const res = await api(user)
        .post('/files')
        .field('kind', 'school_logo')
        .attach('file', bytes, { filename: name })
        .expect(201);
      return res.body as FileRef;
    });
  },
  attach: async ({ api }, use) => {
    await use(async (user, file) => {
      const res = await api(user)
        .put('/school-account/logo')
        .send({ fileId: file.id })
        .expect(200);
      return res.body as SchoolProfile;
    });
  },
});

export const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
export const png = (size = 64) =>
  Buffer.concat([Buffer.from(PNG_SIGNATURE), Buffer.alloc(size, 7)]);
