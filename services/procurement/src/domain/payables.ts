/**
 * The calendar a payable is bucketed on.
 *
 * "Due this week" is an Indian business's week, Monday to Sunday, on the
 * calendar date in India — not the server's clock. A bill due on Sunday sits in
 * this week whatever time zone the process happens to run in, and a request at
 * 11 pm in Mumbai is on the Mumbai date.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Today's date in India, `YYYY-MM-DD`. */
export function todayInIndia(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * The Sunday that ends the week containing `today`, and the Sunday after it.
 * Monday to Sunday, so a Sunday ends its own week.
 */
export function weekBounds(today: string): { readonly weekEnds: string; readonly nextWeekEnds: string } {
  if (!ISO_DATE.test(today)) throw new RangeError(`not an ISO date: ${JSON.stringify(today)}`);
  const date = new Date(`${today}T00:00:00Z`);
  const daysToSunday = (7 - date.getUTCDay()) % 7;
  const weekEnds = new Date(date);
  weekEnds.setUTCDate(date.getUTCDate() + daysToSunday);
  const nextWeekEnds = new Date(weekEnds);
  nextWeekEnds.setUTCDate(weekEnds.getUTCDate() + 7);
  return { weekEnds: isoDate(weekEnds), nextWeekEnds: isoDate(nextWeekEnds) };
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
