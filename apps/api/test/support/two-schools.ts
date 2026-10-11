import { baseTest, type Fixtures } from './base-test';
import { createStudent } from './factories/students';

type SchoolFixtures = Pick<
  Fixtures,
  'app' | 'createUser' | 'createOrganization' | 'createCampus' | 'addMember'
>;

export async function twoSchoolsWithoutStudents({
  createUser,
  createOrganization,
  createCampus,
  addMember,
}: Omit<SchoolFixtures, 'app'>) {
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
  };
}

export async function twoSchools(fixtures: SchoolFixtures) {
  const schools = await twoSchoolsWithoutStudents(fixtures);
  const { app } = fixtures;
  const studentLekki = await createStudent(app, schools.owner, {
    campusId: schools.lekki.id,
  });
  const studentIkeja = await createStudent(app, schools.owner, {
    campusId: schools.ikeja.id,
  });
  const studentB = await createStudent(app, schools.ownerB, {
    campusId: schools.campusB.id,
  });
  return { ...schools, studentLekki, studentIkeja, studentB };
}

type TwoSchools = Awaited<ReturnType<typeof twoSchools>>;
export type TwoSchoolsWithoutStudents = Awaited<
  ReturnType<typeof twoSchoolsWithoutStudents>
>;

export const bareSchoolsTest = baseTest.extend<{
  schools: TwoSchoolsWithoutStudents;
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
});

export const schoolsTest = baseTest.extend<{ schools: TwoSchools }>({
  schools: async (
    { app, createUser, createOrganization, createCampus, addMember },
    use
  ) => {
    await use(
      await twoSchools({
        app,
        createUser,
        createOrganization,
        createCampus,
        addMember,
      })
    );
  },
});
