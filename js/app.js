// App entry: loads settings, runs the once-a-day rollover rules, and swaps
// views based on the URL hash (#today, #plan, #checkin, #settings, #setup).

import { getSettings, getRoutine } from './store.js';
import { runDailyMaintenance } from './rollover.js';
import { dateKey } from './time.js';
import { renderToday } from './views/today.js';
import { renderPlan } from './views/plan.js';
import { renderCheckin } from './views/checkin.js';
import { renderSettings } from './views/settings.js';
import { renderOnboarding } from './views/onboarding.js';

const root = document.getElementById('app');
const routes = { today: renderToday, plan: renderPlan, checkin: renderCheckin, settings: renderSettings, setup: renderOnboarding };

const ctx = {
  today: dateKey(),
  settings: null,
  routine: [],
  maintenance: { freshStart: false },
  timers: [],
  async startDay() {
    ctx.today = dateKey();
    ctx.settings = await getSettings();
    ctx.maintenance = await runDailyMaintenance(ctx.settings, ctx.today);
  },
  go(name) {
    if (location.hash === `#${name}`) render();
    else location.hash = `#${name}`;
  },
  every(ms, fn) {
    ctx.timers.push(setInterval(fn, ms));
  },
};

// Renders are queued so two quick hash changes can't interleave.
let queue = Promise.resolve();
const render = () => (queue = queue.then(doRender, doRender));

async function doRender() {
  ctx.timers.forEach(clearInterval);
  ctx.timers = [];
  ctx.settings = await getSettings();
  ctx.routine = await getRoutine();

  let name = location.hash.slice(1) || 'today';
  if (!ctx.settings.onboarded) name = 'setup';
  if (!routes[name]) name = 'today';

  document.body.classList.toggle('no-nav', name === 'setup');
  for (const a of document.querySelectorAll('#tabbar a')) {
    if (a.dataset.route === name) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  root.replaceChildren();
  try {
    await routes[name](root, ctx);
  } catch (err) {
    console.error(err);
    root.textContent = 'Something went wrong drawing this screen. Try reloading.';
  }
  window.scrollTo(0, 0);
}

async function boot() {
  try {
    ctx.settings = await getSettings();
    if (ctx.settings.onboarded) await ctx.startDay();
  } catch (err) {
    console.error(err);
    root.textContent = "Couldn't open on-device storage. Private Browsing can block it; try a normal Safari tab.";
    return;
  }
  window.addEventListener('hashchange', render);
  // If the app was left open overnight, roll the day over when you come back to it.
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && ctx.settings?.onboarded && dateKey() !== ctx.today) {
      await ctx.startDay();
      render();
    }
  });
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW failed', e));
}

boot();
