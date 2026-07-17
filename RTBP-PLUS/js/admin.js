(() => {
  const SESSION_KEY = 'rtb_admin_unlocked';
  let config;

  const gate = document.getElementById('gate');
  const gateForm = document.getElementById('gate-form');
  const gatePassword = document.getElementById('gate-password');
  const gateErr = document.getElementById('gate-err');
  const adminContent = document.getElementById('admin-content');
  const toastEl = document.getElementById('toast');

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), 2200);
  }

  async function init() {
    config = await loadConfig();
    if (sessionStorage.getItem(SESSION_KEY) === '1') {
      await unlock();
    }
  }

  async function unlock() {
    gate.style.display = 'none';
    adminContent.style.display = '';
    initPayoutSettings();
    renderSources();
    renderTable();
  }

  gateForm.addEventListener('submit', async e => {
    e.preventDefault();
    gateErr.style.display = 'none';
    const submitBtn = gateForm.querySelector('button[type=submit]');
    submitBtn.disabled = true;

    // Direct local check matching "Abdulrehman" (agents don't see setup screen, they just run the unpacked zip)
    if (gatePassword.value === 'Abdulrehman') {
      sessionStorage.setItem(SESSION_KEY, '1');
      await unlock();
    } else {
      gateErr.textContent = 'Incorrect password.';
      gateErr.style.display = 'block';
    }
    submitBtn.disabled = false;
  });

  document.getElementById('logout-btn').addEventListener('click', () => {
    sessionStorage.removeItem(SESSION_KEY);
    location.reload();
  });

  // ── Payout Settings ───────────────────────────────────────

  function initPayoutSettings() {
    const chk        = document.getElementById('payout-visible-chk');
    const container  = document.getElementById('payout-toggle-container');
    const track      = document.getElementById('payout-toggle-track');
    const thumb      = document.getElementById('payout-toggle-thumb');
    const badge      = document.getElementById('payout-status-badge');

    function applyToggleUI(visible) {
      if (visible) {
        track.style.background = 'var(--teal)';
        thumb.style.transform  = 'translateX(20px)';
        badge.style.background = 'rgba(95,208,138,0.12)';
        badge.style.color      = 'var(--green)';
        badge.textContent      = 'REVEALED (agents see $ amount)';
      } else {
        track.style.background = 'var(--border)';
        thumb.style.transform  = 'translateX(0)';
        badge.style.background = 'rgba(229,88,107,0.12)';
        badge.style.color      = 'var(--red)';
        badge.textContent      = 'HIDDEN (agents see tiers)';
      }
    }

    // Load saved state
    chk.checked = config.payoutVisible === true;
    applyToggleUI(chk.checked);

    // Toggle click on the container div (avoids double toggle bugs)
    container.addEventListener('click', async () => {
      chk.checked = !chk.checked;
      config.payoutVisible = chk.checked;
      await saveConfig(config);
      applyToggleUI(chk.checked);
      toast(chk.checked ? '💰 Payout revealed to agents' : '🔒 Payout hidden — agents see tiers');
    });
  }

  // ── Table render ─────────────────────────────────────────

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function sourceById(id) {
    return config.sources.find(s => s.id === id);
  }

  function renderTable() {
    const tbody = document.getElementById('route-tbody');
    tbody.innerHTML = '';
    if (config.routes.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="color:var(--muted-2); text-align:center; padding:30px;">No routes yet — add one above.</td></tr>`;
      return;
    }
    // group by source order, unknown sources last
    const ordered = [...config.sources.map(s => s.id), ...config.routes.filter(r => !sourceById(r.sourceId)).map(r => r.sourceId)];
    const sorted = [...config.routes].sort((a, b) => ordered.indexOf(a.sourceId) - ordered.indexOf(b.sourceId));

    for (const route of sorted) {
      const source = sourceById(route.sourceId) || { name: route.sourceId, color: '#5B636F' };
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="${route.paused ? 'opacity: 0.5;' : ''}"><span class="source-badge"><span class="source-swatch" style="background:${source.color}"></span>${escapeHtml(source.name)}</span></td>
        <td style="${route.paused ? 'opacity: 0.5; text-decoration: line-through;' : ''}"><strong>${escapeHtml(route.name)}</strong></td>
        <td class="url-cell" style="${route.paused ? 'opacity: 0.5;' : ''}">${escapeHtml(route.url)}</td>
        <td style="${route.paused ? 'opacity: 0.5;' : ''}">${route.fields.map(f => `<span class="field-tag">${f === 'caller_id' ? 'Caller ID' : 'Zip'}</span>`).join('')}</td>
        <td style="white-space:nowrap;">
          <button class="btn ${route.paused ? 'btn-primary' : 'btn-ghost'} btn-sm" data-action="toggle-pause-route" data-id="${route.id}">${route.paused ? '▶️ Resume' : '⏸️ Pause'}</button>
          <button class="btn btn-ghost btn-sm" data-action="edit" data-id="${route.id}">Edit</button>
          <button class="btn btn-danger btn-sm" data-action="delete" data-id="${route.id}">Delete</button>
        </td>
      `;
      tbody.appendChild(tr);
    }

    tbody.querySelectorAll('[data-action=toggle-pause-route]').forEach(btn =>
      btn.addEventListener('click', async () => {
        const route = config.routes.find(r => r.id === btn.dataset.id);
        if (!route) return;
        route.paused = !route.paused;
        await saveConfig(config);
        renderTable();
        toast(route.paused ? `⏸️ Route "${route.name}" paused` : `▶️ Route "${route.name}" active`);
      })
    );

    tbody.querySelectorAll('[data-action=edit]').forEach(btn =>
      btn.addEventListener('click', () => openRouteModal(btn.dataset.id))
    );
    tbody.querySelectorAll('[data-action=delete]').forEach(btn =>
      btn.addEventListener('click', async () => {
        const route = config.routes.find(r => r.id === btn.dataset.id);
        if (!route) return;
        if (!confirm(`Delete route "${route.name}"? This can't be undone here — export a backup first if unsure.`)) return;
        config.routes = config.routes.filter(r => r.id !== btn.dataset.id);
        await saveConfig(config);
        renderTable();
        toast('Route deleted');
      })
    );
  }

  // ── Route modal ──────────────────────────────────────────

  const routeBackdrop = document.getElementById('route-modal-backdrop');
  const routeForm = document.getElementById('route-form');
  const routeModalTitle = document.getElementById('route-modal-title');
  const routeIdInput = document.getElementById('route-id');
  const routeSourceSelect = document.getElementById('route-source');
  const routeNameInput = document.getElementById('route-name');
  const routeUrlInput = document.getElementById('route-url');
  const routeFieldCaller = document.getElementById('route-field-caller');
  const routeFieldZip = document.getElementById('route-field-zip');

  function populateSourceSelect() {
    routeSourceSelect.innerHTML = config.sources
      .map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`)
      .join('');
  }

  function openRouteModal(routeId) {
    populateSourceSelect();
    if (routeId) {
      const route = config.routes.find(r => r.id === routeId);
      routeModalTitle.textContent = 'Edit route';
      routeIdInput.value = route.id;
      routeSourceSelect.value = route.sourceId;
      routeNameInput.value = route.name;
      routeUrlInput.value = route.url;
      routeFieldCaller.checked = route.fields.includes('caller_id');
      routeFieldZip.checked = route.fields.includes('zip');
    } else {
      routeModalTitle.textContent = 'Add route';
      routeIdInput.value = '';
      routeNameInput.value = '';
      routeUrlInput.value = '';
      routeFieldCaller.checked = true;
      routeFieldZip.checked = false;
    }
    routeBackdrop.classList.add('open');
    routeNameInput.focus();
  }

  function closeRouteModal() {
    routeBackdrop.classList.remove('open');
  }

  document.getElementById('add-route-btn').addEventListener('click', () => {
    if (config.sources.length === 0) {
      toast('Add a source first');
      return;
    }
    openRouteModal(null);
  });
  document.getElementById('route-cancel-btn').addEventListener('click', closeRouteModal);
  routeBackdrop.addEventListener('click', e => { if (e.target === routeBackdrop) closeRouteModal(); });

  routeForm.addEventListener('submit', async e => {
    e.preventDefault();
    const fields = [];
    if (routeFieldCaller.checked) fields.push('caller_id');
    if (routeFieldZip.checked) fields.push('zip');

    const url = routeUrlInput.value.trim();
    if (!routeNameInput.value.trim() || !url) return;
    if (fields.includes('caller_id') && !url.includes('{{CALLER_ID}}')) {
      toast('URL must contain {{CALLER_ID}}');
      return;
    }
    if (fields.includes('zip') && !url.includes('{{ZIP}}')) {
      toast('URL must contain {{ZIP}}');
      return;
    }

    if (routeIdInput.value) {
      const route = config.routes.find(r => r.id === routeIdInput.value);
      route.sourceId = routeSourceSelect.value;
      route.name = routeNameInput.value.trim();
      route.url = url;
      route.fields = fields;
      toast('Route updated');
    } else {
      config.routes.push({
        id: uid('route'),
        sourceId: routeSourceSelect.value,
        name: routeNameInput.value.trim(),
        url,
        fields
      });
      toast('Route added');
    }
    await saveConfig(config);
    renderTable();
    closeRouteModal();
  });

  // ── Source CRUD ──────────────────────────────────────────

  function renderSources() {
    const list = document.getElementById('source-list');
    list.innerHTML = '';
    if (config.sources.length === 0) {
      list.innerHTML = `<div style="color:var(--muted-2); font-size:13px; padding:6px 0;">No sources yet — add one above.</div>`;
      return;
    }
    for (const src of config.sources) {
      const routeCount = config.routes.filter(r => r.sourceId === src.id).length;
      const row = document.createElement('div');
      row.style.cssText = 'display:flex; align-items:center; gap:12px; padding:10px 14px; background:var(--surface-2); border-radius:8px;';
      row.innerHTML = `
        <span class="source-swatch" style="background:${src.color}; width:12px; height:12px; border-radius:50%; flex-shrink:0; ${src.paused ? 'opacity: 0.5;' : ''}"></span>
        <span style="flex:1; font-weight:600; font-size:14px; ${src.paused ? 'text-decoration: line-through; opacity: 0.5;' : ''}">${escapeHtml(src.name)}</span>
        <span style="font-size:12px; color:var(--muted-2); margin-right:8px; ${src.paused ? 'opacity: 0.5;' : ''}">${routeCount} route${routeCount !== 1 ? 's' : ''}</span>
        <button class="btn ${src.paused ? 'btn-primary' : 'btn-ghost'} btn-sm" data-action="toggle-pause-src" data-id="${src.id}">${src.paused ? '▶️ Resume' : '⏸️ Pause'}</button>
        <button class="btn btn-ghost btn-sm" data-action="edit-src" data-id="${src.id}">Edit</button>
        <button class="btn btn-danger btn-sm" data-action="delete-src" data-id="${src.id}">Delete</button>
      `;
      list.appendChild(row);
    }

    list.querySelectorAll('[data-action=toggle-pause-src]').forEach(btn =>
      btn.addEventListener('click', async () => {
        const src = config.sources.find(s => s.id === btn.dataset.id);
        if (!src) return;
        src.paused = !src.paused;
        await saveConfig(config);
        renderSources();
        renderTable();
        toast(src.paused ? `⏸️ Source "${src.name}" paused` : `▶️ Source "${src.name}" active`);
      })
    );

    list.querySelectorAll('[data-action=edit-src]').forEach(btn =>
      btn.addEventListener('click', () => openSourceModal(btn.dataset.id))
    );
    list.querySelectorAll('[data-action=delete-src]').forEach(btn =>
      btn.addEventListener('click', async () => {
        const src = config.sources.find(s => s.id === btn.dataset.id);
        if (!src) return;
        const routeCount = config.routes.filter(r => r.sourceId === src.id).length;
        const msg = routeCount > 0
          ? `Delete source "${src.name}"? This will also delete ${routeCount} route${routeCount > 1 ? 's' : ''} assigned to it. This can't be undone.`
          : `Delete source "${src.name}"? This can't be undone.`;
        if (!confirm(msg)) return;
        config.routes = config.routes.filter(r => r.sourceId !== src.id);
        config.sources = config.sources.filter(s => s.id !== src.id);
        await saveConfig(config);
        renderSources();
        renderTable();
        toast(`Source "${src.name}" deleted`);
      })
    );
  }

  const sourceBackdrop = document.getElementById('source-modal-backdrop');
  const sourceForm = document.getElementById('source-form');
  const sourceModalTitle = document.getElementById('source-modal-title');
  const sourceIdInput = document.getElementById('source-id');

  function openSourceModal(srcId) {
    if (srcId) {
      const src = config.sources.find(s => s.id === srcId);
      if (!src) return;
      sourceModalTitle.textContent = 'Edit source';
      sourceIdInput.value = src.id;
      document.getElementById('source-name').value = src.name;
      document.getElementById('source-color').value = src.color;
    } else {
      sourceModalTitle.textContent = 'Add source';
      sourceIdInput.value = '';
      document.getElementById('source-name').value = '';
      document.getElementById('source-color').value = '#3FB8AF';
    }
    sourceBackdrop.classList.add('open');
    document.getElementById('source-name').focus();
  }

  document.getElementById('add-source-btn').addEventListener('click', () => openSourceModal(null));
  document.getElementById('source-cancel-btn').addEventListener('click', () => sourceBackdrop.classList.remove('open'));
  sourceBackdrop.addEventListener('click', e => { if (e.target === sourceBackdrop) sourceBackdrop.classList.remove('open'); });

  sourceForm.addEventListener('submit', async e => {
    e.preventDefault();
    const name = document.getElementById('source-name').value.trim();
    if (!name) return;
    const color = document.getElementById('source-color').value;
    const existingId = sourceIdInput.value;

    if (existingId) {
      const src = config.sources.find(s => s.id === existingId);
      if (src) { src.name = name; src.color = color; }
      toast(`Source "${name}" updated`);
    } else {
      config.sources.push({ id: uid('src'), name, color });
      toast(`Source "${name}" added`);
    }
    await saveConfig(config);
    sourceBackdrop.classList.remove('open');
    renderSources();
    renderTable();
  });

  // ── Backup export / import ───────────────────────────────

  document.getElementById('export-btn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `rtb-route-board-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  const importFile = document.getElementById('import-file');
  document.getElementById('import-btn').addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', () => {
    const file = importFile.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed.sources || !parsed.routes) throw new Error('Missing sources/routes');
        if (!confirm('Replace the current route board with this backup?')) return;
        config = parsed;
        await saveConfig(config);
        renderTable();
        toast('Backup imported');
      } catch (err) {
        toast('Invalid backup file');
      }
      importFile.value = '';
    };
    reader.readAsText(file);
  });

  init();
})();
