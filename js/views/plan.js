// Morning planning: one main thing, up to 2 small ones, lunch yes/no, then a
// recommended schedule you can accept or tweak.

import { h, fill, choice, toast } from '../ui.js';
import { getDay, saveDay, allTasks, saveTask, routineFor } from '../store.js';
import { keepTask, dropTask } from '../rollover.js';
import { isWorkday, lunchUsuallyFree } from '../windows.js';
import { buildPlan } from '../scheduler.js';
import { addDays, fmtDuration, niceDate } from '../time.js';
import { uid } from '../db.js';
import { timeline } from './timeline.js';
import { blockSheet } from './block-sheet.js';

const MAIN_MINUTES = [15, 30, 45, 60, 90, 120, 180];
const SMALL_MINUTES = [10, 15, 20, 30, 45];
const MAX_SMALL = 2;

const durationOptions = (base, current) =>
  [...new Set([...base, current])].sort((a, b) => a - b).map((m) => ({ value: m, label: fmtDuration(m) }));

export async function renderPlan(root, ctx) {
  const { today, settings: s } = ctx;
  const day = await getDay(today);
  const tasks = await allTasks();
  const decide = tasks.filter((t) => t.status === 'decide');
  const pending = tasks.filter((t) => t.plannedDate === today && t.status === 'pending');
  const workday = isWorkday(s, today);

  const pick = (t) => ({ id: t.id, title: t.title, minutes: t.minutes, carried: (t.rolloverCount || 0) > 0 && t.createdDate < today });
  const mainT = pending.find((t) => t.kind === 'main');
  const others = pending.filter((t) => t !== mainT);
  const state = {
    main: mainT ? pick(mainT) : { id: null, title: '', minutes: 30 },
    smalls: others.slice(0, MAX_SMALL).map(pick),
    extras: others.slice(MAX_SMALL),
    prefillIds: [mainT, ...others.slice(0, MAX_SMALL)].filter(Boolean).map((t) => t.id),
    lunchFree: day.lunchFree ?? lunchUsuallyFree(s, today),
    replanning: !day.confirmed,
    overflowChoice: {},
    plan: null,
    tasks: [],
  };
  const existing = Object.fromEntries(tasks.map((t) => [t.id, t]));

  const view = h('div');
  root.append(view);
  const reload = () => {
    root.replaceChildren();
    renderPlan(root, ctx);
  };

  // ---- Step 1: the questions --------------------------------------------

  function drawForm() {
    const parts = [h('p', { class: 'eyebrow' }, niceDate(today)), h('h1', {}, 'Plan today')];

    if (!state.replanning) {
      parts.push(
        h(
          'div',
          { class: 'card' },
          h('p', { class: 'q' }, "Today's plan is set."),
          h('div', { class: 'stack' }, h('a', { class: 'btn primary', href: '#today' }, 'View today'), h('button', { type: 'button', class: 'btn', onclick: () => ((state.replanning = true), drawForm()) }, 'Re-plan today')),
        ),
      );
      fill(view, ...parts);
      return;
    }

    parts.push(h('p', { class: 'sub' }, 'Three quick answers. Under a minute.'));

    for (const t of decide) {
      parts.push(
        h(
          'div',
          { class: 'card decide' },
          h('p', { class: 'q' }, `"${t.title}" has rolled over already.`),
          h('p', { class: 'sub' }, 'Keep it for today, or let it go? Either is fine.'),
          h(
            'div',
            { class: 'row' },
            h('button', { type: 'button', class: 'btn', onclick: async () => (await keepTask(t, today), reload()) }, 'Keep'),
            h('button', { type: 'button', class: 'btn', onclick: async () => (await dropTask(t, today), toast('Dropped. One less thing.'), reload()) }, 'Drop'),
          ),
        ),
      );
    }

    if (state.extras.length) {
      parts.push(
        h(
          'div',
          { class: 'card' },
          h('p', { class: 'q' }, 'Also lined up for today'),
          h('p', { class: 'sub' }, 'Today only has room for one main thing and two small ones.'),
          state.extras.map((t) =>
            h(
              'div',
              { class: 'extra-row' },
              h('span', { class: 'grow' }, t.title),
              h('button', { type: 'button', class: 'chip', onclick: async () => (await saveTask({ ...t, plannedDate: addDays(today, 1), rolloverCount: 1 }), reload()) }, 'Tomorrow'),
              h('button', { type: 'button', class: 'chip', onclick: async () => (await dropTask(t, today), reload()) }, 'Drop'),
            ),
          ),
        ),
      );
    }

    const mainInput = h('input', {
      id: 'main-task',
      type: 'text',
      value: state.main.title,
      placeholder: 'e.g. Draft the cover letter',
      enterkeyhint: 'done',
      autocomplete: 'off',
      oninput: (e) => (state.main.title = e.target.value),
    });
    parts.push(
      h('label', { class: 'q', for: 'main-task' }, "What's the one thing today?"),
      mainInput,
      state.main.carried ? h('p', { class: 'hint' }, 'Carried over from yesterday. Clear it to let it go.') : null,
      h('p', { class: 'label' }, 'Roughly how long?'),
      choice({ label: 'Main task length', options: durationOptions(MAIN_MINUTES, state.main.minutes), value: state.main.minutes, onChange: (v) => (state.main.minutes = v) }),
    );

    parts.push(h('p', { class: 'q' }, 'Anything small? ', h('span', { class: 'muted' }, '(optional, up to 2)')));
    state.smalls.forEach((t, i) => {
      parts.push(
        h(
          'div',
          { class: 'card small-task' },
          h(
            'div',
            { class: 'small-head' },
            h('input', { type: 'text', value: t.title, placeholder: 'e.g. Call the dentist', autocomplete: 'off', 'aria-label': `Small task ${i + 1}`, oninput: (e) => (t.title = e.target.value) }),
            h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Remove small task', onclick: () => (state.smalls.splice(i, 1), drawForm()) }, '×'),
          ),
          t.carried ? h('p', { class: 'hint' }, 'Carried over from yesterday.') : null,
          choice({ label: 'Small task length', options: durationOptions(SMALL_MINUTES, t.minutes), value: t.minutes, onChange: (v) => (t.minutes = v) }),
        ),
      );
    });
    if (state.smalls.length < MAX_SMALL) {
      parts.push(
        h(
          'button',
          {
            type: 'button',
            class: 'btn ghost add-small',
            onclick: () => {
              state.smalls.push({ id: null, title: '', minutes: 15 });
              drawForm();
              view.querySelectorAll('.small-task input')[state.smalls.length - 1]?.focus();
            },
          },
          '+ Add a small task',
        ),
      );
    }

    if (workday) {
      parts.push(
        h('p', { class: 'q' }, 'Lunch free today?'),
        choice({
          label: 'Lunch free today',
          className: 'seg',
          options: [
            { value: true, label: 'Yes' },
            { value: false, label: 'No' },
          ],
          value: state.lunchFree,
          onChange: (v) => (state.lunchFree = v),
        }),
      );
    }

    parts.push(h('div', { class: 'cta' }, h('button', { type: 'button', class: 'btn primary', onclick: propose }, 'Plan my day')));
    fill(view, ...parts);
  }

  // ---- Step 2: the recommendation ----------------------------------------

  function toTask(x, kind) {
    if (!x.id) x.id = uid();
    return { id: x.id, title: x.title.trim(), minutes: x.minutes, kind };
  }

  function propose() {
    const list = [];
    if (state.main.title.trim()) list.push(toTask(state.main, 'main'));
    for (const x of state.smalls) if (x.title.trim()) list.push(toTask(x, 'small'));
    state.tasks = list;
    state.plan = buildPlan({
      settings: s,
      routine: routineFor(ctx.routine, s, today),
      tasks: list,
      date: today,
      lunchFree: workday && state.lunchFree,
    });
    drawProposal();
    window.scrollTo(0, 0);
  }

  function shorten(o) {
    const target = state.main.id === o.task.id ? state.main : state.smalls.find((x) => x.id === o.task.id);
    if (target) target.minutes = o.shortenTo;
    propose();
  }

  function drawProposal() {
    const p = state.plan;
    const pct = p.stats.free ? Math.round((p.stats.used / p.stats.free) * 100) : 0;
    const parts = [
      h('p', { class: 'eyebrow' }, niceDate(today)),
      h('h1', {}, "Here's your day"),
      h('p', { class: 'sub' }, `${fmtDuration(p.stats.used)} planned of ${fmtDuration(p.stats.free)} free (${pct}%). The rest stays open on purpose.`),
    ];

    for (const o of p.overflow) {
      const id = o.task.id;
      const options = [{ value: 'move', label: `Move to ${o.moveLabel}` }];
      if (o.shortenTo) options.push({ value: 'shorten', label: `Shorten to ${fmtDuration(o.shortenTo)}` });
      options.push({ value: 'drop', label: 'Drop it' });
      parts.push(
        h(
          'div',
          { class: 'card warn' },
          h('p', { class: 'q' }, `"${o.task.title}" (${fmtDuration(o.task.minutes)}) doesn't fit today.`),
          h('p', { class: 'sub' }, o.why + ' Better to say so now than overpack the day.'),
          choice({
            label: `What to do with ${o.task.title}`,
            options,
            value: state.overflowChoice[id] || 'move',
            onChange: (v) => (v === 'shorten' ? shorten(o) : (state.overflowChoice[id] = v)),
          }),
        ),
      );
    }

    for (const n of p.notes) parts.push(h('p', { class: 'note' }, n));

    parts.push(
      timeline(p.blocks, {
        onTap: (b) =>
          blockSheet(b, {
            frame: p.frame,
            onSave: drawProposal,
            onRemove: () => {
              p.blocks = p.blocks.filter((x) => x !== b);
              drawProposal();
            },
          }),
      }),
      h('p', { class: 'hint center' }, 'Tap a block to change its time.'),
      h(
        'div',
        { class: 'cta stack' },
        h('button', { type: 'button', class: 'btn primary', onclick: confirm }, 'Looks good'),
        h('button', { type: 'button', class: 'btn ghost', onclick: () => (drawForm(), window.scrollTo(0, 0)) }, 'Change tasks'),
      ),
    );
    fill(view, ...parts);
  }

  async function confirm() {
    const p = state.plan;
    const overflow = new Map(p.overflow.map((o) => [o.task.id, o]));
    const kept = new Set();

    for (const t of state.tasks) {
      const prev = existing[t.id] || { id: t.id, createdDate: today, rolloverCount: 0, history: [] };
      const rec = { ...prev, title: t.title, minutes: t.minutes, kind: t.kind, status: 'pending', plannedDate: today };
      const o = overflow.get(t.id);
      if (o) {
        if ((state.overflowChoice[t.id] || 'move') === 'drop') {
          if (existing[t.id]) await dropTask(rec, today);
          kept.add(t.id);
          continue;
        }
        rec.plannedDate = o.moveTo;
        rec.window = null;
      } else {
        rec.window = p.blocks.find((b) => b.taskId === t.id)?.window ?? null;
      }
      kept.add(t.id);
      await saveTask(rec);
    }

    // Carried-over tasks you cleared out of the form: let them go.
    for (const id of state.prefillIds) if (!kept.has(id) && existing[id]) await dropTask(existing[id], today);
    // Anything still in "also lined up" moves to tomorrow (and will ask keep/drop if missed again).
    for (const t of state.extras) await saveTask({ ...t, plannedDate: addDays(today, 1), rolloverCount: 1 });

    await saveDay({ ...day, blocks: p.blocks, lunchFree: p.lunchFree, confirmed: true, plannedAt: new Date().toISOString(), notes: p.notes });
    toast('Plan set. Have a good day.');
    ctx.go('today');
  }

  drawForm();
}
