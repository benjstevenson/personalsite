(() => {
  const $ = (id) => document.getElementById(id);
  const editor = $('editor');
  const titleEl = $('title');
  const SCREENS = ['loading', 'notconfigured', 'gate', 'expired', 'published', 'app'];
  const show = (name) => SCREENS.forEach((s) => ($(s).hidden = s !== name));
  const JSON_HEADERS = { 'Content-Type': 'application/json' };

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...opts,
      headers: { 'X-Requested-With': 'write', ...(opts.headers || {}) },
    });
    let data = {};
    try { data = await res.json(); } catch { /* non-JSON error page */ }
    return { ok: res.ok, status: res.status, data };
  }

  // ---------- state ----------
  let hours = 3;           // timer length: picked before starting, then locked
  let deadline = null;     // server epoch ms, set once and never changed
  let offset = 0;          // serverNow - clientNow
  let clockTimer = null;
  let locked = false;      // true once time is up or the essay is published
  let dirty = false;
  let saveTimer = null;
  let firstDirtyAt = 0;
  let chain = Promise.resolve(); // every server call runs one at a time, in order
  const enqueue = (fn) => (chain = chain.catch(() => {}).then(fn));

  const setStatus = (text) => { $('status').textContent = text; };

  // ---------- countdown ----------
  const pad = (n) => String(n).padStart(2, '0');

  const picker = $('picker');

  function renderPicker() {
    picker.querySelectorAll('.pick').forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.h) === hours)));
  }

  // Before the clock starts, the display shows the length you've chosen.
  function renderIdle() {
    if (deadline !== null) return;
    $('clock').firstChild.nodeValue = `${hours}:00:00`;
    $('clock-note').textContent = 'Starts when you type';
  }

  picker.addEventListener('click', (e) => {
    const b = e.target.closest('.pick');
    if (!b || deadline !== null) return; // locked once the clock is running
    hours = Number(b.dataset.h);
    renderPicker();
    renderIdle();
  });

  function syncClock(serverNow, dl, serverHours) {
    if (typeof serverNow === 'number') offset = serverNow - Date.now();
    if (dl && deadline === null) {
      deadline = dl;
      if (serverHours) hours = serverHours;
      picker.hidden = true;
      clockTimer = setInterval(tick, 250);
      tick();
    }
  }

  function tick() {
    const left = deadline - (Date.now() + offset);
    if (left <= 0) return timeUp();
    const total = Math.floor(left / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const clock = $('clock');
    clock.firstChild.nodeValue = `${h}:${pad(m)}:${pad(s)}`;
    $('clock-note').textContent = `${hours}-hour timer`;
    clock.classList.toggle('warn', left <= 30 * 60 * 1000 && left > 10 * 60 * 1000);
    clock.classList.toggle('danger', left <= 10 * 60 * 1000);
  }

  function timeUp() {
    if (locked) return;
    locked = true;
    clearInterval(clockTimer);
    clearTimeout(saveTimer);
    editor.contentEditable = 'false';
    editor.innerHTML = '';
    titleEl.value = '';
    api('/api/write/state'); // asking the server is what triggers the deletion if it hasn't happened yet
    show('expired');
  }

  // ---------- paragraphs ----------
  // contenteditable leaves the very first line as bare text. Make every top-level line a <p>.
  const BLOCKS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'UL', 'OL', 'BLOCKQUOTE', 'PRE', 'DIV', 'HR']);

  function currentHTML() {
    const tmp = document.createElement('div');
    tmp.innerHTML = editor.innerHTML;
    const out = document.createElement('div');
    let run = null;
    for (const node of [...tmp.childNodes]) {
      if (node.nodeType === 1 && BLOCKS.has(node.tagName)) {
        run = null;
        out.appendChild(node);
      } else {
        if (!run) { run = document.createElement('p'); out.appendChild(run); }
        run.appendChild(node);
      }
    }
    return out.innerHTML;
  }

  function ensureParagraphs() {
    const loose = [...editor.childNodes].some(
      (n) => (n.nodeType === 3 && n.textContent.trim()) || (n.nodeType === 1 && !BLOCKS.has(n.tagName) && n.tagName !== 'IMG' && n.tagName !== 'BR'),
    );
    if (loose) document.execCommand('formatBlock', false, 'p');
  }

  // ---------- autosave ----------
  function scheduleSave() {
    if (locked) return;
    dirty = true;
    if (!firstDirtyAt) firstDirtyAt = Date.now();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, Math.max(0, Math.min(1000, 4000 - (Date.now() - firstDirtyAt))));
  }

  function flush() {
    clearTimeout(saveTimer);
    return enqueue(async () => {
      if (!dirty || locked) return;
      const body = JSON.stringify({ title: titleEl.value, html: currentHTML(), hours });
      dirty = false;
      firstDirtyAt = 0;
      setStatus('Saving…');
      try {
        const r = await api('/api/write/save', { method: 'POST', headers: JSON_HEADERS, body });
        if (r.status === 410) return timeUp();
        if (r.status === 401) return location.reload();
        if (!r.ok) throw new Error(r.data.error || 'Save failed');
        if (r.data.draft) {
          syncClock(r.data.now, r.data.draft.deadline, r.data.draft.hours);
          setStatus('Saved');
        } else {
          setStatus('');
        }
      } catch {
        dirty = true;
        setStatus('Offline? Retrying…');
        saveTimer = setTimeout(flush, 3000);
      }
    });
  }

  titleEl.addEventListener('input', scheduleSave);
  editor.addEventListener('input', () => { ensureParagraphs(); scheduleSave(); });

  // Last-ditch save when the tab is hidden or closed.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && dirty && !locked) {
      fetch('/api/write/save', {
        method: 'POST',
        keepalive: true,
        credentials: 'same-origin',
        headers: { 'X-Requested-With': 'write', ...JSON_HEADERS },
        body: JSON.stringify({ title: titleEl.value, html: currentHTML(), hours }),
      }).catch(() => {});
    }
  });
  window.addEventListener('beforeunload', (e) => {
    if (dirty && !locked) { e.preventDefault(); e.returnValue = ''; }
  });

  // ---------- formatting ----------
  try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch { /* older browsers */ }

  document.querySelectorAll('.tool[data-cmd]').forEach((b) => {
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => {
      editor.focus();
      document.execCommand(b.dataset.cmd);
      scheduleSave();
      refreshToolbar();
    });
  });

  document.querySelectorAll('.tool[data-block]').forEach((b) => {
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => {
      editor.focus();
      const current = String(document.queryCommandValue('formatBlock')).toLowerCase().replace(/[<>]/g, '');
      document.execCommand('formatBlock', false, current === b.dataset.block ? 'p' : b.dataset.block);
      scheduleSave();
      refreshToolbar();
    });
  });

  function addLink() {
    const sel = getSelection();
    if (!sel.rangeCount || sel.isCollapsed || !editor.contains(sel.anchorNode)) {
      setStatus('Select some text first, then click Link.');
      return;
    }
    const saved = sel.getRangeAt(0).cloneRange();
    const url = prompt('Link to (leave empty to remove the link):');
    editor.focus();
    sel.removeAllRanges();
    sel.addRange(saved);
    if (url === null) return;
    if (!url.trim()) {
      document.execCommand('unlink');
    } else {
      let u = url.trim();
      if (!/^(https?:|mailto:)/i.test(u)) u = 'https://' + u;
      document.execCommand('createLink', false, u);
    }
    scheduleSave();
  }
  $('link-btn').addEventListener('mousedown', (e) => e.preventDefault());
  $('link-btn').addEventListener('click', addLink);

  editor.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); addLink(); }
  });

  function refreshToolbar() {
    document.querySelectorAll('.tool[data-cmd="bold"], .tool[data-cmd="italic"], .tool[data-cmd="underline"]').forEach((b) => {
      let on = false;
      try { on = document.queryCommandState(b.dataset.cmd); } catch { /* ignore */ }
      b.classList.toggle('on', on);
    });
  }
  document.addEventListener('selectionchange', refreshToolbar);

  // ---------- paste: text goes in plain, images get uploaded ----------
  editor.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
    e.preventDefault();
    if (files.length) { files.forEach(uploadImage); return; }
    const text = e.clipboardData?.getData('text/plain') || '';
    if (text) document.execCommand('insertText', false, text);
  });

  editor.addEventListener('dragover', (e) => {
    if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault();
  });
  editor.addEventListener('drop', (e) => {
    const files = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    files.forEach(uploadImage);
  });

  $('image-btn').addEventListener('click', () => $('file').click());
  $('file').addEventListener('change', (e) => {
    [...e.target.files].forEach(uploadImage);
    e.target.value = '';
  });

  // ---------- images ----------
  const MAX_BYTES = 3_800_000;
  const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

  async function prepareImage(file) {
    if (file.type === 'image/gif' && file.size <= MAX_BYTES) return file;
    const bitmap = await createImageBitmap(file);
    let maxWidth = 1600;
    let quality = 0.9;
    for (let attempt = 0; attempt < 4; attempt++) {
      const scale = Math.min(1, maxWidth / bitmap.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      let blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', quality));
      if (!blob || blob.type !== 'image/webp') blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
      if (blob && blob.size <= MAX_BYTES) return blob;
      maxWidth = Math.round(maxWidth * 0.75);
      quality = Math.max(0.7, quality - 0.05);
    }
    throw new Error('That image is too large.');
  }

  async function uploadImage(file) {
    if (locked) return;
    if (!OK_TYPES.includes(file.type)) { setStatus('Only JPEG, PNG, GIF or WebP images.'); return; }

    // Remember where the cursor was so the image lands there.
    const sel = getSelection();
    const range = sel.rangeCount && editor.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null;

    setStatus('Uploading image…');
    try {
      const blob = await prepareImage(file);
      const r = await enqueue(() =>
        api('/api/write/image', { method: 'POST', headers: { 'Content-Type': blob.type, 'X-Duration-Hours': String(hours) }, body: blob }),
      );
      if (r.status === 410) return timeUp();
      if (!r.ok) throw new Error(r.data.error || 'Upload failed');
      syncClock(r.data.now, r.data.deadline, r.data.hours);

      editor.focus();
      const s = getSelection();
      s.removeAllRanges();
      if (range) {
        s.addRange(range);
      } else {
        const end = document.createRange();
        end.selectNodeContents(editor);
        end.collapse(false);
        s.addRange(end);
      }
      document.execCommand('insertHTML', false, `<img src="${r.data.url}" alt="">`);
      setStatus('');
      scheduleSave();
    } catch (err) {
      setStatus(err.message || 'Could not upload that image.');
    }
  }

  // ---------- publish ----------
  $('publish').addEventListener('click', async () => {
    if (locked) return;
    const title = titleEl.value.trim();
    if (!title) { setStatus('Add a title first.'); titleEl.focus(); return; }
    if (!confirm('Publish now?\n\nIt goes live on benstevenson.io immediately.')) return;

    const btn = $('publish');
    btn.disabled = true;
    setStatus('Publishing…');
    clearTimeout(saveTimer);
    const r = await enqueue(() =>
      api('/api/write/publish', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ title, html: currentHTML() }) }),
    );
    if (r.status === 410) return timeUp();
    if (!r.ok) {
      btn.disabled = false;
      setStatus(r.data.error || 'Could not publish. Try again.');
      return;
    }
    locked = true;
    dirty = false;
    clearInterval(clockTimer);
    const link = $('published-link');
    link.href = r.data.url;
    link.textContent = location.origin + r.data.url;
    show('published');
  });

  // ---------- passphrase gate ----------
  $('gate-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('gate-error').textContent = '';
    const r = await api('/api/write/login', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ passphrase: $('passphrase').value }),
    });
    if (r.ok) return boot();
    if (r.status === 503) return show('notconfigured');
    $('gate-error').textContent = r.data.error || 'Could not unlock.';
  });

  // ---------- start ----------
  async function boot() {
    show('loading');
    let r;
    try { r = await api('/api/write/state'); } catch { r = { data: {} }; }
    const s = r.data;
    if (!s.configured) return show('notconfigured');
    if (!s.authed) { show('gate'); $('passphrase').focus(); return; }
    if (s.expired) return show('expired');

    show('app');
    if (s.draft) {
      titleEl.value = s.draft.title || '';
      editor.innerHTML = s.draft.html || '';
      syncClock(s.now, s.draft.deadline, s.draft.hours);
    } else {
      renderPicker();
      renderIdle();
    }
    (s.draft && s.draft.title ? editor : titleEl).focus();
  }

  boot();
})();
