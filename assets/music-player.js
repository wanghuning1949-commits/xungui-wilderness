/* ============================================================
   寻归荒野 · 音乐库悬浮组件
   - 右下角常驻一枚小音符按钮，点击才弹出音乐库面板；不点不弹。
   - 悬浮按钮可整体拖动到屏幕任意位置（位置自动记忆）；面板可放大 / 缩小。
   - 双标签：收藏曲库（默认，原四首 + 自己红心收藏的歌） | 歌曲搜索（线上代理搜索 → 在线试听）。
   - 支持：播放 / 暂停 / 上一首 / 下一首 / 点选切歌 / 进度拖动 / 音量。
   - 与启动画面、公告弹窗、游戏本体互不干扰：
     组件层级远低于启动画面与公告；冷启动期间被现有机制自动隐藏；
     不自动播放（需用户点击），不修改页面任何既有 DOM 节点。
   ============================================================ */
(() => {
  'use strict';
  if (window.__xunguiMusicLoaded) return;
  window.__xunguiMusicLoaded = true;

  /* ---------- 收藏曲库（原始四首，顺序与文件不改动） ---------- */
  const TRACKS = [
    { src: './assets/music/chunlai.mp3',        name: '春来' },
    { src: './assets/music/faguangshidai.mp3',  name: '发光时代' },
    { src: './assets/music/wohuainiande.mp3',   name: '我怀念的' },
    { src: './assets/music/yexin.mp3',          name: '野心' },
  ];

  const API_SEARCH = '/.netlify/functions/music-search';
  const GDS_API = 'https://music-api.gdstudio.xyz/api.php';
  const GDS_SOURCE = 'netease';
  const SCALES = [1, 1.25, 1.5];
  const STORE_KEY = 'xungui-music-v1';
  const state = { idx: 0, volume: 0.8, pos: null, posVer: 2, scale: 1, favs: [] };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      if (Number.isInteger(saved.idx) && saved.idx >= 0 && saved.idx < TRACKS.length) state.idx = saved.idx;
      if (typeof saved.volume === 'number') state.volume = Math.min(1, Math.max(0, saved.volume));
      // posVer!==2 为旧版右下角布局的记忆 → 丢弃，图标回到新版默认右上角
      if (saved.posVer === 2 && saved.pos && Number.isFinite(saved.pos.nx) && Number.isFinite(saved.pos.ny)) {
        state.pos = { nx: Math.min(1, Math.max(0, saved.pos.nx)), ny: Math.min(1, Math.max(0, saved.pos.ny)) };
      }
      if (SCALES.includes(saved.scale)) state.scale = saved.scale;
      if (Array.isArray(saved.favs)) {
        state.favs = saved.favs
          .filter(f => f && Number.isInteger(f.id) && typeof f.name === 'string')
          .slice(0, 20)
          .map(f => ({ id: f.id, name: f.name, artist: typeof f.artist === 'string' ? f.artist : '' }));
      }
    }
  } catch (_) { /* localStorage 不可用时静默降级 */ }

  const collectionList = () => TRACKS.concat(state.favs);
  const persist = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (_) {} };

  /* ---------- 图标 ---------- */
  const icn = {
    note: '<svg class="icn-netease-note" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.22 8.42a4.85 4.85 0 0 0-.24-1.2c.5-.7.8-1.42.7-2.1-.12-.84-.86-1.24-1.94-1.4a1.06 1.06 0 0 0-1.24.86c-.09.55.06 1.05.36 1.66a6.28 6.28 0 0 0-.44.94 15.5 15.5 0 0 0-2.16-1.03c-2.16-.85-4.14-1.03-5.8-.44-2.28.8-3.62 2.66-3.9 5.4-.26 2.48.3 4.9 1.6 6.98 1.36 2.18 3.4 3.72 5.76 4.34 2.16.57 4.28.24 5.96-.92 1.62-1.12 2.62-2.88 2.9-5.1.34-2.7-.28-5.4-1.56-7.99Zm-.64 7.82c-.22 1.78-1.02 3.18-2.3 4.06-1.34.93-3.06 1.2-4.84.74-2.02-.52-3.76-1.84-4.92-3.72a10.86 10.86 0 0 1-1.42-6.18c.22-2.26 1.24-3.72 3-4.34 1.34-.47 2.98-.32 4.82.4 1.02.4 1.96.94 2.8 1.58-.16.44-.24.9-.2 1.36.1.9.68 1.36 1.6 1.44.5.05.96-.04 1.4-.26.9 2.02 1.28 3.66 1.06 4.92ZM9.9 15.24a2.26 2.26 0 0 1-1.28-2.02c-.02-.8.3-1.5.94-2.02.6-.5 1.36-.72 2.14-.66l1.9-2.52a.95.95 0 0 1 1.32-.2c.42.32.5.9.2 1.32l-1.98 2.62c.44.64.62 1.4.48 2.16-.18 1-.94 1.74-1.96 1.94a2.6 2.6 0 0 1-1.76-.62Z"/></svg>',
    play: '<svg class="icn-play" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.54.84l9.9-6.5a1 1 0 0 0 0-1.68l-9.9-6.5A1 1 0 0 0 8 5.5Z"/></svg>',
    pause: '<svg class="icn-pause" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>',
    prev: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18 7 10.5 12 18 17Z"/><path d="M6.5 6h2v12h-2z"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 7 13.5 12 6 17Z"/><path d="M15.5 6h2v12h-2z"/></svg>',
    vol: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>',
    zoom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/><path d="M8 11h6M11 8v6"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19.5 12.57 12 20l-7.5-7.43A5 5 0 1 1 12 6.01a5 5 0 1 1 7.5 6.56Z"/></svg>',
    heartFill: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19.5 12.57 12 20l-7.5-7.43A5 5 0 1 1 12 6.01a5 5 0 1 1 7.5 6.56Z"/></svg>',
  };
  // 网易云音乐官方 logo（取自 music.163.com 的站点图标，红色音符/透明底）
  const NETEASE_LOGO_HTML = '<img class="icn-ncm" src="./assets/ncm-logo.ico" alt="" draggable="false">';
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  /* ---------- 悬浮按钮 ---------- */
  const fab = document.createElement('button');
  fab.type = 'button';
  fab.className = 'music-lib-fab';
  fab.title = '音乐库';
  fab.setAttribute('aria-label', '打开音乐库');
  fab.setAttribute('aria-expanded', 'false');
  fab.innerHTML = NETEASE_LOGO_HTML;

  /* ---------- 面板 ---------- */
  const panel = document.createElement('div');
  panel.className = 'music-lib-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', '音乐库');
  panel.innerHTML = `
    <div class="mlp-head">
      <span class="mlp-title">${icn.note}音乐库</span>
      <span class="mlp-head-right">
        <button type="button" class="mlp-zoom" data-act="zoomout" aria-label="缩小面板" title="缩小">−</button>
        <button type="button" class="mlp-zoom" data-act="zoomin" aria-label="放大面板" title="放大">+</button>
        <button type="button" class="mlp-close" data-act="close" aria-label="收起音乐库" title="收起">×</button>
      </span>
    </div>
    <div class="mlp-tabs" role="tablist">
      <button type="button" class="mlp-tab on" data-tab="fav" role="tab" aria-selected="true">收藏曲库</button>
      <button type="button" class="mlp-tab" data-tab="search" role="tab" aria-selected="false">歌曲搜索</button>
    </div>
    <div class="mlp-search" hidden>
      <input type="search" class="mlp-search-input" placeholder="输入歌名 / 歌手，回车搜索" maxlength="40" aria-label="搜索歌曲">
      <button type="button" class="mlp-go" data-act="go" aria-label="搜索" title="搜索">${icn.zoom}</button>
    </div>
    <div class="mlp-status" hidden></div>
    <ul class="mlp-list">
      ${TRACKS.map((t, i) => `
        <li data-idx="${i}" class="${i === state.idx ? 'active paused' : ''}">
          <button type="button" class="mlp-row" data-idx="${i}" title="${t.name}">
            <span class="mlp-num">${String(i + 1).padStart(2, '0')}</span>
            <span class="mlp-main"><span class="mlp-name">${esc(t.name)}</span></span>
            <span class="mlp-eq" aria-hidden="true"><i></i><i></i><i></i></span>
          </button>
        </li>`).join('')}
    </ul>
    <div class="mlp-progress">
      <span class="mlp-time mlp-cur">0:00</span>
      <div class="mlp-track" role="slider" aria-label="播放进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        <div class="mlp-fill"><div class="mlp-inner"></div></div>
      </div>
      <span class="mlp-time mlp-dur">--:--</span>
    </div>
    <div class="mlp-controls">
      <button type="button" class="mlp-btn" data-act="prev" aria-label="上一首" title="上一首">${icn.prev}</button>
      <button type="button" class="mlp-btn mlp-toggle" data-act="toggle" aria-label="播放或暂停" title="播放 / 暂停">${icn.play}${icn.pause}</button>
      <button type="button" class="mlp-btn" data-act="next" aria-label="下一首" title="下一首">${icn.next}</button>
    </div>
    <div class="mlp-volume">
      ${icn.vol}
      <input type="range" min="0" max="1" step="0.01" value="${state.volume}" aria-label="音量">
      <span class="mlp-vol-label">${Math.round(state.volume * 100)}%</span>
    </div>
    <p class="mlp-footnote">寻归荒野 · BGM 选集</p>`;

  /* ---------- 音频 ---------- */
  const audio = document.createElement('audio');
  audio.preload = 'metadata';
  audio.volume = state.volume;

  /* ---------- 引用 ---------- */
  const $ = sel => panel.querySelector(sel);
  const toggleBtn = $('.mlp-toggle');
  const fill = $('.mlp-fill');
  const trackBar = $('.mlp-track');
  const curEl = $('.mlp-cur');
  const durEl = $('.mlp-dur');
  const volInput = $('.mlp-volume input');
  const volLabel = $('.mlp-vol-label');
  const listEl = $('.mlp-list');
  const zoomInBtn = panel.querySelector('.mlp-zoom[data-act="zoomin"]');
  const zoomOutBtn = panel.querySelector('.mlp-zoom[data-act="zoomout"]');
  const tabBtns = [...panel.querySelectorAll('.mlp-tab')];
  const searchWrap = $('.mlp-search');
  const searchInput = $('.mlp-search-input');
  const statusEl = $('.mlp-status');
  let items = [...listEl.querySelectorAll('li')];

  /* ---------- 播放状态 ---------- */
  let tab = 'fav';            // 收藏(fav) / 搜索(search)
  let results = [];           // 搜索结果 [{id,name,artist}]
  let searchIdx = -1;         // 正在播放的搜索结果下标
  let playingCtx = 'fav';     // 当前播放上下文：收藏列表 / 搜索结果
  let lastKw = '';

  const fmt = s => {
    s = Math.max(0, Math.floor(s || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  // 进度填充条宽度（r: 0~1）
  function setFillRatio(r) {
    fill.style.width = `${Math.min(100, Math.max(0, Math.round((r || 0) * 10000) / 100))}%`;
  }
  const isOpen = () => panel.classList.contains('open');
  const activeList = () => (playingCtx === 'search' ? results : collectionList());
  const activeIdx = () => (playingCtx === 'search' ? searchIdx : state.idx);

  /* ---------- 列表渲染 ---------- */
  function setStatus(text) {
    if (!text) { statusEl.hidden = true; statusEl.textContent = ''; return; }
    statusEl.hidden = false;
    statusEl.textContent = text;
  }
  function rowHtml(tr, i, kind) {
    const eq = `<span class="mlp-eq" aria-hidden="true"><i></i><i></i><i></i></span>`;
    const num = `<span class="mlp-num">${String(i + 1).padStart(2, '0')}</span>`;
    const main = `<span class="mlp-main"><span class="mlp-name">${esc(tr.name)}</span>${tr.artist ? `<span class="mlp-sub">${esc(tr.artist)}</span>` : ''}</span>`;
    let extra = '';
    if (kind === 'fav' && i >= TRACKS.length) extra = `<button type="button" class="mlp-heart" data-heart="${i}" aria-label="从收藏移除" title="从收藏移除">${icn.heartFill}</button>`;
    if (kind === 'search') {
      const inFav = state.favs.some(f => f.id === tr.id);
      extra = `<button type="button" class="mlp-heart ${inFav ? 'on' : ''}" data-heart="${i}" aria-label="${inFav ? '已在收藏中，点按移除' : '加入收藏'}" title="${inFav ? '点击移出收藏' : '加入收藏'}">${inFav ? icn.heartFill : icn.heart}</button>`;
    }
    return `<li data-idx="${i}"><button type="button" class="mlp-row" data-idx="${i}" title="${esc(tr.name)}">${num}${main}${eq}</button>${extra}</li>`;
  }
  function renderList() {
    const data = listData();
    listEl.innerHTML = data.length
      ? data.map((t, i) => rowHtml(t, i, tab)).join('')
      : '';
    items = [...listEl.querySelectorAll('li')];
    refreshActive();
  }
  function listData() {
    return tab === 'search' ? results.map(t => ({ name: t.name, artist: t.artist, id: t.id })) : collectionList();
  }
  function refreshActive() {
    const cur = activeIdx();
    items.forEach((li, i) => {
      const isActive = i === cur && tab === playingCtx && (playingCtx === 'search' ? searchIdx >= 0 : true);
      li.classList.toggle('active', isActive);
      li.classList.toggle('paused', isActive && audio.paused);
    });
  }
  function openTab(next) {
    if (tab === next) return;
    tab = next;
    tabBtns.forEach(b => {
      const on = b.dataset.tab === tab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    searchWrap.hidden = tab !== 'search';
    setStatus('');
    renderList();
    if (isOpen()) positionPanel();
  }
  function markPlaying(playing) {
    fab.classList.toggle('playing', playing);
    toggleBtn.classList.toggle('playing', playing);
    toggleBtn.setAttribute('aria-label', playing ? '暂停' : '播放');
  }

  function openPanel() {
    positionPanel();
    panel.classList.add('open');
    setPanelHidden(false);
  }
  function closePanel() {
    panel.classList.remove('open');
    setPanelHidden(true);
  }
  /* 收起状态：inert 一次解决焦点、Tab、读屏三种"隐形可达"；
     老浏览器不认 inert 时，CSS 里的 visibility:hidden 仍然会把按钮踢出 Tab 序列。 */
  function setPanelHidden(hidden) {
    fab.setAttribute('aria-expanded', hidden ? 'false' : 'true');
    try { panel.inert = !!hidden; } catch (_) {}
    panel.setAttribute('aria-hidden', hidden ? 'true' : 'false');
  }
  function togglePanel() { isOpen() ? closePanel() : openPanel(); }

  /* ---------- 悬浮按钮位置（可拖动）与面板尺寸记忆 ---------- */
  const FAB_MARGIN = 8;
  function clampPos(x, y) {
    const w = window.innerWidth, h = window.innerHeight;
    return {
      x: Math.min(Math.max(x, FAB_MARGIN), w - fab.offsetWidth - FAB_MARGIN),
      y: Math.min(Math.max(y, FAB_MARGIN), h - fab.offsetHeight - FAB_MARGIN),
    };
  }
  function applyPos() {
    if (!state.pos) {
      fab.style.left = ''; fab.style.top = ''; fab.style.right = ''; fab.style.bottom = '';
      panel.style.left = ''; panel.style.top = ''; panel.style.right = ''; panel.style.bottom = '';
      return;
    }
    const p = clampPos(state.pos.nx * window.innerWidth, state.pos.ny * window.innerHeight);
    fab.style.right = 'auto'; fab.style.bottom = 'auto';
    fab.style.left = `${p.x}px`; fab.style.top = `${p.y}px`;
  }
  // 面板始终锚定在悬浮标旁（默认放上方；放大或贴近屏幕边缘时自动夹紧回屏内）
  function positionPanel() {
    if (!document.body.contains(panel)) return;
    const r = fab.getBoundingClientRect();
    const w = window.innerWidth, h = window.innerHeight;
    const pRect = panel.getBoundingClientRect();
    const pw = pRect.width, ph = pRect.height;
    let left = r.right - pw - 6;
    left = Math.max(FAB_MARGIN, Math.min(left, w - pw - FAB_MARGIN));
    let top = r.top - ph - 10;
    if (top < FAB_MARGIN) {
      // 上方放不下：优先翻转到悬浮标下方
      const below = r.bottom + 10;
      top = (below + ph <= h - FAB_MARGIN) ? below : Math.max(FAB_MARGIN, Math.min(top, h - ph - FAB_MARGIN));
    }
    panel.style.right = 'auto'; panel.style.bottom = 'auto';
    panel.style.left = `${left}px`; panel.style.top = `${top}px`;
  }
  function applyScale() {
    panel.style.zoom = state.scale === 1 ? '' : String(state.scale);
  }
  // 当前视口下放得下的最大缩放档（即便被裁夹紧也要保证面板在屏内可见）
  function maxFittingScale() {
    const prevZoom = panel.style.zoom;
    panel.style.zoom = '';
    const bW = panel.offsetWidth, bH = panel.offsetHeight;
    panel.style.zoom = prevZoom;
    const availW = window.innerWidth - FAB_MARGIN * 2, availH = window.innerHeight - FAB_MARGIN * 2;
    let best = 1;
    for (const s of SCALES) { if (Math.round(bW * s) <= availW && Math.round(bH * s) <= availH) best = s; }
    return best;
  }
  function scaleList() {
    const maxS = maxFittingScale();
    return SCALES.filter(s => s <= maxS);
  }
  // 明确的放大 / 缩小（两个独立按钮，到边界自动置灰）
  function zoomIndexOf(list) {
    let at = list.indexOf(state.scale);
    if (at < 0) at = list.findIndex(s => s > state.scale);
    if (at < 0) at = list.length - 1;
    return at;
  }
  function zoomStep(dir) {
    const list = scaleList();
    if (!list.length) return;
    const next = Math.min(list.length - 1, Math.max(0, zoomIndexOf(list) + dir));
    if (!(next in list) || list[next] === state.scale) { syncZoomBtns(); return; }
    state.scale = list[next];
    applyScale();
    if (isOpen()) positionPanel();
    persist();
    syncZoomBtns();
  }
  function syncZoomBtns() {
    if (!zoomInBtn || !zoomOutBtn) return;
    const list = scaleList();
    const at = list.length ? zoomIndexOf(list) : 0;
    zoomOutBtn.disabled = !list.length || at <= 0;
    zoomInBtn.disabled = !list.length || at >= list.length - 1;
  }
  let drag = null, suppressClick = false;
  fab.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const r = fab.getBoundingClientRect();
    drag = { sx: e.clientX, sy: e.clientY, ox: r.left, oy: r.top, moved: false };
    try { fab.setPointerCapture(e.pointerId); } catch (_) {}
  });
  fab.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true;
    fab.classList.add('dragging');
    document.body.classList.add('mlp-dragging');
    const p = clampPos(drag.ox + dx, drag.oy + dy);
    fab.style.right = 'auto'; fab.style.bottom = 'auto';
    fab.style.left = `${p.x}px`; fab.style.top = `${p.y}px`;
  });
  const endDrag = () => {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    fab.classList.remove('dragging');
    document.body.classList.remove('mlp-dragging');
    if (!moved) return; // 未拖动 → 交给 click 事件正常开合面板
    const r = fab.getBoundingClientRect();
    state.pos = { nx: Math.min(1, Math.max(0, r.left / window.innerWidth)), ny: Math.min(1, Math.max(0, r.top / window.innerHeight)) };
    persist();
    suppressClick = true;
    if (isOpen()) positionPanel();
  };
  fab.addEventListener('pointerup', endDrag);
  fab.addEventListener('pointercancel', endDrag);
  window.addEventListener('resize', () => { applyPos(); if (isOpen()) positionPanel(); syncZoomBtns(); });

  /* ---------- 事件：悬浮按钮 ---------- */
  fab.addEventListener('click', e => {
    e.stopPropagation();
    if (suppressClick) { suppressClick = false; return; }
    togglePanel();
  });

  /* ---------- 共用暂停/播放函数 ---------- */
  function playPause() {
    if (!audio.src) {
      if (playingCtx === 'search') { if (results.length) playAt('search', Math.max(0, searchIdx), true); }
      else playAt('fav', state.idx, true);
      return;
    }
    if (audio.paused) { audio.play().catch(() => markPlaying(false)); markPlaying(true); }
    else { audio.pause(); }
  }

  /* ---------- 事件：面板内控件 ---------- */
  panel.addEventListener('click', e => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'close') { closePanel(); return; }
    if (act === 'zoomin') { zoomStep(1); return; }
    if (act === 'zoomout') { zoomStep(-1); return; }
    if (act === 'go') { doSearch(); return; }
    const heart = e.target.closest('[data-heart]');
    if (heart) {
      toggleFav(Number(heart.dataset.heart));
      return;
    }
    const tbtn = e.target.closest('.mlp-tab');
    if (tbtn) { openTab(tbtn.dataset.tab); return; }
    const item = e.target.closest('.mlp-list button.mlp-row');
    if (item) {
      const i = Number(item.dataset.idx);
      // 点同一个标签里正在播的同一首 → 播放/暂停切换
      if (tab === playingCtx && i === activeIdx() && audio.src) {
        if (audio.paused) { audio.play().catch(() => markPlaying(false)); markPlaying(true); }
        else { audio.pause(); }
        return;
      }
      playAt(tab, i, true);
      return;
    }
    if (act === 'toggle') {
      if (!audio.src) { setStatus(''); playPause(); return; }
      playPause();
    } else if (act === 'prev') {
      if (audio.src && audio.currentTime > 3) { audio.currentTime = 0; return; }
      stepTrack(-1);
    } else if (act === 'next') {
      stepTrack(1);
    }
  });

  /* ---------- 统一播放入口：本地收藏曲目（带 src）与网络曲目（带 id，先解析 https 直链） ---------- */
  let playToken = 0;
  function playAt(ctx, i, autoplay) {
    const data = ctx === 'search' ? results : collectionList();
    if (!data[i]) return;
    const n = data.length;
    const idx = ((i % n) + n) % n;
    if (ctx === 'search') searchIdx = idx; else { state.idx = idx; persist(); }
    playingCtx = ctx;
    playToken += 1;
    const token = playToken;
    refreshPlaying();
    const tr = data[idx];
    const failMsg = () => { markPlaying(false); refreshActive(); setStatus('该曲目暂时无法播放'); setTimeout(() => setStatus(''), 3000); };
    if (tr.src) {
      // 本地收藏库：与原始行为一致，直接播放
      audio.src = tr.src;
      if (autoplay) audio.play().catch(failMsg);
      else audio.load();
      return;
    }
    if (!autoplay) return;
    setStatus('正在连接试听…');
    resolveStream(tr.id)
      .then(link => {
        if (token !== playToken) return; // 期间用户已切换到别处
        if (!link) { failMsg(); return; }
        audio.src = link;
        audio.play().catch(failMsg);
      })
      .catch(() => { if (token === playToken) failMsg(); });
  }
  // 试听直链解析：优先走自己的函数（部署了函数时最快最稳），失败自动回退公开接口
  async function resolveStream(id) {
    try {
      const res = await fetch(`${API_SEARCH}?stream=${id}`, { headers: { Accept: 'application/json' } });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data && data.url) return data.url;
      }
    } catch (_) { /* 本地打开或函数未部署 → 走公开接口 */ }
    const res = await fetch(`${GDS_API}?types=url&source=${GDS_SOURCE}&id=${encodeURIComponent(id)}&br=128`);
    if (!res.ok) throw new Error('resolve failed');
    const data = await res.json().catch(() => ({}));
    if (!data || !data.url) throw new Error('unplayable');
    return data.url;
  }
  /* ---------- 上一首/下一首（跟随当前播放上下文） ---------- */
  function stepTrack(dir) {
    if (playingCtx === 'search' && results.length) {
      playAt('search', ((searchIdx + dir) % results.length + results.length) % results.length, true);
    } else {
      playAt('fav', state.idx + dir, true);
    }
  }
  /* ---------- 收藏/取消一首搜索结果 ---------- */
  function toggleFav(i) {
    if (tab === 'search') {
      const tr = results[i];
      if (!tr) return;
      const at = state.favs.findIndex(f => f.id === tr.id);
      if (at >= 0) state.favs.splice(at, 1);
      else { state.favs.push({ id: tr.id, name: tr.name, artist: tr.artist }); if (state.favs.length > 20) state.favs.shift(); }
      persist();
      setStatus(state.favs.some(f => f.id === tr.id) ? `已加入收藏：<${tr.name}>` : `已移出收藏：<${tr.name}>`);
      setTimeout(() => setStatus(''), 2000);
    } else {
      if (i >= TRACKS.length && i < collectionList().length) {
        const removed = state.favs.splice(i - TRACKS.length, 1);
        persist();
        if (state.idx === i) state.idx = 0;
        setStatus(removed.length ? '已移出收藏' : '');
        setTimeout(() => setStatus(''), 1500);
        renderList();
        if (isOpen()) positionPanel();
      }
    }
  }

  /* ---------- 搜索 ---------- */
  async function searchOwn(kw) {
    const res = await fetch(`${API_SEARCH}?kw=${encodeURIComponent(kw)}&limit=14`, { headers: { Accept: 'application/json' } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `搜索服务暂不可用（HTTP ${res.status}）`);
    return (data.songs || []).map(s => ({ id: s.id, name: s.name || '(未知曲目)', artist: s.artist || '' }));
  }
  // 公开接口回退（拖拽部署 / 本地打开也能搜）：GD Studio 聚合检索，返回数组 [{id,name,artist[]}...]
  async function searchPublic(kw) {
    const res = await fetch(`${GDS_API}?types=search&source=${GDS_SOURCE}&name=${encodeURIComponent(kw)}&count=14&pages=1`, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`搜索服务暂不可用（HTTP ${res.status}）`);
    const raw = await res.json().catch(() => ({}));
    return (Array.isArray(raw) ? raw : [])
      .filter(s => s && s.id)
      .map(s => ({
        id: String(s.id),
        name: s.name || '(未知曲目)',
        artist: Array.isArray(s.artist) ? s.artist.join('、') : (typeof s.artist === 'string' ? s.artist : ''),
      }));
  }
  async function doSearch() {
    const kw = searchInput.value.trim();
    if (!kw) { searchInput.focus(); setStatus('先输入想找的歌名或歌手'); setTimeout(() => setStatus(''), 2000); return; }
    lastKw = kw;
    setStatus(`正在搜索「${kw}」…`);
    searchInput.disabled = true;
    try {
      let list = [];
      try { list = await searchOwn(kw); } catch (_) { list = []; }
      if (!list.length) {
        // 自有函数不可用 / 无结果 → 公开接口兜底；公开接口自身出错才会抛出
        try { list = await searchPublic(kw); } catch (err) { if (!results.length) throw err; }
      }
      results = list;
      if (!results.length) {
        setStatus(`没有找到与「${kw}」相关的可试听歌曲`);
        renderList();
        setTimeout(() => setStatus(''), 3500);
        return;
      }
      searchIdx = -1;
      setStatus('');
      renderList();
      if (isOpen()) positionPanel();
    } catch (err) {
      results = [];
      renderList();
      setStatus(`${err.message || '搜索失败'} · 请稍后再试`);
      setTimeout(() => setStatus(''), 6000);
    } finally {
      searchInput.disabled = false;
    }
  }
  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); doSearch(); }
  });

  /* ---------- 事件：音频状态 ---------- */
  audio.addEventListener('play', () => { markPlaying(true); refreshActive(); setStatus(''); });
  audio.addEventListener('pause', () => { markPlaying(false); refreshActive(); });
  audio.addEventListener('ended', () => { stepTrack(1); });
  audio.addEventListener('loadedmetadata', () => {
    durEl.textContent = Number.isFinite(audio.duration) ? fmt(audio.duration) : '--:--';
  });
  audio.addEventListener('timeupdate', () => {
    if (audio.duration) setFillRatio(audio.currentTime / audio.duration);
    curEl.textContent = fmt(audio.currentTime);
  });
  audio.addEventListener('error', () => {
    if (!audio.src) return;
    durEl.textContent = '无法加载';
    setStatus('曲目加载失败，试试换一首');
    setTimeout(() => { if (audio.paused) durEl.textContent = '--:--'; }, 2400);
    setTimeout(() => setStatus(''), 3000);
  });
  function refreshPlaying() {
    if (playingCtx === 'search') {
      durEl.textContent = '--:--';
      curEl.textContent = '0:00';
      setFillRatio(0);
    }
    refreshActive();
  }

  /* ---------- 事件：进度条拖动 ---------- */
  let scrubbing = false;
  const ratioFromEvent = e => {
    const rect = trackBar.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  };
  trackBar.addEventListener('pointerdown', e => {
    if (!audio.src || !audio.duration) return;
    scrubbing = true;
    trackBar.classList.add('dragging');
    trackBar.setPointerCapture(e.pointerId);
    audio.pause();
    markPlaying(false);
    setFillRatio(ratioFromEvent(e));
    curEl.textContent = fmt(ratioFromEvent(e) * audio.duration);
  });
  trackBar.addEventListener('pointermove', e => {
    if (!scrubbing) return;
    setFillRatio(ratioFromEvent(e));
    curEl.textContent = fmt(ratioFromEvent(e) * audio.duration);
  });
  trackBar.addEventListener('pointerup', e => {
    if (!scrubbing) return;
    scrubbing = false;
    trackBar.classList.remove('dragging');
    if (audio.src && audio.duration) {
      audio.currentTime = ratioFromEvent(e) * audio.duration;
      audio.play().catch(() => markPlaying(false));
    }
  });
  trackBar.addEventListener('pointercancel', () => {
    scrubbing = false;
    trackBar.classList.remove('dragging');
    if (!audio.paused) markPlaying(true);
  });

  /* ---------- 事件：音量 ---------- */
  volInput.addEventListener('input', () => {
    state.volume = Number(volInput.value);
    audio.volume = state.volume;
    volLabel.textContent = `${Math.round(state.volume * 100)}%`;
    persist();
  });

  /* ---------- 事件：点击外部 / Esc 收起面板 ---------- */
  document.addEventListener('pointerdown', e => {
    if (!isOpen()) return;
    if (panel.contains(e.target) || fab.contains(e.target)) return;
    closePanel();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isOpen()) closePanel();
  });

  /* ---------- 初始化（不自动播放） ---------- */
  function init() {
    document.body.appendChild(audio);
    document.body.appendChild(fab);
    document.body.appendChild(panel);
    setPanelHidden(true);           /* 初始是收起态：先把 13 个按钮移出 Tab 序列 */
    applyPos();
    // 旧版（posVer 缺失）的位置记忆已按新版右上角默认处理，这里立即写回新版标记
    try {
      const old = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (!old || old.posVer !== state.posVer) persist();
    } catch (_) { persist(); }
    // 视口过小时把保存的缩放档夹紧到可容纳的最大档
    const defS = maxFittingScale();
    if (state.scale > defS) { state.scale = defS; persist(); }
    applyScale();
    syncZoomBtns();
    tabBtns.forEach(b => {
      const on = b.dataset.tab === tab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    searchWrap.hidden = tab !== 'search';
    if (state.idx >= collectionList().length) state.idx = 0;
    items.forEach(li => {
      const on = Number(li.dataset.idx) === state.idx;
      li.classList.toggle('active', on);
      li.classList.toggle('paused', on && audio.paused);
    });
    volLabel.textContent = `${Math.round(state.volume * 100)}%`;
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
