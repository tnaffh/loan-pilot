/**
 * Human-readable names for the PDFs this API produces, so a download lands as
 * "Loan Agreement - Selma Nghidinwa - 2026-09-22.pdf" rather than the opaque
 * storage key it is kept under.
 */

/** Characters that are unsafe in a file name on any common OS. */
const UNSAFE = /[\\/:*?"<>|]+/g;

/** Collapse a free-text part (a borrower's name) into something file-name safe. */
const safePart = (value: string): string =>
  Array.from(value)
    // Control characters (below space) have no place in a file name either.
    .filter((char) => char.charCodeAt(0) >= 32)
    .join('')
    .replace(UNSAFE, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** `YYYY-MM-DD` of a date, for sortable file names. */
const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

/** e.g. `documentFileName('Loan Agreement', 'Selma N', date)` → "Loan Agreement - Selma N - 2026-09-22.pdf". */
export const documentFileName = (kind: string, subject: string, date: Date, ext = 'pdf'): string =>
  [kind, safePart(subject), isoDay(date)].filter((part) => part.length > 0).join(' - ') + `.${ext}`;

/**
 * A `Content-Disposition: attachment` header value that survives non-ASCII
 * names: the plain `filename` carries an ASCII fallback, `filename*` the UTF-8
 * original (RFC 6266 / 5987).
 */
export const attachmentDisposition = (fileName: string): string => {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");
  const encoded = encodeURIComponent(fileName).replace(/['()*]/g, (c) =>
    `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
};
