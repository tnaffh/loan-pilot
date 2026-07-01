/**
 * Identity & contact validation shared by the public application form, the
 * lender-captured borrower form, and the NestJS validation pipe.
 *
 * "Smart but lenient": we recognise and decode the 11-digit Namibian national
 * ID (whose first six digits encode the date of birth) and cross-check it
 * against a supplied date of birth, but we still accept passport-style
 * identifiers and international phone numbers so non-Namibian applicants are
 * never blocked.
 */

const MINIMUM_LOAN_AGE = 18;

/** Strip spaces and common separators, returning only the meaningful characters. */
const compact = (value: string): string => value.replace(/[\s.\-()]/g, '');

/** Parse a `YYYY-MM-DD` string into its parts, or null when malformed. */
const parseIsoDate = (iso: string): { year: number; month: number; day: number } | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // Round-trip through a Date to reject impossible days (e.g. 2026-02-31).
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
};

export interface NamibianIdResult {
  /** True when the value is a well-formed 11-digit Namibian national ID. */
  readonly isNamibianId: boolean;
  /** The decoded date of birth as `YYYY-MM-DD`, when derivable. */
  readonly dateOfBirth?: string;
}

/**
 * Detect an 11-digit Namibian national ID and decode the leading `YYMMDD`
 * birth-date block. The century is inferred so the resulting date is not in the
 * future relative to `today` (a 2-digit `05` reads as 2005 unless that is still
 * to come, in which case 1905).
 */
export const parseNamibianId = (value: string, today: Date = new Date()): NamibianIdResult => {
  const digits = compact(value);
  if (!/^\d{11}$/.test(digits)) {
    return { isNamibianId: false };
  }

  const yy = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const day = Number(digits.slice(4, 6));
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return { isNamibianId: false };
  }

  const thisYear = today.getFullYear();
  const candidate = 2000 + yy;
  const year = candidate > thisYear ? 1900 + yy : candidate;
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (!parseIsoDate(iso)) {
    return { isNamibianId: false };
  }
  return { isNamibianId: true, dateOfBirth: iso };
};

/** True for a value that is a valid Namibian national ID. */
export const isNamibianId = (value: string): boolean => parseNamibianId(value).isNamibianId;

/**
 * Accept either a Namibian national ID or a passport-style identifier
 * (6–15 alphanumeric characters). Lenient by design.
 */
export const isPlausibleId = (value: string): boolean => {
  const compacted = compact(value);
  if (isNamibianId(value)) {
    return true;
  }
  return /^[A-Za-z0-9]{6,15}$/.test(compacted);
};

/**
 * True for a synthetic placeholder ID minted during import when the source
 * register had no real ID number (see `import-raccoons.ts`, `NOID-<slug>`).
 * Such borrowers cannot be matched by ID, so intake dedup skips them and the
 * UI flags them for manual cleanup.
 */
export const isPlaceholderId = (value: string): boolean => /^NOID-/i.test(value.trim());

/**
 * True when a stored ID cannot be trusted for dedup — a placeholder, blank, or
 * otherwise implausible value. Used to badge legacy borrowers that predate ID
 * validation so operators can correct or merge them.
 */
export const isUnverifiedId = (value: string): boolean =>
  isPlaceholderId(value) || !isPlausibleId(value);

/** Remove spaces and separators from a phone number for storage/comparison. */
export const normalizePhone = (value: string): string => compact(value);

/**
 * Accept Namibian (`081…`, `+264…`) and international numbers: an optional
 * leading `+` followed by 8–15 digits.
 */
export const isPlausiblePhone = (value: string): boolean =>
  /^\+?\d{8,15}$/.test(normalizePhone(value));

/** Whole years between a `YYYY-MM-DD` birth date and `on`; null when unparseable. */
export const ageOnDate = (dateOfBirth: string, on: Date = new Date()): number | null => {
  const parts = parseIsoDate(dateOfBirth);
  if (!parts) {
    return null;
  }
  let age = on.getFullYear() - parts.year;
  const monthDelta = on.getMonth() + 1 - parts.month;
  if (monthDelta < 0 || (monthDelta === 0 && on.getDate() < parts.day)) {
    age -= 1;
  }
  return age;
};

/** True when the birth date is real, not in the future, and at least 18 years ago. */
export const isAdult = (dateOfBirth: string, on: Date = new Date()): boolean => {
  const age = ageOnDate(dateOfBirth, on);
  return age !== null && age >= MINIMUM_LOAN_AGE && age < 120;
};
