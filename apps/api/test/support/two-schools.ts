import type { Fixtures } from './base-test';
import { createStudent } from './factories/students';

type SchoolFixtures = Pick<
  Fixtures,
  'app' | 'createUser' | 'createOrganization' | 'createCampus' | 'addMember'
>;

export async function twoSchools({
  app,
  createUser,
  createOrganization,
  createCampus,
  addMember,
}: SchoolFixtures) {
  const owner = await createUser();
  const ownerB = await createUser();
  const orgA = await createOrganization(owner, 'School A');
  const orgB = await createOrganization(ownerB, 'School B');
  const lekki = await createCampus(orgA, 'Lekki');
  const ikeja = await createCampus(orgA, 'Ikeja');
  const campusB = await createCampus(orgB, 'Main');

  const lekkiOnly = await addMember(orgA, await createUser(), {
    roles: ['bursar'],
    campuses: [lekki],
  });
  const noPermission = await addMember(orgA, await createUser(), {
    roles: ['member'],
  });

  const studentLekki = await createStudent(app, owner, {
    campusId: lekki.id,
  });
  const studentIkeja = await createStudent(app, owner, {
    campusId: ikeja.id,
  });
  const studentB = await createStudent(app, ownerB, { campusId: campusB.id });

  return {
    orgA,
    orgB,
    owner,
    ownerB,
    lekkiOnly,
    noPermission,
    lekki,
    ikeja,
    campusB,
    studentLekki,
    studentIkeja,
    studentB,
  };
}

export type TwoSchools = Awaited<ReturnType<typeof twoSchools>>;
