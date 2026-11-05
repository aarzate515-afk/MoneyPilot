(function () {
  const LS_KEY = 'desk_data_path';
  const POLL_MS = 15000;
  let dataPath = null;
  let state = null;
  let chart = null;
  let activity = [];
  let range = 'LIVE';
  let retryIn = 5;
  let lastOk = null;
  let timer = null;

  function $(id) { return document.getElementById(id); }

  function readDataPath() {
    const hash = location.hash || '';
    const m = hash.match(/[#&]d=([A-Za-z0-9_\-]+)/);
    if (m && m[1].length >= 32) {
      dataPath = m[1];
      try { localStorage.setItem(LS_KEY, dataPath); } catch (_) {}
      // strip fragment from visible history without losing path in storage
      history.replaceState(null, '', location.pathname + location.search);
      return dataPath;
    }
    try { dataPath = localStorage.getItem(LS_KEY); } catch (_) {}
    return dataPath;
  }

  function base() {
    // Pages site root
    const root = location.origin + location.pathname.replace(/index\.html$/, '').replace(/\/?$/, '/');
    return root + 'd/' + dataPath + '/';
  }

  async function fetchJson(name) {
    const url = base() + name;
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(name + ' ' + r.status);
    return r.json();
  }

  function showError(msg) {
    const el = $('errorBar');
    el.textContent = msg;
    el.classList.add('show');
  }
  function clearError() { $('errorBar').classList.remove('show'); }

  function fmtUsd(n) {
    if (n == null || isNaN(n)) return '—';
    return '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtPct(n) {
    const v = Number(n) || 0;
    const s = (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
    return s;
  }

  function setTab(name) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === 'tab-' + name));
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
    if (name === 'account') $('btnAvatar').focus();
  }

  function renderHome() {
    if (!state) return;
    $('balance').textContent = fmtUsd(state.balance);
    $('todayPct').textContent = fmtPct(state.today_pct);
    $('todayPct').style.color = (state.today_pct || 0) >= 0 ? 'var(--green)' : 'var(--red)';
    $('multPill').textContent = (state.multiplier || 1).toFixed(2) + '×';
    $('paperPill').style.display = state.mode === 'PAPER' ? '' : 'none';
    const running = (state.agents || []).filter((a) => a.status === 'running').length;
    $('agentsLabel').textContent = 'Agents · ' + running + ' running';
    renderAgentCards($('agentCarousel'), state.agents || [], true);
    renderActivityList($('homeActivity'), (activity || []).slice(0, 5));
    drawChart();
  }

  function renderAgentCards(el, agents, carousel) {
    el.innerHTML = '';
    const order = ['scanner', 'auditor', 'analyst', 'executor', 'risk'];
    const by = {};
    (agents || []).forEach((a) => { by[a.name] = a; });
    order.forEach((name) => {
      const a = by[name] || { name, status: 'offline', count: 0 };
      const card = document.createElement('div');
      card.className = 'agent-card';
      const color = { scanner: 'var(--cyan)', auditor: '#fff', analyst: 'var(--yellow)', executor: 'var(--green)', risk: 'var(--pink)' }[name];
      let body = '';
      if (name === 'scanner') {
        body = `<div class="sub" style="color:${color}">${a.count || 0} pools</div>` +
          feedHtml(a.feed);
      } else if (name === 'auditor') {
        body = `<div class="sub">${a.count || 0} taken apart · ${a.rejected || 0} rejected</div>` +
          stripsHtml(a.layers) + `<div class="muted">${a.last || ''}</div>`;
      } else if (name === 'analyst') {
        body = `<div class="sub">Scoring</div><div class="ring-wrap"><canvas data-score="${a.score ?? ''}"></canvas></div>`;
      } else if (name === 'executor') {
        body = `<div class="sub" style="color:${color}">${a.count || 0} trades · ${fmtUsd(a.size)} · ${a.stack_pct || 0}% of stack</div>` +
          `<div class="bar"><span style="width:${a.bar || 0}%"></span></div><div class="muted">${a.last || ''}</div>`;
      } else {
        body = `<div class="sub" style="color:${color}">Guarding</div><div class="muted">${a.last || ''}</div>` +
          `<div class="pills"><span class="pill stop">stop -${a.stop_pct ?? 6}%</span>` +
          `<span class="pill trail">trail ${a.trail_pct ?? 12}%</span></div>`;
      }
      card.innerHTML = `<h3><span class="dot-status ${a.status === 'paused' ? 'paused' : a.status === 'running' ? '' : 'offline'}"></span>${titleCase(name)}</h3>${body}`;
      el.appendChild(card);
      const c = card.querySelector('canvas[data-score]');
      if (c) DeskCharts.scoreRing(c, Number(c.dataset.score) || 0);
    });
  }

  function titleCase(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function feedHtml(feed) {
    if (!feed || !feed.length) return '<div class="muted">Listening for graduations</div>';
    return '<ul class="feed">' + feed.slice(0, 6).map((f) => {
      const cls = f.verdict === 'kill' ? 'kill' : 'pass';
      return `<li class="${cls}"><span class="name">${esc(f.name || f.mint)}</span><span class="${f.verdict === 'kill' ? 'reason' : ''}">${esc(f.reason || '→ auditor')}</span></li>`;
    }).join('') + '</ul>';
  }
  function stripsHtml(layers) {
    const arr = layers || [];
    let html = '<div class="layers">';
    for (let i = 1; i <= 8; i++) {
      const L = arr.find((x) => x.n === i);
      let cls = '';
      if (L && L.value === 'not checked') cls = '';
      else if (L && L.pass) cls = 'ok';
      else if (L && L.pass === false) cls = 'bad';
      html += `<div class="layer-strip ${cls}"></div>`;
    }
    return html + '</div>';
  }

  function renderActivityList(el, rows) {
    if (!rows || !rows.length) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = rows.map((r) => {
      return `<li data-mint="${esc(r.mint || '')}" data-kind="${esc(r.kind || '')}">
        <div class="title">${esc(r.title || '')}</div>
        <div class="val tabular">${esc(r.value || '')}</div>
        <div class="sub">${esc(r.subtitle || '')}</div>
      </li>`;
    }).join('');
    el.querySelectorAll('li').forEach((li) => {
      li.addEventListener('click', () => openDetail(li.dataset.mint, li.dataset.kind));
    });
  }

  function renderActivity() {
    const rows = activity || [];
    $('activityEmpty').style.display = rows.length ? 'none' : '';
    renderActivityList($('activityList'), rows);
  }

  function renderAgentsTab() {
    const el = $('agentsFull');
    el.innerHTML = '';
    const wrap = document.createElement('div');
    renderAgentCards(wrap, (state && state.agents) || [], false);
    // convert carousel cards to full width stacked
    wrap.querySelectorAll('.agent-card').forEach((c) => {
      c.style.flex = 'none';
      c.style.maxWidth = 'none';
      c.style.width = '100%';
      c.style.marginBottom = '12px';
      c.style.borderRadius = '16px';
      // decisions
      const name = (c.querySelector('h3') || {}).textContent || '';
      const key = name.trim().toLowerCase();
      const a = ((state && state.agents) || []).find((x) => x.name === key);
      const dec = document.createElement('div');
      dec.className = 'muted';
      dec.style.marginTop = '10px';
      if (a && a.decisions && a.decisions.length) {
        dec.innerHTML = a.decisions.slice(0, 20).map((d) => {
          const link = d.link ? ` <a href="${esc(d.link)}" target="_blank" rel="noopener">FOMO</a>` : '';
          return `<div>${esc(d.ts || '')} · ${esc(d.coin || '')} · ${esc(d.verdict || '')} · ${esc(d.reason || '')}${link}</div>`;
        }).join('');
      } else {
        dec.textContent = 'No decisions yet';
      }
      const note = document.createElement('div');
      note.className = 'muted';
      note.style.marginTop = '8px';
      note.textContent = 'Pause / resume via Telegram · Settings in Telegram';
      c.appendChild(dec);
      c.appendChild(note);
      el.appendChild(c);
    });
  }


  function renderCopy() {
    const box = $('copySummary');
    const openEl = $('copyOpen');
    const walEl = $('copyWallets');
    if (!box) return;
    const c = (state && state.copy) || {};
    const st = c.stats || {};
    box.innerHTML = `<h3>Copy follower</h3>
      <div class="row"><span class="left">Enabled</span><span>${c.enabled ? 'on' : 'off'}</span></div>
      <div class="row"><span class="left">Size</span><span class="tabular">$${Number(c.size_usd||0).toFixed(2)}</span></div>
      <div class="row"><span class="left">Max open</span><span>${c.max_open||0}</span></div>
      <div class="row"><span class="left">Total PnL</span><span class="tabular">$${(st.total_pnl||0).toFixed(2)}</span></div>`;
    const opens = c.open || [];
    openEl.innerHTML = opens.length ? opens.map(o =>
      `<li><div class="title">${esc(o.wallet)}</div><div class="val tabular">$${Number(o.size||0).toFixed(2)}</div>
       <div class="sub"><a href="${esc(o.link||'#')}" target="_blank" rel="noopener">${esc((o.mint||'').slice(0,8))}</a></div></li>`
    ).join('') : '<div class="empty">No open copy positions</div>';
    const ws = c.wallets || [];
    walEl.innerHTML = ws.length ? ws.map(w =>
      `<li><div class="title">${esc(w.label||w.address)}</div><div class="val">${w.enabled?'on':'off'}</div>
       <div class="sub mono">${esc(w.address||'')}</div></li>`
    ).join('') : '<div class="empty">No wallets — /copy add in Telegram</div>';
  }

  function renderAccount() {
    if (!state) return;
    $('acctMode').textContent = state.mode || 'PAPER';
    $('acctStack').textContent = fmtUsd(state.stack);
    const prof = state.profile_url || '#';
    const a = $('acctProfile');
    a.href = prof;
    a.textContent = state.fomo_handle ? '@' + state.fomo_handle : 'Open';
    $('acctTg').textContent = state.telegram_connected ? 'connected' : 'not connected';
    const box = $('settingsReadonly');
    const s = state.settings || {};
    const keys = Object.keys(s).sort();
    box.innerHTML = '<h3>Settings (read-only)</h3>' + keys.map((k) =>
      `<div class="row"><span class="left">${esc(k)}</span><span class="mono tabular">${esc(String(s[k]))}</span></div>`
    ).join('');
  }

  function drawChart() {
    const pts = (chart && chart.points) || [];
    const filtered = filterRange(pts, range);
    DeskCharts.lineChart($('homeChart'), filtered, {
      startValue: chart && chart.start_value,
      marks: (chart && chart.marks) || [],
      emptyText: 'Waiting for the first trade',
    });
  }

  function filterRange(pts, r) {
    if (!pts.length || r === 'ALL' || r === 'LIVE') return pts.slice(-Math.min(pts.length, r === 'LIVE' ? 120 : pts.length));
    const now = Date.now();
    const ms = { '1H': 3600e3, '4H': 14400e3, '1D': 86400e3, '1W': 604800e3 }[r] || 86400e3;
    return pts.filter((p) => {
      const t = typeof p.t === 'number' ? p.t : Date.parse(p.t);
      return now - t <= ms;
    });
  }

  async function openDetail(mint, kind) {
    if (!mint) return;
    try {
      const coin = await fetchJson('coin/' + mint + '.json');
      if (kind === 'rejected') {
        showAudit(coin);
      } else {
        showCoin(coin);
      }
    } catch (e) {
      // try audit-only from state
      showError('Coin data not ready yet');
    }
  }

  function showCoin(coin) {
    const el = $('coinBody');
    const paper = state && state.mode === 'PAPER' ? '<span class="pill paper">PAPER</span>' : '';
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <h2 style="margin:0;flex:1">${esc(coin.name || coin.mint)}</h2>${paper}
        <span class="pill mult">${esc(coin.shield || '')}</span>
      </div>
      <div class="muted">${esc(coin.symbol || '')} · Solana · ${esc(coin.age || '')}</div>
      <div class="price-big tabular">${fmtUsd(coin.price)}</div>
      <div class="muted">${esc(coin.since_entry || '')}</div>
      <div class="chart-wrap" style="height:220px;margin:12px 0"><canvas id="coinChart"></canvas></div>
      <div class="card">
        <div class="row"><span class="left">Market cap</span><span>${fmtUsd(coin.market_cap)}</span></div>
        <div class="row"><span class="left">Liquidity</span><span>${fmtUsd(coin.liquidity)}</span></div>
        <div class="row"><span class="left">24h volume</span><span>${fmtUsd(coin.volume_h24)}</span></div>
        <div class="row"><span class="left">Holders</span><span>${coin.holders == null ? 'n/a' : esc(String(coin.holders))}</span></div>
      </div>
      ${coin.position ? `<div class="card"><h3>Your position · ${fmtUsd(coin.position.size_usd)} in · Executor</h3>
        <div class="row"><span class="left">Stop</span><span>${fmtUsd(coin.position.stop_price)}</span></div>
        <div class="row"><span class="left">Trail</span><span>${coin.position.trail_line != null ? fmtUsd(coin.position.trail_line) : '—'}</span></div>
        <div class="row"><span class="left">Timeout</span><span>${esc(coin.position.timeout_left || '')}</span></div>
      </div>` : ''}
      <a class="full-btn" id="coinFomo" href="${esc(coin.coin_url || '#')}" target="_blank" rel="noopener">
        ${coin.position ? 'Sell on FOMO' : 'Buy on FOMO'}
      </a>`;
    $('coinOverlay').classList.add('on');
    DeskCharts.candles($('coinChart'), coin.candles || [], coin.position && coin.position.trail_line);
  }

  function showAudit(coin) {
    const layers = coin.audit_layers || [];
    const discs = layers.map((L) => {
      const cls = L.value === 'not checked' ? '' : (L.pass ? 'ok' : 'bad');
      return `<div class="disc ${cls}"></div>`;
    }).join('') || '<div class="empty">No coin taken apart yet</div>';
    const rows = layers.map((L) =>
      `<div class="row"><span class="left">${L.n}. ${esc(L.name)}</span><span>${esc(L.value)}</span></div>`
    ).join('');
    const rejected = layers.some((L) => L.pass === false && L.value !== 'not checked');
    $('auditBody').innerHTML = `
      <h2 style="margin:0 0 8px">${esc(coin.name || coin.mint)}</h2>
      ${discs}
      <div class="card" style="margin-top:12px">${rows || '<div class="empty">No coin taken apart yet</div>'}</div>
      <div class="muted" style="margin:12px 0">${rejected ? 'Rejected · Grok Bot won\'t buy this' : (layers.length === 8 ? 'Cleared · 8/8 parts' : '')}</div>
      <div class="note">“Take apart before buying” is toggled in Telegram.</div>
      <a class="full-btn" href="${esc(coin.coin_url || '#')}" target="_blank" rel="noopener">Open on FOMO</a>`;
    $('auditOverlay').classList.add('on');
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function refresh() {
    if (!dataPath) {
      showError('Missing data path. Open the link from Telegram once.');
      return;
    }
    try {
      const [st, ch, act] = await Promise.all([
        fetchJson('state.json'),
        fetchJson('chart.json'),
        fetchJson('activity.json'),
      ]);
      state = st; chart = ch; activity = act.rows || act || [];
      lastOk = new Date();
      clearError();
      retryIn = 5;
      renderHome();
      renderAgentsTab();
      renderActivity();
      renderAccount();
      renderCopy();
      if (state.unread_pushes) $('bellDot').classList.add('on');
      else $('bellDot').classList.remove('on');
    } catch (e) {
      const t = lastOk ? lastOk.toLocaleTimeString() : 'never';
      showError(`Desk offline · retrying in ${retryIn}s · last update ${t}`);
      retryIn = Math.min(60, retryIn + 5);
    }
  }

  function bind() {
    document.querySelectorAll('.tabs button').forEach((b) => {
      b.addEventListener('click', () => setTab(b.dataset.tab));
    });
    $('btnAvatar').addEventListener('click', () => setTab('account'));
    $('seeAll').addEventListener('click', () => setTab('activity'));
    $('btnSearch').addEventListener('click', () => {
      $('searchBox').classList.toggle('on');
      $('searchInput').focus();
    });
    $('searchInput').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const q = $('searchInput').value.trim().toLowerCase();
      const hit = (activity || []).find((r) =>
        (r.mint || '').toLowerCase() === q ||
        (r.title || '').toLowerCase().includes(q)
      );
      if (hit) openDetail(hit.mint, hit.kind);
    });
    $('ranges').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      range = b.dataset.r;
      $('ranges').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      drawChart();
    });
    $('coinBack').addEventListener('click', () => $('coinOverlay').classList.remove('on'));
    $('auditBack').addEventListener('click', () => $('auditOverlay').classList.remove('on'));
    $('btnInvite').addEventListener('click', async () => {
      const url = (state && state.signup_url) || 'https://fomo.family/r/savipww';
      if (navigator.share) {
        try { await navigator.share({ title: 'FOMO', url }); return; } catch (_) {}
      }
      try {
        await navigator.clipboard.writeText(url);
        $('btnInvite').textContent = 'Link copied';
        setTimeout(() => { $('btnInvite').textContent = 'Share'; }, 1500);
      } catch (_) {
        prompt('Copy invite link', url);
      }
    });
  }

  async function boot() {
    readDataPath();
    bind();
    if ('serviceWorker' in navigator) {
      try { await navigator.serviceWorker.register('sw.js'); } catch (_) {}
    }
    await refresh();
    timer = setInterval(refresh, POLL_MS);
  }

  boot();
})();
