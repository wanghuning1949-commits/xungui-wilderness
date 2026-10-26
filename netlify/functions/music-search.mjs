// 寻归荒野 · 音乐库搜索代理
// GET /.netlify/functions/music-search?kw=关键词   —— 搜索歌曲（返回免登录可播的条目）
// GET /.netlify/functions/music-search?stream=<id> —— 把试听外链解析成最终的 https CDN 直链
// 音乐元数据/音频由网易云音乐平台提供，本函数仅在服务端转发请求，不落库、不转码。

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const OUTER = 'https://music.163.com/song/media/outer/url?id=';
// fee: 0=免费, 2=免费/低码率, 8=标准码率直链可播, 1/4/16=VIP/专辑/登录限制（外链 404，过滤掉）
const PLAYABLE_FEE = new Set([0, 2, 8]);
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

export default async (req) => {
  const url = new URL(req.url);

  // —— 解析试听直链 ——
  const streamId = url.searchParams.get('stream');
  if (streamId) {
    if (!/^\d{1,12}$/.test(streamId)) return json({ error: '参数错误' }, 400);
    try {
      const r = await fetch(`${OUTER}${streamId}.mp3`, {
        headers: { 'User-Agent': UA, 'Referer': 'https://music.163.com/' },
        redirect: 'follow',
      });
      const type = r.headers.get('content-type') || '';
      if (r.status === 404 || type.includes('text/html')) return json({ error: 'unplayable' });
      // CDN 链接若以 http 下发，统一替换为 https（避免 https 站点混用 http 媒体）
      const link = (r.url || '').replace(/^http:\/\//i, 'https://');
      if (!link.endsWith && !link) return json({ error: 'unplayable' });
      return json({ url: link });
    } catch (_) {
      return json({ error: 'unplayable' }, 502);
    }
  }

  // —— 关键词搜索 ——
  const kw = (url.searchParams.get('kw') || '').trim();
  if (!kw || kw.length > 40) return json({ error: '参数错误' }, 400);
  let limit = Number(url.searchParams.get('limit') || 14);
  limit = Math.min(20, Math.max(5, Math.floor(limit) || 14));

  try {
    const r = await fetch(
      `https://music.163.com/api/search/get/web?s=${encodeURIComponent(kw)}&type=1&offset=0&limit=${limit}`,
      { headers: { 'User-Agent': UA, 'Referer': 'https://music.163.com/' } }
    );
    if (!r.ok) return json({ error: `搜索服务不可用（HTTP ${r.status}）` }, 502);
    const data = await r.json();
    const songs = (data && data.result && data.result.songs) || [];
    const list = songs
      .filter(s => PLAYABLE_FEE.has(s.fee) && s.id)
      .map(s => ({
        id: s.id,
        name: s.name || '(未知曲目)',
        artist: (s.artists || []).map(a => a.name).filter(Boolean).join(' / ') || '(未知歌手)',
      }));
    return json({ songs: list });
  } catch (_) {
    return json({ error: '搜索服务暂时不可用' }, 502);
  }
};
