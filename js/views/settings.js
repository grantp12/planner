// Settings: schedule, energy, routine, and backup. Changes save immediately.

import { h, fill, toast, stepper, timeInput, saveFile, openSheet } from '../ui.js';
import { saveSettings, replaceRoutineVariant } from '../store.js';
import { exportAll, validateBackup, replaceAll } from '../db.js';
import { toMin, dateKey } from '../time.js';
import { workDaysField, lunchDaysField, energyFields, field } from './fields.js';
import { routineEditor } from './routine-editor.js';

export async function renderSettings(root, ctx) {
  const s = structuredClone(ctx.settings);
  const weekday = ctx.routine.filter((r) => r.variant === 'weekday');
  const weekend = ctx.routine.filter((r) => r.variant === 'weekend');

  const save = async (patch, check) => {
    const next = { ...s, ...patch };
    const problem = check?.(next);
    if (problem) {
      toast(problem);
      return false;
    }
    Object.assign(s, patch);
    await saveSettings(s);
    ctx.settings = s;
    toast('Saved');
    return true;
  };
  const workOrder = (n) => (toMin(n.workEnd) > toMin(n.workStart) ? null : 'Work needs to end after it starts.');
  const lunchOrder = (n) => (toMin(n.lunchEnd) > toMin(n.lunchStart) ? null : 'Lunch needs to end after it starts.');

  let lunchDaysHolder;
  const drawLunchDays = () =>
    lunchDaysHolder.replaceChildren(lunchDaysField(s.workDays, s.lunchFreeDays, (v) => save({ lunchFreeDays: v })));

  const fileInput = h('input', {
    type: 'file',
    accept: 'application/json,.json',
    class: 'visually-hidden',
    'aria-hidden': 'true',
    tabindex: '-1',
    onchange: async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      let json;
      try {
        json = JSON.parse(await file.text());
      } catch {
        toast("Couldn't read that file.");
        return;
      }
      const problem = validateBackup(json);
      if (problem) return toast(problem);
      const when = json.exportedAt ? new Date(json.exportedAt).toLocaleString() : 'an unknown date';
      confirmSheet(`Replace everything on this device with the backup from ${when}?`, 'Replace my data', async () => {
        await replaceAll(json.data);
        location.reload();
      });
    },
  });

  function confirmSheet(message, actionLabel, onConfirm) {
    openSheet((close) => [
      h('h2', { class: 'sheet-title' }, 'Are you sure?'),
      h('p', { class: 'sub' }, message),
      h('button', { type: 'button', class: 'btn primary danger-bg', onclick: async () => (close(), await onConfirm()) }, actionLabel),
      h('button', { type: 'button', class: 'btn ghost', onclick: close }, 'Cancel'),
    ]);
  }

  const parts = [
    h('h1', {}, 'Settings'),
    h('p', { class: 'sub' }, "Everything stays on this device. Changes apply to plans you make from now on."),

    h('h2', {}, 'Routine'),
    h('p', { class: 'label' }, 'Weekdays'),
    routineEditor({ items: weekday, variant: 'weekday', onChange: async (items) => (await replaceRoutineVariant('weekday', items), toast('Saved')) }),
    h('p', { class: 'label' }, 'Weekends'),
    h('p', { class: 'hint' }, 'Optional. If empty, weekends use your weekday routine.'),
    routineEditor({ items: weekend, variant: 'weekend', onChange: async (items) => (await replaceRoutineVariant('weekend', items), toast('Saved')) }),

    h('h2', {}, 'Your day'),
    h(
      'div',
      { class: 'row' },
      field('Wake up', timeInput(s.wakeTime, (v) => save({ wakeTime: v }))),
      field('Bedtime', timeInput(s.bedTime, (v) => save({ bedTime: v }))),
    ),

    h('h2', {}, 'Work'),
    h('p', { class: 'label' }, 'Work days'),
    workDaysField(s.workDays, async (v) => {
      await save({ workDays: v, lunchFreeDays: s.lunchFreeDays.filter((d) => v.includes(d)) });
      drawLunchDays();
    }),
    h(
      'div',
      { class: 'row' },
      field('Start', timeInput(s.workStart, (v) => save({ workStart: v }, workOrder))),
      field('End', timeInput(s.workEnd, (v) => save({ workEnd: v }, workOrder))),
    ),
    h('p', { class: 'label' }, 'Commute before / after work'),
    h(
      'div',
      { class: 'row' },
      stepper({ label: 'Commute before work', value: s.commuteBefore, max: 180, format: (v) => (v ? `${v} min` : 'None'), onChange: (v) => save({ commuteBefore: v }) }),
      stepper({ label: 'Commute after work', value: s.commuteAfter, max: 180, format: (v) => (v ? `${v} min` : 'None'), onChange: (v) => save({ commuteAfter: v }) }),
    ),

    h('h2', {}, 'Lunch'),
    h(
      'div',
      { class: 'row' },
      field('Start', timeInput(s.lunchStart, (v) => save({ lunchStart: v }, lunchOrder))),
      field('End', timeInput(s.lunchEnd, (v) => save({ lunchEnd: v }, lunchOrder))),
    ),
    h('p', { class: 'label' }, 'Usually free on'),
    (lunchDaysHolder = h('div')),

    h('h2', {}, 'Energy'),
    energyFields(s.energy, (v) => save({ energy: v })),

    h('h2', {}, 'Backup'),
    h('p', { class: 'hint' }, 'Your data lives only in this browser. Export a backup now and then; if you clear Safari data, it goes too.'),
    h(
      'div',
      { class: 'stack' },
      h(
        'button',
        {
          type: 'button',
          class: 'btn',
          onclick: async () => saveFile(`planner-backup-${dateKey()}.json`, JSON.stringify(await exportAll(), null, 2), 'application/json'),
        },
        'Export all data (JSON)',
      ),
      h('button', { type: 'button', class: 'btn', onclick: () => fileInput.click() }, 'Import from backup'),
      fileInput,
      h('a', { class: 'btn ghost', href: '#setup' }, 'Run setup again'),
      h(
        'button',
        {
          type: 'button',
          class: 'btn ghost danger',
          onclick: () =>
            confirmSheet('This erases your routine, tasks and history from this device. It cannot be undone. Export a backup first if you might want it.', 'Erase everything', async () => {
              await replaceAll({});
              location.hash = '';
              location.reload();
            }),
        },
        'Erase everything',
      ),
    ),
  ];

  fill(root, ...parts);
  drawLunchDays();
}
