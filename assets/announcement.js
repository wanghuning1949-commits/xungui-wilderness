(() => {
  const STORAGE_KEY = 'xungui-wilderness-announcement-v1';
  const OLD_DEFAULT_CONTENT = '在国师模拟器（宦海）的基础上做了一款以克强为主角的模拟器，这款游戏更多的是政治选项，较易理解。游戏名“寻归荒野”，取自程虹教授的著作。很遗憾能力有限，没能加入程虹出场的情节，仅以此标题向她致敬。\n\n具体的数值含义在首页有所介绍，两个隐藏数值达到目标可以解锁2012年开始的架空剧情。这款游戏相较于宦海一款要更稳定一些，情节更丰满，结局的判定更多元，游戏机制亦有不同的特色。李克强是我最尊重的领导人之一，也是因此我没有塞入更多的架空故事线，我更希望它像一本小说一样展开，但考虑到游戏性还是设置了一条。希望游玩愉快。';
  const DEFAULT = {
    enabled: true,
    theme: 'light',
    showIcon: true,
    icon: './assets/notice-icon.jpg',
    title: '温馨提醒',
    content: '在国师模拟器（宦海）的基础上做了一款以克强为主角的模拟器，这款游戏更多的是政治选项，较易理解。游戏名“寻归荒野”，取自程虹教授的著作。很遗憾能力有限，没能加入程虹出场的情节，仅以此标题向她致敬。\n\n具体的数值含义在首页有所介绍，两个隐藏数值达到目标可以解锁2012年开始的架空剧情。这款游戏相较于宦海一款要更稳定一些，情节更丰满，结局的判定更多元，游戏机制亦有不同的特色。李克强是我最尊重的领导人之一，也是因此我没有塞入更多的架空故事线，我更希望它像一本小说一样展开，但考虑到游戏性还是设置了一条。希望游玩愉快。'
  };
  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!saved || typeof saved !== 'object') return { ...DEFAULT };
      if (saved.content === OLD_DEFAULT_CONTENT) { saved.content = DEFAULT.content; try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); } catch (_) {} }
      // 兼容旧版中文名图标路径，统一迁移到 ASCII 文件名，避免部分平台部署时的中文路径问题。
      if (saved.icon === './assets/公告的小图标.jpg') { saved.icon = DEFAULT.icon; try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); } catch (_) {} }
      return { ...DEFAULT, ...saved };
    } catch (_) { return { ...DEFAULT }; }
  }
  function save(config) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULT, ...config })); }
    catch (_) { /* Private browsing may disable local storage; global storage still works. */ }
  }
  function reset() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    return { ...DEFAULT };
  }
  async function getGlobal() {
    const response = await fetch('/.netlify/functions/announcement', {
      method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store'
    });
    if (!response.ok) throw new Error(`全局公告接口暂不可用（HTTP ${response.status}）`);
    const config = await response.json();
    return { ...DEFAULT, ...config };
  }
  async function saveGlobal(config, token) {
    if (!token) throw new Error('请填写管理员口令');
    const response = await fetch('/.netlify/functions/announcement', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
      body: JSON.stringify({ ...DEFAULT, ...config })
    });
    let result = {};
    try { result = await response.json(); } catch (_) {}
    if (!response.ok) throw new Error(result.error || `全局保存失败（HTTP ${response.status}）`);
    save(config);
    return { ...DEFAULT, ...(result.config || config) };
  }
  function iconMarkup(config) {
    if (!config.showIcon) return '';
    if (config.icon) return `<div class="announce-icon"><img src="${String(config.icon).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}" alt="公告图标"></div>`;
    return '<div class="announce-icon" aria-hidden="true">📣</div>';
  }
  function renderInto(overlay, config) {
    const dialog = overlay.querySelector('.announce-dialog');
    dialog.dataset.theme = config.theme === 'dark' ? 'dark' : 'light';
    const head = overlay.querySelector('.announce-head');
    head.innerHTML = `${iconMarkup(config)}<div><p class="announce-eyebrow">寻归荒野 · 游玩前的话</p><h2 class="announce-title" id="announce-modal-title"></h2></div>`;
    overlay.querySelector('.announce-title').textContent = config.title || '温馨提醒';
    overlay.querySelector('.announce-content').textContent = config.content || '';
  }
  function waitForSplash() {
    return new Promise(resolve => {
      if (!document.getElementById('xg-splash')) { resolve(); return; }
      window.addEventListener('xg-splash-finished', resolve, { once: true });
    });
  }
  function getConfigWithFallback() {
    // 读取全站公告时若网络迟滞，使用本地/默认值兜底，确保启动图结束后公告及时出现。
    return new Promise(resolve => {
      let settled = false;
      const finish = config => {
        if (settled) return;
        settled = true;
        clearTimeout(fallbackTimer);
        resolve(config);
      };
      const fallbackTimer = setTimeout(() => finish(load()), 4500);
      getGlobal().then(finish).catch(() => finish(load()));
    });
  }
  async function initPopup() {
    const overlay = document.getElementById('announcement-overlay');
    if (!overlay) { document.body.classList.remove('xg-startup-active'); return; }
    // 与启动图并行读取公告，但严格等启动图完整显示 6 秒后才呈现公告。
    const configPromise = getConfigWithFallback();
    await waitForSplash();
    const config = await configPromise;
    if (!config.enabled) {
      overlay.hidden = true;
      document.body.classList.remove('xg-startup-active');
      return;
    }
    renderInto(overlay, config);
    overlay.hidden = false;
    // 公告已在当前任务内显示，解除冷启动隐藏状态不会闪出底层首页。
    document.body.classList.remove('xg-startup-active');
    document.body.classList.add('xg-modal-open');
    const lastFocus = document.activeElement;
    let closed = false;
    const focusables = () => Array.prototype.slice.call(overlay.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'));
    const close = () => {
      if (closed) return;
      closed = true;
      overlay.hidden = true;
      document.body.classList.remove('xg-modal-open');
      if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (_) {} }
    };
    overlay.querySelectorAll('[data-announce-close]').forEach(btn => btn.addEventListener('click', close));
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    /* 对话框焦点管理：打开时落到“进入游戏”，Tab 只在公告里循环，关闭后还给原来的位置。
       原来打开后焦点留在 body 上，读屏用户不知道弹出了什么，Tab 还会一路走进背后的游戏。 */
    try {
      const start = overlay.querySelector('.announce-confirm') || focusables()[0];
      if (start) start.focus({ preventScroll: true });
    } catch (_) {}
    document.addEventListener('keydown', e => {
      if (overlay.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab') return;
      const f = focusables();
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      const inside = overlay.contains(document.activeElement);
      if (e.shiftKey && (!inside || document.activeElement === first)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (!inside || document.activeElement === last)) { e.preventDefault(); first.focus(); }
    });
  }
  window.AnnouncementModule = { STORAGE_KEY, DEFAULT: { ...DEFAULT }, load, save, reset, getGlobal, saveGlobal };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initPopup, { once: true });
  else initPopup();
})();
