import { formatShortDate } from 'devgrowth-core/schedule';

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Parse a local `YYYY-MM-DD` key (as stored in events) into a local Date. */
export function fromDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** "Aug 10" from a `YYYY-MM-DD` key. */
export function shortDateFromKey(key) {
  return formatShortDate(fromDateKey(key));
}
