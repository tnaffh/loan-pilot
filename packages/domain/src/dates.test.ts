import { addMonths, completeMonthsBetween, daysBetween } from './dates';

describe('addMonths', () => {
  it('shifts forward within a year', () => {
    expect(addMonths(new Date('2026-03-15T00:00:00Z'), 2).toISOString()).toBe(
      '2026-05-15T00:00:00.000Z',
    );
  });

  it('rolls over a year boundary', () => {
    expect(addMonths(new Date('2026-11-10T00:00:00Z'), 3).toISOString()).toBe(
      '2027-02-10T00:00:00.000Z',
    );
  });

  it('does not mutate the input date', () => {
    const original = new Date('2026-01-01T00:00:00Z');
    addMonths(original, 5);
    expect(original.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('daysBetween', () => {
  it('counts whole days', () => {
    expect(daysBetween(new Date('2026-06-01T00:00:00Z'), new Date('2026-06-13T00:00:00Z'))).toBe(
      12,
    );
  });

  it('floors partial days', () => {
    expect(daysBetween(new Date('2026-06-01T00:00:00Z'), new Date('2026-06-02T23:00:00Z'))).toBe(
      1,
    );
  });

  it('clamps to zero when the range is negative', () => {
    expect(daysBetween(new Date('2026-06-13T00:00:00Z'), new Date('2026-06-01T00:00:00Z'))).toBe(
      0,
    );
  });
});

describe('completeMonthsBetween', () => {
  it('counts a month only once the day-of-month anniversary is reached', () => {
    expect(completeMonthsBetween(new Date('2026-01-15'), new Date('2026-02-14'))).toBe(0);
    expect(completeMonthsBetween(new Date('2026-01-15'), new Date('2026-02-15'))).toBe(1);
    expect(completeMonthsBetween(new Date('2026-01-15'), new Date('2026-04-15'))).toBe(3);
  });

  it('rolls over year boundaries', () => {
    expect(completeMonthsBetween(new Date('2025-11-10'), new Date('2026-02-10'))).toBe(3);
  });

  it('clamps to zero when `to` is not after `from`', () => {
    expect(completeMonthsBetween(new Date('2026-06-01'), new Date('2026-06-01'))).toBe(0);
    expect(completeMonthsBetween(new Date('2026-06-01'), new Date('2026-05-01'))).toBe(0);
  });
});
