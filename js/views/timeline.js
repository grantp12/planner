// Vertical timeline used by the day view and the plan preview.
// Work hours collapse into one gray row; free-lunch blocks sit inside it.
// Buffers render as small spacing, not rows, to keep it calm.

import { h } from '../ui.js';
import { fmtShort, fmtRange, fmtDuration } from '../time.js';

const TAPPABLE = new Set(['task', 'routine']);

const isCurrent = (b, now) => now != null && now >= b.start && now < b.end;

function row(b, { now, onTap }) {
  const current = isCurrent(b, now);
  const soft = b.type === 'break' || b.type === 'decompress';
  const cls = ['tl', b.type, soft && 'soft', b.done && 'done', current && 'current'].filter(Boolean).join(' ');
  const title = b.part ? `${b.title} (${b.part})` : b.title;
  const inner = [
    h('span', { class: 'tl-time' }, fmtShort(b.start)),
    h(
      'span',
      { class: 'tl-body' },
      h(
        'span',
        { class: 'tl-title' },
        b.done ? h('span', { class: 'tick', 'aria-hidden': 'true' }, '✓ ') : null,
        title,
        current ? h('span', { class: 'now-pill' }, 'Now') : null,
      ),
      h('span', { class: 'tl-meta' }, `${fmtDuration(b.end - b.start)} · ${b.reason}`),
    ),
  ];
  const label = `${title}, ${fmtRange(b.start, b.end)}${b.done ? ', done' : ''}${current ? ', happening now' : ''}`;
  if (onTap && TAPPABLE.has(b.type)) {
    return h('li', {}, h('button', { type: 'button', class: cls, 'aria-label': label, onclick: () => onTap(b) }, inner));
  }
  return h('li', {}, h('div', { class: cls, 'aria-label': label }, inner));
}

export function timeline(blocks, { now = null, onTap = null } = {}) {
  const sorted = [...blocks].sort((a, b) => a.start - b.start);
  const lunch = sorted.filter((b) => b.window === 'lunch' && b.type !== 'buffer');
  const list = h('ol', { class: 'timeline' });

  for (const b of sorted) {
    if (b.window === 'lunch') continue;
    if (b.type === 'buffer') {
      list.append(h('li', { class: 'tl-gap', 'aria-hidden': 'true' }));
      continue;
    }
    if (b.type === 'work') {
      const inLunch = lunch.some((l) => isCurrent(l, now));
      const current = isCurrent(b, now) && !inLunch;
      list.append(
        h(
          'li',
          {},
          h(
            'div',
            { class: `tl work ${current ? 'current' : ''}` },
            h('span', { class: 'tl-time' }, fmtShort(b.start)),
            h(
              'span',
              { class: 'tl-body' },
              h('span', { class: 'tl-title' }, 'Work', current ? h('span', { class: 'now-pill' }, 'Now') : null),
              h('span', { class: 'tl-meta' }, fmtRange(b.start, b.end) + (lunch.length ? ' · lunch blocks below' : '')),
              lunch.length ? h('ol', { class: 'timeline nested' }, lunch.map((l) => row(l, { now, onTap }))) : null,
            ),
          ),
        ),
      );
      continue;
    }
    list.append(row(b, { now, onTap }));
  }
  return list;
}
