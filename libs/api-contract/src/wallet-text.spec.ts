import { movementTitle, traceFacts } from './wallet-text';

describe('movementTitle', () => {
  it('names a top-up by its depositor and way of paying', () => {
    expect(
      movementTitle({
        studentName: null,
        source: {
          type: 'topup',
          method: 'transfer',
          depositorName: 'Uncle Bode',
        },
      })
    ).toBe('Top-up from Uncle Bode · Bank transfer');
    expect(
      movementTitle({
        studentName: null,
        source: { type: 'topup', method: 'cash', depositorName: null },
      })
    ).toBe('Top-up · Cash');
  });

  it('calls an online top-up Monnify and a spend by the child it paid', () => {
    expect(
      movementTitle({ studentName: null, source: { type: 'monnify' } })
    ).toBe('Online top-up · Monnify');
    expect(
      movementTitle({ studentName: 'Ada Okeke', source: { type: 'spend' } })
    ).toBe('Paid Ada Okeke’s charges');
    expect(movementTitle({ studentName: null, source: null })).toBe(
      'Paid from wallet'
    );
  });

  it('says Auto-paid for a spend auto-pay made', () => {
    expect(
      movementTitle({
        studentName: 'Ada Okeke',
        source: { type: 'spend', automatic: true },
      })
    ).toBe('Auto-paid Ada Okeke’s charges');
    expect(
      movementTitle({
        studentName: null,
        source: { type: 'spend', automatic: true },
      })
    ).toBe('Auto-paid from wallet');
  });
});

describe('traceFacts', () => {
  it('lists the Monnify chain from reference to the credited amount', () => {
    const facts = traceFacts(
      {
        type: 'monnify',
        transactionReference: 'MNFY|20|1',
        paymentReference: 'PAY-1',
        signatureVerified: true,
        paidAt: '2026-10-24T08:00:00.000Z',
        confirmedAt: '2026-10-24T08:00:05.000Z',
        grossMinor: 5_000_000,
        feeMinor: 50_000,
        netMinor: 4_950_000,
      },
      { reference: 'MNFY|20|1', currency: 'NGN' }
    );
    expect(facts.map((fact) => fact.label)).toEqual([
      'Monnify reference',
      'Payment reference',
      'Signature check',
      'Confirmation',
      'Paid on',
      'Paid by the family',
      'Monnify fee',
      'Credited to the wallet',
      'Journal entry',
    ]);
    expect(facts.find((fact) => fact.label === 'Monnify fee')?.value).toBe(
      '₦500.00'
    );
    expect(
      facts.find((fact) => fact.label === 'Credited to the wallet')?.value
    ).toBe('₦49,500.00');
    expect(facts.find((fact) => fact.label === 'Signature check')?.value).toBe(
      'Valid'
    );
  });
});
