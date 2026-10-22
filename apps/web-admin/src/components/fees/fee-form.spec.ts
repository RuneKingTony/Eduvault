import { FEE_LINE_AMOUNT_MESSAGE, type FeeType } from '@eduvault/api-contract';
import { EVERY_CAMPUS, defaultFeeTypeId, feeFormBody } from './fee-form';

const types: FeeType[] = [
  { id: 'tuition', code: 4010, name: 'Tuition' },
  { id: 'pta', code: 4020, name: 'PTA fee' },
  { id: 'bus', code: 4030, name: 'School bus' },
];

const formWith = (fields: Record<string, string>) => {
  const data = new FormData();
  const base = {
    classLevelId: '00000000-0000-4000-8000-000000000001',
    feeTypeId: '00000000-0000-4000-8000-000000000002',
    campusId: EVERY_CAMPUS,
    name: 'Tuition',
    amount: '₦15,000',
    appliesTo: 'all',
    ...fields,
  };
  for (const [key, value] of Object.entries(base)) {
    data.set(key, value);
  }
  return data;
};

const extra = {
  termId: '00000000-0000-4000-8000-000000000003',
  isOptional: false,
};

describe('defaultFeeTypeId', () => {
  it('is Tuition on School fees', () => {
    expect(defaultFeeTypeId(types, 'school', undefined)).toBe('tuition');
  });

  it('is the chosen chip, else the first other type, on Other fees', () => {
    expect(defaultFeeTypeId(types, 'other', 'bus')).toBe('bus');
    expect(defaultFeeTypeId(types, 'other', undefined)).toBe('pta');
    expect(defaultFeeTypeId(types, 'other', 'gone')).toBe('pta');
  });

  it('is empty with no fee types', () => {
    expect(defaultFeeTypeId([], 'school', undefined)).toBe('');
  });
});

describe('feeFormBody', () => {
  it('turns the form into a request, reading the amount in naira and every campus as null', () => {
    const result = feeFormBody(formWith({}), extra);
    expect(result).toEqual({
      ok: true,
      body: expect.objectContaining({
        amountMinor: 1_500_000,
        campusId: null,
        appliesTo: 'all',
        isOptional: false,
        name: 'Tuition',
      }),
    });
  });

  it('keeps a campus id', () => {
    const campusId = '00000000-0000-4000-8000-000000000009';
    const result = feeFormBody(formWith({ campusId }), extra);
    expect(result).toMatchObject({ ok: true, body: { campusId } });
  });

  it('says Enter an amount for a missing, zero or unreadable amount', () => {
    for (const amount of ['', '0', 'abc']) {
      expect(feeFormBody(formWith({ amount }), extra)).toEqual({
        ok: false,
        message: FEE_LINE_AMOUNT_MESSAGE,
      });
    }
  });

  it('asks for a name', () => {
    expect(feeFormBody(formWith({ name: '  ' }), extra)).toEqual({
      ok: false,
      message: 'Give the fee a name.',
    });
  });
});
