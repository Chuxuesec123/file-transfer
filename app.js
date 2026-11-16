'use strict';

/* ============ 基础常量 ============ */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const SHARE = new URL('files/', location.href).pathname; // 共享目录（页面同级 files/）
const API = SHARE + '__ls__';
const THEME_KEY = 'file-transfer:theme';

const ICON = {
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m4 18 5-5 4 4 3-3 4 4"/>',
  video: '<rect x="3" y="5" width="13" height="14" rx="2"/><path d="m16 10 5-3v10l-5-3Z"/>',
  audio: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  archive: '<path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/><path d="M10 3v4m4-4v4m-4 3v4m4-3v4"/>',
  code: '<path d="m9 8-5 4 5 4m6-8 5 4-5 4"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  download: '<path d="M12 4v11m0 0 4-4m-4 4-4-4"/><path d="M4 19h16"/>',
  trash: '<path d="M4 7h16M10 4h4M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>',
  eye: '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m5 13 4 4L19 7"/>',
  alert: '<path d="M12 8v5m0 3h.01"/><path d="M10.3 4.6 2.8 18a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 4.6a2 2 0 0 0-3.4 0Z"/>',
  retry: '<path d="M20 11a8 8 0 1 0-2.3 6.3"/><path d="M20 5v6h-6"/>',
  minus: '<path d="M6 12h12"/>',
  home: '<path d="M4 11 12 4l8 7"/><path d="M6 10v9h12v-9"/>'
};

function svgMarkup(name) {
  return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (ICON[name] || ICON.file) + '</svg>';
}

function fileIcon(kind) {
  const box = document.createElement('span');
  box.className = 'fi k-' + kind;
  box.innerHTML = svgMarkup(kind === 'dir' ? 'folder' : kind);
  return box;
}

const KIND_RULES = [
  ['image', /\.(png|jpe?g|gif|webp|bmp|svg|ico|avif|heic)$/i],
  ['video', /\.(mp4|mkv|mov|avi|wmv|flv|webm|m4v|ts|rmvb)$/i],
  ['audio', /\.(mp3|wav|flac|aac|ogg|m4a|opus|wma)$/i],
  ['archive', /\.(zip|rar|7z|tar|gz|bz2|xz|zst|iso|jar|apk|whl|deb|rpm)$/i],
  ['doc', /\.(pdf|docx?|xlsx?|pptx?|odt|ods|rtf|csv)$/i],
  ['code', /\.(js|mjs|cjs|ts|jsx|tsx|py|sh|bash|zsh|c|h|cpp|hpp|java|go|rs|rb|php|pl|lua|html?|css|scss|less|json|ya?ml|toml|ini|conf|cfg|sql|xml|md|txt|log|env|pem|key|pub)$/i]
];

function kindOf(name) {
  for (const [kind, re] of KIND_RULES) if (re.test(name)) return kind;
  return 'file';
}

function canPreview(name) {
  return /\.(png|jpe?g|gif|webp|bmp|svg|avif|pdf|mp4|webm|m4v|mp3|wav|ogg|m4a|txt|log|md|json|xml|ya?ml|csv)$/i.test(name);
}

/* ============ 格式化 ============ */
const timeFmt = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false
});

function fmtSize(n) {
  if (n < 0) return '—';
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  const text = i === 0 ? String(v) : (v >= 100 ? v.toFixed(0) : v.toFixed(1));
  return text.replace(/\.0$/, '') + ' ' + units[i];
}

function fmtTime(ms) {
  if (!ms) return '—';
  try { return timeFmt.format(new Date(ms)); } catch (_) { return '—'; }
}

/* ============ Toast ============ */
function toast(message, type) {
  const box = $('#toasts');
  const node = document.createElement('div');
  node.className = 'toast' + (type ? ' ' + type : '');
  node.innerHTML = svgMarkup(type === 'err' ? 'alert' : 'check');
  const text = document.createElement('span');
  text.textContent = message;
  node.appendChild(text);
  box.appendChild(node);
  setTimeout(() => {
    node.classList.add('out');
    setTimeout(() => node.remove(), 240);
  }, 2600);
}

/* ============ 弹窗 ============ */
const modalEl = $('#modal');
let modalResolve = null;

function closeModal(value) {
  if (modalEl.open) modalEl.close();
  if (modalResolve) {
    const fn = modalResolve;
    modalResolve = null;
    fn(value);
  }
}

function openModal(opts) {
  return new Promise(resolve => {
    if (modalResolve) closeModal(null);
    modalResolve = resolve;

    const form = document.createElement('form');
    const title = document.createElement('h3');
    title.textContent = opts.title || '';
    form.appendChild(title);
    if (opts.message) {
      const p = document.createElement('p');
      p.textContent = opts.message;
      form.appendChild(p);
    }

    let field = null;
    if (opts.input) {
      field = document.createElement('input');
      field.type = 'text';
      field.value = opts.input.value || '';
      field.placeholder = opts.input.placeholder || '';
      field.autocomplete = 'off';
      field.spellcheck = false;
      form.appendChild(field);
    }

    const ops = document.createElement('div');
    ops.className = 'modal-ops';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn small';
    cancel.textContent = '取消';
    cancel.addEventListener('click', () => closeModal(null));
    const ok = document.createElement('button');
    ok.type = 'submit';
    ok.className = 'btn small ' + (opts.danger ? 'danger' : 'primary');
    ok.textContent = opts.okText || '确定';
    ops.append(cancel, ok);
    form.appendChild(ops);

    form.addEventListener('submit', ev => {
      ev.preventDefault();
      closeModal(field ? field.value.trim() : true);
    });

    modalEl.replaceChildren(form);
    modalEl.oncancel = ev => { ev.preventDefault(); closeModal(null); };
    modalEl.onclose = () => {
      if (modalResolve) {
        const fn = modalResolve;
        modalResolve = null;
        fn(null);
      }
    };
    modalEl.showModal();
    if (field) setTimeout(() => { field.focus(); field.select(); }, 20);
    else ok.focus();
  });
}

/* ============ 状态 ============ */
const state = {
  path: '/',
  entries: [],
  query: '',
  sort: { key: 'name', dir: 1 },
  caps: { api: false, write: false },
  loading: false,
  metaToken: 0
};

const listEl = $('#list');
const overlayEl = $('#overlay');
const searchEl = $('#search');

const encPath = p => p.split('/').filter(Boolean).map(encodeURIComponent).join('/');
const fileURL = rel => SHARE + encPath(rel);
const joinPath = (dir, name) => (dir === '/' ? '/' : dir + '/') + name;

/* 把服务端返回的 {"error": "..."} 转成更易读的失败信息 */
async function httpError(res) {
  let detail = '';
  try {
    const data = await res.json();
    if (data && data.error) detail = ' ' + data.error;
  } catch (_) { /* 非 JSON 响应 */ }
  return new Error('HTTP ' + res.status + detail);
}

function normalizePath(input) {
  const parts = String(input || '/').replace(/\\/g, '/').split('/');
  const out = [];
  for (const raw of parts) {
    const seg = raw.trim();
    if (!seg || seg === '.') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return '/' + out.join('/');
}

function pathFromHash() {
  const raw = location.hash.replace(/^#/, '');
  if (!raw) return '/';
  let decoded = raw;
  try { decoded = decodeURIComponent(raw); } catch (_) { decoded = raw; }
  return normalizePath(decoded);
}

function go(path, opts) {
  const target = normalizePath(path);
  const hash = '#' + encPath(target);
  const options = opts || {};
  if (location.hash !== hash) {
    if (options.replace) history.replaceState(null, '', hash);
    else history.pushState(null, '', hash);
  }
  syncPath(target);
}

function syncPath(path) {
  state.path = path;
  state.query = '';
  searchEl.value = '';
  renderCrumbs();
  loadDir(path);
}


/* ============ 能力探测与界面状态 ============ */
/* server.py 会给所有响应加上 X-Transfer 头；原生 http.server 没有该头 */
async function detectServer() {
  try {
    const res = await fetch(location.href, { method: 'HEAD', cache: 'no-store' });
    return res.ok && res.headers.get('X-Transfer') === '1';
  } catch (_) {
    return false;
  }
}

function setCaps(api, write) {
  state.caps.api = !!api;
  state.caps.write = !!write;
  const mode = $('#mode');
  mode.classList.toggle('rw', !!write);
  mode.classList.toggle('ro', !write);
  mode.querySelector('b').textContent = write ? '可读写' : '仅下载';
  mode.title = write
    ? '上传 / 删除 / 新建 已启用'
    : '当前由 python3 -m http.server 提供，仅支持浏览与下载';
  $('#newFolder').disabled = !write;
  $$('label.btn').forEach(el => el.classList.toggle('is-off', !write));
}

/* ============ 目录读取 ============ */
async function loadDir(path) {
  const token = ++state.metaToken;
  listEl.classList.add('loading');
  try {
    const entries = await fetchEntries(path);
    if (token !== state.metaToken) return;
    /* .gitkeep 只用于让 git 保留空的共享目录，不在列表里展示 */
    state.entries = entries.filter(e => e.name !== '.gitkeep');
    render();
    fillMeta(token);
  } catch (err) {
    if (token !== state.metaToken) return;
    state.entries = [];
    render();
    toast('读取目录失败：' + ((err && err.message) || err), 'err');
  } finally {
    if (token === state.metaToken) listEl.classList.remove('loading');
  }
}

async function fetchEntries(path) {
  /* 1) 附带 server.py 时使用 JSON 列表（含大小/时间/可写能力） */
  if (state.caps.api) {
    try {
      const res = await fetch(API + '?path=' + encodeURIComponent(path), { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        return (data.entries || []).map(item => ({
          name: item.name,
          dir: !!item.is_dir,
          size: item.is_dir ? -1 : Number(item.size) || 0,
          mtime: item.mtime ? Number(item.mtime) * 1000 : 0,
          known: true
        }));
      }
    } catch (_) { /* 忽略，回退到目录索引解析 */ }
    setCaps(false, false);
  }

  /* 2) python3 -m http.server 的目录索引 */
  const res = await fetch(fileURL(path === '/' ? '/' : path + '/'), {
    cache: 'no-store',
    headers: { Accept: 'text/html' }
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const html = await res.text();
  setCaps(false, false);

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const seen = new Set();
  const out = [];
  doc.querySelectorAll('a[href]').forEach(a => {
    const href = a.getAttribute('href') || '';
    if (!href || /^[?#]/.test(href) || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.slice(0, 2) === '//') return;
    const dir = href.slice(-1) === '/';
    const clean = href.replace(/\/+$/, '');
    if (!clean || clean === '.' || clean === '..') return;
    let name;
    try { name = decodeURIComponent(clean.split('/').pop()); } catch (_) { return; }
    if (!name || seen.has(name)) return;
    seen.add(name);
    out.push({ name, dir, size: dir ? -1 : 0, mtime: 0, known: dir });
  });
  return out;
}

/* 目录索引没有大小/时间时，用 HEAD 逐个补齐（限流，避免卡顿） */
function fillMeta(token) {
  const pending = state.entries.filter(e => !e.dir && !e.known);
  if (!pending.length) return;
  const MAX = 4;
  let index = 0;
  let active = 0;
  const pump = () => {
    while (active < MAX && index < pending.length) {
      if (token !== state.metaToken) return;
      const item = pending[index++];
      active++;
      probe(item, token).then(() => {
        active--;
        if (token === state.metaToken) pump();
      });
    }
  };
  pump();
}

async function probe(item, token) {
  try {
    const res = await fetch(fileURL(joinPath(state.path, item.name)), { method: 'HEAD', cache: 'no-store' });
    if (token !== state.metaToken) return;
    const size = res.headers.get('content-length');
    const modified = res.headers.get('last-modified');
    item.size = size ? Number(size) : 0;
    item.mtime = modified ? (Date.parse(modified) || 0) : 0;
    item.known = true;
    patchRow(item);
  } catch (_) { /* 忽略单个文件的失败 */ }
}

/* ============ 面包屑 ============ */
function renderCrumbs() {
  const nav = $('#crumbs');
  nav.replaceChildren();

  const home = document.createElement('a');
  home.className = 'crumb' + (state.path === '/' ? ' cur' : '');
  home.href = '#/';
  home.title = '根目录';
  home.setAttribute('aria-label', '根目录');
  home.innerHTML = svgMarkup('home');
  home.addEventListener('click', ev => { ev.preventDefault(); go('/'); });
  nav.appendChild(home);

  const segs = state.path.split('/').filter(Boolean);
  let acc = '';
  segs.forEach((seg, i) => {
    acc += '/' + seg;
    const sep = document.createElement('span');
    sep.className = 'crumb-sep';
    sep.textContent = '/';
    nav.appendChild(sep);

    const crumb = document.createElement('a');
    crumb.className = 'crumb' + (i === segs.length - 1 ? ' cur' : '');
    crumb.href = '#' + encPath(acc);
    crumb.textContent = seg;
    crumb.title = seg;
    const target = acc;
    crumb.addEventListener('click', ev => { ev.preventDefault(); go(target); });
    nav.appendChild(crumb);
  });

  const count = document.createElement('span');
  count.className = 'crumb-count';
  count.id = 'count';
  nav.appendChild(count);

  requestAnimationFrame(() => { nav.scrollLeft = nav.scrollWidth; });
  updateCount();
}

function updateCount(shown) {
  const el = $('#count');
  if (!el) return;
  const total = state.entries.length;
  el.textContent = state.query
    ? shown + '/' + total
    : (total ? total + ' 项' : '');
}


/* ============ 渲染列表 ============ */
function render() {
  const keyword = state.query.trim().toLowerCase();
  let rows = state.entries;
  if (keyword) rows = rows.filter(e => e.name.toLowerCase().indexOf(keyword) !== -1);

  const byName = (a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' });
  const { key, dir } = state.sort;
  rows = rows.slice().sort((a, b) => {
    if (a.dir !== b.dir) return a.dir ? -1 : 1;
    let diff = 0;
    if (key === 'size') diff = (a.size || 0) - (b.size || 0);
    else if (key === 'time') diff = (a.mtime || 0) - (b.mtime || 0);
    else diff = byName(a, b);
    if (!diff) diff = byName(a, b);
    return diff * dir;
  });

  const frag = document.createDocumentFragment();
  rows.forEach((item, i) => frag.appendChild(buildRow(item, i)));
  listEl.replaceChildren(frag);
  listEl.hidden = rows.length === 0;

  const empty = $('#empty');
  empty.hidden = rows.length > 0;
  $('#emptyText').textContent = keyword ? '没有匹配的文件' : '空文件夹';

  updateHead();
  updateCount(rows.length);
}

function buildRow(item, index) {
  const row = document.createElement('div');
  row.className = 'row' + (item.dir ? ' is-dir' : '');
  row.dataset.name = item.name;
  row.tabIndex = 0;
  row.setAttribute('role', 'listitem');
  row.style.animationDelay = Math.min(index, 14) * 11 + 'ms';

  const nameCell = document.createElement('div');
  nameCell.className = 'c-name';
  const label = document.createElement('span');
  label.textContent = item.name;
  label.title = item.name;
  nameCell.append(fileIcon(item.dir ? 'dir' : kindOf(item.name)), label);

  const sizeCell = document.createElement('div');
  sizeCell.className = 'c-size';
  const timeCell = document.createElement('div');
  timeCell.className = 'c-time';
  fillMetaCells(item, sizeCell, timeCell);

  const ops = document.createElement('div');
  ops.className = 'c-ops';
  if (!item.dir) {
    ops.appendChild(opButton('download', '下载', () => triggerDownload(item)));
    if (canPreview(item.name)) {
      ops.appendChild(opButton('eye', '新窗口打开', () => {
        window.open(fileURL(joinPath(state.path, item.name)), '_blank', 'noopener');
      }));
    }
  }
  if (state.caps.write) {
    ops.appendChild(opButton('trash', '删除', () => removeEntry(item), 'danger'));
  }

  row.append(nameCell, sizeCell, timeCell, ops);
  row.addEventListener('click', () => openEntry(item));
  row.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      openEntry(item);
    }
  });
  return row;
}

function fillMetaCells(item, sizeCell, timeCell) {
  if (item.dir) {
    sizeCell.textContent = '—';
    timeCell.textContent = '—';
    return;
  }
  sizeCell.textContent = item.known ? fmtSize(item.size) : '…';
  timeCell.textContent = item.known ? fmtTime(item.mtime) : '…';
}

function patchRow(item) {
  let row;
  try {
    row = listEl.querySelector('.row[data-name="' + CSS.escape(item.name) + '"]');
  } catch (_) {
    row = null;
  }
  if (!row) return;
  const sizeCell = row.querySelector('.c-size');
  const timeCell = row.querySelector('.c-time');
  if (sizeCell && timeCell) fillMetaCells(item, sizeCell, timeCell);
}

function opButton(icon, title, handler, extra) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'icon-btn' + (extra ? ' ' + extra : '');
  btn.title = title;
  btn.setAttribute('aria-label', title);
  btn.innerHTML = svgMarkup(icon);
  btn.addEventListener('click', ev => {
    ev.stopPropagation();
    handler();
  });
  return btn;
}

function updateHead() {
  $$('.sort').forEach(btn => {
    const active = btn.dataset.sort === state.sort.key;
    btn.classList.toggle('asc', active && state.sort.dir === 1);
    btn.classList.toggle('desc', active && state.sort.dir === -1);
  });
}

/* ============ 条目操作 ============ */
function openEntry(item) {
  if (item.dir) go(joinPath(state.path, item.name));
  else triggerDownload(item);
}

function triggerDownload(item) {
  const link = document.createElement('a');
  link.href = fileURL(joinPath(state.path, item.name));
  link.download = item.name;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function removeEntry(item) {
  const answer = await openModal({
    title: '删除',
    message: item.name + (item.dir ? '（文件夹）' : '') + ' 将被永久删除，无法恢复。',
    okText: '删除',
    danger: true
  });
  if (!answer) return;
  try {
    const res = await fetch(fileURL(joinPath(state.path, item.name)), { method: 'DELETE' });
    if (!res.ok) throw await httpError(res);
    toast('已删除', 'ok');
    loadDir(state.path);
  } catch (err) {
    toast('删除失败：' + ((err && err.message) || err), 'err');
  }
}

async function createFolder() {
  if (!state.caps.write) {
    toast('当前服务不支持写入', 'err');
    return;
  }
  const name = await openModal({
    title: '新建文件夹',
    input: { placeholder: '名称', value: '' },
    okText: '创建'
  });
  if (!name) return;
  if (name.indexOf('/') !== -1 || name.indexOf('\\') !== -1 || name === '.' || name === '..') {
    toast('名称不合法', 'err');
    return;
  }
  try {
    const res = await fetch(fileURL(joinPath(state.path, name)) + '/', { method: 'MKCOL' });
    if (!res.ok && res.status !== 201) throw await httpError(res);
    toast('已创建', 'ok');
    loadDir(state.path);
  } catch (err) {
    toast('创建失败：' + ((err && err.message) || err), 'err');
  }
}


/* ============ 上传队列 ============ */
const uploads = [];
const MAX_UPLOAD = 2;
let uploadSeq = 0;
let uploading = 0;
let reloadTimer = 0;
let autoClearTimer = 0;

function queueFiles(files) {
  if (!state.caps.write) {
    toast('当前服务不支持上传', 'err');
    return;
  }
  if (!files || !files.length) return;
  const dir = state.path;
  files.forEach(pair => {
    uploads.push({
      id: ++uploadSeq,
      file: pair.file,
      rel: pair.rel,
      dir,
      size: pair.file.size,
      loaded: 0,
      status: 'waiting',
      error: '',
      xhr: null
    });
  });
  renderQueue();
  pumpUploads();
}

function renderQueue() {
  const box = $('#queue');
  const list = $('#queueList');
  if (!uploads.length) {
    box.hidden = true;
    list.replaceChildren();
    return;
  }
  box.hidden = false;
  const frag = document.createDocumentFragment();
  uploads.forEach(it => frag.appendChild(queueItem(it)));
  list.replaceChildren(frag);
  updateQueueBar();
}

function statusIconName(it) {
  return ({ waiting: 'file', uploading: 'retry', done: 'check', error: 'alert', canceled: 'minus' })[it.status] || 'file';
}

function pctOf(it) {
  if (it.status === 'done') return 100;
  if (!it.size) return 0;
  return Math.max(0, Math.min(99, Math.round((it.loaded || 0) / it.size * 100)));
}

function stateText(it) {
  if (it.status === 'uploading') return pctOf(it) + '%';
  return ({ waiting: '等待', done: '完成', error: '失败', canceled: '已取消' })[it.status] || '';
}

function actionOf(it) {
  if (it.status === 'error') return { icon: 'retry', title: '重试' };
  if (it.status === 'uploading' || it.status === 'waiting') return { icon: 'close', title: '取消' };
  return { icon: 'close', title: '移除' };
}

function queueItem(it) {
  const row = document.createElement('div');
  row.className = 'qitem ' + it.status;
  row.dataset.id = it.id;

  const ico = document.createElement('span');
  ico.className = 'qi-ico';
  ico.innerHTML = svgMarkup(statusIconName(it));

  const name = document.createElement('span');
  name.className = 'qi-name';
  name.textContent = it.rel;
  name.title = it.rel;

  const track = document.createElement('span');
  track.className = 'qi-track';
  const bar = document.createElement('i');
  bar.style.width = pctOf(it) + '%';
  track.appendChild(bar);

  const stateEl = document.createElement('span');
  stateEl.className = 'qi-state';
  stateEl.textContent = stateText(it);

  const act = actionOf(it);
  const action = document.createElement('button');
  action.type = 'button';
  action.className = 'qi-x';
  action.title = act.title;
  action.setAttribute('aria-label', act.title);
  action.innerHTML = svgMarkup(act.icon);
  action.addEventListener('click', () => onQueueAction(it));

  row.append(ico, name, track, stateEl, action);
  return row;
}

function updateQueueItem(it) {
  let row = $('#queueList .qitem[data-id="' + it.id + '"]');
  if (!row) {
    $('#queueList').appendChild(queueItem(it));
    return;
  }
  row.className = 'qitem ' + it.status;
  const ico = row.querySelector('.qi-ico');
  if (ico) ico.innerHTML = svgMarkup(statusIconName(it));
  const bar = row.querySelector('.qi-track i');
  if (bar) bar.style.width = pctOf(it) + '%';
  const stateEl = row.querySelector('.qi-state');
  if (stateEl) stateEl.textContent = stateText(it);
  const act = actionOf(it);
  const btn = row.querySelector('.qi-x');
  if (btn) {
    btn.title = act.title;
    btn.setAttribute('aria-label', act.title);
    btn.innerHTML = svgMarkup(act.icon);
  }
}

function onQueueAction(it) {
  if (it.status === 'error') {
    it.status = 'waiting';
    it.loaded = 0;
    updateQueueItem(it);
    pumpUploads();
  } else if (it.status === 'uploading' || it.status === 'waiting') {
    cancelUpload(it);
  } else {
    const index = uploads.indexOf(it);
    if (index !== -1) uploads.splice(index, 1);
    renderQueue();
  }
}

function cancelUpload(it) {
  if (it.status === 'uploading' && it.xhr) {
    it.status = 'canceled';
    try { it.xhr.abort(); } catch (_) { /* 已经结束 */ }
    return;
  }
  it.status = 'canceled';
  updateQueueItem(it);
  pumpUploads();
}


function startUpload(it) {
  it.status = 'uploading';
  it.loaded = 0;
  it.error = '';
  uploading++;
  updateQueueItem(it);

  const xhr = new XMLHttpRequest();
  it.xhr = xhr;
  xhr.open('PUT', fileURL(joinPath(it.dir, it.rel)), true);
  xhr.setRequestHeader('Content-Type', 'application/octet-stream');

  const settle = (status, message) => {
    it.xhr = null;
    uploading = Math.max(0, uploading - 1);
    if (it.status !== 'canceled' || status === 'done') {
      it.status = status;
      if (message) it.error = message;
    }
    if (it.status === 'done') it.loaded = it.size;
    updateQueueItem(it);
    pumpUploads();
  };

  xhr.upload.onprogress = ev => {
    if (ev.lengthComputable) it.loaded = ev.loaded;
    updateQueueItem(it);
    updateQueueBar();
  };
  xhr.onload = () => {
    if (xhr.status >= 200 && xhr.status < 300) {
      settle('done');
      return;
    }
    let detail = '';
    try {
      const data = JSON.parse(xhr.responseText);
      if (data && data.error) detail = ' ' + data.error;
    } catch (_) { /* 非 JSON 响应 */ }
    settle('error', 'HTTP ' + xhr.status + detail);
  };
  xhr.onerror = () => settle('error', '网络错误');
  xhr.onabort = () => settle('canceled');
  try {
    xhr.send(it.file);
  } catch (_) {
    settle('error', '发送失败');
  }
}

function pumpUploads() {
  while (uploading < MAX_UPLOAD) {
    const next = uploads.find(u => u.status === 'waiting');
    if (!next) break;
    startUpload(next);
  }
  updateQueueBar();
  scheduleReload();
}

function updateQueueBar() {
  const active = uploads.some(u => u.status === 'waiting' || u.status === 'uploading');
  const total = uploads.reduce((sum, u) => sum + (u.size || 0), 0);
  const loaded = uploads.reduce((sum, u) => sum + Math.min(u.loaded || 0, u.size || 0), 0);
  let pct = total > 0 ? Math.round(loaded / total * 100) : 0;
  if (!total && uploads.length && uploads.every(u => u.status === 'done')) pct = 100;

  const bar = $('#queueBar');
  bar.style.width = pct + '%';
  const track = bar.parentElement;
  track.classList.toggle('idle', !active);
  track.classList.toggle('done', uploads.length > 0 && !active && uploads.every(u => u.status === 'done'));

  const done = uploads.filter(u => u.status === 'done').length;
  $('#queueTitle').textContent = '传输 ' + done + '/' + uploads.length + ' · ' + pct + '%';

  clearTimeout(autoClearTimer);
  if (!active && uploads.length && uploads.every(u => u.status === 'done')) {
    autoClearTimer = setTimeout(() => {
      if (uploads.length && uploads.every(u => u.status === 'done')) {
        uploads.length = 0;
        renderQueue();
      }
    }, 2800);
  }
}

function scheduleReload() {
  if (uploads.some(u => u.status === 'waiting' || u.status === 'uploading')) return;
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    if (!uploads.some(u => u.status === 'waiting' || u.status === 'uploading')) loadDir(state.path);
  }, 320);
}

function clearFinished() {
  for (let i = uploads.length - 1; i >= 0; i--) {
    const s = uploads[i].status;
    if (s === 'done' || s === 'canceled') uploads.splice(i, 1);
  }
  renderQueue();
}

/* ============ 拖拽与文件夹解析 ============ */
function hasFileDrag(ev) {
  const dt = ev.dataTransfer;
  if (!dt) return false;
  return Array.prototype.indexOf.call(dt.types || [], 'Files') !== -1;
}

async function collectDrop(dt) {
  const out = [];
  const items = dt.items ? Array.from(dt.items) : [];
  const roots = [];
  for (const item of items) {
    if (item.kind !== 'file') continue;
    const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
    if (entry) roots.push(entry);
  }
  if (roots.length) {
    for (const root of roots) await walkEntry(root, '', out);
    return out;
  }
  return Array.from(dt.files || []).map(file => ({ file, rel: file.name }));
}

function walkEntry(entry, prefix, out) {
  return new Promise(resolve => {
    if (!entry) return resolve();
    if (entry.isFile) {
      entry.file(file => {
        out.push({ file, rel: prefix + entry.name });
        resolve();
      }, () => resolve());
      return;
    }
    if (!entry.isDirectory) return resolve();
    const reader = entry.createReader();
    const readBatch = () => {
      reader.readEntries(async batch => {
        if (!batch.length) return resolve();
        for (const child of batch) await walkEntry(child, prefix + entry.name + '/', out);
        readBatch();
      }, () => resolve());
    };
    readBatch();
  });
}


/* ============ 事件绑定 ============ */
let dragDepth = 0;
let searchTimer = 0;

function applyTheme(name) {
  const theme = name === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(THEME_KEY, theme); } catch (_) { /* 隐私模式 */ }
}

function bindEvents() {
  /* 上传文件 / 上传文件夹 */
  $('#fileInput').addEventListener('change', ev => {
    const fileList = ev.target.files;
    const files = Array.from(fileList || []).map(file => ({ file, rel: file.name }));
    ev.target.value = '';
    queueFiles(files);
  });
  $('#dirInput').addEventListener('change', ev => {
    const fileList = ev.target.files;
    const files = Array.from(fileList || []).map(file => ({
      file,
      rel: file.webkitRelativePath || file.name
    }));
    ev.target.value = '';
    queueFiles(files);
  });

  /* 拖拽上传 */
  window.addEventListener('dragenter', ev => {
    if (!hasFileDrag(ev)) return;
    ev.preventDefault();
    dragDepth++;
    if (state.caps.write) overlayEl.hidden = false;
  });
  window.addEventListener('dragover', ev => {
    if (!hasFileDrag(ev)) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = state.caps.write ? 'copy' : 'none';
  });
  window.addEventListener('dragleave', ev => {
    if (!hasFileDrag(ev)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) overlayEl.hidden = true;
  });
  window.addEventListener('drop', async ev => {
    if (!hasFileDrag(ev)) return;
    ev.preventDefault();
    dragDepth = 0;
    overlayEl.hidden = true;
    if (!state.caps.write) {
      toast('当前服务不支持上传', 'err');
      return;
    }
    const files = await collectDrop(ev.dataTransfer);
    queueFiles(files);
  });
  window.addEventListener('blur', () => { dragDepth = 0; overlayEl.hidden = true; });

  /* 顶栏 */
  $('#home').addEventListener('click', ev => {
    ev.preventDefault();
    go('/');
  });
  $('#theme').addEventListener('click', () => {
    applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
  });
  $('#refresh').addEventListener('click', ev => {
    const btn = ev.currentTarget;
    btn.classList.add('spin');
    setTimeout(() => btn.classList.remove('spin'), 700);
    loadDir(state.path);
  });

  /* 筛选 */
  searchEl.addEventListener('input', ev => {
    const value = ev.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.query = value;
      render();
    }, 80);
  });

  /* 排序 */
  $$('.sort').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.sort;
      if (state.sort.key === key) state.sort.dir *= -1;
      else state.sort = { key, dir: key === 'name' ? 1 : -1 };
      render();
    });
  });

  /* 操作 */
  $('#newFolder').addEventListener('click', createFolder);
  $('#queueClear').addEventListener('click', clearFinished);

  /* 浏览器前进 / 后退 */
  window.addEventListener('popstate', () => {
    const path = pathFromHash();
    if (path !== state.path) syncPath(path);
  });
  window.addEventListener('hashchange', () => {
    const path = pathFromHash();
    if (path !== state.path) syncPath(path);
  });

  /* 键盘 */
  window.addEventListener('keydown', ev => {
    if (modalEl.open) return;
    const tag = (ev.target.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || ev.target.isContentEditable;
    if (ev.key === '/' && !typing) {
      ev.preventDefault();
      searchEl.focus();
      searchEl.select();
      return;
    }
    if (ev.key === 'Escape' && ev.target === searchEl) {
      searchEl.value = '';
      state.query = '';
      render();
      searchEl.blur();
      return;
    }
    if (ev.key === 'Backspace' && !typing && state.path !== '/') {
      ev.preventDefault();
      go(state.path.replace(/\/[^/]*$/, '') || '/');
    }
  });
}

/* ============ 启动 ============ */
function init() {
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch (_) { /* 隐私模式 */ }
  document.documentElement.dataset.theme = saved === 'light' ? 'light' : 'dark';

  bindEvents();

  const start = pathFromHash();
  if (!location.hash) history.replaceState(null, '', '#' + encPath(start));
  state.path = start;
  renderCrumbs();
  detectServer().then(write => {
    setCaps(write, write);
    loadDir(start);
  });
}

init();

