import { averageCost, receiveValue, takeValue } from './stock-value';

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
    expect(averageCost(1, 2)).toBe(1);
    expect(averageCost(3, 2)).toBe(2);
    expect(averageCost(0, 5)).toBe(0);
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

describe('takeValue', () => {
  it('takes units at the blended average of two deliveries', () => {
    const value = receiveValue(10, 300_000) + receiveValue(10, 350_000);
    expect(takeValue(value, 20, 2)).toBe(650_000);
  });

  it('rounds a share half up and gives the last units whatever is left', () => {
    expect(takeValue(1_000_000, 3, 1)).toBe(333_333);
    expect(takeValue(1_000_000, 3, 3)).toBe(1_000_000);
    expect(takeValue(1_000_000 - 333_333, 2, 2)).toBe(666_667);
  });

  it('rounds exactly half up', () => {
    expect(takeValue(5, 2, 1)).toBe(3);
    expect(takeValue(1, 2, 1)).toBe(1);
  });

  it('costs nothing for donated stock', () => {
    expect(takeValue(0, 4, 3)).toBe(0);
  });

  it('stays exact where the product passes 2^53', () => {
    const value = 100_000 * 100_000_000;
    expect(takeValue(value, 100_000, 99_999)).toBe(99_999 * 100_000_000);
  });
});
