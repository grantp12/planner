// Tiny DOM helpers. Everything is built with createElement + textContent, so
// anything you type is never interpreted as HTML.

export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value' || k === 'checked') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

// Chip group. Single choice (radio-like) or multi (toggle list).
export function choice({ options, value, multi = false, onChange, className = '', label }) {
  let current = multi ? [...value] : value;
  const wrap = h('div', { class: `chips ${className}`, role: multi ? 'group' : 'radiogroup', 'aria-label': label });
  const selected = (v) => (multi ? current.includes(v) : current === v);
  const draw = () =>
    wrap.replaceChildren(
      ...options.map((o) =>
        h(
          'button',
          {
            type: 'button',
            class: 'chip',
            role: multi ? null : 'radio',
            'aria-pressed': multi ? String(selected(o.value)) : null,
            'aria-checked': multi ? null : String(selected(o.value)),
            onclick: () => {
              if (multi) current = selected(o.value) ? current.filter((x) => x !== o.value) : [...current, o.value];
              else current = o.value;
              draw();
              onChange?.(current);
            },
          },
          o.label,
        ),
      ),
    );
  draw();
  return wrap;
}

export function stepper({ value, min = 0, max = 600, step = 5, format = (v) => `${v} min`, onChange, label }) {
  let v = value;
  const out = h('output', { 'aria-live': 'polite' }, format(v));
  const set = (n) => {
    v = Math.max(min, Math.min(max, n));
    out.textContent = format(v);
    onChange?.(v);
  };
  return h(
    'div',
    { class: 'stepper', role: 'group', 'aria-label': label },
    h('button', { type: 'button', 'aria-label': 'Less', onclick: () => set(v - step) }, '−'),
    out,
    h('button', { type: 'button', 'aria-label': 'More', onclick: () => set(v + step) }, '+'),
  );
}

export function timeInput(value, onChange, attrs = {}) {
  return h('input', {
    type: 'time',
    value,
    ...attrs,
    onchange: (e) => e.target.value && onChange(e.target.value),
  });
}

export function openSheet(build) {
  const prevFocus = document.activeElement;
  const backdrop = h('div', { class: 'sheet-backdrop' });
  const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', tabindex: '-1' });
  const close = () => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
    prevFocus?.focus?.();
  };
  const onKey = (e) => e.key === 'Escape' && close();
  backdrop.addEventListener('click', (e) => e.target === backdrop && close());
  document.addEventListener('keydown', onKey);
  panel.append(h('div', { class: 'grabber', 'aria-hidden': 'true' }), ...[].concat(build(close)).filter(Boolean));
  backdrop.append(panel);
  document.body.append(backdrop);
  requestAnimationFrame(() => {
    backdrop.classList.add('open');
    panel.focus();
  });
  return close;
}

let toastTimer;
export function toast(msg) {
  document.querySelector('.toast')?.remove();
  const el = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 2200);
}

// Saves a file. In the installed iPhone app, downloads are unreliable, so we
// use the share sheet there (Save to Files / open in Calendar).
export async function saveFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone && navigator.canShare) {
    const file = new File([blob], filename, { type: mime });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// replaceChildren() would print null/false as text; this skips them.
export const fill = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));
