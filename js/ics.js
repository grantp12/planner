// Builds an .ics calendar file from today's personal blocks.
// Times are "floating" (no time zone), which calendars read as local time.
// Each event gets a reminder 5 minutes before it starts.

import { parseKey } from './time.js';

const pad = (n) => String(n).padStart(2, '0');
const EXPORTABLE = new Set(['task', 'routine']);

function localStamp(date, min) {
  const d = parseKey(date);
  d.setMinutes(min); // handles minutes past midnight
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
}

const utcStamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

const esc = (s) =>
  String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');

// RFC 5545: lines longer than 75 octets are folded.
function fold(line) {
  const out = [];
  while (line.length > 73) {
    out.push(line.slice(0, 73));
    line = ' ' + line.slice(73);
  }
  out.push(line);
  return out.join('\r\n');
}

export const exportableBlocks = (blocks) => blocks.filter((b) => EXPORTABLE.has(b.type));

export function buildIcs(date, blocks) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Planner//Personal Planner//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const b of exportableBlocks(blocks)) {
    const title = b.part ? `${b.title} (${b.part})` : b.title;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${b.id}@planner.local`,
      `DTSTAMP:${utcStamp()}`,
      `DTSTART:${localStamp(date, b.start)}`,
      `DTEND:${localStamp(date, b.end)}`,
      `SUMMARY:${esc(title)}`,
      `DESCRIPTION:${esc(b.reason)}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${esc(title)}`,
      'TRIGGER:-PT5M',
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
