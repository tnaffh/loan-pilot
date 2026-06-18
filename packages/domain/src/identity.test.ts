import {
  ageOnDate,
  isAdult,
  isNamibianId,
  isPlausibleId,
  isPlausiblePhone,
  normalizePhone,
  parseNamibianId,
} from './identity';

const TODAY = new Date('2026-06-18T00:00:00Z');

describe('parseNamibianId', () => {
  it('decodes the YYMMDD birth block of an 11-digit ID', () => {
    expect(parseNamibianId('90031500123', TODAY)).toEqual({
      isNamibianId: true,
      dateOfBirth: '1990-03-15',
    });
  });

  it('reads a 2000s century when the date is not in the future', () => {
    expect(parseNamibianId('05011000089', TODAY)).toEqual({
      isNamibianId: true,
      dateOfBirth: '2005-01-10',
    });
  });

  it('falls back to the 1900s when a 2000s reading would be in the future', () => {
    // "55" → 2055 is in the future, so it must be 1955.
    expect(parseNamibianId('55070100042', TODAY).dateOfBirth).toBe('1955-07-01');
  });

  it('tolerates spaces and dashes', () => {
    expect(parseNamibianId('900315 00123', TODAY).dateOfBirth).toBe('1990-03-15');
  });

  it('rejects the wrong length', () => {
    expect(parseNamibianId('12345', TODAY)).toEqual({ isNamibianId: false });
  });

  it('rejects an impossible month or day', () => {
    expect(parseNamibianId('90133500123', TODAY).isNamibianId).toBe(false);
  });
});

describe('isPlausibleId', () => {
  it('accepts a Namibian national ID', () => {
    expect(isNamibianId('90031500123')).toBe(true);
    expect(isPlausibleId('90031500123')).toBe(true);
  });

  it('accepts passport-style identifiers', () => {
    expect(isPlausibleId('A1234567')).toBe(true);
  });

  it('rejects values that are too short', () => {
    expect(isPlausibleId('123')).toBe(false);
  });
});

describe('phone helpers', () => {
  it('normalises separators', () => {
    expect(normalizePhone('+264 81 123-4567')).toBe('+264811234567');
  });

  it('accepts Namibian and international forms', () => {
    expect(isPlausiblePhone('0811234567')).toBe(true);
    expect(isPlausiblePhone('+264811234567')).toBe(true);
  });

  it('rejects too-short numbers', () => {
    expect(isPlausiblePhone('1234')).toBe(false);
  });
});

describe('age helpers', () => {
  it('computes whole years, accounting for the month/day', () => {
    expect(ageOnDate('2000-06-18', TODAY)).toBe(26);
    expect(ageOnDate('2000-06-19', TODAY)).toBe(25);
  });

  it('treats an exactly-18 birthday as an adult', () => {
    expect(isAdult('2008-06-18', TODAY)).toBe(true);
  });

  it('blocks under-18 applicants', () => {
    expect(isAdult('2010-01-01', TODAY)).toBe(false);
  });

  it('rejects unparseable dates', () => {
    expect(ageOnDate('not-a-date', TODAY)).toBeNull();
    expect(isAdult('not-a-date', TODAY)).toBe(false);
  });
});
