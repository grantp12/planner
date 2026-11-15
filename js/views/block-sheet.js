// Bottom sheet for a single block: change its time, remove it, plus any extra
// actions the caller adds (e.g. "Mark done" in the day view).

import { h, openSheet } from '../ui.js';
import { toMin, toHHMM, fmtRange } from '../time.js';
import { validateBlock } from '../scheduler.js';
import { windowAt, normalizeMin } from '../windows.js';

export function blockSheet(block, { frame, onSave, onRemove, extra }) {
  openSheet((close) => {
    const err = h('p', { class: 'error', role: 'alert' });
    const startIn = h('input', { type: 'time', value: toHHMM(block.start), 'aria-label': 'Start time' });
    const endIn = h('input', { type: 'time', value: toHHMM(block.end), 'aria-label': 'End time' });
    const title = block.part ? `${block.title} (${block.part})` : block.title;

    const save = () => {
      const start = normalizeMin(toMin(startIn.value), frame);
      let end = normalizeMin(toMin(endIn.value), frame);
      if (end <= start && end + 1440 - start < 600) end += 1440;
      const problem = validateBlock(start, end, frame);
      if (problem) {
        err.textContent = problem;
        return;
      }
      block.start = start;
      block.end = end;
      block.window = windowAt(frame, start);
      close();
      onSave();
    };

    return [
      h('h2', { class: 'sheet-title' }, title),
      h('p', { class: 'sub' }, `${fmtRange(block.start, block.end)} · ${block.reason}`),
      ...(extra ? extra(close) : []),
      h(
        'div',
        { class: 'row time-row' },
        h('label', { class: 'field' }, h('span', {}, 'Start'), startIn),
        h('label', { class: 'field' }, h('span', {}, 'End'), endIn),
      ),
      err,
      h('button', { type: 'button', class: 'btn', onclick: save }, 'Save new time'),
      onRemove
        ? h(
            'button',
            {
              type: 'button',
              class: 'btn ghost danger',
              onclick: () => {
                close();
                onRemove();
              },
            },
            'Remove from today',
          )
        : null,
      h('button', { type: 'button', class: 'btn ghost', onclick: close }, 'Close'),
    ];
  });
}
