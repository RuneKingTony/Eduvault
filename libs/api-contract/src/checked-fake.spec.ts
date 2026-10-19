import { ApiError } from './client';
import { contractChecked } from './checked-fake';
import { contract } from './contract';

const GUARDIAN = '5b0f1e1e-6e53-4c52-9f1c-0a1d7a7f9c11';

const guardian = (overrides: Record<string, unknown> = {}) => ({
  id: GUARDIAN,
  fullName: 'Ngozi Okeke',
  phone: '08012345678',
  email: null,
  username: 'okeke-family',
  address: null,
  photoUrl: null,
  paysFees: true,
  children: [],
  ...overrides,
});

const fakeWith = (update: ReturnType<typeof vi.fn>) =>
  contractChecked(contract, { guardians: { update } } as never);

describe('contractChecked', () => {
  it('passes a valid call and answer through to the fake', async () => {
    const update = vi.fn().mockResolvedValue(guardian());
    const input = {
      params: { id: GUARDIAN },
      body: { fullName: 'Ngozi Okeke' },
    };

    const answer = await fakeWith(update).guardians.update(input);

    expect(update).toHaveBeenCalledWith(input);
    expect(answer.fullName).toBe('Ngozi Okeke');
  });

  it('refuses an answer the real client would fail to parse', async () => {
    const update = vi.fn().mockResolvedValue(guardian({ id: 'ngozi' }));

    await expect(
      fakeWith(update).guardians.update({
        params: { id: GUARDIAN },
        body: { fullName: 'Ngozi Okeke' },
      })
    ).rejects.toThrow(/guardians\.update answered a body the contract rejects/);
  });

  it('refuses a request the API would answer with a 400', async () => {
    const update = vi.fn().mockResolvedValue(guardian());

    await expect(
      fakeWith(update).guardians.update({
        params: { id: 'ngozi' },
        body: { fullName: 'Ngozi Okeke' },
      })
    ).rejects.toThrow(/called with a params the contract rejects/);
    expect(update).not.toHaveBeenCalled();
  });

  it('lets an ApiError the fake rejects with reach the caller unchanged', async () => {
    const refusal = new ApiError(409, { code: 'Conflict', message: 'taken' });
    const update = vi.fn().mockRejectedValue(refusal);

    await expect(
      fakeWith(update).guardians.update({
        params: { id: GUARDIAN },
        body: { fullName: 'Ngozi Okeke' },
      })
    ).rejects.toBe(refusal);
  });

  it('refuses a fake method the contract does not have', () => {
    expect(() =>
      contractChecked(contract, {
        guardians: { rename: vi.fn() },
      } as never)
    ).toThrow('The fake has guardians.rename, which is not in the contract.');
  });
});
