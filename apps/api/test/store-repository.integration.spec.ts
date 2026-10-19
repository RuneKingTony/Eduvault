import { randomUUID } from 'node:crypto';
import {
  FakeStoreRepository,
  storeRef,
} from '../src/app/modules/store/fake-store.repository';
import { StoreRepository } from '../src/app/modules/store/store.repository';
import {
  describeStoreRepositoryContract,
  type StoreHarness,
} from './store-repository.contract';
import { classLevelId } from './support/factories/store';
import type { Fixtures } from './support/base-test';
import {
  bareSchoolsTest as test,
  type TwoSchoolsWithoutStudents,
} from './support/two-schools';

const fakeHarness = (): StoreHarness => {
  const repository = new FakeStoreRepository();
  const schoolA = 'school-a';
  const schoolB = 'school-b';
  const levels = {
    jss1: randomUUID(),
    jss2: randomUUID(),
    otherSchool: randomUUID(),
  };
  const campuses = { lekki: randomUUID(), ikeja: randomUUID() };
  repository.levels.set(levels.jss1, 'JSS 1');
  repository.levels.set(levels.jss2, 'JSS 2');
  repository.levels.set(levels.otherSchool, 'JSS 1');
  repository.levelSchools.set(levels.jss1, schoolA);
  repository.levelSchools.set(levels.jss2, schoolA);
  repository.levelSchools.set(levels.otherSchool, schoolB);
  repository.stores = [
    storeRef('lekki', 'Lekki', campuses.lekki),
    storeRef('ikeja', 'Ikeja', campuses.ikeja),
  ];
  for (const store of repository.stores) {
    repository.storeSchools.set(store.id, schoolA);
  }
  return { repository, schoolA, schoolB, userId: 'user-1', levels, campuses };
};

describe('FakeStoreRepository', () => {
  describeStoreRepositoryContract((title, runScenario) => {
    it(title, async () => {
      await runScenario(fakeHarness());
    });
  });
});

describe('the store repository contract', () => {
  it('gives every scenario its own title, so none is hidden behind another', () => {
    const titles: string[] = [];
    describeStoreRepositoryContract((title) => titles.push(title));

    expect(titles.length).toBeGreaterThan(0);
    expect(new Set(titles).size).toBe(titles.length);
  });
});

const postgresHarness = async ({
  app,
  pool,
  schools,
}: {
  app: Fixtures['app'];
  pool: Fixtures['pool'];
  schools: TwoSchoolsWithoutStudents;
}): Promise<StoreHarness> => ({
  repository: app.get(StoreRepository),
  schoolA: schools.orgA.id,
  schoolB: schools.orgB.id,
  userId: schools.owner.id,
  levels: {
    jss1: await classLevelId(pool, schools.orgA.id, 'JSS1'),
    jss2: await classLevelId(pool, schools.orgA.id, 'JSS2'),
    otherSchool: await classLevelId(pool, schools.orgB.id, 'JSS1'),
  },
  campuses: { lekki: schools.lekki.id, ikeja: schools.ikeja.id },
});

test.describe('KyselyStoreRepository', () => {
  describeStoreRepositoryContract((title, runScenario) => {
    test(title, async ({ app, pool, schools }) => {
      await runScenario(await postgresHarness({ app, pool, schools }));
    });
  });
});
