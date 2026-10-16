import { sendOrder, type SendableCharge } from './send-order';

const charge = (
  id: string,
  [lastName, firstName]: [string, string],
  admissionNumber: string
): SendableCharge => ({ id, lastName, firstName, admissionNumber });

const idsOf = (charges: readonly SendableCharge[]) =>
  charges.map((entry) => entry.id);

describe('sendOrder', () => {
  it('orders by surname, then first name, then admission number', () => {
    const ordered = sendOrder([
      charge('d', ['Okoro', 'Ada'], 'GF/2026/010'),
      charge('b', ['Adeyemi', 'Zainab'], 'GF/2026/003'),
      charge('a', ['Adeyemi', 'Chidi'], 'GF/2026/004'),
      charge('c', ['Adeyemi', 'Chidi'], 'GF/2026/002'),
    ]);
    expect(idsOf(ordered)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('ignores case and compares admission numbers by their digits', () => {
    const ordered = sendOrder([
      charge('late', ['obi', 'ada'], 'GF/2026/10'),
      charge('early', ['OBI', 'ADA'], 'GF/2026/9'),
    ]);
    expect(idsOf(ordered)).toEqual(['early', 'late']);
  });

  it('falls back to the id so the order never depends on input order', () => {
    const one = charge('b', ['Obi', 'Ada'], 'GF/1');
    const two = charge('a', ['Obi', 'Ada'], 'GF/1');
    expect(idsOf(sendOrder([one, two]))).toEqual(['a', 'b']);
    expect(idsOf(sendOrder([two, one]))).toEqual(['a', 'b']);
  });

  it('leaves the input untouched', () => {
    const input = [charge('b', ['Z', 'Z'], '2'), charge('a', ['A', 'A'], '1')];
    sendOrder(input);
    expect(idsOf(input)).toEqual(['b', 'a']);
  });
});
