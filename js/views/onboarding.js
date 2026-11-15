// First-run setup, one question per screen. Also reachable later from
// Settings ("Run setup again") with your current answers pre-filled.

import { h, fill, choice, stepper, timeInput } from '../ui.js';
import { saveSettings, replaceRoutineVariant } from '../store.js';
import { toMin, dateKey } from '../time.js';
import { workDaysField, lunchDaysField, energyFields, field } from './fields.js';
import { routineEditor, ANCHORS } from './routine-editor.js';
import { uid } from '../db.js';

export async function renderOnboarding(root, ctx) {
  const draft = structuredClone(ctx.settings);
  const weekday = ctx.routine.filter((r) => r.variant === 'weekday').map((r) => ({ ...r }));
  let weekend = ctx.routine.filter((r) => r.variant === 'weekend').map((r) => ({ ...r }));
  let weekendMode = weekend.length ? 'own' : 'same';
  const isRedo = ctx.settings.onboarded;
  let step = 0;

  const steps = [
    {
      title: isRedo ? 'Update your routine setup' : "Let's set up your days",
      sub: 'A few quick questions, one at a time. About two minutes. You can change any of it later in Settings.',
      next: 'Start',
      body: () => [
        h(
          'ul',
          { class: 'promise' },
          h('li', {}, 'Each morning: one question, under a minute.'),
          h('li', {}, 'Each evening: done or not done, under 30 seconds.'),
          h('li', {}, 'No streaks to lose and no overdue pile.'),
        ),
      ],
    },
    {
      title: 'What time do you usually wake up?',
      body: () => [timeInput(draft.wakeTime, (v) => (draft.wakeTime = v), { 'aria-label': 'Wake time', class: 'big-time' })],
    },
    {
      title: 'And bedtime?',
      sub: "Nothing gets scheduled past this.",
      body: () => [timeInput(draft.bedTime, (v) => (draft.bedTime = v), { 'aria-label': 'Bedtime', class: 'big-time' })],
    },
    {
      title: 'Your work hours',
      sub: 'Pre-filled as Monday to Friday, 9 to 5. Personal tasks never go inside these.',
      check: () => {
        if (!draft.workDays.length) return null;
        return toMin(draft.workEnd) > toMin(draft.workStart) ? null : 'Work needs to end after it starts.';
      },
      body: () => [
        h('p', { class: 'label' }, 'Work days'),
        workDaysField(draft.workDays, (v) => (draft.workDays = v)),
        h(
          'div',
          { class: 'row' },
          field('Start', timeInput(draft.workStart, (v) => (draft.workStart = v))),
          field('End', timeInput(draft.workEnd, (v) => (draft.workEnd = v))),
        ),
      ],
    },
    {
      title: 'When is lunch?',
      sub: 'On days lunch is free, it can hold one short task (30 min max), like a walk or reading.',
      skip: () => !draft.workDays.length,
      check: () => (toMin(draft.lunchEnd) > toMin(draft.lunchStart) ? null : 'Lunch needs to end after it starts.'),
      body: () => [
        h(
          'div',
          { class: 'row' },
          field('Start', timeInput(draft.lunchStart, (v) => (draft.lunchStart = v))),
          field('End', timeInput(draft.lunchEnd, (v) => (draft.lunchEnd = v))),
        ),
      ],
    },
    {
      title: 'Which days is lunch usually free?',
      sub: "Pick none if it's never free. Each morning you can flip it with one tap.",
      skip: () => !draft.workDays.length,
      body: () => [lunchDaysField(draft.workDays, draft.lunchFreeDays, (v) => (draft.lunchFreeDays = v))],
    },
    {
      title: 'Any commute?',
      sub: "Commute time isn't treated as free time.",
      skip: () => !draft.workDays.length,
      body: () => [
        h('p', { class: 'label' }, 'Before work'),
        stepper({
          label: 'Commute before work',
          value: draft.commuteBefore,
          max: 180,
          format: (v) => (v ? `${v} min` : 'None'),
          onChange: (v) => (draft.commuteBefore = v),
        }),
        h('p', { class: 'label' }, 'After work'),
        stepper({
          label: 'Commute after work',
          value: draft.commuteAfter,
          max: 180,
          format: (v) => (v ? `${v} min` : 'None'),
          onChange: (v) => (draft.commuteAfter = v),
        }),
      ],
    },
    {
      title: 'How is your energy in each window?',
      sub: 'Your one big thing goes where your energy is highest.',
      body: () => [energyFields(draft.energy, (v) => (draft.energy = v))],
    },
    {
      title: 'Your weekday routine',
      sub: 'Start with 3 (5 max). Tie each one to something you already do. That habit is your reminder.',
      next: () => (weekday.length ? 'Next' : 'Skip for now'),
      body: () => [
        routineEditor({
          items: weekday,
          variant: 'weekday',
          onChange: () => drawNav(),
        }),
      ],
    },
    {
      title: 'Weekends too?',
      sub: 'Optional. Weekends can have their own lighter routine, or reuse the weekday one.',
      body: () => {
        const holder = h('div');
        const drawInner = () => {
          fill(holder, 
            choice({
              className: 'seg',
              label: 'Weekend routine',
              options: [
                { value: 'same', label: 'Same as weekdays' },
                { value: 'own', label: 'Its own routine' },
              ],
              value: weekendMode,
              onChange: (v) => {
                weekendMode = v;
                drawInner();
              },
            }),
            weekendMode === 'own'
              ? h(
                  'div',
                  {},
                  !weekend.length && weekday.length
                    ? h(
                        'button',
                        {
                          type: 'button',
                          class: 'btn ghost',
                          onclick: () => {
                            weekend = weekday.map((r) => ({
                              ...r,
                              id: uid(),
                              variant: 'weekend',
                              anchor: ANCHORS[r.anchor]?.weekdayOnly ? 'wake' : r.anchor,
                            }));
                            drawInner();
                          },
                        },
                        'Start from my weekday items',
                      )
                    : null,
                  routineEditor({ items: weekend, variant: 'weekend', onChange: () => {} }),
                )
              : null,
          );
        };
        drawInner();
        return [holder];
      },
    },
    {
      title: "You're set.",
      sub: "Tomorrow morning, open the app and answer one question: what's the one thing today?",
      next: isRedo ? 'Save' : 'Go to today',
      body: () => [
        h(
          'ul',
          { class: 'promise' },
          h('li', {}, 'Add it to your home screen for one-tap mornings. See the README.'),
          h('li', {}, 'Off days are normal. The only rule: never miss twice.'),
        ),
      ],
    },
  ];

  const view = h('div', { class: 'onboard' });
  root.append(view);
  let navEl;

  const nextLabel = (st) => (typeof st.next === 'function' ? st.next() : st.next || 'Next');

  function drawNav() {
    if (!navEl) return;
    const st = steps[step];
    navEl.querySelector('.btn.primary').textContent = nextLabel(st);
  }

  function draw() {
    const st = steps[step];
    const err = h('p', { class: 'error', role: 'alert' });
    navEl = h(
      'div',
      { class: 'step-nav' },
      step > 0 ? h('button', { type: 'button', class: 'btn ghost', onclick: back }, 'Back') : null,
      h('button', { type: 'button', class: 'btn primary', onclick: () => next(err) }, nextLabel(st)),
    );
    const visible = steps.filter((s) => !s.skip?.());
    const pos = visible.indexOf(st);
    fill(view, 
      h(
        'div',
        { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(visible.length), 'aria-valuenow': String(pos + 1) },
        h('span', { style: { width: `${((pos + 1) / visible.length) * 100}%` } }),
      ),
      h('h1', { tabindex: '-1' }, st.title),
      st.sub ? h('p', { class: 'sub' }, st.sub) : null,
      h('div', { class: 'step-body' }, st.body()),
      err,
      navEl,
    );
    view.querySelector('h1').focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  function move(dir) {
    do step += dir;
    while (steps[step]?.skip?.());
    draw();
  }

  function back() {
    move(-1);
  }

  async function next(err) {
    const problem = steps[step].check?.();
    if (problem) {
      err.textContent = problem;
      return;
    }
    if (step === steps.length - 1) return finish();
    move(1);
  }

  async function finish() {
    const today = dateKey();
    draft.lunchFreeDays = draft.lunchFreeDays.filter((d) => draft.workDays.includes(d));
    await saveSettings({ ...draft, onboarded: true, onboardedDate: draft.onboardedDate || today, lastOpened: draft.lastOpened || today });
    await replaceRoutineVariant('weekday', weekday);
    await replaceRoutineVariant('weekend', weekendMode === 'own' ? weekend : []);
    await ctx.startDay();
    ctx.go(isRedo ? 'settings' : 'today');
  }

  draw();
}
