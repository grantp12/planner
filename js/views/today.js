// Day view: timeline, current block, routine checklist, check-in, calendar export.

import { h, fill, toast, saveFile } from '../ui.js';
import { getDay, saveDay, allTasks, saveTask, routineFor } from '../store.js';
import { showUpWeek } from '../rollover.js';
import { dayFrame, lunchUsuallyFree, isWorkday, normalizeMin } from '../windows.js';
import { nowMin, niceDate, toMin, DAY_SHORT, weekday } from '../time.js';
import { buildIcs, exportableBlocks } from '../ics.js';
import { timeline } from './timeline.js';
import { blockSheet } from './block-sheet.js';

function greeting() {
  const hr = new Date().getHours();
  if (hr < 5) return 'Still up?';
  if (hr < 12) return 'Good morning';
  if (hr < 17) return 'Good afternoon';
  return 'Good evening';
}

const NMT_MESSAGES = {
  twice: 'Two off days in a row. No catching up needed. Just do one routine item today.',
  once: 'Yesterday was an off day. That happens. Do one small thing today: never miss twice.',
  none: 'Never miss twice. One off day is normal; only two in a row gets flagged.',
};

export async function renderToday(root, ctx) {
  const { today, settings: s } = ctx;
  const day = await getDay(today);
  const routine = routineFor(ctx.routine, s, today);
  const tasksById = Object.fromEntries((await allTasks()).map((t) => [t.id, t]));
  const week = await showUpWeek(s, today);
  const frame = dayFrame(s, today, day.lunchFree ?? lunchUsuallyFree(s, today));
  const hasDecide = Object.values(tasksById).some((t) => t.status === 'decide');

  const view = h('div');
  root.append(view);
  const persist = () => saveDay(day);

  function setTaskDone(taskId, done) {
    const t = tasksById[taskId];
    if (!t) return;
    const parts = day.blocks.filter((b) => b.taskId === taskId);
    const allDone = parts.length > 0 && parts.every((b) => b.done);
    if (done && allDone) {
      t.status = 'done';
      t.completedDate = today;
      day.results[taskId] = { result: 'done', reason: null };
    } else if (!done && t.status === 'done') {
      t.status = 'pending';
      t.completedDate = null;
      delete day.results[taskId];
    }
    saveTask(t);
  }

  function setRoutineDone(routineId, done) {
    const set = new Set(day.routineDone);
    done ? set.add(routineId) : set.delete(routineId);
    day.routineDone = [...set];
    for (const b of day.blocks) if (b.routineId === routineId) b.done = done;
  }

  function openBlock(b) {
    blockSheet(b, {
      frame,
      onSave: () => (persist(), draw()),
      onRemove: () => {
        day.blocks = day.blocks.filter((x) => x !== b);
        persist();
        draw();
        if (b.taskId) toast("Removed. It'll come up at check-in.");
      },
      extra: (close) => [
        h(
          'button',
          {
            type: 'button',
            class: 'btn primary',
            onclick: async () => {
              const done = !b.done;
              if (b.routineId) setRoutineDone(b.routineId, done);
              else b.done = done;
              if (b.taskId) setTaskDone(b.taskId, done);
              await persist();
              close();
              draw();
              if (done) toast('Done.');
            },
          },
          b.done ? 'Mark as not done' : 'Mark done',
        ),
      ],
    });
  }

  function nmtCard() {
    const msg = NMT_MESSAGES[week.flag || 'none'];
    const label = week.days.map((d) => `${DAY_SHORT[weekday(d.date)]}: ${d.state === 'yes' ? 'showed up' : d.state === 'no' ? 'off' : d.state === 'today' ? 'today' : 'before you started'}`).join(', ');
    return h(
      'div',
      { class: `card nmt ${week.flag ? 'flag' : ''}` },
      h(
        'div',
        { class: 'dots', role: 'img', 'aria-label': `Last 7 days. ${label}` },
        week.days.map((d) => h('span', { class: `dot ${d.state}` }, h('i'), DAY_SHORT[weekday(d.date)][0])),
      ),
      h('p', { class: 'nmt-msg' }, msg),
    );
  }

  function routineList() {
    if (!routine.length) {
      return h('div', { class: 'card' }, h('p', { class: 'sub' }, 'No routine yet.'), h('a', { class: 'btn', href: '#settings' }, 'Add one in Settings'));
    }
    return h(
      'div',
      { class: 'checklist' },
      routine.map((r) => {
        const done = day.routineDone.includes(r.id);
        return h(
          'button',
          {
            type: 'button',
            class: 'check',
            role: 'checkbox',
            'aria-checked': String(done),
            onclick: async () => {
              setRoutineDone(r.id, !done);
              await persist();
              draw();
            },
          },
          h('span', { class: 'box', 'aria-hidden': 'true' }, done ? '✓' : ''),
          h('span', { class: 'grow' }, h('span', { class: 'trigger' }, `After ${r.trigger},`), h('span', { class: 'action' }, `I will ${r.action}`)),
          h('span', { class: 'mins' }, `${r.minutes}m`),
        );
      }),
    );
  }

  function eveningActions() {
    const evening = isWorkday(s, today) ? toMin(s.workEnd) + (s.commuteAfter || 0) : 17 * 60;
    const isEvening = nowMin() >= evening || nowMin() < 4 * 60;
    const exportable = exportableBlocks(day.blocks);
    return h(
      'div',
      { class: 'stack actions' },
      h(
        'a',
        { class: `btn ${isEvening && !day.checkedIn ? 'primary' : ''}`, href: '#checkin' },
        day.checkedIn ? 'Checked in ✓ (edit)' : 'Evening check-in',
      ),
      day.confirmed && exportable.length
        ? h(
            'button',
            {
              type: 'button',
              class: 'btn',
              onclick: () => saveFile(`planner-${today}.ics`, buildIcs(today, day.blocks), 'text/calendar'),
            },
            'Add to my calendar (.ics)',
          )
        : null,
      day.confirmed && exportable.length ? h('p', { class: 'hint center' }, 'Exports personal blocks only, with a reminder 5 min before each.') : null,
    );
  }

  function draw() {
    const now = normalizeMin(nowMin(), frame);
    const parts = [h('p', { class: 'eyebrow' }, niceDate(today))];

    if (ctx.maintenance?.freshStart && !ctx.freshDismissed) {
      parts.push(
        h('h1', {}, 'Welcome back.'),
        h(
          'div',
          { class: 'card fresh' },
          h('p', { class: 'q' }, 'Fresh start.'),
          h('p', { class: 'sub' }, "Nothing is waiting on you. Old tasks were cleared. Just pick one thing for today."),
          h('button', { type: 'button', class: 'btn ghost', onclick: () => ((ctx.freshDismissed = true), draw()) }, 'Thanks'),
        ),
      );
    } else {
      parts.push(h('h1', {}, greeting()), nmtCard());
    }

    if (!day.confirmed) {
      parts.push(
        h(
          'div',
          { class: 'card plan-cta' },
          h('p', { class: 'q' }, "What's the one thing today?"),
          hasDecide ? h('p', { class: 'sub' }, 'One task is waiting on a quick keep-or-drop.') : null,
          h('a', { class: 'btn primary', href: '#plan' }, 'Plan my day: under a minute'),
        ),
      );
    } else {
      parts.push(h('h2', {}, 'Today'), timeline(day.blocks, { now, onTap: openBlock }));
    }

    parts.push(h('h2', {}, 'Routine'), routineList(), eveningActions());
    fill(view, ...parts);
  }

  draw();
  ctx.every(60_000, draw); // keeps the "Now" highlight moving
}
