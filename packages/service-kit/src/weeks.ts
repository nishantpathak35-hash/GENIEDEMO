/**
 * A calendar grid of ISO weeks, for a series a screen draws as a sparkline.
 *
 * Every service that answers "by week" answers over the SAME grid, built
 * once here and handed to each of them, so the points line up without any
 * service knowing what the others measured. The grid is a calendar, not a
 * figure: it holds no money and computes none.
 *
 * ISO weeks start on Monday; `start` is that Monday as a date string and
 * `end` is the following Monday (exclusive), which is what a SQL range
 * `>= start AND < end` wants. The last week is the one containing `now`, in
 * the calendar day of Asia/Kolkata — the only timezone this product's
 * customers file anything in.
 */
export interface IsoWeek {
  /** `2026-W37` */
  readonly isoWeek: string;
  /** Monday, `YYYY-MM-DD` */
  readonly start: string;
  /** The next Monday, `YYYY-MM-DD`, exclusive */
  readonly end: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** The calendar day in Asia/Kolkata as a UTC-midnight Date, so day arithmetic is exact. */
function kolkataDay(now: Date): Date {
  const text = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
  return new Date(`${text}T00:00:00Z`);
}

function isoWeekLabel(monday: Date): string {
  // ISO 8601: the week's year and number are those of its Thursday.
  const thursday = new Date(monday.getTime() + 3 * DAY_MS);
  const year = thursday.getUTCFullYear();
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const week = Math.floor((thursday.getTime() - jan1.getTime()) / DAY_MS / 7) + 1;
  return `${String(year)}-W${String(week).padStart(2, '0')}`;
}

/** The `count` ISO weeks ending with the one that contains `now`, oldest first. */
export function isoWeeksEnding(now: Date, count: number): readonly IsoWeek[] {
  const today = kolkataDay(now);
  // getUTCDay: Sunday 0 … Saturday 6; Monday is the ISO start.
  const back = (today.getUTCDay() + 6) % 7;
  const thisMonday = new Date(today.getTime() - back * DAY_MS);
  const weeks: IsoWeek[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const monday = new Date(thisMonday.getTime() - i * 7 * DAY_MS);
    const next = new Date(monday.getTime() + 7 * DAY_MS);
    weeks.push({ isoWeek: isoWeekLabel(monday), start: ymd(monday), end: ymd(next) });
  }
  return weeks;
}
