import { expect, test } from '@playwright/test';
import { ApiClient } from '../support/api';
import { loadFixture, requirePersona } from '../support/fixtures';
import { signedInAs, type Fixture } from '../support/personas';

let fixture: Fixture;

test.beforeAll(() => {
  fixture = loadFixture();
});

test('an unauthenticated request is 401', async () => {
  const anon = await ApiClient.create();
  expect((await anon.get('/students')).status()).toBe(401);
  await anon.dispose();
});

test('the owner reads a student in their own school', async () => {
  const owner = await signedInAs(fixture.personas.owner);
  const res = await owner.get(`/students/${fixture.ownerStudentId}`);
  expect(res.status()).toBe(200);
  await owner.dispose();
});

test("a foreign school's owner gets 404, not 403, for another school's student", async () => {
  const foreign = await signedInAs(fixture.personas.foreign);
  const res = await foreign.get(`/students/${fixture.ownerStudentId}`);
  expect(res.status()).toBe(404);
  await foreign.dispose();
});

test('a teacher at Main Campus reads students but cannot create one', async () => {
  requirePersona(fixture.personas.teacher);
  const teacher = await signedInAs(fixture.personas.teacher);
  expect(
    (await teacher.get(`/students/${fixture.ownerStudentId}`)).status()
  ).toBe(200);
  const create = await teacher.post('/students', {
    fullName: 'Not allowed',
    admissionNumber: `E2E-denied-${fixture.runId}`,
  });
  expect(create.status()).toBe(403);
  await teacher.dispose();
});

test('a student has no access to the roll', async () => {
  requirePersona(fixture.personas.student);
  const student = await signedInAs(fixture.personas.student);
  expect((await student.get('/students')).status()).toBe(403);
  await student.dispose();
});

test('an admin sees every campus of the school', async () => {
  requirePersona(fixture.personas.admin);
  const admin = await signedInAs(fixture.personas.admin);
  const res = await admin.get('/campuses');
  expect(res.status()).toBe(200);
  const campuses = (await res.json()) as { id: string }[];
  expect(campuses.map((c) => c.id)).toContain(fixture.annexCampusId);
  await admin.dispose();
});
