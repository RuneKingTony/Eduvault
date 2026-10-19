import { NotFoundException } from '@nestjs/common';
import type { NewGuardian } from '@eduvault/api-contract';
import {
  UsernameTakenError,
  type AdmissionRepository,
  type AdmissionWrite,
  type AdmittedGuardian,
} from './admission.repository';
import type { AdmissionTx } from './admission-tx';
import { activityText, admitStudent } from './admit-student';
import { FakeAdmissionTx } from './fake-admission-tx';

const ORG = 'school-a';
const EXISTING = 'guardian-existing';

const write = (overrides: Partial<AdmissionWrite> = {}): AdmissionWrite => ({
  organizationId: ORG,
  actor: { id: 'staff-1', name: 'Tunde' },
  student: {
    firstName: 'Peace',
    lastName: 'Udoh',
    gender: 'F',
    dateOfBirth: '2014-03-03',
  },
  arm: {
    id: 'arm-1',
    levelId: 'level-8',
    levelName: 'JSS 2',
    name: 'Gold',
    campusId: 'lekki',
    campusName: 'Lekki',
  },
  term: {
    termId: 'term-1',
    termName: 'First term',
    sessionId: 'session-1',
    sessionName: '2026/2027',
  },
  startsLater: false,
  school: { prefix: 'GF', slug: 'greenfield' },
  studentPasswordHash: 'hash:student',
  guardians: [],
  ...overrides,
});

const newGuardian = {
  fullName: 'Mrs Udoh',
  phone: '08012345678',
  address: '4 Palm Close',
  relationship: 'mother',
  paysFees: true,
  login: { kind: 'username' },
} as NewGuardian;

const draftNew = {
  kind: 'new' as const,
  guardian: newGuardian,
  passwordHash: 'hash:guardian',
};

const draftExisting = {
  kind: 'existing' as const,
  guardianId: EXISTING,
  relationship: 'father' as const,
  paysFees: false,
};

interface Script {
  clashes?: number;
  failure?: Error;
}

const repository = (script: Script = {}) => {
  const txs: FakeAdmissionTx[] = [];
  let clashes = script.clashes ?? 0;
  const admissions: Pick<AdmissionRepository, 'today' | 'transaction'> = {
    today: () => '2026-10-11',
    async transaction<T>(fn: (tx: AdmissionTx) => Promise<T>): Promise<T> {
      const tx = new FakeAdmissionTx();
      tx.guardians.set(EXISTING, {
        id: EXISTING,
        organizationId: ORG,
        fullName: 'Ifeanyi Okeke',
        phone: '08011112222',
        email: null,
        address: '4 Palm Close',
        photoFileId: null,
        userId: 'user-existing',
        createdBy: 'staff-1',
      });
      txs.push(tx);
      const result = await fn(tx);
      if (script.failure !== undefined) {
        throw script.failure;
      }
      if (clashes > 0) {
        clashes -= 1;
        throw new UsernameTakenError();
      }
      return result;
    },
  };
  return { admissions, txs };
};

describe('admitStudent', () => {
  it('writes in order: number, student, enrolment, student login, link, guardians, activity', async () => {
    const { admissions, txs } = repository();

    const outcome = await admitStudent(
      admissions,
      write({ guardians: [draftNew, draftExisting] })
    );

    expect(txs[0]?.steps).toEqual([
      'number',
      'student',
      'enrolment',
      'login:student',
      'link-login',
      'login:guardian',
      'guardian',
      'activity',
    ]);
    expect(outcome).toMatchObject({
      admissionNumber: 'GF-0234',
      studentUsername: 'greenfield-0234',
    });
  });

  it('stamps the student, enrolment and login from the write and the clock', async () => {
    const { admissions, txs } = repository();

    await admitStudent(admissions, write());

    const [tx] = txs;
    expect(tx?.admitted[0]).toMatchObject({
      organizationId: ORG,
      campusId: 'lekki',
      admissionNumber: 'GF-0234',
      admittedOn: '2026-10-11',
      createdBy: 'staff-1',
    });
    expect(tx?.enrolments[0]).toMatchObject({
      studentId: tx?.admitted[0]?.id,
      sessionId: 'session-1',
      levelId: 'level-8',
      termId: 'term-1',
      classArmId: 'arm-1',
      campusId: 'lekki',
    });
    expect(tx?.linked[0]).toEqual({
      organizationId: ORG,
      studentId: tx?.admitted[0]?.id,
      userId: [...(tx?.users.keys() ?? [])][0],
    });
  });

  it('answers 404 when an existing guardian is gone', async () => {
    const { admissions } = repository();

    await expect(
      admitStudent(
        admissions,
        write({
          guardians: [{ ...draftExisting, guardianId: 'guardian-gone' }],
        })
      )
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('retries the whole transaction once when the username is taken', async () => {
    const { admissions, txs } = repository({ clashes: 1 });

    const outcome = await admitStudent(admissions, write());

    expect(txs).toHaveLength(2);
    expect(txs[1]?.steps[0]).toBe('number');
    expect(outcome.admissionNumber).toBe('GF-0234');
  });

  it('answers the second clash itself and does not retry again', async () => {
    const { admissions, txs } = repository({ clashes: 2 });

    await expect(admitStudent(admissions, write())).rejects.toBeInstanceOf(
      UsernameTakenError
    );
    expect(txs).toHaveLength(2);
  });

  it('does not retry any other failure', async () => {
    const { admissions, txs } = repository({ failure: new Error('boom') });

    await expect(admitStudent(admissions, write())).rejects.toThrow('boom');
    expect(txs).toHaveLength(1);
  });
});

const admitted = (...names: string[]): AdmittedGuardian[] =>
  names.map((name, index) => ({
    guardianId: `guardian-${index}`,
    name,
    relationship: 'mother',
    isNew: true,
    newLogin: true,
    email: null,
    username: null,
  }));

describe('activityText', () => {
  it.each([
    {
      name: 'no guardian',
      names: [],
      startsLater: false,
      text: 'Peace Udoh admitted (GF-0234), placed in JSS 2 Gold, with no guardian yet.',
    },
    {
      name: 'one guardian',
      names: ['Mrs Udoh'],
      startsLater: false,
      text: 'Peace Udoh admitted (GF-0234), placed in JSS 2 Gold, with Mrs Udoh as guardian.',
    },
    {
      name: 'two guardians starting next term',
      names: ['Mrs Udoh', 'Mr Udoh'],
      startsLater: true,
      text: 'Peace Udoh admitted (GF-0234), placed in JSS 2 Gold from First term, with Mrs Udoh and Mr Udoh as guardians.',
    },
  ])('words $name', ({ names, startsLater, text }) => {
    expect(
      activityText(write({ startsLater }), 'GF-0234', admitted(...names))
    ).toBe(text);
  });
});
