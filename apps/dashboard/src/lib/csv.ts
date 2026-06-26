/** Escape a single CSV field: wrap in quotes when it contains a comma, quote or
 * newline, doubling any inner quotes (RFC 4180). */
const escapeCell = (value: string | number): string => {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/**
 * Build a CSV from headers + rows and trigger a browser download. Pure
 * client-side (no dependencies): joins the rows, wraps them in a Blob and
 * clicks a temporary anchor. A leading BOM keeps Excel happy with UTF-8.
 */
export const downloadCsv = (
  filename: string,
  headers: string[],
  rows: (string | number)[][],
): void => {
  const lines = [headers, ...rows].map((cells) => cells.map(escapeCell).join(','));
  const blob = new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
