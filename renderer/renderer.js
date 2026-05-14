const normalEl = document.getElementById('face-normal');
const surprisedEl = document.getElementById('face-surprised');
const projectListEl = document.getElementById('project-list');
const frameEl = document.getElementById('frame');
const { readState, readConfig } = window.petAPI;

frameEl.addEventListener('mouseenter', () => {
  frameEl.classList.add('hovered');
});
frameEl.addEventListener('mouseleave', () => {
  frameEl.classList.remove('hovered');
});

frameEl.addEventListener('mousedown', (e) => {
  if (e.target.closest('#tooltip')) return;
  if (e.button !== 0) return;
  window.petAPI.dragStart();
});
document.addEventListener('mouseup', () => window.petAPI.dragStop());
window.addEventListener('blur', () => window.petAPI.dragStop());

document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  window.petAPI.openEditor();
});

let lastProjectsHash = null;
function projectMatchesAnyWait(project, waitingCwds) {
  const root = project.replace(/\/$/, '');
  return waitingCwds.some((cwd) => cwd === root || (cwd || '').startsWith(root + '/'));
}

function renderProjectsIfChanged(projects, waitingCwds) {
  const list = Array.isArray(projects) ? projects : [];
  const waits = Array.isArray(waitingCwds) ? waitingCwds : [];
  const hash = JSON.stringify([list, waits]);
  if (hash === lastProjectsHash) return;
  lastProjectsHash = hash;
  projectListEl.innerHTML = '';
  if (list.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = '(none configured)';
    projectListEl.appendChild(li);
    return;
  }
  for (const p of list) {
    const li = document.createElement('li');
    const parts = p.replace(/\/$/, '').split('/').filter(Boolean);
    li.textContent = parts.slice(-2).join('/') || p;
    li.title = p;
    if (projectMatchesAnyWait(p, waits)) li.classList.add('waiting');
    projectListEl.appendChild(li);
  }
}

normalEl.addEventListener('error', (e) => console.error('[claude-pet] normal load failed', e));
surprisedEl.addEventListener('error', (e) => console.error('[claude-pet] surprised load failed', e));
normalEl.addEventListener('load', () => console.log('[claude-pet] normal loaded', normalEl.src, normalEl.naturalWidth, 'x', normalEl.naturalHeight));
surprisedEl.addEventListener('load', () => console.log('[claude-pet] surprised loaded', surprisedEl.src, surprisedEl.naturalWidth, 'x', surprisedEl.naturalHeight));

let currentMood = null;

function setMood(mood) {
  if (mood === currentMood) return;
  currentMood = mood;
  const show = mood === 'surprised' ? surprisedEl : normalEl;
  const hide = mood === 'surprised' ? normalEl : surprisedEl;
  show.classList.add('show');
  hide.classList.remove('show');
  show.classList.add('bump');
  setTimeout(() => show.classList.remove('bump'), 140);
  frameEl.classList.toggle('surprised', mood === 'surprised');
}

const STALE_SESSION_MS = 10 * 60 * 1000;
const WAIT_TIMEOUT_MS = 10 * 1000;
const SURPRISED_DEBOUNCE_MS = 3000;

function isSessionWaiting(s, now) {
  if (!s.waitingForUser) return false;
  if (now - (s.lastEventAt || 0) >= STALE_SESSION_MS) return false;
  if (s.lastSetAt && now - s.lastSetAt >= WAIT_TIMEOUT_MS) return false;
  if (!s.waitingSince || now - s.waitingSince < SURPRISED_DEBOUNCE_MS) return false;
  return true;
}

function getWaitingCwds(state) {
  const now = Date.now();
  return Object.values(state.sessions || {})
    .filter((s) => isSessionWaiting(s, now))
    .map((s) => s.cwd);
}

function computeMood(state) {
  return getWaitingCwds(state).length > 0 ? 'surprised' : 'normal';
}

function tick() {
  const config = readConfig();
  const state = readState();
  const waits = getWaitingCwds(state);
  setMood(waits.length > 0 ? 'surprised' : 'normal');
  renderProjectsIfChanged(config.projects, waits);
}

setMood('normal');
const config = readConfig();
setInterval(tick, config.pollIntervalMs || 500);
tick();
