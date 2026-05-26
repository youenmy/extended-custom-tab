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

load();
