/** Date helpers shared by loan scheduling on the API and dashboards. */

/** Returns a new Date shifted forward by the given number of calendar months. */
export const addMonths = (date: Date, months: number): Date => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
};

/** Whole days from `from` to `to`, clamped to zero when `to` is not after `from`. */
export const daysBetween = (from: Date, to: Date): number => {
  const msPerDay = 86_400_000;
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / msPerDay));
};

/**
 * Complete calendar months from `from` to `to`, clamped to zero. A month counts
 * only once its day-of-month anniversary is reached (so it lines up with how
 * `addMonths` builds repayment due dates). E.g. Jan 15 → Feb 14 is 0; Feb 15 is 1.
 */
export const completeMonthsBetween = (from: Date, to: Date): number => {
  if (to.getTime() <= from.getTime()) {
    return 0;
  }
  const months =
    (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  const anniversaryNotReached = to.getDate() < from.getDate();
  return Math.max(0, months - (anniversaryNotReached ? 1 : 0));
};
