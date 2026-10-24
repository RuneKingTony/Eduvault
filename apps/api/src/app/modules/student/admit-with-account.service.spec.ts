import type { AdmitStudentResult } from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import type { ReservedAccountService } from '../gateway/reserved-account.service';
import { AdmitWithAccountService } from './admit-with-account.service';
import type { AdmissionService } from './admission.service';

const ctx = { organizationId: 'school-a' } as OrgContext;

const admitted = (
  guardians: { guardianId: string; paysFees: boolean }[] | undefined
) => ({ student: { guardians } }) as unknown as AdmitStudentResult;

function setup(result: AdmitStudentResult) {
  const events: string[] = [];
  const admissions = {
    admit: () => {
      events.push('admitted');
      return Promise.resolve(result);
    },
  } as unknown as AdmissionService;
  const reservedAccounts = {
    tryEnsureForGuardian: (_organizationId: string, guardianId: string) => {
      events.push(`account:${guardianId}`);
      return Promise.resolve();
    },
  } as unknown as ReservedAccountService;
  return {
    events,
    service: new AdmitWithAccountService(admissions, reservedAccounts),
  };
}

describe('AdmitWithAccountService.admit', () => {
  it('asks for an account for each paying guardian after the admission, and answers with the admission unchanged', async () => {
    const result = admitted([
      { guardianId: 'mother', paysFees: true },
      { guardianId: 'uncle', paysFees: false },
      { guardianId: 'father', paysFees: true },
    ]);
    const { events, service } = setup(result);

    await expect(
      service.admit(ctx, {} as Parameters<typeof service.admit>[1])
    ).resolves.toBe(result);

    expect(events).toEqual(['admitted', 'account:mother', 'account:father']);
  });

  it('has nothing to ask for when no guardian was linked', async () => {
    const { events, service } = setup(admitted(undefined));

    await service.admit(ctx, {} as Parameters<typeof service.admit>[1]);

    expect(events).toEqual(['admitted']);
  });
});
