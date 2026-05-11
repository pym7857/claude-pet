const { getProjects, pickFolder, saveProjects, closeEditor } = window.petAPI;

const listEl = document.getElementById('list');
const addBtn = document.getElementById('add');
const saveBtn = document.getElementById('save');
const cancelBtn = document.getElementById('cancel');
const statusEl = document.getElementById('status');

let projects = [];
let dirty = false;

function setStatus(msg, cls) {
  statusEl.textContent = msg || '';
  statusEl.className = 'status' + (cls ? ' ' + cls : '');
}

function render() {
  listEl.innerHTML = '';
  if (projects.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = '(no folders tracked yet — click "+ Add folder…")';
    listEl.appendChild(li);
    return;
  }
  projects.forEach((p, i) => {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.className = 'path';
    span.textContent = p;
    span.title = p;
    const btn = document.createElement('button');
    btn.className = 'remove';
    btn.textContent = '✕';
    btn.title = 'Remove this folder';
    btn.onclick = () => {
      projects.splice(i, 1);
      dirty = true;
      setStatus('');
      render();
    };
    li.appendChild(span);
    li.appendChild(btn);
    listEl.appendChild(li);
  });
}

addBtn.onclick = async () => {
  const folder = await pickFolder();
  if (!folder) return;
  if (projects.includes(folder)) {
    setStatus('That folder is already tracked.', 'error');
    return;
  }
  projects.push(folder);
  dirty = true;
  setStatus('');
  render();
};

saveBtn.onclick = async () => {
  setStatus('Saving…');
  saveBtn.disabled = true;
  const r = await saveProjects(projects);
  saveBtn.disabled = false;
  if (r && r.ok) {
    setStatus('Saved.', 'success');
    dirty = false;
    setTimeout(closeEditor, 600);
  } else {
    setStatus('Save failed: ' + ((r && r.error) || 'unknown error'), 'error');
  }
};

cancelBtn.onclick = () => {
  if (dirty && !confirm('Discard unsaved changes?')) return;
  closeEditor();
};

(async () => {
  try {
    projects = await getProjects();
  } catch {
    projects = [];
  }
  render();
})();
