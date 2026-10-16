import { ConflictException } from '@nestjs/common';
import { LEDGER_CODE_TAKEN_MESSAGE } from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { FakeFeeTypeRepository } from './fake-fee-line.repository';
import { FeeTypeService } from './fee-type.service';

const ctx = { organizationId: 'school-a' } as OrgContext;

describe('FeeTypeService.create', () => {
  it('trims the name and returns the new fee type', async () => {
    const repository = new FakeFeeTypeRepository();
    const created = await new FeeTypeService(repository).create(ctx, {
      name: '  Sports levy ',
    });
    expect(repository.createdNames).toEqual(['Sports levy']);
    expect(created).toEqual({
      id: 'new-type',
      code: 4090,
      name: 'Sports levy',
    });
  });

  it('answers 409 with the duplicate copy for a taken name', async () => {
    const repository = new FakeFeeTypeRepository();
    repository.outcome = { status: 'name_taken' };
    const refused = new FeeTypeService(repository).create(ctx, {
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
      new FeeTypeService(repository).create(ctx, { name: 'Trip' })
    ).rejects.toThrow(LEDGER_CODE_TAKEN_MESSAGE);
  });
});
