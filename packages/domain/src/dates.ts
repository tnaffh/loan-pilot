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
