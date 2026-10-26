import { getStore } from "@netlify/blobs";

const OLD_DEFAULT_CONTENT = '在国师模拟器（宦海）的基础上做了一款以克强为主角的模拟器，这款游戏更多的是政治选项，较易理解。游戏名“寻归荒野”，取自程虹教授的著作。很遗憾能力有限，没能加入程虹出场的情节，仅以此标题向她致敬。\n\n具体的数值含义在首页有所介绍，两个隐藏数值达到目标可以解锁2012年开始的架空剧情。这款游戏相较于宦海一款要更稳定一些，情节更丰满，结局的判定更多元，游戏机制亦有不同的特色。李克强是我最尊重的领导人之一，也是因此我没有塞入更多的架空故事线，我更希望它像一本小说一样展开，但考虑到游戏性还是设置了一条。希望游玩愉快。';
const DEFAULT = {
  enabled: true,
  theme: "light",
  showIcon: true,
  icon: "./assets/notice-icon.jpg",
  title: "温馨提醒",
  content: "在国师模拟器（宦海）的基础上做了一款以克强为主角的模拟器，这款游戏更多的是政治选项，较易理解。游戏名“寻归荒野”，取自程虹教授的著作。很遗憾能力有限，没能加入程虹出场的情节，仅以此标题向她致敬。\n\n具体的数值含义在首页有所介绍，两个隐藏数值达到目标可以解锁2012年开始的架空剧情。这款游戏相较于宦海一款要更稳定一些，情节更丰满，结局的判定更多元，游戏机制亦有不同的特色。李克强是我最尊重的领导人之一，也是因此我没有塞入更多的架空故事线，我更希望它像一本小说一样展开，但考虑到游戏性还是设置了一条。希望游玩愉快。"
};
const STORE_NAME = "xungui-wilderness-announcement";
const STORE_KEY = "global-config";
const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
const respond = (payload, status = 200) => new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });

function sameSecret(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function validateConfig(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("配置格式不正确");
  const title = typeof input.title === "string" ? input.title.trim() : DEFAULT.title;
  const content = typeof input.content === "string" ? input.content : DEFAULT.content;
  const theme = input.theme === "dark" ? "dark" : "light";
  const enabled = typeof input.enabled === "boolean" ? input.enabled : DEFAULT.enabled;
  const showIcon = typeof input.showIcon === "boolean" ? input.showIcon : DEFAULT.showIcon;
  const icon = input.icon === null ? null : (typeof input.icon === "string" ? input.icon : DEFAULT.icon);
  if (!title || title.length > 80) throw new Error("标题需要为 1–80 个字符");
  if (content.length > 5000) throw new Error("公告正文不能超过 5000 个字符");
  if (icon !== null) {
    if (OLD_ICON_PATHS.includes(icon)) {
      return { enabled, theme, showIcon, icon: normalizeIcon(icon), title, content };
    }
    const allowedPath = NEW_ICON_PATHS.includes(icon);
    const allowedData = /^data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(icon);
    if (icon.length > 320000 || (!allowedPath && !allowedData)) throw new Error("图标格式不受支持或文件过大，请重新上传图片");
  }
  return { enabled, theme, showIcon, icon, title, content };
}

const OLD_ICON_PATHS = [
  "./assets/公告的小图标.jpg",
  "/assets/公告的小图标.jpg",
];
const NEW_ICON_PATHS = [
  "./assets/notice-icon.jpg",
  "/assets/notice-icon.jpg",
];
function normalizeIcon(icon) {
  if (typeof icon === "string" && OLD_ICON_PATHS.includes(icon)) return DEFAULT.icon;
  return icon;
}
function normalizeConfig(cfg) {
  return { ...cfg, icon: normalizeIcon(cfg.icon) };
}

export default async (request) => {
  if (request.method !== "GET" && request.method !== "PUT") {
    return respond({ error: "仅支持 GET 和 PUT 请求" }, 405);
  }
  try {
    const store = getStore(STORE_NAME);
    if (request.method === "GET") {
      const saved = await store.get(STORE_KEY, { type: "json" });
      let migrated = false;
      if (saved && typeof saved.icon === "string" && OLD_ICON_PATHS.includes(saved.icon)) {
        saved.icon = DEFAULT.icon;
        migrated = true;
      }
      if (saved && saved.content === OLD_DEFAULT_CONTENT) {
        saved.content = DEFAULT.content;
        migrated = true;
      }
      if (saved && migrated) {
        try { await store.setJSON(STORE_KEY, saved); } catch { /* 迁移写失败不影响本次响应 */ }
      }
      return respond(normalizeConfig({ ...DEFAULT, ...(saved || {}) }));
    }
    const expected = process.env.ANNOUNCEMENT_ADMIN_TOKEN;
    if (!expected) return respond({ error: "站点尚未设置 ANNOUNCEMENT_ADMIN_TOKEN 环境变量" }, 503);
    const provided = request.headers.get("x-admin-token") || "";
    if (!sameSecret(provided, expected)) return respond({ error: "管理员口令不正确" }, 401);
    const length = Number(request.headers.get("content-length") || 0);
    if (length > 400000) return respond({ error: "提交内容过大" }, 413);
    let body;
    try { body = await request.json(); } catch { return respond({ error: "请求内容不是有效 JSON" }, 400); }
    let config;
    try { config = validateConfig(body); } catch (error) { return respond({ error: error.message || "设置内容不合法" }, 400); }
    await store.setJSON(STORE_KEY, config);
    return respond({ ok: true, config: normalizeConfig(config) });
  } catch (error) {
    console.error("Announcement function error:", error);
    return respond({ error: "全局公告存储暂时不可用，请稍后重试" }, 500);
  }
};
