/* ============================================================
   寻归荒野 · 结局彩蛋视频播放器
   独立作用域（.xgegv- 前缀），只在结局页被调用，不影响其他模块。
   对外接口：window.XGEggVideo.open(结局标题)
   ============================================================ */
(function () {
  'use strict';
  if (window.XGEggVideo) return;

  /* ---------- 结局 → 视频文件（ASCII 文件名，避免线上中文路径 404） ---------- */
  const MAP = {
    '被时代超越的总理': './assets/videos/e1.mp4',
    '低调的遗产': './assets/videos/e2.mp4',
    '改革的遗产': './assets/videos/e3.mp4',
    '改革派总书记': './assets/videos/e4.mp4',
    '过渡性的顶点': './assets/videos/e5.mp4',
    '夹缝中的花': './assets/videos/e6.mp4',
    '旧局易主': './assets/videos/e7.mp4',
    '人民的总理': './assets/videos/e8.mp4',
    '退休之后 · 守成': './assets/videos/e9.mp4',
    '退休之后·守成': './assets/videos/e9.mp4',
    '退休之后 守成': './assets/videos/e9.mp4',
    '退休之后 · 未竟': './assets/videos/e10.mp4',
    '退休之后·未竟': './assets/videos/e10.mp4',
    '退休之后 未竟': './assets/videos/e10.mp4',
    '未竟的改革': './assets/videos/e11.mp4',
    '务实者的孤独': './assets/videos/e12.mp4',
    '新的强人': './assets/videos/e13.mp4',
    '永远的舵手': './assets/videos/e14.mp4',
    '众叛亲离': './assets/videos/e15.mp4',
  };

  const fmt = s => {
    s = Math.max(0, Math.floor(s || 0));
    const m = Math.floor(s / 60), r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  };
  const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

  /* 第一次打开（本机没有存过音量）就给 30%：听得见，又不至于突然炸耳。
     以后玩家自己拖过滑条，就一直用他记住的那个值——包括他存下来的 0。 */
  const VOL_KEY = 'xungui-egg-vol';
  const DEFAULT_VOL = 0.30;
  function storedVol() {
    try {
      const raw = localStorage.getItem(VOL_KEY);
      if (raw === null) return null;
      const v = Number(raw);
      return (Number.isFinite(v) && v >= 0 && v <= 1) ? v : null;
    } catch (_) { return null; }
  }

  let root = null, video = null, panel = null, timeline = null, curEl = null, durEl = null,
    playBtn = null, volEl = null, muteBtn = null, speedBtn = null, timeMark = null, bufEl = null,
    titleEl = null, hintEl = null, sizeEl = null, dragBar = null;
  let curTitle = '', lastFocus = null, savedTime = 0, wasPlaying = false, resumeTimer = null;
  let sizes = [], sizeIdx = 0;
  const openState = { visible: false };
  /* 音量的“意图值”单独存一份：换源、重新打开、浏览器在 loadstart 时把 volume 打回 1.0
     都能靠它重新断言回来，不会出现滑条写着 30、实际静音或炸响。 */
  let wantVol = DEFAULT_VOL, wantMute = false;

  const ICON = {
    play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.54.84l9.9-6.5a1 1 0 0 0 0-1.68l-9.9-6.5A1 1 0 0 0 8 5.5Z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>',
    back10: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 4 12l7 7"/><path d="M4 12h9a7 7 0 1 1 0 14h-1"/></svg>',
    fwd10: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 5l7 7-7 7"/><path d="M20 12h-9a7 7 0 1 0 0 14h1"/></svg>',
    full: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    vol: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>',
    mute: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h3l5 4V5Z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>',
  };

  function build() {
    root = document.createElement('div');
    root.className = 'xgegv';
    root.hidden = true;
    root.innerHTML = `
      <div class="xgegv-mask"></div>
      <div class="xgegv-panel" role="dialog" aria-modal="true" aria-label="结局彩蛋视频">
        <div class="xgegv-head">
          <span class="xgegv-title"></span>
          <span class="xgegv-head-tools">
            <button type="button" class="xgegv-btn xgegv-size" title="切换窗口大小（也可拖拽右下角自由拉伸）">大小</button>
            <button type="button" class="xgegv-btn xgegv-full" title="全屏">${ICON.full}</button>
            <button type="button" class="xgegv-btn xgegv-close" title="关闭（Esc）" aria-label="关闭">${ICON.close}</button>
          </span>
        </div>
        <div class="xgegv-stage">
          <video class="xgegv-video" playsinline preload="metadata"></video>
          <div class="xgegv-loading" hidden><span></span><span></span><span></span></div>
          <div class="xgegv-resize" title="拖动自由改变大小"></div>
        </div>
        <div class="xgegv-ctrls">
          <div class="xgegv-track">
            <div class="xgegv-buffer"><div class="xgegv-buffer-fill"></div></div>
            <input type="range" class="xgegv-timeline" min="0" max="1000" step="1" value="0" aria-label="播放进度，可拖到任意位置">
            <div class="xgegv-played"><div class="xgegv-played-tip"></div></div>
          </div>
          <div class="xgegv-row">
            <button type="button" class="xgegv-btn xgegv-back" title="后退 10 秒（←）">${ICON.back10}</button>
            <button type="button" class="xgegv-btn xgegv-play" title="播放 / 暂停（空格）">${ICON.play}</button>
            <button type="button" class="xgegv-btn xgegv-fwd" title="前进 10 秒（→）">${ICON.fwd10}</button>
            <span class="xgegv-time"><b class="xgegv-cur">0:00</b> / <span class="xgegv-dur">0:00</span></span>
            <span class="xgegv-spacer"></span>
            <button type="button" class="xgegv-btn xgegv-speed" title="倍速">1×</button>
            <button type="button" class="xgegv-btn xgegv-mute" title="静音">${ICON.vol}</button>
            <input type="range" class="xgegv-vol" min="0" max="100" step="1" value="30" aria-label="音量">
          </div>
        </div>
        <div class="xgegv-hint" hidden></div>
      </div>`;
    document.body.appendChild(root);

    panel = root.querySelector('.xgegv-panel');
    video = root.querySelector('.xgegv-video');
    timeline = root.querySelector('.xgegv-timeline');
    curEl = root.querySelector('.xgegv-cur');
    durEl = root.querySelector('.xgegv-dur');
    playBtn = root.querySelector('.xgegv-play');
    volEl = root.querySelector('.xgegv-vol');
    muteBtn = root.querySelector('.xgegv-mute');
    speedBtn = root.querySelector('.xgegv-speed');
    titleEl = root.querySelector('.xgegv-title');
    hintEl = root.querySelector('.xgegv-hint');
    bufEl = root.querySelector('.xgegv-buffer-fill');
    timeMark = root.querySelector('.xgegv-played-tip');
    dragBar = root.querySelector('.xgegv-resize');

    /* ---------- 控件绑定 ---------- */
    root.querySelector('.xgegv-mask').addEventListener('click', close);
    root.querySelector('.xgegv-close').addEventListener('click', close);
    root.querySelector('.xgegv-full').addEventListener('click', toggleFull);
    root.querySelector('.xgegv-size').addEventListener('click', cycleSize);
    root.querySelector('.xgegv-back').addEventListener('click', () => seekBy(-10));
    root.querySelector('.xgegv-fwd').addEventListener('click', () => seekBy(10));
    playBtn.addEventListener('click', togglePlay);
    speedBtn.addEventListener('click', cycleSpeed);
    muteBtn.addEventListener('click', toggleMute);
    volEl.addEventListener('input', () => {
      /* 拖滑条算“玩家自己定的”，记住它；拖到 0 以上就顺手解除静音标记，免得静音态把音量吃掉 */
      setVolume(Number(volEl.value) / 100, true);
    });

    timeline.addEventListener('input', () => {
      if (!video.duration) return;
      const t = (Number(timeline.value) / 1000) * video.duration;
      video.currentTime = t;
      curEl.textContent = fmt(t);
      paintProgress(timeline.value / 10);
    });
    timeline.addEventListener('pointerdown', () => { wasPlaying = !video.paused; if (!video.paused) video.pause(); });
    timeline.addEventListener('pointerup', () => { if (wasPlaying) resumeAfterSeek(); });
    timeline.addEventListener('pointercancel', () => { if (wasPlaying) resumeAfterSeek(); });
    timeline.addEventListener('keydown', e => { if (['ArrowLeft', 'ArrowRight', ' ', 'Enter'].includes(e.key)) e.stopPropagation(); });

    dragBar.addEventListener('pointerdown', startFreeResize);
    // 点画面任意处 = 播放/暂停（右下角拉伸把手除外），手机上更顺手
    root.querySelector('.xgegv-stage').addEventListener('click', e => {
      if (e.target.closest('.xgegv-resize')) return;
      togglePlay();
    });

    video.addEventListener('loadedmetadata', () => {
      durEl.textContent = fmt(video.duration);
      hideLoading();
      applyAudio();
    });
    video.addEventListener('timeupdate', onTick);
    video.addEventListener('progress', paintBuffer);
    video.addEventListener('play', () => { paintPlay(true); applyAudio(); pauseGameAudio(); });
    video.addEventListener('pause', () => paintPlay(false));
    video.addEventListener('loadstart', applyAudio);   // 换源时 Chrome 可能把 volume 打回 1.0
    video.addEventListener('waiting', showLoading);
    video.addEventListener('playing', hideLoading);
    video.addEventListener('ended', () => { paintPlay(false); timeline.value = 1000; });
    video.addEventListener('error', onVideoError);

    document.addEventListener('keydown', onKey, true);
  }

  /* ---------- 播放进度与缓冲 ---------- */
  function onTick() {
    const d = video.duration || 0;
    if (d) {
      const r = video.currentTime / d;
      timeline.value = String(Math.round(r * 1000));
      paintProgress(r * 100);
    }
    curEl.textContent = fmt(video.currentTime);
    savedTime = video.currentTime;
  }
  function paintProgress(pct) {
    const played = root.querySelector('.xgegv-played');
    played.style.width = `${Math.min(100, Math.max(0, pct))}%`;
  }
  function paintBuffer() {
    try {
      const b = video.buffered;
      if (!b.length || !video.duration) { bufEl.style.width = '0%'; return; }
      bufEl.style.width = `${Math.min(100, (b.end(b.length - 1) / video.duration) * 100)}%`;
    } catch (_) {}
  }
  function paintPlay(playing) {
    playBtn.innerHTML = playing ? ICON.pause : ICON.play;
    playBtn.setAttribute('aria-label', playing ? '暂停' : '播放');
  }
  function seekBy(sec) {
    if (!video.duration) return;
    video.currentTime = Math.min(video.duration, Math.max(0, video.currentTime + sec));
    onTick();
  }
  function togglePlay() {
    if (video.paused) video.play().catch(() => showHint('浏览器拦截了自动播放，点一下画面再试'));
    else video.pause();
  }
  // 拖完进度条要把播放状态接回去；正在 seek 时等 seeked 再 play，避免拖完变成静止画面。
  function resumeAfterSeek() {
    const go = () => { video.play().catch(() => {}); };
    if (video.seeking) video.addEventListener('seeked', go, { once: true });
    else go();
  }
  function toggleMute() {
    wantMute = !wantMute;
    applyAudio();
  }
  /* 音量/静音只认这一对“意图值”，任何地方（换源、重开、浏览器重置）都从这里断言回去 */
  function applyAudio() {
    const v = Math.min(1, Math.max(0, wantVol));
    try { video.volume = v; } catch (_) { }
    try { video.muted = wantMute || v === 0; } catch (_) { }
    if (volEl) volEl.value = String(Math.round(v * 100));
    syncMute();
  }
  function setVolume(v, persist) {
    const n = Number(v);
    wantVol = Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : DEFAULT_VOL;
    if (wantVol > 0) wantMute = false;      // 把音量拖起来就说明想听，别让他再去找那个静音键
    applyAudio();
    if (persist) { try { localStorage.setItem(VOL_KEY, String(wantVol)); } catch (_) { } }
  }
  function syncMute() {
    const silent = wantMute || wantVol <= 0 || video.muted || !video.volume;
    muteBtn.innerHTML = silent ? ICON.mute : ICON.vol;
    muteBtn.title = silent ? '取消静音' : '静音';
    muteBtn.setAttribute('aria-label', muteBtn.title);
  }
  function cycleSpeed() {
    const at = SPEEDS.indexOf(Number(video.playbackRate) || 1);
    const next = SPEEDS[(at + 1 + SPEEDS.length) % SPEEDS.length];
    video.playbackRate = next;
    speedBtn.textContent = `${next}×`;
  }
  function cycleSize() {
    sizeIdx = (sizeIdx + 1) % sizes.length;
    applySize();
  }
  // 清掉自由拉伸写入的内联尺寸，否则“大小”按钮会被内联样式盖住、点了没反应。
  function applySize() {
    panel.classList.remove('xgegv-free');
    panel.style.width = '';
    panel.style.height = '';
    panel.style.setProperty('--xgegv-w', sizes[sizeIdx]);
  }

  /* ---------- 右下角自由拉伸 ---------- */
  function startFreeResize(e) {
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    const startW = panel.offsetWidth, startH = panel.offsetHeight;
    panel.classList.add('xgegv-free');
    const move = ev => {
      const w = Math.min(window.innerWidth - 16, Math.max(280, startW + (ev.clientX - startX)));
      const h = Math.min(window.innerHeight - 16, Math.max(200, startH + (ev.clientY - startY)));
      panel.style.width = `${w}px`;
      panel.style.height = `${h}px`;
    };
    const up = () => {
      try { if (dragBar.hasPointerCapture && dragBar.hasPointerCapture(e.pointerId)) dragBar.releasePointerCapture(e.pointerId); } catch (_) {}
      dragBar.removeEventListener('pointermove', move);
      dragBar.removeEventListener('pointerup', up);
      dragBar.removeEventListener('pointercancel', up);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    // 捕获失败（个别浏览器不支持或指针已抬起）也不要紧：同时挂到 window 上，拖动照样跟手。
    try { dragBar.setPointerCapture(e.pointerId); } catch (_) {}
    dragBar.addEventListener('pointermove', move);
    dragBar.addEventListener('pointerup', up);
    dragBar.addEventListener('pointercancel', up);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  /* ---------- 键盘 ---------- */
  function onKey(e) {
    if (!openState.visible) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    /* 焦点留在播放器里：Tab 不能跑到背后的结局页按钮上。 */
    if (e.key === 'Tab') {
      const f = Array.prototype.slice.call(panel.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'));
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      const inside = panel.contains(document.activeElement);
      if (e.shiftKey && (!inside || document.activeElement === first)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (!inside || document.activeElement === last)) { e.preventDefault(); first.focus(); }
      return;
    }
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT') return;
    if (e.key === ' ') { e.preventDefault(); togglePlay(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); seekBy(-10); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); seekBy(10); }
    else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toggleFull(); }
  }

  /* ---------- 全屏 ---------- */
  function toggleFull() {
    const el = panel;
    if (!document.fullscreenElement) {
      (el.requestFullscreen ? el.requestFullscreen() : Promise.reject(new Error('nf')))
        .catch(() => showHint('这个浏览器不支持全屏，可用“大小”按钮或拖右下角放大'));
    } else if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
  }
  document.addEventListener('fullscreenchange', () => {
    const full = !!document.fullscreenElement;
    panel.classList.toggle('xgegv-full', full);
    // 全屏时清掉自定义尺寸，退出全屏时回到当前“大小”档位。
    if (full) { panel.classList.remove('xgegv-free'); panel.style.width = ''; panel.style.height = ''; }
    else applySize();
  });

  /* ---------- 加载态 / 提示 ---------- */
  let loadingTimer = null;
  function showLoading() { clearTimeout(loadingTimer); loadingTimer = setTimeout(() => { const l = root.querySelector('.xgegv-loading'); if (l) l.hidden = false; }, 320); }
  function hideLoading() { clearTimeout(loadingTimer); const l = root.querySelector('.xgegv-loading'); if (l) l.hidden = true; }
  function showHint(text) {
    hintEl.textContent = text;
    hintEl.hidden = false;
    clearTimeout(showHint._t);
    showHint._t = setTimeout(() => { hintEl.hidden = true; }, 4200);
  }
  function onVideoError() {
    hideLoading();
    const src = video.currentSrc || '';
    showHint(src ? '视频暂时加载不出来，可能还在上传/缓冲，稍后再点一次' : '这条结局还没有彩蛋视频');
  }

  /* ---------- 与游戏内其他音频互不干扰 ---------- */
  // 视频开始播放时，把音乐库（以及任何在播的 <audio>）临时暂停；关闭视频时再续上。
  let resumeList = [];
  function pauseGameAudio() {
    // 不能用 resumeList = [] 重来：视频每次 play（含点画面恢复播放）都会走这里，
    // 清空后音乐库就被记成“本来没在播”，关闭视频时不再续播。
    document.querySelectorAll('audio').forEach(a => {
      if (a === video || resumeList.indexOf(a) >= 0) return;
      try {
        if (!a.paused) { resumeList.push(a); a.pause(); }
      } catch (_) {}
    });
  }
  function resumeGameAudio() {
    const list = resumeList; resumeList = [];
    list.forEach(a => { try { if (a.paused && a.src) a.play().catch(() => {}); } catch (_) {} });
  }

  /* ---------- 打开 / 关闭 ---------- */
  function videoOf(title) { return MAP[String(title || '').trim()]; }

  function open(title) {
    const key = String(title || '').trim();
    const src = videoOf(key);
    if (!root) build();
    lastFocus = document.activeElement;
    curTitle = key;
    titleEl.textContent = `结局彩蛋 · ${curTitle}`;
    root.hidden = false;
    requestAnimationFrame(() => root.classList.add('xgegv-in'));
    document.body.classList.add('xgegv-lock');
    openState.visible = true;

    sizes = computeSizes();
    sizeIdx = 0;
    applySize();
    playBtn.focus({ preventScroll: true });

    // 这个结局没有对应视频：只给提示，不进入加载/播放流程（例如自定义结局标题）。
    if (!src) {
      hintEl.textContent = '这个结局暂时没有配套的彩蛋视频。';
      hintEl.hidden = false;
      return;
    }

    /* 音量：本机存过就用存的（包括他存下来的 0），没存过一律 30%，滑条同步显示 30 */
    const sv = storedVol();
    wantMute = false;
    setVolume(sv === null ? DEFAULT_VOL : sv, false);
    video.playbackRate = 1; speedBtn.textContent = '1×';
    timeline.value = '0'; curEl.textContent = '0:00'; durEl.textContent = '0:00';
    paintProgress(0); paintPlay(false); bufEl.style.width = '0%';
    hintEl.hidden = true;

    showLoading();
    /* 起播必须留在“点了这颗按钮”这一次用户手势里同步发出。
       以前等 loadedmetadata 再 play()，那一跳已经是异步：iOS Safari / 安卓 WebView
       把它按无声自动播放处理，画面能动、声音不给——玩家看到的正是“一打开就没声音”。 */
    video.src = src;                       // 赋值 src 本身就触发资源加载，不再额外 load()（那会打断这次 play）
    savedTime = 0;
    try {
      const p0 = video.play();
      if (p0 && typeof p0.then === 'function') p0.then(() => paintPlay(true)).catch(() => { /* 让 metadata 到位后补一次 */ });
    } catch (_) { }
    video.addEventListener('loadedmetadata', function once() {
      video.removeEventListener('loadedmetadata', once);
      hideLoading();
      applyAudio();                        // 有些内核在换源时把 volume 打回 1.0，这里按意图值钉回去
      if (video.paused) {
        try {
          const p = video.play();
          if (p && typeof p.then === 'function') {
            p.then(() => paintPlay(true)).catch(() => {
              paintPlay(false);
              try { playBtn.focus({ preventScroll: true }); } catch (_) { }
              showHint('浏览器不允许自动出声播放 —— 点一下画面（或左边那颗播放键）就开始带声音播放');
            });
          }
        } catch (_) { }
      }
    });
  }
  function close() {
    if (!openState.visible) return;
    try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {}); } catch (_) {}
    openState.visible = false;
    root.classList.remove('xgegv-in');
    document.body.classList.remove('xgegv-lock');
    const done = () => { root.hidden = true; };
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(done, 220);
    try { video.pause(); } catch (_) {}
    video.removeAttribute('src'); try { video.load(); } catch (_) {}
    resumeGameAudio();
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  function computeSizes() {
    const w = window.innerWidth, h = window.innerHeight;
    const base = Math.min(940, w - 40);
    const mid = Math.min(660, w - 40);
    const small = Math.min(430, w - 32);
    return [`${base}px`, `${mid}px`, `${small}px`, `${Math.min(w - 16, 1200)}px`];
  }

  window.addEventListener('resize', () => {
    if (!openState.visible || !root) return;
    const stillOk = sizes[sizeIdx] && parseFloat(sizes[sizeIdx]) <= window.innerWidth - 16;
    if (!stillOk) { sizes = computeSizes(); sizeIdx = 0; applySize(); }
  });

  /* 鼠标悬停进度条时显示目标时间点 */
  document.addEventListener('pointermove', e => {
    if (!root || !openState.visible) return;
    const track = root.querySelector('.xgegv-track');
    if (!track) return;
    const r = track.getBoundingClientRect();
    if (e.clientY < r.top - 6 || e.clientY > r.bottom + 6 || e.clientX < r.left || e.clientX > r.right) return;
    if (!video.duration) { timeMark.hidden = true; return; }
    const pct = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    timeMark.hidden = false;
    timeMark.style.left = `${pct * 100}%`;
    timeMark.textContent = fmt(pct * video.duration);
  });

  window.XGEggVideo = { open, has: t => !!videoOf(t), videoOf };
})();
