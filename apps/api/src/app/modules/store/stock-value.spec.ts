import { averageCost, receiveValue } from './stock-value';

describe('receiveValue', () => {
  it('multiplies the quantity by the unit cost', () => {
    expect(receiveValue(10, 350_000)).toBe(3_500_000);
    expect(receiveValue(1, 1)).toBe(1);
  });
});

describe('averageCost', () => {
  it('is the value over the quantity when it divides exactly', () => {
    expect(averageCost(3_500_000, 10)).toBe(350_000);
  });

  it('rounds half up', () => {
    expect(averageCost(5, 2)).toBe(3);
    expect(averageCost(7, 3)).toBe(2);
    expect(averageCost(8, 3)).toBe(3);
    expect(averageCost(1, 3)).toBe(0);
  });

  it('is 0 when nothing is on hand', () => {
    expect(averageCost(0, 0)).toBe(0);
    expect(averageCost(500, 0)).toBe(0);
    expect(averageCost(500, -2)).toBe(0);
  });

  it('blends a later delivery at a different cost', () => {
    const value = receiveValue(10, 350_000) + receiveValue(5, 400_000);
    expect(averageCost(value, 15)).toBe(366_667);
  });
});
