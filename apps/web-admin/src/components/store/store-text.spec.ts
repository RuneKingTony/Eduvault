import {
  COUNT_APPLIED_MESSAGE,
  COUNT_MATCHED_MESSAGE,
  COUNT_STATUS_LABELS,
  countSubmittedMessage,
  countedItemsText,
  countWaitingMessage,
  differenceText,
  saleRecordedMessage,
  termSoldNote,
  deliveryRecordedMessage,
  newDeliveryReference,
  scopeNote,
  storeDescription,
  stockTone,
  stockValueNote,
} from './store-text';

const lekki = { id: 'c1', name: 'Lekki' };
const ikeja = { id: 'c2', name: 'Ikeja' };

describe('storeDescription', () => {
  it('names the chosen campus', () => {
    expect(
      storeDescription({
        campuses: [lekki, ikeja],
        allCampuses: true,
        selectedId: 'c2',
      })
    ).toBe('Books and uniforms · Ikeja campus');
  });

  it('says All campuses for a viewer who sees every campus', () => {
    expect(scopeNote({ campuses: [lekki, ikeja], allCampuses: true })).toBe(
      'All campuses'
    );
  });

  it('lists the campuses of a narrower viewer', () => {
    expect(scopeNote({ campuses: [lekki], allCampuses: false })).toBe(
      'Lekki campus'
    );
    expect(scopeNote({ campuses: [lekki, ikeja], allCampuses: false })).toBe(
      'Lekki, Ikeja campus'
    );
  });
});

describe('stockTone', () => {
  it('is out at zero, low at or below the level and ok above it', () => {
    expect(stockTone(0, 5)).toBe('out');
    expect(stockTone(-1, 5)).toBe('out');
    expect(stockTone(5, 5)).toBe('low');
    expect(stockTone(6, 5)).toBe('ok');
  });
});

describe('stockValueNote', () => {
  it('counts the items that are low or out', () => {
    expect(stockValueNote(1)).toBe('At cost · 1 item low or out');
    expect(stockValueNote(3)).toBe('At cost · 3 items low or out');
  });
});

describe('deliveryRecordedMessage', () => {
  it('names the number, total and money account', () => {
    expect(
      deliveryRecordedMessage(
        {
          number: 'DEL-2026-0001',
          totalMinor: 3_500_000,
          moneyAccount: { id: 'a1', name: 'GTBank current' },
        },
        'Lekki'
      )
    ).toBe('DEL-2026-0001 recorded: ₦35,000 paid from GTBank current.');
  });

  it('words opening stock by the campus', () => {
    expect(
      deliveryRecordedMessage(
        { number: 'OPEN-STORE-c1', totalMinor: 7_000_000, moneyAccount: null },
        'Lekki'
      )
    ).toBe('Opening stock recorded for Lekki: ₦70,000 at cost.');
  });
});

describe('newDeliveryReference', () => {
  it('is the Lagos date and eight characters of a UUID', () => {
    expect(
      newDeliveryReference(
        '2026-10-07',
        () => '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed'
      )
    ).toBe('DEL-REQ-20261007-1B9D6BCD');
  });

  it('differs between calls', () => {
    expect(newDeliveryReference('2026-10-07')).not.toBe(
      newDeliveryReference('2026-10-07')
    );
  });
});

describe('sale copy', () => {
  it('confirms the sale with its total and receipt', () => {
    expect(
      saleRecordedMessage({
        number: 'ISS-2026-0001',
        totalMinor: 1_350_000,
        receiptNumber: 'RCT-2026-00012',
      })
    ).toBe('ISS-2026-0001: ₦13,500 paid, receipt RCT-2026-00012.');
  });

  it('counts the students served', () => {
    expect(termSoldNote(1)).toBe('1 student served');
    expect(termSoldNote(4)).toBe('4 students served');
  });
});

describe('stock count text', () => {
  it('names the four statuses', () => {
    expect(COUNT_STATUS_LABELS).toEqual({
      matched: 'Matched',
      submitted: 'Waiting',
      approved: 'Approved',
      rejected: 'Declined',
    });
  });

  it('says what happened to a submitted count', () => {
    expect(countSubmittedMessage({ status: 'matched', netValueMinor: 0 })).toBe(
      COUNT_MATCHED_MESSAGE
    );
    expect(
      countSubmittedMessage({ status: 'approved', netValueMinor: 100 })
    ).toBe(COUNT_APPLIED_MESSAGE);
    expect(
      countSubmittedMessage({ status: 'submitted', netValueMinor: 1_166_700 })
    ).toBe('Count submitted. ₦11,667 of differences wait for approval.');
    expect(countWaitingMessage(-325_000)).toBe(
      'Count submitted. ₦3,250 of differences wait for approval.'
    );
  });

  it('counts the items and signs a difference', () => {
    expect(countedItemsText(1)).toBe('1 item counted');
    expect(countedItemsText(12)).toBe('12 items counted');
    expect(differenceText(3)).toBe('+3');
    expect(differenceText(-2)).toBe('−2');
    expect(differenceText(0)).toBe('matches');
  });
});
