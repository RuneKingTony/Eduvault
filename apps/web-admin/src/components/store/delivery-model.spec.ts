import {
  DELIVERY_ACCOUNT_MESSAGE,
  DELIVERY_FUTURE_DATE_MESSAGE,
  DELIVERY_REQUIRED_MESSAGE,
  DELIVERY_UNIT_COST_MESSAGE,
  OPENING_STOCK_SUPPLIER,
} from '@eduvault/api-contract';
import {
  deliveryRequest,
  eligibleAccounts,
  initialDelivery,
  totalMinor,
  validateDelivery,
  withCampus,
  withLine,
  withLoaded,
  withOpening,
} from './delivery-model';

const TODAY = '2026-10-07';

const accounts = [
  { id: 'bank', kind: 'bank', campusId: null, retiredAt: null },
  { id: 'lekki-cash', kind: 'cash', campusId: 'lekki', retiredAt: null },
  { id: 'ikeja-pos', kind: 'pos', campusId: 'ikeja', retiredAt: null },
  { id: 'card', kind: 'gateway', campusId: null, retiredAt: null },
  {
    id: 'old',
    kind: 'bank',
    campusId: null,
    retiredAt: '2026-01-01T00:00:00.000Z',
  },
] as const;

const items = [
  { id: 'shirt', costPriceMinor: 350_000 },
  { id: 'tie', costPriceMinor: 120_000 },
];

const ready = () =>
  withLoaded(
    { ...initialDelivery('DEL-REQ-1', 'lekki', TODAY), supplier: 'Adebayo' },
    items,
    accounts
  );

describe('eligibleAccounts', () => {
  it('keeps open, non-gateway accounts that are school-wide or on the campus', () => {
    expect(eligibleAccounts(accounts, 'lekki').map((a) => a.id)).toEqual([
      'bank',
      'lekki-cash',
    ]);
  });
});

describe('withLoaded', () => {
  it('prefills each unit cost from the cost price and picks the first account', () => {
    const state = ready();
    expect(state.lines['shirt']).toEqual({ quantity: '', unitCost: '3500' });
    expect(state.lines['tie']).toEqual({ quantity: '', unitCost: '1200' });
    expect(state.accountId).toBe('bank');
  });

  it('keeps what was typed when the items arrive again', () => {
    const typed = withLine(ready(), 'shirt', { quantity: '10' });
    expect(withLoaded(typed, items, accounts).lines['shirt']?.quantity).toBe(
      '10'
    );
  });
});

describe('withCampus', () => {
  it('moves to the first eligible account when the paying one no longer fits', () => {
    const state = withCampus(
      { ...ready(), accountId: 'lekki-cash' },
      'ikeja',
      accounts
    );
    expect(state.campusId).toBe('ikeja');
    expect(state.accountId).toBe('bank');
  });

  it('keeps an account that fits both campuses', () => {
    expect(withCampus(ready(), 'ikeja', accounts).accountId).toBe('bank');
  });
});

describe('withOpening', () => {
  it('defaults an empty supplier to the opening stock count and back', () => {
    const on = withOpening({ ...ready(), supplier: '' }, true);
    expect(on.supplier).toBe(OPENING_STOCK_SUPPLIER);
    expect(withOpening(on, false).supplier).toBe('');
  });

  it('keeps a supplier the user typed', () => {
    expect(withOpening(ready(), true).supplier).toBe('Adebayo');
  });
});

describe('validateDelivery', () => {
  it('needs a supplier and at least one quantity', () => {
    expect(validateDelivery(ready(), TODAY)).toBe(DELIVERY_REQUIRED_MESSAGE);
    const noSupplier = withLine({ ...ready(), supplier: ' ' }, 'shirt', {
      quantity: '2',
    });
    expect(validateDelivery(noSupplier, TODAY)).toBe(DELIVERY_REQUIRED_MESSAGE);
  });

  it('needs a unit cost above zero on every line received', () => {
    const state = withLine(
      withLine(ready(), 'shirt', { quantity: '2' }),
      'tie',
      {
        quantity: '1',
        unitCost: '',
      }
    );
    expect(validateDelivery(state, TODAY)).toBe(DELIVERY_UNIT_COST_MESSAGE);
    const free = withLine(ready(), 'shirt', { quantity: '2', unitCost: '0' });
    expect(validateDelivery(free, TODAY)).toBe(DELIVERY_UNIT_COST_MESSAGE);
  });

  it('ignores a unit cost on a line with no quantity', () => {
    const state = withLine(
      withLine(ready(), 'shirt', { quantity: '2' }),
      'tie',
      {
        unitCost: '',
      }
    );
    expect(validateDelivery(state, TODAY)).toBeUndefined();
  });

  it('refuses a future date', () => {
    const state = withLine({ ...ready(), receivedOn: '2026-10-08' }, 'shirt', {
      quantity: '1',
    });
    expect(validateDelivery(state, TODAY)).toBe(DELIVERY_FUTURE_DATE_MESSAGE);
  });

  it('needs a money account, except for opening stock', () => {
    const noAccount = withLine({ ...ready(), accountId: '' }, 'shirt', {
      quantity: '1',
    });
    expect(validateDelivery(noAccount, TODAY)).toBe(DELIVERY_ACCOUNT_MESSAGE);
    expect(
      validateDelivery({ ...noAccount, opening: true }, TODAY)
    ).toBeUndefined();
  });

  it('treats a quantity that is not a whole number as none', () => {
    const state = withLine(ready(), 'shirt', { quantity: '1.5' });
    expect(validateDelivery(state, TODAY)).toBe(DELIVERY_REQUIRED_MESSAGE);
  });
});

describe('deliveryRequest', () => {
  const state = withLine(
    withLine(ready(), 'shirt', { quantity: '10' }),
    'tie',
    {
      quantity: '4',
      unitCost: '1,250.50',
    }
  );

  it('sends the lines received, in minor units, with the money account', () => {
    expect(deliveryRequest(state)).toEqual({
      reference: 'DEL-REQ-1',
      campusId: 'lekki',
      supplierName: 'Adebayo',
      moneyAccountId: 'bank',
      receivedOn: TODAY,
      lines: [
        { itemId: 'shirt', quantity: 10, unitCostMinor: 350_000 },
        { itemId: 'tie', quantity: 4, unitCostMinor: 125_050 },
      ],
    });
  });

  it('marks opening stock and sends no account', () => {
    const request = deliveryRequest({ ...state, opening: true });
    expect(request.isOpening).toBe(true);
    expect(request).not.toHaveProperty('moneyAccountId');
  });

  it('totals quantity times unit cost', () => {
    expect(totalMinor(state)).toBe(10 * 350_000 + 4 * 125_050);
  });
});
