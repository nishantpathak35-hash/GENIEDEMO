/**
 * The calendar Today's panels are drawn over, built once here and handed to
 * each service — the same reason `weeks.ts` exists: every service that answers
 * "by month" or "this week" answers over the SAME window, without any service
 * knowing what the others measured. A window holds no money and computes none.
 *
 * India's financial year runs April to March, and its business week Monday to
 * Sunday; both are taken on the calendar day in Asia/Kolkata, the only zone
 * this product's customers file anything in.
 */

/** Today's date in India, `YYYY-MM-DD`. */
export function todayInIndia(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_LABEL = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const DAY_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

function assertDate(day: string): void {
  if (!ISO_DATE.test(day)) throw new RangeError(`not an ISO date: ${JSON.stringify(day)}`);
}

/** `days` after (or before, negative) a `YYYY-MM-DD`, at UTC midnight so day arithmetic is exact. */
export function addDays(day: string, days: number): string {
  assertDate(day);
  const at = new Date(`${day}T00:00:00Z`);
  return new Date(at.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  assertDate(from);
  assertDate(to);
  return Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / DAY_MS);
}

/** "Mon", "Tue" … for a `YYYY-MM-DD`. */
export function weekdayLabel(day: string): string {
  assertDate(day);
  return DAY_LABEL[new Date(`${day}T00:00:00Z`).getUTCDay()] ?? '';
}

export interface BusinessWeek {
  /** Monday. */
  readonly start: string;
  /** Sunday — the week's own, so a Sunday ends its week. */
  readonly end: string;
}

/** The Monday-to-Sunday week containing `today`. */
export function businessWeek(today: string): BusinessWeek {
  assertDate(today);
  const at = new Date(`${today}T00:00:00Z`);
  const back = (at.getUTCDay() + 6) % 7;
  const start = addDays(today, -back);
  return { start, end: addDays(start, 6) };
}

export type FinancialPeriod = 'fy' | 'q';

export interface FinancialWindow {
  readonly period: FinancialPeriod;
  /** "FY 2026-27", "Q2 2026-27". */
  readonly label: string;
  /** The financial year as a screen prints it, "2026-27". */
  readonly financialYear: string;
  /** First and last month of the window, `YYYY-MM`; `to` is the month of `today`. */
  readonly from: string;
  readonly to: string;
  /** First day of the window and the day after its last month — what a SQL range `>= start AND < end` wants. */
  readonly start: string;
  readonly end: string;
  /** Every month in the window, oldest first. */
  readonly months: ReadonlyArray<{ readonly month: string; readonly label: string }>;
}

/** `YYYY-MM` for a year and a 1-based month. */
function ym(year: number, month: number): string {
  return `${String(year)}-${String(month).padStart(2, '0')}`;
}

/**
 * The financial year to date, or the quarter to date, ending with the month
 * that holds `today`. April to March: a day in January 2027 is in FY 2026-27,
 * and in its fourth quarter.
 */
export function financialWindow(today: string, period: FinancialPeriod): FinancialWindow {
  assertDate(today);
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const fyStartYear = month >= 4 ? year : year - 1;
  const financialYear = `${String(fyStartYear)}-${String(fyStartYear + 1).slice(2)}`;
  // months since April, 0..11
  const sinceApril = (month - 4 + 12) % 12;
  const firstOffset = period === 'fy' ? 0 : Math.floor(sinceApril / 3) * 3;
  const months: Array<{ month: string; label: string }> = [];
  for (let offset = firstOffset; offset <= sinceApril; offset += 1) {
    const m = ((offset + 3) % 12) + 1; // April is offset 0
    const y = fyStartYear + (offset + 3 >= 12 ? 1 : 0);
    months.push({ month: ym(y, m), label: MONTH_LABEL[m - 1] ?? '' });
  }
  const first = months[0];
  const last = months[months.length - 1];
  if (first === undefined || last === undefined) throw new RangeError('a window has at least one month');
  const endYear = Number(last.month.slice(0, 4));
  const endMonth = Number(last.month.slice(5, 7));
  const end = endMonth === 12 ? ym(endYear + 1, 1) : ym(endYear, endMonth + 1);
  return {
    period,
    label: period === 'fy' ? `FY ${financialYear}` : `Q${String(Math.floor(sinceApril / 3) + 1)} ${financialYear}`,
    financialYear,
    from: first.month,
    to: last.month,
    start: `${first.month}-01`,
    end: `${end}-01`,
    months,
  };
}
