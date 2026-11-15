// Time helpers. Times of day are stored as "HH:MM" strings in settings and as
// minutes-since-midnight numbers everywhere else (easier math). Minutes can go
// past 1440 when bedtime is after midnight; formatting wraps them back.

const pad = (n) => String(n).padStart(2, '0');
const wrap = (min) => ((Math.round(min) % 1440) + 1440) % 1440;

export const toMin = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + (m || 0);
};

export const toHHMM = (min) => {
  const m = wrap(min);
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
};

// 450 -> "7:30 AM", 540 -> "9 AM"
export const fmt = (min) => {
  const m = wrap(min);
  let h = Math.floor(m / 60);
  const mm = m % 60;
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return mm ? `${h}:${pad(mm)} ${ap}` : `${h} ${ap}`;
};

// Short form for the timeline column: "7:30" / "9:00"
export const fmtShort = (min) => {
  const m = wrap(min);
  const h = Math.floor(m / 60) % 12 || 12;
  return `${h}:${pad(m % 60)}`;
};

export const fmtRange = (a, b) => `${fmt(a)} – ${fmt(b)}`;

export const fmtDuration = (m) => {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
};

// Dates are local "YYYY-MM-DD" keys. String comparison sorts them correctly.
export const dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const parseKey = (k) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (k, n) => {
  const d = parseKey(k);
  d.setDate(d.getDate() + n);
  return dateKey(d);
};

export const weekday = (k) => parseKey(k).getDay(); // 0 = Sunday

export const daysBetween = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 86400000);

export const nowMin = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const dayName = (k) => DAY_LONG[weekday(k)];

export const niceDate = (k) =>
  parseKey(k).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
