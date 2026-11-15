// The rule-based planner. Pure function: same inputs -> same plan, no storage.
//
//   buildPlan({ settings, routine, tasks, date, lunchFree })
//     -> { blocks, overflow, notes, stats, frame, ... }
//
// Phase 2's AI planner can return the same shape from a serverless function
// and the views won't need to change.
//
// How a window is filled: each window has a `head` (things pinned to its
// start: decompression, routine items like "after I wake up"), a `body`
// (tasks, packed after the head) and a `tail` (things pinned to its end, like
// "before I leave" or bedtime routine). Gaps (buffers/breaks) are inserted
// automatically, and an item only goes in if the whole window still fits.

import { dayFrame } from './windows.js';
import { addDays, weekday, dayName, fmtDuration } from './time.js';
import { uid } from './db.js';

export const RULES = {
  buffer: 10, // minutes between blocks
  longBlock: 50, // a focus block this long earns a break after it
  breakMin: 15,
  decompress: 30, // unscheduled time right after work
  cap: 0.7, // never schedule more than ~70% of free time
  lunchMax: 30, // lunch only holds short tasks
  minChunk: 20, // smallest useful piece when splitting a task
  maxFocusWorkday: 90, // longest single focus block on a workday
  maxFocusDayOff: 150, // weekends allow longer focus blocks
};

const total = (items) => items.reduce((s, i) => s + i.minutes, 0);

function gapBetween(a, b) {
  if (a.type === 'decompress') return null; // decompression is already open time
  if (a.type === 'task' && a.minutes >= RULES.longBlock) {
    return { type: 'break', title: 'Break', minutes: RULES.breakMin, reason: 'Short break after a long focus block' };
  }
  if (a.type === 'task' || b.type === 'task') {
    return { type: 'buffer', title: 'Buffer', minutes: RULES.buffer, reason: 'Breathing room between blocks' };
  }
  return null; // routine items chain together naturally
}

function withGaps(items) {
  const out = [];
  items.forEach((it, i) => {
    if (i > 0) {
      const g = gapBetween(items[i - 1], it);
      if (g) out.push(g);
    }
    out.push(it);
  });
  return out;
}

// An item fits if the window has room for everything plus gaps, AND the
// window itself stays under the ~70% cap (so no single window gets packed
// wall-to-wall, e.g. a morning with no time to get ready).
const scheduledIn = (items) => total(items.filter((i) => i.type === 'task' || i.type === 'routine'));
const fits = (w) => {
  const all = [...w.head, ...w.body, ...w.tail];
  const len = w.end - w.start;
  return total(withGaps(all)) <= len && scheduledIn(all) <= Math.max(RULES.lunchMax, len * RULES.cap);
};

function tryPlace(win, items) {
  win.body.push(...items);
  if (fits(win)) return true;
  win.body.splice(win.body.length - items.length, items.length);
  return false;
}

function chunkSizes(minutes, maxFocus) {
  const n = Math.ceil(minutes / maxFocus);
  if (n <= 1) return [minutes];
  const base = Math.floor(minutes / n / 5) * 5;
  const parts = Array(n).fill(base);
  parts[n - 1] += minutes - base * n;
  return parts;
}

function taskItems(task, minutes, reason, maxFocus) {
  return chunkSizes(minutes, maxFocus).map((m) => ({
    type: 'task',
    title: task.title,
    minutes: m,
    taskId: task.id,
    kind: task.kind,
    reason,
  }));
}

// Largest multiple of 5 minutes of `task` that still fits in `win`.
function roomFor(win, task, maxFocus, limit) {
  for (let m = Math.floor(limit / 5) * 5; m >= 5; m -= 5) {
    const items = taskItems(task, m, '', maxFocus);
    if (tryPlace(win, items)) {
      win.body.splice(win.body.length - items.length, items.length);
      return m;
    }
  }
  return 0;
}

function anchorSlot(anchor, frame, w) {
  if (frame.workday) {
    const map = {
      wake: [w.beforeWork, 'head'],
      leave: [w.beforeWork, 'tail'],
      lunch: [w.lunch, 'head'],
      home: [w.afterWork, 'head'],
      bed: [w.afterWork, 'tail'],
    };
    const hit = map[anchor];
    return hit && hit[0] ? hit : null;
  }
  const am = w.weekendAM || w.weekendPM;
  const pm = w.weekendPM || w.weekendAM;
  const map = { wake: [am, 'head'], leave: [am, 'head'], lunch: [pm, 'head'], home: [pm, 'head'], bed: [pm, 'tail'] };
  const hit = map[anchor];
  return hit && hit[0] ? hit : null;
}

const ANCHOR_WORDS = { wake: 'morning', leave: 'before-work', lunch: 'lunch', home: 'after-work', bed: 'bedtime' };

export function nextDayOff(settings, date) {
  for (let i = 1; i <= 7; i++) {
    const d = addDays(date, i);
    if (!settings.workDays.includes(weekday(d))) return d;
  }
  return addDays(date, 1);
}

export function moveLabel(from, to) {
  return to === addDays(from, 1) ? 'tomorrow' : dayName(to);
}

export function buildPlan({ settings, routine = [], tasks = [], date, lunchFree = false }) {
  const frame = dayFrame(settings, date, lunchFree);
  const maxFocus = frame.workday ? RULES.maxFocusWorkday : RULES.maxFocusDayOff;
  const wins = frame.windows.map((w) => ({ ...w, head: [], body: [], tail: [] }));
  const byId = Object.fromEntries(wins.map((w) => [w.id, w]));
  const notes = [];
  const overflow = [];

  const free = wins.reduce((s, w) => s + (w.end - w.start), 0);
  const cap = Math.floor(free * RULES.cap);
  let used = 0;

  // 1. Decompression right after work, before anything personal.
  if (byId.afterWork) {
    byId.afterWork.head.push({
      type: 'decompress',
      title: 'Decompress',
      minutes: RULES.decompress,
      reason: 'Unscheduled time to land after work',
    });
  }

  // 2. Routine items at their trigger points.
  for (const r of routine) {
    const slot = anchorSlot(r.anchor, frame, byId);
    const item = { type: 'routine', title: r.action, minutes: r.minutes, routineId: r.id, reason: `After ${r.trigger}` };
    if (!slot) {
      notes.push(`"${r.action}" skipped: no ${ANCHOR_WORDS[r.anchor] || ''} free time today.`);
      continue;
    }
    const [win, part] = slot;
    win[part].push(item);
    if (!fits(win)) {
      win[part].pop();
      notes.push(`"${r.action}" skipped: ${win.label.toLowerCase()} is too short today.`);
      continue;
    }
    used += r.minutes;
  }

  const moveTo = frame.workday ? nextDayOff(settings, date) : addDays(date, 1);
  const overflowFor = (task, why, shortenTo = 0) =>
    overflow.push({ task, why, moveTo, moveLabel: moveLabel(date, moveTo), shortenTo: shortenTo >= 15 ? shortenTo : 0 });

  // 3. The main task goes in the highest-energy window (lunch never counts).
  const main = tasks.find((t) => t.kind === 'main');
  const smalls = tasks.filter((t) => t !== main);
  const focusWins = () => wins.filter((w) => w.id !== 'lunch');

  if (main) {
    const ranked = focusWins().sort(
      (a, b) => b.energy - a.energy || roomFor(b, main, maxFocus, 600) - roomFor(a, main, maxFocus, 600),
    );
    const capLeft = cap - used;
    let placed = false;

    if (main.minutes > capLeft) {
      overflowFor(
        main,
        `It would fill more than ~70% of your free time today (${fmtDuration(free)} free).`,
        Math.min(capLeft, Math.max(0, ...ranked.map((w) => roomFor(w, main, maxFocus, capLeft)))),
      );
      placed = null; // handled
    } else {
      // Order of preference: whole task in the best window -> split across the
      // two best windows (keeps part of it in high energy) -> whole task in a
      // lower-energy window -> doesn't fit (suggest moving/shortening).
      const best = ranked[0];
      if (best) {
        const tie = ranked.length > 1 && ranked[1].energy === best.energy;
        const reason = tie
          ? `${best.label}: most open time in your best-energy windows`
          : `${best.label}: your highest-energy window`;
        placed = tryPlace(best, taskItems(main, main.minutes, reason, maxFocus));
      }
      if (!placed && ranked.length > 1) {
        const [a, b] = ranked;
        const first = roomFor(a, main, maxFocus, main.minutes - RULES.minChunk);
        const rest = main.minutes - first;
        if (first >= RULES.minChunk && rest >= RULES.minChunk) {
          const second = taskItems(main, rest, `${b.label}: the rest of a long task`, maxFocus);
          if (tryPlace(b, second)) {
            tryPlace(a, taskItems(main, first, `${a.label}: your best-energy window (rest later)`, maxFocus));
            placed = true;
            notes.push(
              `"${main.title}" is too long for one window, so it's split: ${fmtDuration(first)} ${a.label.toLowerCase()}, ${fmtDuration(rest)} ${b.label.toLowerCase()}.` +
                (frame.workday ? ` Or move it to ${dayName(moveTo)} for one longer block.` : ''),
            );
          }
        }
      }
      for (const w of ranked.slice(1)) {
        if (placed) break;
        placed = tryPlace(w, taskItems(main, main.minutes, `${w.label}: didn't fit ${best.label.toLowerCase()}`, maxFocus));
      }
      if (!placed) {
        const room = Math.max(0, ...ranked.map((w) => roomFor(w, main, maxFocus, capLeft)));
        overflowFor(
          main,
          room
            ? `It needs ${fmtDuration(main.minutes)}; the most open stretch today is about ${fmtDuration(room)}.`
            : `There's no open stretch long enough today.`,
          room,
        );
      }
    }
    if (placed) used += main.minutes;
  }

  // 4. Small tasks: lunch first if it's free and the task is short, else the
  //    window with the most room left.
  for (const t of smalls) {
    if (used + t.minutes > cap) {
      overflowFor(t, 'Adding it would fill more than ~70% of your free time.');
      continue;
    }
    const order = [];
    if (byId.lunch && t.minutes <= RULES.lunchMax) order.push([byId.lunch, 'Lunch: short, low-setup task']);
    const others = focusWins().sort((a, b) => roomFor(b, t, maxFocus, 600) - roomFor(a, t, maxFocus, 600));
    others.forEach((w, i) => order.push([w, i === 0 ? `${w.label}: most open time left` : `${w.label}: room left here`]));
    let ok = false;
    for (const [w, reason] of order) {
      if (tryPlace(w, taskItems(t, t.minutes, reason, maxFocus))) {
        ok = true;
        break;
      }
    }
    if (ok) used += t.minutes;
    else overflowFor(t, 'No open stretch left today that fits it.');
  }

  // 5. Turn windows into timed blocks. Head+body pack from the window start;
  //    tail ends at the window end; whatever's between stays open.
  const blocks = [];
  const mk = (it, start, w) => ({
    id: uid(),
    type: it.type,
    title: it.title,
    start,
    end: start + it.minutes,
    window: w.id,
    reason: it.reason,
    taskId: it.taskId || null,
    routineId: it.routineId || null,
    kind: it.kind || null,
    part: null,
    done: false,
  });
  for (const w of wins) {
    let t = w.start;
    for (const it of withGaps([...w.head, ...w.body])) {
      blocks.push(mk(it, t, w));
      t += it.minutes;
    }
    const tail = withGaps(w.tail);
    let tt = w.end - total(tail);
    for (const it of tail) {
      blocks.push(mk(it, tt, w));
      tt += it.minutes;
    }
  }
  if (frame.workday) {
    blocks.push({
      id: uid(),
      type: 'work',
      title: 'Work',
      start: frame.work.start,
      end: frame.work.end,
      window: 'work',
      reason: '',
      done: false,
    });
  }
  blocks.sort((a, b) => a.start - b.start);

  // Label split tasks "1/3", "2/3"... in time order.
  const partsByTask = {};
  for (const b of blocks) if (b.taskId) (partsByTask[b.taskId] ||= []).push(b);
  for (const parts of Object.values(partsByTask)) {
    if (parts.length > 1) parts.forEach((b, i) => (b.part = `${i + 1}/${parts.length}`));
  }

  return {
    date,
    workday: frame.workday,
    lunchFree: !!(frame.workday && lunchFree),
    frame,
    blocks,
    overflow,
    notes,
    stats: { free, cap, used },
  };
}

// Used when you edit a block by hand.
export function validateBlock(start, end, frame) {
  if (end <= start) return 'End time needs to be after the start.';
  if (frame.workday && frame.work) {
    const { work, lunch } = frame;
    if (start < work.end && end > work.start) {
      const inLunch = lunch.free && start >= lunch.start && end <= lunch.end;
      if (!inLunch) return lunch.free ? 'That overlaps work hours. Only your lunch break is open.' : 'That overlaps work hours.';
      if (end - start > RULES.lunchMax) return `Lunch blocks max out at ${RULES.lunchMax} minutes.`;
    }
  }
  return null;
}
