// Planner-specific data access on top of db.js: defaults, and small helpers
// the views share.

import { get, all, put, del } from './db.js';
import { isWorkday } from './windows.js';

export const DEFAULT_SETTINGS = {
  key: 'main',
  wakeTime: '06:30',
  bedTime: '22:30',
  workDays: [1, 2, 3, 4, 5], // Mon–Fri
  workStart: '09:00',
  workEnd: '17:00',
  lunchStart: '12:00',
  lunchEnd: '13:00',
  lunchFreeDays: [],
  commuteBefore: 0, // minutes
  commuteAfter: 0,
  // 1 = low, 2 = medium, 3 = high
  energy: { beforeWork: 2, lunch: 2, afterWork: 2, weekendAM: 2, weekendPM: 2 },
  onboarded: false,
  onboardedDate: null,
  lastOpened: null,
};

export const REASONS = [
  ['forgot', 'Forgot'],
  ['time', 'Ran out of time'],
  ['mood', "Didn't feel like it"],
  ['distracted', 'Got distracted'],
  ['unrealistic', 'Plan was unrealistic'],
  ['work', 'Work ran late'],
];

export async function getSettings() {
  const s = (await get('settings', 'main')) || {};
  return { ...DEFAULT_SETTINGS, ...s, energy: { ...DEFAULT_SETTINGS.energy, ...(s.energy || {}) } };
}

export const saveSettings = (s) => put('settings', { ...s, key: 'main' });

export async function getRoutine() {
  return (await all('routine')).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

// Weekend routine is optional: if it's empty, weekends use the weekday one.
export function routineFor(routine, settings, date) {
  const variant = isWorkday(settings, date) ? 'weekday' : 'weekend';
  const items = routine.filter((r) => r.variant === variant);
  if (items.length || variant === 'weekday') return items;
  return routine.filter((r) => r.variant === 'weekday');
}

export async function replaceRoutineVariant(variant, items) {
  for (const r of await all('routine')) if (r.variant === variant) await del('routine', r.id);
  let order = 0;
  for (const r of items) await put('routine', { ...r, variant, order: order++ });
}

export async function getDay(date) {
  const d = await get('days', date);
  return { date, lunchFree: null, blocks: [], confirmed: false, checkedIn: false, routineDone: [], results: {}, ...d };
}

export const saveDay = (d) => put('days', d);
export const allTasks = () => all('tasks');
export const saveTask = (t) => put('tasks', t);
export const allDays = () => all('days');
