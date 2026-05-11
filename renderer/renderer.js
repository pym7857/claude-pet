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
  window.petAPI.dragStart();
});
document.addEventListener('mouseup', () => window.petAPI.dragStop());
window.addEventListener('blur', () => window.petAPI.dragStop());

let lastProjectsHash = null;
function renderProjectsIfChanged(projects) {
  const list = Array.isArray(projects) ? projects : [];
  const hash = list.join('\n');
  console.log('[claude-pet] renderProjects called with', list.length, 'projects:', list);
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
    projectListEl.appendChild(li);
  }
  console.log('[claude-pet] rendered', projectListEl.children.length, 'items');
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
const WAIT_TIMEOUT_MS = 60 * 1000;

function computeMood(state) {
  const now = Date.now();
  const sessions = Object.values(state.sessions || {});
  const anyWaiting = sessions.some((s) => {
    if (!s.waitingForUser) return false;
    if (now - (s.lastEventAt || 0) >= STALE_SESSION_MS) return false;
    if (s.lastSetAt && now - s.lastSetAt >= WAIT_TIMEOUT_MS) return false;
    return true;
  });
  return anyWaiting ? 'surprised' : 'normal';
}

function tick() {
  const config = readConfig();
  const state = readState();
  setMood(computeMood(state));
  renderProjectsIfChanged(config.projects);
}

setMood('normal');
const config = readConfig();
setInterval(tick, config.pollIntervalMs || 500);
tick();
