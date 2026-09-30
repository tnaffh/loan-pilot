const DAY_MS = 24 * 60 * 60 * 1000;

/** "14 Oct 2026" */
export const formatDate = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

/** "14 Oct" */
export const formatShortDate = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

/** Whole calendar days from today to `iso` (negative when past). */
export const daysUntil = (iso: string, now: Date = new Date()): number => {
  const startOfDay = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((startOfDay(new Date(iso)) - startOfDay(now)) / DAY_MS);
};

/** "Due today", "Due in 3 days", "2 days overdue". */
export const describeDue = (iso: string): string => {
  const days = daysUntil(iso);
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days > 1) return `Due in ${days} days`;
  return `${-days} day${days === -1 ? '' : 's'} overdue`;
};

/** A short, readable reference for an id (the web result screen shows 10 chars). */
export const shortRef = (id: string): string => id.slice(0, 10).toUpperCase();

export const firstName = (name: string | undefined): string => name?.split(' ')[0] ?? '';

/** "+264812345567" → "+264 81 234 5567"; other numbers are left as they are. */
export const formatPhone = (phone: string | null | undefined): string => {
  if (!phone) return '';
  const match = /^\+264(\d{2})(\d{3})(\d{3,4})$/.exec(phone);
  return match ? `+264 ${match[1]} ${match[2]} ${match[3]}` : phone;
};
