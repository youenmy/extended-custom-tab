const DEFAULT_SHORTCUTS = [
  { name: 'Я.Карты', url: 'https://yandex.ru/maps' },
  { name: 'Firstbyte', url: 'https://firstbyte.ru' },
  { name: 'GMAIL', url: 'https://mail.google.com' },
  { name: 'ECP', url: 'https://ecp.gov' },
  { name: 'ЦОД Казахстан', url: 'https://example.kz' }
];

const storage = (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local)
  ? chrome.storage.local
  : {
      get: (keys) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        const result = {};
        arr.forEach((k) => { result[k] = JSON.parse(localStorage.getItem(k) || 'null'); });
        return Promise.resolve(result);
      },
      set: (obj) => { Object.entries(obj).forEach(([k, v]) => localStorage.setItem(k, JSON.stringify(v))); return Promise.resolve(); }
    };

const syncStorage = (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync)
  ? chrome.storage.sync
  : storage;

let shortcuts = [];
let editingIndex = -1;
let draggedIndex = -1;

const shortcutsEl = document.getElementById('shortcuts');
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modalTitle');
const nameInput = document.getElementById('shortcutName');
const urlInput = document.getElementById('shortcutUrl');
const saveBtn = document.getElementById('saveBtn');
const cancelBtn = document.getElementById('cancelBtn');
const deleteBtn = document.getElementById('deleteBtn');
const addBtn = document.getElementById('addBtn');
const bgBtn = document.getElementById('bgBtn');
const bgInput = document.getElementById('bgInput');
const bgResetBtn = document.getElementById('bgResetBtn');
const settingsBtn = document.getElementById('settingsBtn');
const settingsMenu = document.getElementById('settingsMenu');

async function load() {
  const data = await storage.get(['shortcuts', 'background']);
  shortcuts = (data && data.shortcuts) || DEFAULT_SHORTCUTS;
  applyBackground(data && data.background);
  render();
}

function applyBackground(dataUrl) {
  if (dataUrl) {
    document.body.style.backgroundImage = `url("${dataUrl}")`;
    document.body.classList.add('has-bg');
    bgResetBtn.hidden = false;
  } else {
    document.body.style.backgroundImage = '';
    document.body.classList.remove('has-bg');
    bgResetBtn.hidden = true;
  }
}

async function setBackgroundFromFile(file) {
  try {
    const dataUrl = await imageFileToDataUrl(file);
    await storage.set({ background: dataUrl });
    applyBackground(dataUrl);
  } catch (err) {
    console.error(err);
    alert('Не удалось установить фон: ' + (err && err.message ? err.message : 'неизвестная ошибка'));
  }
}

function imageFileToDataUrl(file, maxWidth = 2560, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objUrl);
      try {
        let { width, height } = img;
        if (width > maxWidth) {
          height = Math.round(height * (maxWidth / width));
          width = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(objUrl); reject(new Error('не удалось прочитать изображение')); };
    img.src = objUrl;
  });
}

async function save() {
  await storage.set({ shortcuts });
}

function normalizeUrl(url) {
  if (!url) return '';
  return /^https?:\/\//.test(url) ? url : 'https://' + url;
}

function faviconUrl(url) {
  try {
    const u = new URL(normalizeUrl(url));
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
      const favUrl = new URL(chrome.runtime.getURL('/_favicon/'));
      favUrl.searchParams.set('pageUrl', u.href);
      favUrl.searchParams.set('size', '32');
      return favUrl.href;
    }
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(u.hostname)}&sz=64`;
  } catch {
    return '';
  }
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function firstLetter(s) {
  return (s || '?').trim().charAt(0).toUpperCase();
}

function render() {
  shortcutsEl.innerHTML = '';
  shortcuts.forEach((s, i) => {
    const a = document.createElement('a');
    a.href = normalizeUrl(s.url);
    a.className = 'shortcut';
    a.draggable = true;
    a.dataset.index = i;

    const fav = faviconUrl(s.url);
    a.innerHTML = `
      <button class="shortcut-edit" title="Изменить">⋮</button>
      <div class="shortcut-icon">
        ${fav ? `<img src="${fav}" alt="" loading="lazy">` : `<span>${escapeHtml(firstLetter(s.name))}</span>`}
      </div>
      <div class="shortcut-name">${escapeHtml(s.name)}</div>
    `;

    const img = a.querySelector('img');
    if (img) {
      img.addEventListener('error', () => {
        img.replaceWith(Object.assign(document.createElement('span'), { textContent: firstLetter(s.name) }));
      });
    }

    a.querySelector('.shortcut-edit').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openModal(i);
    });

    addDragHandlers(a);
    shortcutsEl.appendChild(a);
  });
}

function openModal(index = -1) {
  editingIndex = index;
  if (index >= 0) {
    modalTitle.textContent = 'Изменить ярлык';
    nameInput.value = shortcuts[index].name;
    urlInput.value = shortcuts[index].url;
    deleteBtn.style.display = 'block';
  } else {
    modalTitle.textContent = 'Новый ярлык';
    nameInput.value = '';
    urlInput.value = '';
    deleteBtn.style.display = 'none';
  }
  modal.classList.add('active');
  setTimeout(() => nameInput.focus(), 0);
}

function closeModal() {
  modal.classList.remove('active');
  editingIndex = -1;
}

addBtn.addEventListener('click', () => openModal(-1));

bgBtn.addEventListener('click', () => {
  bgInput.click();
  settingsMenu.hidden = true;
});

bgInput.addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (file) await setBackgroundFromFile(file);
  bgInput.value = '';
});

bgResetBtn.addEventListener('click', async () => {
  await storage.set({ background: null });
  applyBackground(null);
  settingsMenu.hidden = true;
});

settingsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  settingsMenu.hidden = !settingsMenu.hidden;
});

document.addEventListener('click', (e) => {
  if (!settingsMenu.hidden && !settingsMenu.contains(e.target) && e.target !== settingsBtn) {
    settingsMenu.hidden = true;
  }
});

cancelBtn.addEventListener('click', closeModal);

saveBtn.addEventListener('click', async () => {
  const name = nameInput.value.trim();
  const url = urlInput.value.trim();
  if (!name || !url) {
    if (!name) nameInput.focus();
    else urlInput.focus();
    return;
  }
  if (editingIndex >= 0) {
    shortcuts[editingIndex] = { name, url };
  } else {
    shortcuts.push({ name, url });
  }
  await save();
  render();
  closeModal();
});

deleteBtn.addEventListener('click', async () => {
  if (editingIndex >= 0) {
    shortcuts.splice(editingIndex, 1);
    await save();
    render();
    closeModal();
  }
});

modal.addEventListener('click', (e) => {
  if (e.target === modal) closeModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (modal.classList.contains('active')) closeModal();
    if (!settingsMenu.hidden) settingsMenu.hidden = true;
  }
  if (e.key === 'Enter' && modal.classList.contains('active') && document.activeElement !== nameInput && document.activeElement !== urlInput) {
    saveBtn.click();
  }
});

[nameInput, urlInput].forEach((inp) => {
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveBtn.click();
    }
  });
});

function addDragHandlers(el) {
  el.addEventListener('dragstart', (e) => {
    draggedIndex = parseInt(el.dataset.index, 10);
    el.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-shortcut-index', String(draggedIndex));
  });
  el.addEventListener('dragend', () => {
    el.classList.remove('dragging');
    document.querySelectorAll('.drag-over').forEach((x) => x.classList.remove('drag-over'));
    draggedIndex = -1;
  });
  el.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  });
  el.addEventListener('dragenter', (e) => {
    e.preventDefault();
    if (parseInt(el.dataset.index, 10) !== draggedIndex) el.classList.add('drag-over');
  });
  el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
  el.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    el.classList.remove('drag-over');
    clearExtDragState();

    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      await setBackgroundFromFile(file);
      return;
    }

    const targetIndex = parseInt(el.dataset.index, 10);
    if (e.dataTransfer.getData('application/x-shortcut-index')) {
      if (draggedIndex >= 0 && draggedIndex !== targetIndex) {
        const [moved] = shortcuts.splice(draggedIndex, 1);
        shortcuts.splice(targetIndex, 0, moved);
        await save();
        render();
      }
    } else {
      const parsed = parseDroppedData(e.dataTransfer);
      if (parsed) {
        shortcuts.splice(targetIndex, 0, parsed);
        await save();
        render();
      }
    }
  });
}

function parseDroppedData(dataTransfer) {
  let url = '';
  let name = '';

  const uriList = dataTransfer.getData('text/uri-list');
  if (uriList) {
    const lines = uriList.split(/\r?\n/).filter((l) => l && !l.startsWith('#'));
    if (lines[0]) url = lines[0].trim();
  }

  if (!url) {
    const plain = dataTransfer.getData('text/plain');
    if (plain && /^https?:\/\//i.test(plain.trim())) url = plain.trim();
  }

  const html = dataTransfer.getData('text/html');
  if (html) {
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const link = doc.querySelector('a[href]');
      if (link) {
        if (!url) url = link.href;
        const text = (link.textContent || '').trim();
        if (text) name = text;
      }
    } catch {}
  }

  if (!url || !/^https?:/i.test(url)) return null;

  if (!name) {
    try {
      name = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      name = url;
    }
  }
  return { name, url };
}

function isExternalDrag(dt) {
  return !Array.from(dt.types).includes('application/x-shortcut-index');
}

function hasUrlInTransfer(dt) {
  const t = Array.from(dt.types);
  return t.includes('text/uri-list') || t.includes('text/plain') || t.includes('text/html');
}

let extDragCounter = 0;

function clearExtDragState() {
  extDragCounter = 0;
  shortcutsEl.classList.remove('drop-zone-active');
}

function dragKind(dt) {
  const types = Array.from(dt.types);
  if (types.includes('Files')) return 'file';
  if (hasUrlInTransfer(dt)) return 'url';
  return null;
}

document.addEventListener('dragenter', (e) => {
  if (!isExternalDrag(e.dataTransfer)) return;
  const kind = dragKind(e.dataTransfer);
  if (!kind) return;
  extDragCounter++;
  shortcutsEl.dataset.dropHint = kind === 'file'
    ? 'Отпустите чтобы установить фон'
    : 'Отпустите чтобы добавить ярлык';
  shortcutsEl.classList.add('drop-zone-active');
});

document.addEventListener('dragleave', (e) => {
  if (!isExternalDrag(e.dataTransfer)) return;
  if (!dragKind(e.dataTransfer)) return;
  extDragCounter = Math.max(0, extDragCounter - 1);
  if (extDragCounter === 0) shortcutsEl.classList.remove('drop-zone-active');
});

document.addEventListener('dragover', (e) => {
  if (isExternalDrag(e.dataTransfer)) e.preventDefault();
});

document.addEventListener('drop', async (e) => {
  if (!isExternalDrag(e.dataTransfer)) return;
  e.preventDefault();
  clearExtDragState();

  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) {
    await setBackgroundFromFile(file);
    return;
  }

  const parsed = parseDroppedData(e.dataTransfer);
  if (parsed) {
    shortcuts.push(parsed);
    await save();
    render();
  }
});

// === Notes ===

let notes = [];
let isEditingNote = false;
const notesListEl = document.getElementById('notesList');
const notesAddBtn = document.getElementById('notesAdd');

async function loadNotes() {
  try {
    const data = await syncStorage.get('notes');
    notes = (data && data.notes) || [];
  } catch {
    notes = [];
  }
  renderNotes();
}

async function saveNotes() {
  try {
    await syncStorage.set({ notes });
  } catch (e) {
    console.warn('saveNotes failed:', e);
  }
}

function renderNotes() {
  notesListEl.innerHTML = '';
  if (notes.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'notes-empty';
    empty.textContent = 'Пока нет заметок';
    notesListEl.appendChild(empty);
    return;
  }
  notes.forEach((n, i) => {
    const li = document.createElement('li');
    li.className = 'note' + (n.done ? ' done' : '');
    li.innerHTML = `
      <input type="checkbox" class="note-check" ${n.done ? 'checked' : ''} aria-label="Готово">
      <span class="note-text"></span>
      <button class="note-delete" title="Удалить" aria-label="Удалить">×</button>
    `;
    li.querySelector('.note-text').textContent = n.text || '(пусто)';
    li.querySelector('.note-check').addEventListener('change', async () => {
      notes[i].done = !notes[i].done;
      await saveNotes();
      renderNotes();
    });
    li.querySelector('.note-delete').addEventListener('click', async () => {
      notes.splice(i, 1);
      await saveNotes();
      renderNotes();
    });
    li.querySelector('.note-text').addEventListener('click', () => editNote(i));
    notesListEl.appendChild(li);
  });
}

function editNote(index, isNew = false) {
  const li = notesListEl.children[index];
  if (!li) return;
  const textEl = li.querySelector('.note-text');
  if (!textEl) return;
  const currentText = notes[index].text || '';

  isEditingNote = true;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'note-text-input';
  input.value = currentText;
  if (isNew) input.placeholder = 'Введите заметку...';
  textEl.replaceWith(input);
  input.focus();
  if (currentText) input.select();

  let finished = false;
  const finish = async (cancel = false) => {
    if (finished) return;
    finished = true;
    isEditingNote = false;
    const val = input.value.trim();
    if (cancel) {
      if (isNew) notes.splice(index, 1);
    } else if (!val) {
      if (isNew) notes.splice(index, 1);
    } else {
      notes[index].text = val;
    }
    await saveNotes();
    renderNotes();
  };
  input.addEventListener('blur', () => finish(false));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { e.preventDefault(); finish(true); }
  });
}

notesAddBtn.addEventListener('click', () => {
  if (isEditingNote) return;
  notes.unshift({ text: '', done: false });
  renderNotes();
  editNote(0, true);
});

if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.notes && !isEditingNote) {
      notes = changes.notes.newValue || [];
      renderNotes();
    }
  });
}

// === Calendar ===

const calendarContent = document.getElementById('calendarContent');
const calendarRefreshBtn = document.getElementById('calendarRefresh');

function getCalendarToken(interactive) {
  return new Promise((resolve, reject) => {
    if (typeof chrome === 'undefined' || !chrome.identity || !chrome.identity.getAuthToken) {
      reject(new Error('chrome.identity недоступен'));
      return;
    }
    chrome.identity.getAuthToken({ interactive }, (token) => {
      const err = chrome.runtime.lastError;
      if (err || !token) {
        reject(new Error((err && err.message) || 'нет токена'));
      } else {
        resolve(token);
      }
    });
  });
}

function removeCachedToken(token) {
  return new Promise((resolve) => {
    if (!chrome.identity || !chrome.identity.removeCachedAuthToken) return resolve();
    chrome.identity.removeCachedAuthToken({ token }, () => resolve());
  });
}

async function fetchCalendarEvents(interactive = false) {
  if (!isCalendarConfigured()) {
    showCalendarSetupNeeded();
    return;
  }
  let token;
  try {
    token = await getCalendarToken(interactive);
  } catch (e) {
    showCalendarConnectPrompt();
    return;
  }

  const now = new Date();
  const future = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
  url.searchParams.set('timeMin', now.toISOString());
  url.searchParams.set('timeMax', future.toISOString());
  url.searchParams.set('maxResults', '30');
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');

  try {
    calendarRefreshBtn.classList.add('spinning');
    const res = await fetch(url.href, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) {
      await removeCachedToken(token);
      calendarRefreshBtn.classList.remove('spinning');
      return fetchCalendarEvents(interactive);
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    renderCalendarEvents(data.items || []);
  } catch (e) {
    showCalendarError(e.message || String(e));
  } finally {
    setTimeout(() => calendarRefreshBtn.classList.remove('spinning'), 400);
  }
}

function isCalendarConfigured() {
  try {
    const m = chrome.runtime.getManifest();
    const cid = m && m.oauth2 && m.oauth2.client_id;
    return cid && !cid.startsWith('YOUR_CLIENT_ID');
  } catch {
    return false;
  }
}

function showCalendarSetupNeeded() {
  calendarContent.innerHTML = `
    <div class="calendar-empty">
      <div style="margin-bottom:8px">⚙ OAuth не настроен</div>
      <div style="font-size:11px;color:#6a8a90">В manifest.json замени <code>YOUR_CLIENT_ID</code> на свой Google OAuth Client ID.<br>См. README → «Настройка Calendar».</div>
    </div>
  `;
}

function showCalendarConnectPrompt() {
  calendarContent.innerHTML = `
    <div class="calendar-connect">
      <button class="add-btn" id="calendarConnectBtn">Подключить Google Calendar</button>
    </div>
  `;
  document.getElementById('calendarConnectBtn').addEventListener('click', () => fetchCalendarEvents(true));
}

function showCalendarError(msg) {
  calendarContent.innerHTML = `
    <div class="calendar-error">
      <div>Ошибка: ${escapeHtml(msg)}</div>
      <div style="margin-top:8px"><button class="add-btn" id="calendarRetryBtn">Повторить</button></div>
    </div>
  `;
  document.getElementById('calendarRetryBtn').addEventListener('click', () => fetchCalendarEvents(true));
}

function formatDayLabel(date) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = Math.round((target - today) / (24 * 60 * 60 * 1000));
  if (diff === 0) return 'Сегодня';
  if (diff === 1) return 'Завтра';
  const days = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  return `${days[target.getDay()]}, ${target.getDate()} ${months[target.getMonth()]}`;
}

function formatTime(date) {
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function renderCalendarEvents(events) {
  if (events.length === 0) {
    calendarContent.innerHTML = '<div class="calendar-empty">Нет событий на ближайшую неделю</div>';
    return;
  }
  const groups = new Map();
  events.forEach((e) => {
    const start = e.start.dateTime || e.start.date;
    const date = new Date(start);
    const key = new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  });

  const frag = document.createDocumentFragment();
  for (const [key, evts] of groups) {
    const group = document.createElement('div');
    group.className = 'calendar-day-group';

    const label = document.createElement('div');
    label.className = 'calendar-day-label';
    label.textContent = formatDayLabel(new Date(key));
    group.appendChild(label);

    evts.forEach((e) => {
      const a = document.createElement('a');
      a.href = e.htmlLink || '#';
      a.target = '_blank';
      a.rel = 'noopener';
      const allDay = !e.start.dateTime;
      a.className = 'calendar-event' + (allDay ? ' allday' : '');

      const time = document.createElement('span');
      time.className = 'calendar-event-time';
      time.textContent = allDay ? 'весь день' : formatTime(new Date(e.start.dateTime));

      const title = document.createElement('span');
      title.className = 'calendar-event-title';
      title.textContent = e.summary || '(без названия)';

      a.appendChild(time);
      a.appendChild(title);
      group.appendChild(a);
    });

    frag.appendChild(group);
  }
  calendarContent.innerHTML = '';
  calendarContent.appendChild(frag);
}

calendarRefreshBtn.addEventListener('click', () => fetchCalendarEvents(false));

// Initial: try silently, fall back to connect prompt
if (typeof chrome !== 'undefined' && chrome.identity) {
  fetchCalendarEvents(false);
} else {
  calendarContent.innerHTML = '<div class="calendar-empty">chrome.identity недоступен</div>';
}

// Auto-refresh every 5 minutes
setInterval(() => {
  if (isCalendarConfigured()) fetchCalendarEvents(false);
}, 5 * 60 * 1000);

load();
loadNotes();
