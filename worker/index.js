// Cloudflare Worker: 每日歌词实时API
// 部署到 Cloudflare Workers 后，前端通过 /api/lyric 实时获取歌词

const THEMES = [
  { name: "思念",   keywords: ["思念", "远方", "等待", "回忆"], bg: "miss" },
  { name: "自由",   keywords: ["自由", "远方", "旅行", "流浪"], bg: "freedom" },
  { name: "温柔",   keywords: ["温柔", "安静", "月光", "晚安"], bg: "gentle" },
  { name: "热血",   keywords: ["热血", "勇敢", "奋斗", "光芒"], bg: "passion" },
  { name: "孤独",   keywords: ["孤独", "夜晚", "独处", "沉默"], bg: "lonely" },
  { name: "浪漫",   keywords: ["浪漫", "星空", "告白", "心动"], bg: "romantic" },
  { name: "离别",   keywords: ["离别", "再见", "送别", "远方"], bg: "farewell" },
  { name: "青春",   keywords: ["青春", "校园", "少年", "奔跑"], bg: "youth" },
  { name: "治愈",   keywords: ["治愈", "温暖", "阳光", "微笑"], bg: "healing" },
  { name: "江湖",   keywords: ["江湖", "沧桑", "天涯", "豪情"], bg: "jianghu" },
  { name: "故乡",   keywords: ["故乡", "回家", "老歌", "童年"], bg: "hometown" },
  { name: "梦境",   keywords: ["梦境", "幻想", "星空", "漫游"], bg: "dream" },
  { name: "海",     keywords: ["海", "海浪", "海边", "潮汐"], bg: "ocean" },
  { name: "雨",     keywords: ["雨", "下雨", "雨天", "雨中"], bg: "rain" },
  { name: "风",     keywords: ["风", "微风", "风中", "飞扬"], bg: "wind" },
  { name: "花",     keywords: ["花", "花开", "樱花", "玫瑰"], bg: "flower" },
  { name: "夜",     keywords: ["夜", "深夜", "夜晚", "夜色"], bg: "night" },
  { name: "时光",   keywords: ["时光", "岁月", "从前", "旧时光"], bg: "time" },
];

const SEASON_KW = {
  spring: ["春天", "花开", "微风"],
  summer: ["夏天", "海风", "蝉鸣"],
  autumn: ["秋天", "落叶", "回忆"],
  winter: ["冬天", "温暖", "安静"],
};

function getSeason(month) {
  if ([3,4,5].includes(month)) return "spring";
  if ([6,7,8].includes(month)) return "summer";
  if ([9,10,11].includes(month)) return "autumn";
  return "winter";
}

function seededRandom(seed) {
  // Simple LCG
  let s = seed;
  return function() {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function hashSeed(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + c;
    hash |= 0;
  }
  return Math.abs(hash);
}

async function neteaseFetch(url, params) {
  const qs = new URLSearchParams(params).toString();
  const fullUrl = qs ? `${url}?${qs}` : url;
  try {
    const resp = await fetch(fullUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        "Referer": "https://music.163.com/",
      },
    });
    return await resp.json();
  } catch (e) {
    return null;
  }
}

function isChineseOrEnglish(text) {
  if (!text.trim()) return false;
  // 排除日文假名和韩文
  if (/[ぁ-んァ-ヶ]/.test(text) || /[가-힣]/.test(text)) return false;
  const cjk = (text.match(/[一-鿿㐀-䶿]/g) || []).length;
  const en = (text.match(/[a-zA-Z]/g) || []).length;
  return (cjk + en) / text.trim().length > 0.5;
}

async function searchSongs(keyword, limit = 30) {
  const data = await neteaseFetch("https://music.163.com/api/search/get", {
    s: keyword, type: "1", limit: String(limit), offset: "0",
  });
  if (!data || data.code !== 200) return [];
  return (data.result?.songs || [])
    .filter(s => isChineseOrEnglish(s.name) || isChineseOrEnglish(s.artists.map(a=>a.name).join(",")))
    .map(s => ({
      id: s.id,
      name: s.name,
      artist: s.artists.map(a => a.name).join(", "),
    }));
}

async function getLyric(songId) {
  const data = await neteaseFetch("https://music.163.com/api/song/lyric", {
    id: String(songId), lv: "1", tv: "-1",
  });
  if (!data || data.code !== 200) return null;
  const lrc = data.lrc?.lyric || "";
  return lrc.trim().split("\n")
    .map(line => line.replace(/\[\d+:\d+\.\d+\]/g, "").trim())
    .filter(text => text && !text.startsWith("//") && isChineseOrEnglish(text));
}

function pickBestLines(lines, count = 4) {
  if (!lines) return [];
  let cands = lines.filter(l => l.length >= 5 && l.length <= 30);
  if (!cands.length) cands = lines;
  const mid = Math.floor(cands.length / 2);
  const win = Math.max(count * 2, 6);
  const start = Math.max(0, mid - Math.floor(win / 2));
  const end = Math.min(cands.length, start + win);
  const seg = cands.slice(start, end);
  if (seg.length <= count) return seg;
  let bestI = 0, bestS = 0;
  for (let i = 0; i <= seg.length - count; i++) {
    const score = seg.slice(i, i + count).reduce((s, l) => s + Math.min(l.length, 20), 0);
    if (score > bestS) { bestS = score; bestI = i; }
  }
  return seg.slice(bestI, bestI + count);
}

export default {
  async fetch(request) {
    // CORS
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    const url = new URL(request.url);
    const offset = parseInt(url.searchParams.get("offset") || "0");

    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
    const month = now.getMonth() + 1;

    const seed = hashSeed(`daily-lyric-${dateStr}-${offset}`);
    const rng = seededRandom(seed);

    const theme = THEMES[Math.floor(rng() * THEMES.length)];
    const season = getSeason(month);
    const seasonKw = SEASON_KW[season] || [];
    const kw1 = theme.keywords[Math.floor(rng() * theme.keywords.length)];
    const kw2 = rng() > 0.5 && seasonKw.length ? seasonKw[Math.floor(rng() * seasonKw.length)] : "";
    const keyword = kw2 ? `${kw1} ${kw2}` : kw1;

    const songs = await searchSongs(keyword, 30);
    if (!songs.length) {
      return Response.json({ error: "未找到歌曲" }, { status: 500, headers: { "Access-Control-Allow-Origin": "*" } });
    }

    let song = songs[Math.floor(rng() * songs.length)];
    let lyricLines = null;
    for (const s of [song, ...songs.filter(x => x.id !== song.id)]) {
      const lines = await getLyric(s.id);
      if (lines && lines.length >= 3) {
        lyricLines = lines;
        song = s;
        break;
      }
    }

    if (!lyricLines) {
      return Response.json({ error: "未找到歌词" }, { status: 500, headers: { "Access-Control-Allow-Origin": "*" } });
    }

    const weekday = ["周日","周一","周二","周三","周四","周五","周六"][now.getDay()];
    const dateDisplay = `${month}月${now.getDate()}日 ${weekday}`;

    return Response.json({
      date: dateDisplay,
      song: song.name,
      artist: song.artist,
      lyric: pickBestLines(lyricLines),
      theme: theme.name,
      theme_bg: theme.bg,
    }, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300",
      },
    });
  },
};
