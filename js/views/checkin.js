// Evening check-in: Done / Not done per task, and one tap for why.
// "Not done" isn't a failure state: the task rolls to tomorrow once.

import { h, fill, choice } from '../ui.js';
import { getDay, saveDay, allTasks, saveTask, REASONS } from '../store.js';
import { niceDate, fmtDuration } from '../time.js';

export async function renderCheckin(root, ctx) {
  const { today } = ctx;
  const day = await getDay(today);
  const tasks = (await allTasks()).filter((t) => t.plannedDate === today && (t.status === 'pending' || t.status === 'done'));
  const order = { main: 0, small: 1 };
  tasks.sort((a, b) => (order[a.kind] ?? 2) - (order[b.kind] ?? 2));

  const answers = {};
  for (const t of tasks) {
    const r = day.results?.[t.id];
    answers[t.id] = r ? { ...r } : t.status === 'done' ? { result: 'done', reason: null } : null;
  }

  const view = h('div');
  root.append(view);

  let msgText = '';
  const say = (m) => ((msgText = m), draw());

  function draw() {
    const parts = [
      h('p', { class: 'eyebrow' }, niceDate(today)),
      h('h1', {}, 'Evening check-in'),
      h('p', { class: 'sub' }, 'Quick and honest. No grades.'),
    ];

    if (!tasks.length) {
      parts.push(
        h('div', { class: 'card' }, h('p', { class: 'q' }, 'No tasks were planned today.'), h('p', { class: 'sub' }, "That's allowed. Tomorrow's a new one.")),
        h('a', { class: 'btn', href: '#today' }, 'Back to today'),
      );
      fill(view, ...parts);
      return;
    }

    for (const t of tasks) {
      const a = answers[t.id];
      parts.push(
        h(
          'div',
          { class: 'card checkin-item' },
          h('p', { class: 'q' }, t.title, h('span', { class: 'muted' }, ` · ${fmtDuration(t.minutes)}`)),
          choice({
            label: `${t.title}: done or not`,
            className: 'seg',
            options: [
              { value: 'done', label: 'Done' },
              { value: 'notDone', label: 'Not done' },
            ],
            value: a?.result ?? null,
            onChange: (v) => {
              answers[t.id] = { result: v, reason: v === 'done' ? null : a?.reason ?? null };
              draw();
            },
          }),
          a?.result === 'notDone'
            ? h(
                'div',
                { class: 'reasons' },
                h('p', { class: 'label' }, 'What got in the way?'),
                choice({
                  label: 'Reason',
                  options: REASONS.map(([value, label]) => ({ value, label })),
                  value: a.reason,
                  onChange: (v) => (answers[t.id].reason = v),
                }),
              )
            : null,
        ),
      );
    }

    parts.push(h('p', { class: 'error', role: 'alert' }, msgText), h('div', { class: 'cta' }, h('button', { type: 'button', class: 'btn primary', onclick: save }, 'Save check-in')));
    fill(view, ...parts);
  }

  async function save() {
    const unanswered = tasks.filter((t) => !answers[t.id]);
    if (unanswered.length) return say(`Tap Done or Not done for "${unanswered[0].title}" first.`);
    const noReason = tasks.find((t) => answers[t.id].result === 'notDone' && !answers[t.id].reason);
    if (noReason) return say(`Pick what got in the way for "${noReason.title}". One tap is enough.`);
    day.results ||= {};
    for (const t of tasks) {
      const a = answers[t.id];
      if (!a) continue;
      const done = a.result === 'done';
      t.status = done ? 'done' : 'pending'; // pending + past date = rolls over tomorrow
      t.completedDate = done ? today : null;
      // History is what Phase 2's weekly review will read.
      t.history = (t.history || []).filter((x) => x.date !== today).concat({ date: today, result: a.result, reason: a.reason || null, window: t.window || null });
      await saveTask(t);
      day.results[t.id] = { result: a.result, reason: a.reason || null };
      for (const b of day.blocks) if (b.taskId === t.id) b.done = done;
    }
    day.checkedIn = true;
    day.checkedInAt = new Date().toISOString();
    await saveDay(day);

    const results = Object.values(answers).filter(Boolean);
    const allDone = results.length && results.every((r) => r.result === 'done');
    const unrealistic = results.some((r) => r.reason === 'unrealistic');
    const msg = allDone
      ? "That's the whole list. Nice."
      : unrealistic
        ? 'Logged. Tomorrow, try a smaller one thing.'
        : 'Logged. Anything unfinished gets one free roll to tomorrow.';
    fill(view, 
      h('p', { class: 'eyebrow' }, niceDate(today)),
      h('h1', {}, 'Checked in.'),
      h('div', { class: 'card' }, h('p', { class: 'q' }, msg), h('p', { class: 'sub' }, 'See you in the morning.')),
      h('a', { class: 'btn primary', href: '#today' }, 'Back to today'),
    );
  }

  draw();
}
