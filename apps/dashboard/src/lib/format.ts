const DATE_FORMAT = new Intl.DateTimeFormat('en-NA', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

/** Format an ISO date string for display, e.g. "12 Jun 2026". */
export const formatDate = (iso: string | null | undefined): string =>
  iso ? DATE_FORMAT.format(new Date(iso)) : '—';
