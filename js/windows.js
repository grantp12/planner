// Works out which parts of a given day are personal time.
// Weekdays: before work, lunch (only if free), after work.
// Days off: a morning and an afternoon window with midday left open.

import { toMin, weekday } from './time.js';

export const WINDOW_LABELS = {
  beforeWork: 'Before work',
  lunch: 'Lunch',
  afterWork: 'After work',
  weekendAM: 'Morning',
  weekendPM: 'Afternoon',
};

export const ENERGY_WINDOWS = [
  ['beforeWork', 'Before work'],
  ['lunch', 'Lunch'],
  ['afterWork', 'After work'],
  ['weekendAM', 'Weekend mornings'],
  ['weekendPM', 'Weekend afternoons'],
];

export const isWorkday = (s, date) => s.workDays.includes(weekday(date));
export const lunchUsuallyFree = (s, date) => isWorkday(s, date) && s.lunchFreeDays.includes(weekday(date));

const MIDDAY_START = 12 * 60;
const MIDDAY_END = 13 * 60;
const MIN_WINDOW = 15;

export function dayFrame(settings, date, lunchFree) {
  const wake = toMin(settings.wakeTime);
  let bed = toMin(settings.bedTime);
  if (bed <= wake) bed += 1440; // bedtime after midnight
  const workday = isWorkday(settings, date);
  const frame = { date, workday, wake, bed, windows: [] };

  const add = (id, start, end) => {
    if (end - start >= MIN_WINDOW) {
      frame.windows.push({ id, label: WINDOW_LABELS[id], start, end, energy: settings.energy[id] ?? 2 });
    }
  };

  if (workday) {
    const ws = toMin(settings.workStart);
    const we = toMin(settings.workEnd);
    frame.work = { start: ws, end: we };
    frame.lunch = { start: toMin(settings.lunchStart), end: toMin(settings.lunchEnd), free: !!lunchFree };
    add('beforeWork', wake, Math.min(ws - (settings.commuteBefore || 0), bed));
    if (lunchFree) add('lunch', Math.max(frame.lunch.start, ws), Math.min(frame.lunch.end, we));
    add('afterWork', Math.max(we + (settings.commuteAfter || 0), wake), bed);
  } else {
    add('weekendAM', wake, Math.min(MIDDAY_START, bed));
    add('weekendPM', Math.max(MIDDAY_END, wake), bed);
  }
  return frame;
}

export const windowAt = (frame, min) => frame.windows.find((w) => min >= w.start && min < w.end)?.id || 'other';

// Bring a clock time onto the same scale as the frame (for after-midnight bedtimes).
export const normalizeMin = (min, frame) => (frame.bed > 1440 && min < frame.wake ? min + 1440 : min);
