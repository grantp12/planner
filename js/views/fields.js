// Form pieces shared by onboarding and settings.

import { h, choice } from '../ui.js';
import { DAY_SHORT } from '../time.js';
import { ENERGY_WINDOWS } from '../windows.js';

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon first

export const workDaysField = (value, onChange) =>
  choice({
    label: 'Work days',
    multi: true,
    options: WEEK_ORDER.map((d) => ({ value: d, label: DAY_SHORT[d] })),
    value,
    onChange: (v) => onChange([...v].sort()),
  });

export const lunchDaysField = (workDays, value, onChange) =>
  choice({
    label: 'Days lunch is usually free',
    multi: true,
    options: WEEK_ORDER.filter((d) => workDays.includes(d)).map((d) => ({ value: d, label: DAY_SHORT[d] })),
    value: value.filter((d) => workDays.includes(d)),
    onChange: (v) => onChange([...v].sort()),
  });

export function energyFields(initial, onChange) {
  const energy = { ...initial }; // accumulate every tap, not just the last one
  return h(
    'div',
    { class: 'energy' },
    ENERGY_WINDOWS.map(([id, label]) =>
      h(
        'div',
        { class: 'energy-row' },
        h('span', { class: 'energy-label' }, label),
        choice({
          label: `Energy ${label}`,
          className: 'seg',
          options: [
            { value: 1, label: 'Low' },
            { value: 2, label: 'Med' },
            { value: 3, label: 'High' },
          ],
          value: energy[id] ?? 2,
          onChange: (v) => {
            energy[id] = v;
            onChange({ ...energy }, id);
          },
        }),
      ),
    ),
  );
}

export const field = (label, control, hint) =>
  h('label', { class: 'field' }, h('span', {}, label), control, hint ? h('small', { class: 'hint' }, hint) : null);
