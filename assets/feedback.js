/* ============================================================
   寻归荒野 · 操作反馈层（选项点击编排 + 可选择的合成音效）
   - 不新增任何音频文件：全部用 WebAudio 实时合成，包体不增大。
   - 四套音色（纸墨 / 木石 / 电子 / 钟磬），每套都覆盖全部 9 类操作音，
     页眉"音效"那颗按钮点开就是选择面板，点一下就试听。
   - 所有声音都在"用户已经点了一下"之后才触发，符合浏览器自动播放策略。
   - 关掉了就完全不产生 AudioContext；音色、音量、开关都写进 localStorage。
   - 尊重系统的"减少动态效果"：动画时长归零，逻辑照常。
   ============================================================ */
(function () {
  'use strict';

  var STORE = 'xg-sfx';           // 开/关（沿用旧键，老玩家的设置不丢）
  var PACK_STORE = 'xg-sfx-pack'; // 音色包
  var VOL_STORE = 'xg-sfx-vol';   // 0—100
  var DEFAULT_PACK = 'ink';
  var DEFAULT_VOL = 60;           // 第一次打开时不要吓到人：落章是"点一下纸面"，不是"敲一下桌子"
  var PICK_MS = 150;              // 落章动画时长，之后才换幕
  var LOCK_MS = 340;              // 换幕后仍锁住键盘，防连打
  var ALL_VOICES = ['stamp', 'page', 'up', 'down', 'mixed', 'risk', 'ending', 'twist', 'secret'];

  var enabled = true;
  var packId = DEFAULT_PACK;
  var vol = DEFAULT_VOL / 100;
  try {
    enabled = localStorage.getItem(STORE) !== '0';
    var p = localStorage.getItem(PACK_STORE);
    if (p && packOf(p)) packId = p;
    /* 注意：localStorage 没有这个键时 getItem 返回 null，而 Number(null) === 0——
       这正是"音量默认变成 0 / 一打开就没声音"那类 bug 的源头，必须先判 null 再转数。 */
    var raw = localStorage.getItem(VOL_STORE);
    if (raw !== null && raw !== '') {
      var v = Number(raw);
      if (Number.isFinite(v) && v >= 0 && v <= 100) vol = v / 100;
    }
  } catch (_) { }

  var ctx = null, master = null, noiseBuf = null, broken = false;
  var reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reduced() { return !!(reduce && reduce.matches); }

  function audio() {
    if (broken || !enabled) return null;
    if (!ctx) {
      var C = window.AudioContext || window.webkitAudioContext;
      if (!C) { broken = true; return null; }
      try { ctx = new C(); } catch (e) { broken = true; return null; }
      master = ctx.createGain();
      master.gain.value = vol;
      /* 连打的时候好几个音会叠在一起：加一层软压缩顶住，声音才不会破。
         没有这个 API 的老内核就直接接到 destination。 */
      var out = ctx.destination;
      try {
        if (typeof ctx.createDynamicsCompressor === 'function') {
          var comp = ctx.createDynamicsCompressor();
          comp.threshold.value = -10; comp.knee.value = 22; comp.ratio.value = 9;
          comp.attack.value = 0.004; comp.release.value = 0.20;
          master.connect(comp); comp.connect(ctx.destination); out = null;
        }
      } catch (_) { out = ctx.destination; }
      if (out) master.connect(out);
      noiseBuf = makeNoise();
    }
    if (ctx.state === 'suspended') { try { ctx.resume().catch(function () { }); } catch (_) { } }
    return ctx;
  }

  function makeNoise() {
    var n = Math.floor(ctx.sampleRate * 0.4);
    var buf = ctx.createBuffer(1, n, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function tone(o) {
    var c = audio(); if (!c) return;
    var t = c.currentTime + (o.when || 0);
    var dur = o.dur || 0.12;
    var osc = c.createOscillator();
    osc.type = o.type || 'triangle';
    osc.frequency.setValueAtTime(Math.max(20, o.f0), t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + dur);
    var g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain || 0.05), t + (o.attack || 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(master);
    osc.start(t); osc.stop(t + dur + 0.03);
  }

  function hiss(o) {
    var c = audio(); if (!c) return;
    var t = c.currentTime + (o.when || 0);
    var dur = o.dur || 0.18;
    var src = c.createBufferSource();
    src.buffer = noiseBuf;
    var f = c.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    f.frequency.setValueAtTime(o.f0 || 900, t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + dur);
    f.Q.value = o.q || 1.1;
    var g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain || 0.04), t + (o.attack || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur + 0.03);
  }

  /* 钟磬用的"泛音叠层"：真音 + 2.76 倍 + 5.4 倍偏谐，三条不同衰减的指数包络，
     听起来才是敲一下金属，而不是"嘀"一声。 */
  function bell(f, when, dur, gain) {
    tone({ f0: f, when: when, dur: dur, gain: gain, type: 'sine', attack: 0.004 });
    tone({ f0: f * 2.76, when: when, dur: dur * 0.55, gain: gain * 0.45, type: 'sine', attack: 0.003 });
    tone({ f0: f * 5.4, when: when, dur: dur * 0.3, gain: gain * 0.2, type: 'sine', attack: 0.002 });
  }

  /* ---------- 四套音色：每套都必须覆盖 ALL_VOICES，缺一处都会被自检逮到 ---------- */
  var PACKS = [
    {
      id: 'ink', name: '纸墨', desc: '闷落章 + 纸面摩擦，最贴这份档案',
      voices: {
        stamp: function () { tone({ f0: 152, f1: 68, dur: 0.115, gain: 0.28, type: 'sine' }); hiss({ dur: 0.05, f0: 1100, gain: 0.15, q: 0.9 }); },
        page: function () { hiss({ dur: 0.2, f0: 620, f1: 2500, gain: 0.40, q: 0.7 }); },
        up: function () { tone({ f0: 659, dur: 0.085, gain: 0.21 }); tone({ f0: 988, when: 0.07, dur: 0.13, gain: 0.18 }); },
        down: function () { tone({ f0: 392, f1: 262, dur: 0.18, gain: 0.22, type: 'sine' }); },
        mixed: function () { tone({ f0: 587, dur: 0.08, gain: 0.13 }); tone({ f0: 311, f1: 233, when: 0.08, dur: 0.17, gain: 0.20, type: 'sine' }); },
        risk: function () { tone({ f0: 174, dur: 0.3, gain: 0.15, type: 'sine' }); tone({ f0: 185, when: 0.03, dur: 0.26, gain: 0.11, type: 'sine' }); },
        ending: function () { tone({ f0: 392, dur: 0.26, gain: 0.14 }); tone({ f0: 523, when: 0.14, dur: 0.26, gain: 0.13 }); tone({ f0: 659, when: 0.28, dur: 0.5, gain: 0.16 }); },
        twist: function () { tone({ f0: 233, f1: 87, dur: 0.5, gain: 0.26, type: 'sawtooth' }); hiss({ dur: 0.4, f0: 300, f1: 90, gain: 0.18, filter: 'lowpass' }); },
        secret: function () { tone({ f0: 1174, dur: 0.06, gain: 0.10, type: 'sine' }); }
      }
    },
    {
      id: 'wood', name: '木石', desc: '干脆的木鱼式敲击，短、利落、不余音',
      voices: {
        stamp: function () { tone({ f0: 210, f1: 120, dur: 0.06, gain: 0.26, type: 'triangle' }); hiss({ dur: 0.028, f0: 1900, gain: 0.20, q: 1.6 }); },
        page: function () { hiss({ dur: 0.13, f0: 1500, f1: 900, gain: 0.32, q: 1.2 }); },
        up: function () { tone({ f0: 784, dur: 0.06, gain: 0.20, type: 'triangle' }); tone({ f0: 1176, when: 0.06, dur: 0.09, gain: 0.18, type: 'triangle' }); },
        down: function () { tone({ f0: 440, f1: 330, dur: 0.09, gain: 0.21, type: 'triangle' }); },
        mixed: function () { tone({ f0: 660, dur: 0.05, gain: 0.12, type: 'triangle' }); tone({ f0: 392, f1: 330, when: 0.06, dur: 0.10, gain: 0.20, type: 'triangle' }); },
        risk: function () { tone({ f0: 233, dur: 0.12, gain: 0.15, type: 'triangle' }); tone({ f0: 247, when: 0.05, dur: 0.12, gain: 0.12, type: 'triangle' }); },
        ending: function () { tone({ f0: 523, dur: 0.10, gain: 0.15, type: 'triangle' }); tone({ f0: 659, when: 0.10, dur: 0.10, gain: 0.14, type: 'triangle' }); tone({ f0: 784, when: 0.20, dur: 0.22, gain: 0.16, type: 'triangle' }); },
        twist: function () { tone({ f0: 392, f1: 110, dur: 0.28, gain: 0.22, type: 'triangle' }); hiss({ dur: 0.22, f0: 800, f1: 200, gain: 0.16, q: 0.9 }); },
        secret: function () { tone({ f0: 1568, dur: 0.035, gain: 0.10, type: 'triangle' }); }
      }
    },
    {
      id: 'synth', name: '电子', desc: '方波提示音 + 高频沙锤，像一台机器在记账',
      voices: {
        stamp: function () { tone({ f0: 110, f1: 55, dur: 0.07, gain: 0.24, type: 'square' }); hiss({ dur: 0.03, f0: 6000, gain: 0.10, q: 0.8, filter: 'highpass' }); },
        page: function () { hiss({ dur: 0.16, f0: 2200, f1: 7000, gain: 0.09, q: 0.6, filter: 'highpass' }); },
        up: function () { tone({ f0: 880, dur: 0.055, gain: 0.17, type: 'square' }); tone({ f0: 1320, when: 0.055, dur: 0.08, gain: 0.15, type: 'square' }); },
        down: function () { tone({ f0: 660, f1: 330, dur: 0.12, gain: 0.18, type: 'sawtooth' }); },
        mixed: function () { tone({ f0: 990, dur: 0.05, gain: 0.12, type: 'square' }); tone({ f0: 495, f1: 330, when: 0.05, dur: 0.11, gain: 0.16, type: 'sawtooth' }); },
        risk: function () { tone({ f0: 196, dur: 0.22, gain: 0.12, type: 'sawtooth' }); tone({ f0: 277, when: 0.02, dur: 0.20, gain: 0.10, type: 'square' }); },
        ending: function () { tone({ f0: 523, dur: 0.09, gain: 0.12, type: 'square' }); tone({ f0: 659, when: 0.09, dur: 0.09, gain: 0.11, type: 'square' }); tone({ f0: 784, when: 0.18, dur: 0.30, gain: 0.13, type: 'square' }); },
        twist: function () { tone({ f0: 880, f1: 110, dur: 0.45, gain: 0.22, type: 'sawtooth' }); hiss({ dur: 0.35, f0: 4000, f1: 400, gain: 0.14, q: 0.7 }); },
        secret: function () { tone({ f0: 2093, dur: 0.04, gain: 0.09, type: 'square' }); }
      }
    },
    {
      id: 'bell', name: '钟磬', desc: '带偏谐的金属余音，每一下都留一段尾巴',
      voices: {
        stamp: function () { bell(196, 0, 0.55, 0.18); hiss({ dur: 0.035, f0: 2600, gain: 0.08, q: 2 }); },
        page: function () { hiss({ dur: 0.28, f0: 1200, f1: 3200, gain: 0.35, q: 1.4 }); },
        up: function () { bell(523, 0, 0.5, 0.13); bell(784, 0.09, 0.6, 0.12); },
        down: function () { bell(523, 0, 0.40, 0.13); bell(349, 0.07, 0.60, 0.13); },
        mixed: function () { bell(659, 0, 0.45, 0.12); bell(392, 0.08, 0.60, 0.13); },
        risk: function () { bell(220, 0, 0.80, 0.13); bell(311, 0.02, 0.70, 0.09); },
        ending: function () { bell(392, 0, 0.9, 0.12); bell(523, 0.16, 0.9, 0.11); bell(659, 0.32, 1.3, 0.10); },
        twist: function () { bell(147, 0, 1.2, 0.17); hiss({ dur: 0.5, f0: 700, f1: 150, gain: 0.10, q: 1 }); },
        secret: function () { bell(1046, 0, 0.3, 0.055); }
      }
    }
  ];

  function packOf(id) {
    for (var i = 0; i < PACKS.length; i++) if (PACKS[i].id === id) return PACKS[i];
    return null;
  }
  function currentPack() { return packOf(packId) || packOf(DEFAULT_PACK) || PACKS[0]; }

  function play(name) {
    var v = currentPack().voices[name];
    if (v) { try { v(); } catch (_) { } }
  }

  /* ---------- 选项点击的编排 ---------- */
  function pick(btn, list, next) {
    play('stamp');
    if (!btn || !list || reduced() || typeof next !== 'function') { if (next) next(); return; }
    list.classList.add('xg-locked');
    btn.classList.add('xg-picked');
    document.body.classList.add('xg-choosing');
    window.setTimeout(function () {
      try { next(); } finally {
        /* 换幕后再过一会儿才放开键盘：落章动画 + 快速连按不该撞到下一幕 */
        window.setTimeout(function () { document.body.classList.remove('xg-choosing'); }, LOCK_MS - PICK_MS);
      }
    }, PICK_MS);
  }

  /* ---------- 选择造成的数值变化：一声，且听得出方向 ----------
     以前风险音和涨/跌音会叠在一起响，两个音挤在半秒里很吵；现在一次变化只配一声，
     风险升高时以风险音为主（它比涨跌更需要被听见）。 */
  function afterChoose(delta) {
    if (!delta) return;
    var VIS = ['Inf', 'Pat', 'Rep', 'R', 'Cen'];
    var pos = 0, neg = 0;
    for (var i = 0; i < VIS.length; i++) {
      var v = delta[VIS[i]] || 0;
      if (v > 0) pos++; else if (v < 0) neg++;
    }
    var t = delta.Tarn || 0;
    if (t > 0) { play('risk'); return; }
    if (!pos && !neg) {
      if (t < 0) { play('up'); return; }                       // 只降了风险，那是好事
      if (delta.Econ || delta.Pol) play('secret');             // 只有隐形数值动了：一声极轻的点
      return;
    }
    if (pos && !neg) play('up');
    else if (neg && !pos) play('down');
    else play('mixed');
  }

  /* ---------- 页眉那颗按钮 + 选择面板 ---------- */
  var CSS = [
    '.xg-sfx-pop{position:fixed;z-index:var(--z-sfx,9700);min-width:230px;max-width:calc(100vw - 24px);overflow:auto;',
    /* 面板压在正文上，底必须是不透明的：游戏里的 --card 是 .88 的半透明纸色，
       直接拿来会被底下的标题和选项透上来，浅深两套都看不清。 */
    'background:#fefdf7;color:var(--ink,#221d16);border:1px solid var(--line,#c9c2ad);',
    'border-radius:14px;box-shadow:0 14px 34px rgba(28,22,12,.24);padding:12px 13px 11px;',
    'font-family:inherit;animation:xgSfxIn .2s cubic-bezier(.32,.72,0,1) both}',
    ':root[data-theme="dark"] .xg-sfx-pop{background:#1e2f24;border-color:#3d5945}',
    '@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .xg-sfx-pop{background:#1e2f24;border-color:#3d5945}}',
    '@keyframes xgSfxIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}',
    'body.xg-modal-open.xg-sfx-open{overflow:auto}   /* 借用引擎的"有弹层"信号挡按键，但不锁页面滚动 */',
    '.xg-sfx-pop h4{margin:0 0 8px;font-size:12px;letter-spacing:.14em;color:var(--ink-soft,#5a5346);font-weight:700}',
    '.xg-sfx-list{display:grid;gap:6px}',
    '.xg-sfx-pack{display:flex;align-items:baseline;gap:8px;text-align:left;width:100%;cursor:pointer;',
    'font-family:inherit;font-size:12.5px;line-height:1.35;padding:8px 10px;border-radius:10px;',
    'border:1px solid var(--line,#d8d2c0);background:transparent;color:inherit;transition:border-color .2s cubic-bezier(.32,.72,0,1),background .2s cubic-bezier(.32,.72,0,1)}',
    '.xg-sfx-pack b{font-size:13px;font-weight:700;white-space:nowrap}',
    '.xg-sfx-pack i{font-style:normal;font-size:11px;color:var(--ink-soft,#6a6355)}',
    '.xg-sfx-pack:hover{border-color:#92af83}',
    '.xg-sfx-pack[aria-checked="true"]{border-color:var(--seal,#3f6b4a);background:rgba(98,146,82,.13)}',
    '.xg-sfx-pack[aria-checked="true"]::after{content:"✓";margin-left:auto;font-weight:700;color:var(--seal,#3f6b4a)}',
    '.xg-sfx-pack:focus-visible,.xg-sfx-btn:focus-visible,.xg-sfx-vol:focus-visible{outline:3px solid rgba(98,146,82,.42);outline-offset:2px}',
    '.xg-sfx-row{display:flex;align-items:center;gap:9px;margin-top:10px}',
    '.xg-sfx-row label{font-size:11.5px;color:var(--ink-soft,#5a5346);white-space:nowrap}',
    '.xg-sfx-vol{flex:1;min-width:70px;height:28px;accent-color:var(--seal,#3f6b4a);cursor:pointer}',
    '.xg-sfx-btn{font-family:inherit;font-size:12px;padding:7px 11px;border-radius:999px;cursor:pointer;',
    'border:1px solid var(--line,#d8d2c0);background:var(--paper,#f6f2e2);color:inherit}',
    '.xg-sfx-btn:hover{border-color:#92af83}',
    '.xg-sfx-btn[data-off="1"]{opacity:.55}',
    '.xg-sfx-foot{display:flex;gap:7px;margin-top:9px}',
    '.xg-sfx-note{margin:8px 0 0;font-size:10.5px;line-height:1.5;color:var(--ink-soft,#6a6355)}',
    '@media (prefers-reduced-motion:reduce){.xg-sfx-pop{animation:none}}'
  ].join('\n');

  var pop = null, btn = null, openFlag = false, demoTimers = [], tookModal = false, lastScrub = 0;

  function paint() {
    if (!btn) return;
    var pk = currentPack();
    btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    btn.setAttribute('aria-expanded', openFlag ? 'true' : 'false');
    btn.classList.toggle('off', !enabled);
    btn.title = enabled ? '音效：开（当前「' + pk.name + '」，点击选择音色）' : '音效：关（点击打开）';
    btn.setAttribute('aria-label', btn.title);
    var lab = btn.querySelector('.sfx-label');
    if (lab) lab.textContent = enabled ? '音效 · ' + pk.name : '静音';
    var mark = btn.querySelector('.sfx-mark');
    if (mark) mark.textContent = enabled ? '♪' : '♪̸';
    var sw = pop && pop.querySelector('.xg-sfx-onoff');
    if (sw) {
      sw.textContent = enabled ? '音效：开' : '音效：关';
      sw.setAttribute('aria-checked', enabled ? 'true' : 'false');
      sw.setAttribute('data-off', enabled ? '0' : '1');
    }
    var chips = pop && pop.querySelectorAll('.xg-sfx-pack');
    if (chips) for (var i = 0; i < chips.length; i++) {
      var on = chips[i].getAttribute('data-pack') === pk.id;
      chips[i].setAttribute('aria-checked', on ? 'true' : 'false');
    }
    var s = pop && pop.querySelector('.xg-sfx-vol');
    if (s && document.activeElement !== s) s.value = String(Math.round(vol * 100));
  }

  function buildPop() {
    if (pop) return pop;
    var st = document.createElement('style');
    st.id = 'xg-sfx-css';
    st.textContent = CSS;
    document.head.appendChild(st);

    var list = '';
    for (var i = 0; i < PACKS.length; i++) {
      list += '<button type="button" class="xg-sfx-pack" role="radio" aria-checked="false" data-pack="' +
        PACKS[i].id + '"><b>' + PACKS[i].name + '</b><i>' + PACKS[i].desc + '</i></button>';
    }
    pop = document.createElement('div');
    pop.className = 'xg-sfx-pop';
    pop.id = 'xgSfxPop';
    pop.setAttribute('role', 'group');
    pop.setAttribute('aria-label', '音效设置');
    pop.innerHTML =
      '<h4>音效音色</h4>' +
      '<div class="xg-sfx-list" role="radiogroup" aria-label="音效音色包">' + list + '</div>' +
      '<div class="xg-sfx-row"><label for="xgSfxVol">音量</label>' +
      '<input type="range" class="xg-sfx-vol" id="xgSfxVol" min="0" max="100" step="5" value="' + Math.round(vol * 100) + '">' +
      '<span class="xg-sfx-volnum mono">' + Math.round(vol * 100) + '</span></div>' +
      '<div class="xg-sfx-foot">' +
      '<button type="button" class="xg-sfx-btn xg-sfx-preview">试听这一套</button>' +
      '<button type="button" class="xg-sfx-btn xg-sfx-onoff" role="switch" aria-checked="' + (enabled ? 'true' : 'false') + '">音效：开</button>' +
      '</div>' +
      '<p class="xg-sfx-note">点音色名就立刻响一声，可以直接听差别。选项落章、涨跌、风险、结局各有各的音；关掉了游戏照常玩。</p>';
    document.body.appendChild(pop);

    var chips = pop.querySelectorAll('.xg-sfx-pack');
    for (var j = 0; j < chips.length; j++) {
      chips[j].addEventListener('click', function () {
        setPack(this.getAttribute('data-pack'));
        demo(['stamp', 'up'], 0);          // 换完就响两下，让人知道这套是什么脾气
      });
    }
    pop.querySelector('.xg-sfx-preview').addEventListener('click', function () {
      demo(['stamp', 'up', 'down', 'risk', 'ending'], 0);
    });
    pop.querySelector('.xg-sfx-onoff').addEventListener('click', function () { setEnabled(!enabled); });
    var sld = pop.querySelector('.xg-sfx-vol');
    sld.addEventListener('input', function () {
      setVolume(Number(this.value) / 100, false);
      var num = pop.querySelector('.xg-sfx-volnum');
      if (num) num.textContent = String(Math.round(vol * 100));
      if (!enabled) setEnabled(true);      // 拖音量就是想听，别还要再去开开关
      /* 拖动时 input 会连着来十几二十次，每次都响一声就成了机关枪。
         限流到 130ms 一声，听着像"一路小台阶"，而不是"一串爆豆"。 */
      var now = Date.now();
      if (now - lastScrub > 130) { lastScrub = now; play('up'); }
    });
    sld.addEventListener('change', function () { setVolume(Number(this.value) / 100, true); });
    return pop;
  }

  function place() {
    if (!pop || !btn) return;
    var r = btn.getBoundingClientRect();
    var w = pop.offsetWidth || 240, h = pop.offsetHeight || 200;
    var vw = window.innerWidth, vh = window.innerHeight;
    var left = Math.max(8, Math.min(vw - w - 8, r.right - w));
    /* 优先挂在按钮下面；下面放不下就往上挂；再放不下就贴着屏幕顶，靠内部滚动。
       （以前只算"下面"，被 Math.min 夹成负数时整块面板会跑到屏幕顶上糊住页眉。） */
    var below = r.bottom + 8, above = r.top - 8 - h;
    var top = below + h <= vh - 8 ? below : (above >= 8 ? above : 8);
    pop.style.maxHeight = Math.max(160, vh - top - 8) + 'px';
    pop.style.top = top + 'px';
    pop.style.left = left + 'px';
  }

  function stopDemo() {
    for (var i = 0; i < demoTimers.length; i++) clearTimeout(demoTimers[i]);
    demoTimers = [];
  }
  function demo(names, _k) {
    if (!enabled) { buildPop(); paint(); return; }
    stopDemo();
    var gap = 170;
    for (var i = 0; i < names.length; i++) {
      (function (n, d) { demoTimers.push(setTimeout(function () { play(n); }, d)); })(names[i], i * gap);
    }
  }

  function openPop() {
    buildPop();
    openFlag = true;
    pop.hidden = false;
    document.body.classList.add('xg-sfx-open');
    /* 借引擎的"有弹层"信号挡住 1—9 / ← / Enter。但分享图那一类如果已经把信号占上了，
       解除就只能由占上它的那一方来做——不然收起这个小面板会悄悄拆掉别人的锁。 */
    tookModal = !document.body.classList.contains('xg-modal-open');
    if (tookModal) document.body.classList.add('xg-modal-open');
    place();
    paint();
    var chips = pop.querySelectorAll('.xg-sfx-pack');
    for (var i = 0; i < chips.length; i++) if (chips[i].getAttribute('aria-checked') === 'true') { chips[i].focus(); break; }
  }
  function closePop(back) {
    if (!openFlag) return;
    openFlag = false;
    stopDemo();
    document.body.classList.remove('xg-sfx-open');
    /* 借引擎的"有弹层"信号挡住 1—9 / ← / Enter。但分享图那一类如果已经把信号占上了，
       解除就只能由占上它的那一方来做——不然收起这个小面板会悄悄拆掉别人的锁。 */
    if (tookModal) { document.body.classList.remove('xg-modal-open'); tookModal = false; }
    /* 先把焦点接回页眉按钮，再隐藏面板：隐藏"当前被聚焦的那个元素"时，
       浏览器会在这次样式更新之后把焦点掉回 body，顺序反了就变成
       "面板关了、光标还停在已经看不见的按钮上"（键盘用户按 Tab 会不知道从哪继续）。 */
    if (back !== false && btn && btn.isConnected) { try { btn.focus({ preventScroll: true }); } catch (_) { } }
    if (pop) pop.hidden = true;
    paint();          // aria-expanded 跟着 openFlag 落地，收起后不能还报"已展开"
  }
  function togglePop() { openFlag ? closePop() : openPop(); }

  function setPack(id) {
    if (!packOf(id)) return;
    packId = id;
    try { localStorage.setItem(PACK_STORE, id); } catch (_) { }
    if (!enabled) setEnabled(true);        // 挑了音色就是要听，开关顺手给开上
    paint();
  }
  function setVolume(v, persist) {
    var n = Number(v);
    vol = Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : DEFAULT_VOL / 100;
    if (master) { try { master.gain.value = vol; } catch (_) { } }
    if (persist) { try { localStorage.setItem(VOL_STORE, String(Math.round(vol * 100))); } catch (_) { } }
  }
  function setEnabled(v) {
    enabled = !!v;
    try { localStorage.setItem(STORE, enabled ? '1' : '0'); } catch (_) { }
    if (enabled) play('up');               // 打开时给一声确认，关闭时不作声
    paint();
  }

  function wire() {
    btn = document.getElementById('sfxBtn');
    if (!btn) return;
    if (pop) pop.hidden = true;
    btn.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); togglePop(); });
    paint();

    document.addEventListener('click', function (e) {
      if (!openFlag) return;
      var t = e.target;
      if (pop && pop.contains(t)) return;
      if (btn === t || btn.contains(t)) return;
      closePop(false);                     // 点外面只收起，焦点不必抢回来
    }, true);
    document.addEventListener('keydown', function (e) {
      if (!openFlag) return;
      if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); e.stopPropagation(); closePop(); }
    }, true);
    window.addEventListener('scroll', function () { if (openFlag) place(); }, true);
    window.addEventListener('resize', function () { if (openFlag) place(); });
  }

  /* ---------- 换幕时自动配音：继续/翻页、结局、异线 ---------- */
  function wireStage() {
    var stage = document.getElementById('stage');
    if (!stage) return;
    document.addEventListener('click', function (e) {
      if (openFlag) return;
      var t = e.target && e.target.closest ? e.target.closest('button') : null;
      if (!t) return;
      if (t.id === 'cont' || t.id === 'proceed' || t.id === 'start') play('page');
      if (t.id === 'again') play('page');
    }, true);
    var last = '';
    new MutationObserver(function () {
      var sig = '';
      if (stage.querySelector('.ending')) sig = 'ending';
      else if (stage.querySelector('.divider.gs')) sig = 'twist';
      if (sig && sig !== last) play(sig);
      last = sig;
    }).observe(stage, { childList: true, subtree: true });
  }

  function boot() { wire(); wireStage(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.XGFX = {
    sfx: play,
    pick: pick,
    afterChoose: afterChoose,
    reduced: reduced,
    enabled: function () { return enabled; },
    setEnabled: setEnabled,
    packs: function () {
      return PACKS.map(function (p) { return { id: p.id, name: p.name, desc: p.desc }; });
    },
    pack: function () { return currentPack().id; },
    setPack: setPack,
    volume: function () { return vol; },
    setVolume: setVolume,
    openPanel: openPop,
    closePanel: closePop,
    panelOpen: function () { return openFlag; },
    voices: function () { return ALL_VOICES.slice(); }
  };
})();
