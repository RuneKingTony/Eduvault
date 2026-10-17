import {
  lastPurchaseNote,
  methodsText,
  paidByLabel,
  priceListNote,
  priceText,
  sizesText,
  termPurchasesNote,
} from './purchase-text';

describe('purchase text', () => {
  it('words how a purchase was paid', () => {
    expect(paidByLabel('pos')).toBe('Paid by POS');
    expect(paidByLabel('cash')).toBe('Paid by cash');
    expect(paidByLabel('transfer')).toBe('Paid by bank transfer');
  });

  it('lists the ways to pay as a sentence', () => {
    expect(methodsText(['cash', 'pos', 'transfer'])).toBe(
      'cash, POS or bank transfer'
    );
    expect(methodsText(['cash', 'transfer'])).toBe('cash or bank transfer');
    expect(methodsText(['pos'])).toBe('POS');
    expect(methodsText([])).toBe('');
  });

  it('puts the ways to pay in the price list note, or leaves them out', () => {
    expect(priceListNote(['cash', 'pos'])).toBe(
      'Paid at the store by cash or POS. Store items are not added to school fees.'
    );
    expect(priceListNote([])).toBe('Store items are not added to school fees.');
  });

  it('shows one price or a range', () => {
    expect(priceText(450_000, 450_000)).toBe('₦4,500');
    expect(priceText(400_000, 450_000)).toBe('₦4,000 – ₦4,500');
  });

  it('names the sizes or says one size', () => {
    expect(sizesText(['Size 8', 'Size 10'])).toBe('Sizes Size 8, Size 10');
    expect(sizesText([])).toBe('One size');
  });

  it('counts the term’s purchases in the term’s own words', () => {
    expect(termPurchasesNote(1, 'First term')).toBe('1 purchase in first term');
    expect(termPurchasesNote(3, 'First term')).toBe(
      '3 purchases in first term'
    );
    expect(termPurchasesNote(0, null)).toBe('0 purchases');
  });

  it('says what the last purchase came to', () => {
    expect(lastPurchaseNote({ totalMinor: 1_300_000 })).toBe(
      '₦13,000 · paid at the store'
    );
    expect(lastPurchaseNote(undefined)).toBe('Nothing yet');
  });
});
