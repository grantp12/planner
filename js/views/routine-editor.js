// Routine builder: every item is "After [existing habit], I will [action]."
// The trigger is required and vague ones ("later", "in the morning") are
// rejected, because a routine with no concrete cue is the one you forget.

import { h, fill, choice } from '../ui.js';
import { uid } from '../db.js';

export const MAX_ROUTINE = 5;

export const ANCHORS = {
  wake: { label: 'Morning', examples: ['I pour my coffee', 'I turn off my alarm', 'I make my bed'] },
  leave: { label: 'Before leaving', weekdayOnly: true, examples: ['I put my shoes on', 'I grab my keys'] },
  lunch: { label: 'Lunch', weekendLabel: 'Midday', examples: ['I finish eating lunch', 'I close my laptop for lunch'] },
  home: { label: 'Getting home', weekendLabel: 'Afternoon', examples: ['I put my bag down', 'I change out of work clothes'] },
  bed: { label: 'Bedtime', examples: ['I brush my teeth at night', 'I plug in my phone'] },
};

export const anchorLabel = (anchor, variant) =>
  (variant === 'weekend' && ANCHORS[anchor]?.weekendLabel) || ANCHORS[anchor]?.label || anchor;

const VAGUE =
  /^(sometime|some time|someday|later|eventually|whenever|daily|every ?day|each day|morning|in the morning|evening|in the evening|at night|tonight|night|today|tomorrow|when(ever)? i (can|have time|feel like it|get a chance|remember|get around to it)|i have time|i feel like it|free time)\b/i;

export function triggerProblem(trigger) {
  const t = trigger.trim();
  if (!t) return 'Add a trigger: something you already do every day.';
  if (t.length < 4 || VAGUE.test(t)) {
    return `"${t}" is too vague to remind you. Tie it to something you already do, like "I pour my coffee".`;
  }
  return null;
}

export const sentence = (r) => `After ${r.trigger}, I will ${r.action}.`;

const cleanTrigger = (s) => s.trim().replace(/^after\s+/i, '').replace(/[,.;:]+$/, '').trim();
const cleanAction = (s) => s.trim().replace(/^i('ll| will)\s+/i, '').replace(/[.]+$/, '').trim();

export function routineEditor({ items, variant, onChange }) {
  const wrap = h('div', { class: 'routine-editor' });
  const form = { anchor: 'wake', trigger: '', action: '', minutes: 5 };
  let error = '';
  const anchors = Object.entries(ANCHORS).filter(([, a]) => !(variant === 'weekend' && a.weekdayOnly));

  function draw() {
    const list = items.map((r, i) =>
      h(
        'div',
        { class: 'card routine-item' },
        h(
          'div',
          { class: 'grow' },
          h('div', { class: 'item-title' }, sentence(r)),
          h('div', { class: 'item-meta' }, `${r.minutes} min · ${anchorLabel(r.anchor, variant)}`),
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'icon-btn',
            'aria-label': `Remove "${r.action}"`,
            onclick: () => {
              items.splice(i, 1);
              onChange(items);
              draw();
            },
          },
          '×',
        ),
      ),
    );
    const full = items.length >= MAX_ROUTINE;
    fill(wrap, 
      ...list,
      full ? h('p', { class: 'hint' }, `That's ${MAX_ROUTINE}, the max. A short routine you keep beats a long one you don't.`) : addForm(),
    );
  }

  function addForm() {
    const trig = h('input', {
      type: 'text',
      value: form.trigger,
      placeholder: 'I pour my coffee',
      autocomplete: 'off',
      'aria-label': 'After (existing habit)',
      oninput: (e) => (form.trigger = e.target.value),
    });
    const act = h('input', {
      type: 'text',
      value: form.action,
      placeholder: 'stretch for 5 minutes',
      autocomplete: 'off',
      'aria-label': 'I will (routine item)',
      oninput: (e) => (form.action = e.target.value),
    });
    return h(
      'div',
      { class: 'card add-form' },
      h('p', { class: 'q' }, items.length ? 'Add another' : 'Add your first one'),
      h('p', { class: 'label' }, 'When?'),
      choice({
        label: 'When',
        options: anchors.map(([v]) => ({ value: v, label: anchorLabel(v, variant) })),
        value: form.anchor,
        onChange: (v) => {
          form.anchor = v;
          draw();
        },
      }),
      h('label', { class: 'inline-field' }, h('span', { class: 'prefix' }, 'After'), trig),
      h(
        'div',
        { class: 'chips hint-chips' },
        ANCHORS[form.anchor].examples.map((ex) =>
          h(
            'button',
            {
              type: 'button',
              class: 'chip small',
              onclick: () => {
                form.trigger = ex;
                trig.value = ex;
              },
            },
            ex,
          ),
        ),
      ),
      h('label', { class: 'inline-field' }, h('span', { class: 'prefix' }, 'I will'), act),
      h('p', { class: 'label' }, 'How long?'),
      choice({
        label: 'How long',
        options: [2, 5, 10, 15, 20, 30].map((m) => ({ value: m, label: `${m}m` })),
        value: form.minutes,
        onChange: (v) => (form.minutes = v),
      }),
      error ? h('p', { class: 'error', role: 'alert' }, error) : null,
      h('button', { type: 'button', class: 'btn', onclick: add }, 'Add to routine'),
    );
  }

  function add() {
    const trigger = cleanTrigger(form.trigger);
    const action = cleanAction(form.action);
    error = triggerProblem(trigger) || (action.length < 3 ? 'Say what you will do, like "stretch for 5 minutes".' : '');
    if (!error) {
      items.push({ id: uid(), variant, trigger, action, minutes: form.minutes, anchor: form.anchor });
      form.trigger = '';
      form.action = '';
      onChange(items);
    }
    draw();
  }

  draw();
  return wrap;
}
