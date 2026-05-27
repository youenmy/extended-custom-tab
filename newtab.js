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
  const [syncData, localData] = await Promise.all([
    syncStorage.get('shortcuts').catch(() => ({})),
    storage.get(['shortcuts', 'background'])
  ]);

  if (syncData && syncData.shortcuts) {
    shortcuts = syncData.shortcuts;
  } else if (localData && localData.shortcuts) {
    // Migration from v2.1 and below: copy shortcuts from local to sync
    shortcuts = localData.shortcuts;
    try {
      await syncStorage.set({ shortcuts });
      console.log('[v2.2] shortcuts migrated from local to sync');
    } catch (e) {
      console.warn('[v2.2] shortcuts sync migration failed:', e);
    }
  } else {
    shortcuts = DEFAULT_SHORTCUTS;
  }

  applyBackground(localData && localData.background);
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
  try {
    await syncStorage.set({ shortcuts });
  } catch (e) {
    console.warn('[v2.2] sync quota exceeded, fallback to local:', e);
    await storage.set({ shortcuts });
  }
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
  if (hasUrlInTransfer(dt)) return 'url';
  return null;
}

document.addEventListener('dragenter', (e) => {
  if (!isExternalDrag(e.dataTransfer)) return;
  if (!dragKind(e.dataTransfer)) return;
  extDragCounter++;
  shortcutsEl.dataset.dropHint = 'Отпустите чтобы добавить ярлык';
  shortcutsEl.classList.add('drop-zone-active');
});

document.addEventListener('dragleave', (e) => {
  if (!isExternalDrag(e.dataTransfer)) return;
  if (!dragKind(e.dataTransfer)) return;
  extDragCounter = Math.max(0, extDragCounter - 1);
  if (extDragCounter === 0) shortcutsEl.classList.remove('drop-zone-active');
});

document.addEventListener('dragover', (e) => {
  if (!isExternalDrag(e.dataTransfer)) return;
  if (!dragKind(e.dataTransfer)) return;
  e.preventDefault();
});

document.addEventListener('drop', async (e) => {
  if (!isExternalDrag(e.dataTransfer)) return;
  if (!dragKind(e.dataTransfer)) return;
  e.preventDefault();
  clearExtDragState();

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
    if (area !== 'sync') return;
    if (changes.notes && !isEditingNote) {
      notes = changes.notes.newValue || [];
      renderNotes();
    }
    if (changes.shortcuts) {
      shortcuts = changes.shortcuts.newValue || [];
      render();
    }
  });
}

// === Calendar (month grid + optional iCal feed) ===

const calendarContent = document.getElementById('calendarContent');
const calendarRefreshBtn = document.getElementById('calendarRefresh');
const icalBtn = document.getElementById('icalBtn');
const icalResetBtn = document.getElementById('icalResetBtn');

const MONTHS_RU = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const DAY_NAMES_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS_SHORT_RU = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const DAY_FULL_RU = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

let calendarMonth = new Date().getMonth();
let calendarYear = new Date().getFullYear();
let selectedDay = sameDay(new Date());
let icalEvents = [];

function sameDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatTime(date) {
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function getEventsForDay(date) {
  const target = sameDay(date).getTime();
  return icalEvents.filter((e) => {
    const start = new Date(e.start);
    const end = e.end ? new Date(e.end) : new Date(start.getTime() + 60 * 60 * 1000);
    const s = sameDay(start).getTime();
    const eAdj = e.allDay ? new Date(end.getTime() - 1) : end;
    const eDay = sameDay(eAdj).getTime();
    return target >= s && target <= eDay;
  }).sort((a, b) => new Date(a.start) - new Date(b.start));
}

function renderCalendar() {
  const monthStart = new Date(calendarYear, calendarMonth, 1);
  const monthEnd = new Date(calendarYear, calendarMonth + 1, 0);
  const today = sameDay(new Date());

  // Monday-first: 0=Mon..6=Sun. JS getDay: 0=Sun..6=Sat
  let firstDayOfWeek = monthStart.getDay() - 1;
  if (firstDayOfWeek < 0) firstDayOfWeek = 6;

  const daysInMonth = monthEnd.getDate();

  const wrapper = document.createElement('div');

  const header = document.createElement('div');
  header.className = 'cal-month-header';
  header.innerHTML = `
    <button class="cal-nav" id="calPrev" aria-label="Предыдущий месяц">‹</button>
    <span class="cal-month-name">${MONTHS_RU[calendarMonth]} ${calendarYear}</span>
    <button class="cal-nav" id="calNext" aria-label="Следующий месяц">›</button>
  `;
  wrapper.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'cal-grid';

  DAY_NAMES_RU.forEach((d) => {
    const el = document.createElement('div');
    el.className = 'cal-day-name';
    el.textContent = d;
    grid.appendChild(el);
  });

  for (let i = 0; i < firstDayOfWeek; i++) {
    const el = document.createElement('div');
    el.className = 'cal-day empty';
    grid.appendChild(el);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dayDate = new Date(calendarYear, calendarMonth, d);
    const isToday = dayDate.getTime() === today.getTime();
    const isSelected = dayDate.getTime() === selectedDay.getTime();
    const events = getEventsForDay(dayDate);
    const hasEvents = events.length > 0;

    const cell = document.createElement('div');
    cell.className = 'cal-day';
    if (isToday) cell.classList.add('today');
    if (isSelected) cell.classList.add('selected');
    if (hasEvents) cell.classList.add('has-events');
    cell.textContent = String(d);
    if (hasEvents) {
      const dot = document.createElement('span');
      dot.className = 'cal-dot';
      cell.appendChild(dot);
    }
    cell.addEventListener('click', () => {
      selectedDay = dayDate;
      renderCalendar();
    });
    grid.appendChild(cell);
  }

  wrapper.appendChild(grid);

  // Events for selected day
  const eventsForSelected = getEventsForDay(selectedDay);
  const list = document.createElement('div');
  list.className = 'cal-events-list';

  const label = document.createElement('div');
  label.className = 'cal-events-day-label';
  label.textContent = formatSelectedDayLabel(selectedDay);
  list.appendChild(label);

  if (eventsForSelected.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'cal-events-empty';
    empty.textContent = icalEvents.length ? 'Нет событий' : 'iCal не подключён — настройки → «Подключить календарь»';
    list.appendChild(empty);
  } else {
    eventsForSelected.forEach((e) => {
      const a = document.createElement('a');
      a.href = '#';
      a.className = 'calendar-event' + (e.allDay ? ' allday' : '');
      a.style.cursor = 'default';
      a.onclick = (ev) => ev.preventDefault();

      const time = document.createElement('span');
      time.className = 'calendar-event-time';
      time.textContent = e.allDay ? 'весь день' : formatTime(new Date(e.start));

      const title = document.createElement('span');
      title.className = 'calendar-event-title';
      title.textContent = e.summary || '(без названия)';
      if (e.location) title.title = e.summary + ' — ' + e.location;

      a.appendChild(time);
      a.appendChild(title);
      list.appendChild(a);
    });
  }
  wrapper.appendChild(list);

  calendarContent.innerHTML = '';
  calendarContent.appendChild(wrapper);

  document.getElementById('calPrev').addEventListener('click', () => {
    calendarMonth--;
    if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
    renderCalendar();
  });
  document.getElementById('calNext').addEventListener('click', () => {
    calendarMonth++;
    if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
    renderCalendar();
  });
}

function formatSelectedDayLabel(date) {
  const today = sameDay(new Date());
  const target = sameDay(date);
  const diff = Math.round((target - today) / (24 * 60 * 60 * 1000));
  let prefix = '';
  if (diff === 0) prefix = 'Сегодня';
  else if (diff === 1) prefix = 'Завтра';
  else if (diff === -1) prefix = 'Вчера';
  else prefix = DAY_FULL_RU[target.getDay()];
  return `${prefix}, ${target.getDate()} ${MONTHS_SHORT_RU[target.getMonth()]}`;
}

// === iCal parsing ===

function unfoldIcsLines(text) {
  const raw = text.split(/\r?\n/);
  const out = [];
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length) {
      out[out.length - 1] += line.substring(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

function unescapeIcs(s) {
  return s.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

function parseIcsDateTime(keyPart, value) {
  const isDateOnly = /VALUE=DATE(?!-TIME)/i.test(keyPart) || /^\d{8}$/.test(value);
  if (isDateOnly && /^\d{8}$/.test(value)) {
    const y = value.substring(0, 4);
    const m = value.substring(4, 6);
    const d = value.substring(6, 8);
    return { iso: `${y}-${m}-${d}T00:00:00`, allDay: true };
  }
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (m) {
    const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7] || ''}`;
    return { iso, allDay: false };
  }
  return { iso: value, allDay: false };
}

function parseIcs(text) {
  const out = [];
  const lines = unfoldIcsLines(text);
  let ev = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      ev = {};
    } else if (line === 'END:VEVENT') {
      if (ev && ev.summary && ev.start) out.push(ev);
      ev = null;
    } else if (ev) {
      const colon = line.indexOf(':');
      if (colon === -1) continue;
      const keyPart = line.substring(0, colon);
      const value = line.substring(colon + 1);
      const baseKey = keyPart.split(';')[0];
      if (baseKey === 'SUMMARY') ev.summary = unescapeIcs(value);
      else if (baseKey === 'DTSTART') {
        const { iso, allDay } = parseIcsDateTime(keyPart, value);
        ev.start = iso;
        if (allDay) ev.allDay = true;
      } else if (baseKey === 'DTEND') {
        const { iso } = parseIcsDateTime(keyPart, value);
        ev.end = iso;
      } else if (baseKey === 'LOCATION') ev.location = unescapeIcs(value);
      else if (baseKey === 'DESCRIPTION') ev.description = unescapeIcs(value);
    }
  }
  return out;
}

async function loadIcalEvents() {
  const data = await storage.get('icalUrl');
  const url = data && data.icalUrl;
  if (!url) {
    icalEvents = [];
    icalResetBtn.hidden = true;
    icalBtn.textContent = 'Подключить календарь (iCal)';
    return;
  }
  icalResetBtn.hidden = false;
  icalBtn.textContent = 'Сменить календарь (iCal)';
  try {
    calendarRefreshBtn.classList.add('spinning');
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    icalEvents = parseIcs(text);
  } catch (e) {
    console.warn('iCal fetch failed:', e);
    icalEvents = [];
  } finally {
    setTimeout(() => calendarRefreshBtn.classList.remove('spinning'), 400);
  }
}

async function setupIcal() {
  const current = (await storage.get('icalUrl')).icalUrl || '';
  const url = prompt('Вставь Secret iCal URL из настроек Google Calendar\n(Settings → Settings for my calendars → Integrate calendar → Secret address in iCal format):', current);
  if (url === null) return;
  const trimmed = url.trim();
  if (!trimmed) {
    await storage.set({ icalUrl: null });
  } else {
    await storage.set({ icalUrl: trimmed });
  }
  settingsMenu.hidden = true;
  await loadIcalEvents();
  renderCalendar();
}

async function resetIcal() {
  await storage.set({ icalUrl: null });
  settingsMenu.hidden = true;
  await loadIcalEvents();
  renderCalendar();
}

calendarRefreshBtn.addEventListener('click', async () => {
  await loadIcalEvents();
  renderCalendar();
});

icalBtn.addEventListener('click', setupIcal);
icalResetBtn.addEventListener('click', resetIcal);

// Initial render — show calendar immediately, fetch iCal in background
renderCalendar();
loadIcalEvents().then(renderCalendar);

// Auto-refresh iCal every 15 minutes
setInterval(async () => {
  await loadIcalEvents();
  renderCalendar();
}, 15 * 60 * 1000);

// === Clock ===

const CLOCK_DAYS_RU = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const CLOCK_MONTHS_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const clockTimeEl = document.getElementById('clockTime');
const clockDateEl = document.getElementById('clockDate');

function updateClock() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  clockTimeEl.textContent = `${hh}:${mm}`;
  clockDateEl.textContent = `${CLOCK_DAYS_RU[now.getDay()]}, ${now.getDate()} ${CLOCK_MONTHS_RU[now.getMonth()]}`;
}

function startClock() {
  updateClock();
  const msToNextMinute = 60000 - (Date.now() % 60000);
  setTimeout(() => {
    updateClock();
    setInterval(updateClock, 60000);
  }, msToNextMinute);
}

startClock();

// === Mail (Gmail Atom feed) ===

const mailContent = document.getElementById('mailContent');
const mailCountEl = document.getElementById('mailCount');
const mailRefreshBtn = document.getElementById('mailRefresh');

function getXmlText(parent, tagName) {
  if (!parent) return '';
  const els = parent.getElementsByTagName(tagName);
  return els.length > 0 ? (els[0].textContent || '').trim() : '';
}

function mailRelativeTime(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);
  if (diffMin < 1) return 'только что';
  if (diffMin < 60) return `${diffMin} мин`;
  if (diffHr < 24) return `${diffHr} ч`;
  if (diffDay === 1) return 'вчера';
  if (diffDay < 7) {
    const days = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
    return days[date.getDay()];
  }
  return `${date.getDate()} ${MONTHS_SHORT_RU[date.getMonth()]}`;
}

async function loadMail() {
  try {
    mailRefreshBtn.classList.add('spinning');
    const res = await fetch('https://mail.google.com/mail/feed/atom', {
      credentials: 'include',
      cache: 'no-store'
    });
    if (res.status === 401 || res.status === 403) {
      renderMailNotLogged();
      return;
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    if (!text.includes('<feed') && !text.includes('<entry')) {
      renderMailNotLogged();
      return;
    }
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    const parseErr = doc.querySelector('parsererror');
    if (parseErr) throw new Error('XML parse error');

    const fullcount = parseInt(getXmlText(doc.documentElement, 'fullcount') || '0', 10);
    const entries = Array.from(doc.getElementsByTagName('entry')).map((entry) => {
      const authorEl = entry.getElementsByTagName('author')[0];
      const linkEl = entry.getElementsByTagName('link')[0];
      return {
        title: getXmlText(entry, 'title'),
        summary: getXmlText(entry, 'summary'),
        link: linkEl ? linkEl.getAttribute('href') : '',
        issued: getXmlText(entry, 'issued') || getXmlText(entry, 'modified'),
        author: {
          name: getXmlText(authorEl, 'name'),
          email: getXmlText(authorEl, 'email')
        }
      };
    });
    renderMail(entries, fullcount);
  } catch (e) {
    renderMailError(e.message || String(e));
  } finally {
    setTimeout(() => mailRefreshBtn.classList.remove('spinning'), 400);
  }
}

function renderMail(entries, fullcount) {
  if (fullcount > 0) {
    mailCountEl.textContent = String(fullcount);
    mailCountEl.hidden = false;
  } else {
    mailCountEl.hidden = true;
  }

  if (entries.length === 0) {
    mailContent.innerHTML = '<div class="mail-empty">Нет непрочитанных</div>';
    return;
  }

  const frag = document.createDocumentFragment();
  entries.forEach((e) => {
    const a = document.createElement('a');
    a.className = 'mail-item';
    a.href = e.link || 'https://mail.google.com/';
    a.target = '_blank';
    a.rel = 'noopener';

    const row1 = document.createElement('div');
    row1.className = 'mail-item-row1';

    const sender = document.createElement('span');
    sender.className = 'mail-item-sender';
    sender.textContent = e.author.name || e.author.email || '(без отправителя)';
    if (e.author.email) sender.title = e.author.email;

    const time = document.createElement('span');
    time.className = 'mail-item-time';
    time.textContent = mailRelativeTime(e.issued);

    row1.appendChild(sender);
    row1.appendChild(time);

    const subject = document.createElement('div');
    subject.className = 'mail-item-subject';
    subject.textContent = e.title || '(без темы)';

    a.appendChild(row1);
    a.appendChild(subject);

    if (e.summary) {
      const summary = document.createElement('div');
      summary.className = 'mail-item-summary';
      summary.textContent = e.summary;
      a.appendChild(summary);
    }

    frag.appendChild(a);
  });

  mailContent.innerHTML = '';
  mailContent.appendChild(frag);
}

function renderMailNotLogged() {
  mailCountEl.hidden = true;
  mailContent.innerHTML = `
    <div class="mail-not-logged">
      Нужно войти в Gmail в этом профиле Chrome
      <br><a href="https://mail.google.com/" target="_blank" rel="noopener">Открыть Gmail →</a>
    </div>
  `;
}

function renderMailError(msg) {
  mailCountEl.hidden = true;
  mailContent.innerHTML = `<div class="mail-error">Ошибка: ${escapeHtml(msg)}</div>`;
}

mailRefreshBtn.addEventListener('click', loadMail);

// Initial load + auto-refresh every 5 minutes
loadMail();
setInterval(loadMail, 5 * 60 * 1000);

load();
loadNotes();
