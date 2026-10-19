import { ConflictException } from '@nestjs/common';
import { LEDGER_CODE_TAKEN_MESSAGE } from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import {
  FakeFeeLineRepository,
  FakeFeeTypeRepository,
} from './fake-fee-line.repository';
import { FeeTypeService } from './fee-type.service';

const ctx = {
  organizationId: 'school-a',
  user: { id: 'caller', name: 'Tunde Bakare' },
} as OrgContext;

const serviceOver = (repository: FakeFeeTypeRepository) =>
  new FeeTypeService(repository, new FakeFeeLineRepository());

describe('FeeTypeService.create', () => {
  it('trims the name and returns the new fee type', async () => {
    const repository = new FakeFeeTypeRepository();
    const created = await serviceOver(repository).create(ctx, {
      name: '  Sports levy ',
    });
    expect(repository.createdNames).toEqual(['Sports levy']);
    expect(created).toEqual({
      id: 'new-type',
      code: 4090,
      name: 'Sports levy',
    });
  });

  it('records one school-wide fee_type.created row for a saved type', async () => {
    const repository = new FakeFeeTypeRepository();
    await serviceOver(repository).create(ctx, { name: 'Sports levy' });
    expect(repository.recorded).toEqual([
      {
        organizationId: 'school-a',
        campusId: null,
        pillar: 'finance',
        kind: 'fee_type.created',
        actorUserId: 'caller',
        subjectType: 'fee_type',
        subjectId: 'new-type',
        text: 'Tunde Bakare added the fee type Sports levy (4090).',
        data: { feeTypeId: 'new-type', code: 4090, name: 'Sports levy' },
      },
    ]);
  });

  it.each(['name_taken', 'code_taken'] as const)(
    'records nothing when the outcome is %s',
    async (status) => {
      const repository = new FakeFeeTypeRepository();
      repository.outcome = { status };
      await expect(
        serviceOver(repository).create(ctx, { name: 'Tuition' })
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repository.recorded).toEqual([]);
    }
  );

  it('answers 409 with the duplicate copy for a taken name', async () => {
    const repository = new FakeFeeTypeRepository();
    repository.outcome = { status: 'name_taken' };
    const refused = serviceOver(repository).create(ctx, {
      name: 'Tuition',
    });
    await expect(refused).rejects.toBeInstanceOf(ConflictException);
    await expect(refused).rejects.toThrow(
      'A fee type called Tuition already exists.'
    );
  });

  it('answers 409 asking to try again when two types race for one code', async () => {
    const repository = new FakeFeeTypeRepository();
    repository.outcome = { status: 'code_taken' };
    await expect(
      serviceOver(repository).create(ctx, { name: 'Trip' })
    ).rejects.toThrow(LEDGER_CODE_TAKEN_MESSAGE);
  });
});
