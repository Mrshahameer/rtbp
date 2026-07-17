(() => {
  let config;
  const form        = document.getElementById('query-form');
  const callerInput = document.getElementById('caller-id');
  const zipInput    = document.getElementById('zip');
  const zipField    = document.getElementById('zip-field');
  const resultsEl   = document.getElementById('results');
  const runBtn      = document.getElementById('run-btn');
  const runDot      = document.getElementById('run-dot');
  const summaryBar  = document.getElementById('summary-bar');
  let clientProfile = null;
  const logoutBtn   = document.getElementById('logout-btn');

  async function init() {
    // 1. Auth check
    const user = await checkAuth();
    if (!user) {
      window.location.href = '/login.html';
      return;
    }

    // 2. Load DB values
    config = await loadConfig();
    clientProfile = await loadUserProfile(user.id);

    // 3. UI render
    refreshZipVisibility();
    renderBoard();

    // 4. Setup logout
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        const supabase = await getSupabaseClient();
        if (supabase) await supabase.auth.signOut();
        window.location.href = '/login.html';
      });
    }
  }

  function refreshZipVisibility() {
    const needs = config.routes.some(r => r.fields.includes('zip'));
    zipField.style.display = needs ? '' : 'none';
  }

  // ── Phone number cleaning ─────────────────────────────────
  function cleanPhone(val) {
    let d = String(val).replace(/[^\d]/g, '');
    if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
    if (d.length > 10) d = d.substring(0, 10);
    return d;
  }

  callerInput.addEventListener('input', () => {
    const c = cleanPhone(callerInput.value);
    if (callerInput.value !== c) callerInput.value = c;
  });

  // ── Utilities ─────────────────────────────────────────────
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  }

  function copyText(t) { navigator.clipboard.writeText(t).catch(() => {}); }

  function showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2000);
  }

  // ── Paste handler ─────────────────────────────────────────
  async function handlePaste(targetId, type) {
    try {
      const text  = await navigator.clipboard.readText();
      const input = document.getElementById(targetId);
      if (!input) return;
      input.value = type === 'phone' ? cleanPhone(text) : text.trim();
      input.dispatchEvent(new Event('input'));
      showToast(type === 'phone' ? '📋 Pasted & cleaned' : '📋 Pasted');
    } catch {
      showToast('❌ Clipboard permission denied');
    }
  }

  document.querySelectorAll('.paste-btn').forEach(btn =>
    btn.addEventListener('click', () => handlePaste(btn.dataset.target, btn.dataset.type))
  );

  // ── Route number extraction ───────────────────────────────
  function extractPhoneNumber(raw) {
    const s = String(raw || '');
    if (s.startsWith('+1')) return s.slice(2);
    if (s.startsWith('1') && s.length === 11) return s.slice(1);
    return s;
  }

  // ── Payout tier calculation ───────────────────────────────
  // $1-$40 = 1x, $41-$100 = 2x, $101+ = 3x
  function getTierLabel(payout, rangeSize) {
    const val = Number(payout || 0);
    if (val <= 40) return '1x';
    if (val <= 100) return '2x';
    return '3x';
  }

  function formatPayout(payout, payoutVisible, rangeSize) {
    return payoutVisible
      ? `$${Number(payout || 0).toFixed(2)}`
      : getTierLabel(payout || 0, rangeSize);
  }

  // ── Skeleton/Initial card ──────────────────
  function routeCardSkeleton(route) {
    const card = document.createElement('div');
    const src = config.sources.find(s => s.id === route.sourceId);
    const isPaused = route.paused || (src && src.paused);

    if (isPaused) {
      card.className = 'result-card no-routes';
      card.id = `row-${route.id}`;
      card.innerHTML = `
        <div class="card-header">
          <div class="card-dot gray"></div>
          <span class="card-label">${escapeHtml(route.name)}</span>
          <span class="card-meta">Paused</span>
        </div>
        <div class="card-body">
          <div class="no-routes-msg">Paused by admin</div>
        </div>
      `;
    } else {
      card.className = 'result-card loading';
      card.id = `row-${route.id}`;
      card.innerHTML = `
        <div class="card-header">
          <div class="card-dot spin" style="animation:none; background:var(--muted-2);"></div>
          <span class="card-label">${escapeHtml(route.name)}</span>
          <span class="card-meta">Ready</span>
        </div>
        <div class="card-body">
          <div class="skeleton-line" style="width:82%; animation:none; background:var(--border-soft);"></div>
          <div class="skeleton-line" style="width:55%; animation:none; background:var(--border-soft);"></div>
        </div>
      `;
    }
    return card;
  }

  // ── Wire copy buttons inside a rendered card ──────────────
  function wireCopyButtons(card) {
    card.querySelectorAll('.copy-num-btn').forEach(btn =>
      btn.addEventListener('click', e => { e.stopPropagation(); copyText(btn.dataset.copy); showToast('📋 Number copied'); })
    );
    card.querySelectorAll('.copy-bid-btn').forEach(btn =>
      btn.addEventListener('click', e => { e.stopPropagation(); copyText(btn.dataset.copy); showToast('📋 Bid copied'); })
    );
    card.querySelectorAll('.copy-both-btn').forEach(btn =>
      btn.addEventListener('click', e => { e.stopPropagation(); copyText(btn.dataset.copy); showToast('📋 Copied number & bid'); })
    );
    card.querySelectorAll('.card-url-btn').forEach(btn =>
      btn.addEventListener('click', e => { e.stopPropagation(); copyText(btn.dataset.url); showToast('🔗 URL copied'); })
    );
  }


  // ── Template fill ─────────────────────────────────────────
  function fillTemplate(url, callerId, zip) {
    return url
      .replaceAll('{{CALLER_ID}}', encodeURIComponent(callerId))
      .replaceAll('{{ZIP}}',       encodeURIComponent(zip || ''));
  }

  // ── Update a card with the final result ───────────────────
  function updateRow(route, outcome, payoutVisible, rangeSize) {
    const card = document.getElementById(`row-${route.id}`);
    if (!card) return;

    // Skipped
    if (outcome.kind === 'skipped') {
      card.className = 'result-card no-routes';
      card.innerHTML = `
        <div class="card-header">
          <div class="card-dot gray"></div>
          <span class="card-label">${escapeHtml(route.name)}</span>
          <span class="card-meta">Skipped</span>
        </div>
        <div class="card-body"><div class="no-routes-msg">${escapeHtml(outcome.reason)}</div></div>
      `;
      return;
    }

    // Error
    if (outcome.kind === 'error') {
      card.className = 'result-card errored';
      card.innerHTML = `
        <div class="card-header">
          <div class="card-dot red"></div>
          <span class="card-label">${escapeHtml(route.name)}</span>
          <span class="card-meta">Error</span>
        </div>
        <div class="card-body">
          <div class="no-routes-msg" style="color:var(--red)">⚠️ ${escapeHtml(outcome.message)}</div>
        </div>
      `;
      return;
    }

    // Success — parse response
    const json = outcome.data;
    const eligibleRoutes = Array.isArray(json?.eligible_routes) ? json.eligible_routes : [];

    const hasRoutes = eligibleRoutes.length > 0;
    const reqId    = json?.request_id ? json.request_id.substring(0, 8) + '…' : '';
    const ts       = json?.timestamp ? new Date(json.timestamp).toLocaleTimeString() : '';
    const totalRts = json?.total_routes;

    card.className = `result-card ${hasRoutes ? 'has-routes' : 'no-routes'}`;

    // "Copy Both" value
    const copyBothVal = eligibleRoutes.map(rt => {
      const num    = extractPhoneNumber(rt.number || '');
      const bidStr = formatPayout(rt.payout, payoutVisible, rangeSize);
      return `${num} - ${bidStr}`;
    }).join('\n');

    // Footer pills
    const pills = [];
    if (totalRts !== undefined) pills.push(`${totalRts} route${totalRts !== 1 ? 's' : ''}`);
    if (reqId) pills.push(`ID: ${reqId}`);
    if (ts)    pills.push(ts);

    // Route rows
    const routesHtml = hasRoutes
      ? eligibleRoutes.map(rt => {
          const num        = escapeHtml(extractPhoneNumber(rt.number || ''));
          const payoutDisp = escapeHtml(formatPayout(rt.payout, payoutVisible, rangeSize));
          const bufferVal = rt.duration != null 
            ? rt.duration 
            : (rt.allocation_time_seconds != null 
                ? rt.allocation_time_seconds 
                : (json?.allocation_time_seconds != null 
                    ? json.allocation_time_seconds 
                    : null));
          const bufferSecs = bufferVal != null ? `${bufferVal}s` : '—';
          const bidLabel   = payoutVisible ? 'Bid Payout' : 'Bid Tier';

          return `
            <div class="route-result-row">
              <div style="display:flex; flex-direction:column; gap:3px; width:100%;">
                <span class="route-box-label">Route Number</span>
                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                  <span class="route-number-display">${num}</span>
                  <button class="copy-num-btn" data-copy="${num}" title="Copy number">📋 Copy</button>
                </div>
              </div>
              <div style="height:1px; background:var(--border-soft); width:100%;"></div>
              <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; width:100%;">
                <div style="display:flex; flex-direction:column; gap:3px;">
                  <span class="route-box-label">Buffer Time</span>
                  <span class="route-alloc-badge">⏳ ${escapeHtml(bufferSecs)}</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:3px; align-items:flex-end;">
                  <span class="route-box-label">${bidLabel}</span>
                  <div style="display:flex; align-items:center; gap:5px;">
                    <span class="route-payout-badge">${payoutDisp}</span>
                    <button class="copy-bid-btn" data-copy="${payoutDisp}" title="Copy bid">📋 Copy</button>
                  </div>
                </div>
              </div>
            </div>
          `;
        }).join('')
      : `<div class="no-routes-msg">No eligible routes</div>`;

    card.innerHTML = `
      <div class="card-header">
        <div class="card-dot ${hasRoutes ? 'green' : 'gray'}"></div>
        <span class="card-label">${escapeHtml(route.name)}</span>
        <span class="card-meta">${hasRoutes
          ? `${eligibleRoutes.length} route${eligibleRoutes.length > 1 ? 's' : ''}`
          : 'No match'}</span>
        ${hasRoutes ? `<button class="copy-both-btn" data-copy="${escapeHtml(copyBothVal)}" title="Copy number &amp; bid">📋 Copy Both</button>` : ''}
        <button class="card-url-btn" data-url="${escapeHtml(route.url)}" title="Copy URL">🔗</button>
      </div>
      <div class="card-body">${routesHtml}</div>
      ${pills.length ? `<div class="card-footer">${pills.map(p => `<span class="meta-pill">${escapeHtml(p)}</span>`).join('')}</div>` : ''}
    `;

    wireCopyButtons(card);
  }

  // ── Board render ──────────────────────────────────────────
  function renderBoard() {
    resultsEl.innerHTML = '';
    summaryBar.style.display = 'none';

    if (config.routes.length === 0) {
      resultsEl.innerHTML = `<div class="empty-state"><div class="big">No routes configured</div>Add buyer routes from Manage routes to get started.</div>`;
      return;
    }

    for (const source of config.sources) {
      const routes = config.routes.filter(r => r.sourceId === source.id);
      if (routes.length === 0) continue;

      const group = document.createElement('div');
      group.className = 'source-group';
      group.innerHTML = `
        <div class="source-head">
          <span class="source-badge">
            <span class="source-swatch" style="background:${source.color}"></span>
            ${escapeHtml(source.name)}
          </span>
          <span class="source-count">${routes.length}</span>
          <div class="source-line"></div>
        </div>
        <div class="route-list" data-role="list"></div>
      `;
      const list = group.querySelector('[data-role=list]');
      routes.forEach(r => list.appendChild(routeCardSkeleton(r)));
      resultsEl.appendChild(group);
    }

    // Orphan routes
    const orphan = config.routes.filter(r => !config.sources.some(s => s.id === r.sourceId));
    if (orphan.length) {
      const group = document.createElement('div');
      group.className = 'source-group';
      group.innerHTML = `
        <div class="source-head">
          <span class="source-badge"><span class="source-swatch" style="background:#5B636F"></span>Unassigned</span>
          <span class="source-count">${orphan.length}</span>
          <div class="source-line"></div>
        </div>
        <div class="route-list" data-role="list"></div>
      `;
      orphan.forEach(r => group.querySelector('[data-role=list]').appendChild(routeCardSkeleton(r)));
      resultsEl.appendChild(group);
    }
  }

  // ── Summary bar ───────────────────────────────────────────
  function updateSummaryBar(okData, elapsedMs, payoutVisible, rangeSize) {
    const fired      = config.routes.length;
    const totalHits  = okData.reduce((s, d) => s + (d.eligible_routes?.length || 0), 0);
    const maxPayout  = okData.reduce((mx, d) => {
      const top = (d.eligible_routes || []).reduce((m, rt) => Math.max(m, rt.payout || 0), 0);
      return Math.max(mx, top);
    }, 0);

    document.getElementById('sum-fired').textContent  = fired;
    document.getElementById('sum-routes').textContent = totalHits;
    document.getElementById('sum-payout').textContent = maxPayout > 0
      ? formatPayout(maxPayout, payoutVisible, rangeSize)
      : (payoutVisible ? '$0' : '—');
    document.getElementById('sum-time').textContent   = (elapsedMs / 1000).toFixed(1) + 's';
    summaryBar.style.display = 'grid';
  }

  // ── Run all routes in parallel ────────────────────────────
  async function runCheck(callerId, zip) {
    config = await loadConfig();
    
    // Refresh client profile to get latest reveal_payout settings
    const user = await checkAuth();
    if (user) {
      clientProfile = await loadUserProfile(user.id);
    }
    const payoutVisible = clientProfile ? clientProfile.reveal_payout === true : false;
    const rangeSize     = config.payoutRangeSize || 40;

    renderBoard();
    runBtn.disabled = true;
    runDot.style.display = '';
    const t0 = Date.now();
    const okData = [];

    const jobs = config.routes.map(async route => {
      // Check if route or source is paused
      const src = config.sources.find(s => s.id === route.sourceId);
      if (route.paused || (src && src.paused)) {
        return updateRow(route, { kind: 'skipped', reason: 'Paused by admin' }, payoutVisible, rangeSize);
      }

      if (route.fields.includes('caller_id') && !callerId)
        return updateRow(route, { kind: 'skipped', reason: 'Caller ID required' }, payoutVisible, rangeSize);
      if (route.fields.includes('zip') && !zip)
        return updateRow(route, { kind: 'skipped', reason: 'Zip code required' }, payoutVisible, rangeSize);

      const targetUrl = fillTemplate(route.url, callerId, zip);
      try {
        const response = await chrome.runtime.sendMessage({ type: 'FETCH_DIRECT', url: targetUrl });
        if (!response || !response.success) {
          throw new Error(response?.error || 'Direct fetch failed');
        }
        const body = response.data;
        okData.push(body);
        return updateRow(route, { kind: 'ok', data: body }, payoutVisible, rangeSize);
      } catch (e) {
        return updateRow(route, {
          kind: 'error',
          message: e.name === 'TimeoutError' ? 'Timed out after 20s' : e.message
        }, payoutVisible, rangeSize);
      }
    });

    await Promise.all(jobs);
    updateSummaryBar(okData, Date.now() - t0, payoutVisible, rangeSize);
    runBtn.disabled = false;
    runDot.style.display = 'none';
  }

  // ── Form submit ───────────────────────────────────────────
  form.addEventListener('submit', e => {
    e.preventDefault();
    const callerId = callerInput.value.trim();
    const zip      = zipInput.value.trim();
    if (!callerId) { callerInput.focus(); return; }
    runCheck(callerId, zip);
  });

  init();
})();
