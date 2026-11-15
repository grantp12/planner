// Anti-guilt rules, run once per day when the app opens.
//
// - Unfinished task: rolls to today once (rolloverCount 0 -> 1).
// - Unfinished again: status "decide" -> you're asked "Keep or drop?".
//   Nothing ever collects into an overdue list.
// - Away 3+ days: everything old is quietly let go. Fresh start.
// - "Never miss twice": only flags two missed days in a row. No streak counts.

import { allTasks, saveTask, saveSettings, allDays } from './store.js';
import { dateKey, daysBetween, addDays } from './time.js';

export const FRESH_START_DAYS = 3;

export async function runDailyMaintenance(settings, today = dateKey()) {
  const result = { freshStart: false };
  const last = settings.lastOpened;
  const gap = last ? daysBetween(last, today) : 0;
  const tasks = await allTasks();
  const stale = tasks.filter((t) => (t.status === 'pending' || t.status === 'decide') && t.plannedDate < today);

  if (last && gap >= FRESH_START_DAYS) {
    result.freshStart = true;
    for (const t of stale) await saveTask({ ...t, status: 'dropped', droppedBy: 'freshStart', droppedDate: today });
  } else {
    for (const t of stale) {
      if (t.status === 'decide') continue; // still waiting on your answer
      if ((t.rolloverCount || 0) < 1) await saveTask({ ...t, rolloverCount: 1, plannedDate: today });
      else await saveTask({ ...t, status: 'decide', plannedDate: today });
    }
  }

  if (last !== today) await saveSettings({ ...settings, lastOpened: today });
  return result;
}

export const keepTask = (t, today) =>
  saveTask({ ...t, status: 'pending', plannedDate: today, rolloverCount: 1, keptCount: (t.keptCount || 0) + 1 });

export const dropTask = (t, today) => saveTask({ ...t, status: 'dropped', droppedBy: 'user', droppedDate: today });

export const showedUp = (d) =>
  !!d &&
  ((d.blocks || []).some((b) => b.done && (b.type === 'task' || b.type === 'routine')) ||
    (d.routineDone || []).length > 0 ||
    Object.values(d.results || {}).some((r) => r.result === 'done'));

// Last 7 days as dots. "none" = before you started using the app.
export async function showUpWeek(settings, today) {
  const byDate = Object.fromEntries((await allDays()).map((d) => [d.date, d]));
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const date = addDays(today, -i);
    let state;
    if (!settings.onboardedDate || date < settings.onboardedDate) state = 'none';
    else if (showedUp(byDate[date])) state = 'yes';
    else state = i === 0 ? 'today' : 'no';
    days.push({ date, state });
  }
  const [y2, y, t] = days.slice(-3).map((d) => d.state);
  let flag = null;
  if (t !== 'yes') {
    if (y === 'no' && y2 === 'no') flag = 'twice';
    else if (y === 'no') flag = 'once';
  }
  return { days, flag };
}
