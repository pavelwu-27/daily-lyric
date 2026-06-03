export const config = {
  runtime: 'edge',
};

const THEMES = [
  { name: "思念", keywords: ["邓丽君", "蔡琴", "费玉清", "罗大佑"], bg: "miss" },
  { name: "自由", keywords: ["崔健", "Beyond", "黑豹", "许巍"], bg: "freedom" },
  { name: "温柔", keywords: ["李宗盛", "周华健", "齐秦", "张信哲"], bg: "gentle" },
  { name: "热血", keywords: ["黄家驹", "唐朝乐队", "张雨生", "郑智化"], bg: "passion" },
  { name: "孤独", keywords: ["齐秦 冬天", "王杰", "姜育恒", "陈百强"], bg: "lonely" },
  { name: "浪漫", keywords: ["张国荣", "谭咏麟", "刘德华", "张学友"], bg: "romantic" },
  { name: "离别", keywords: ["陈奕迅", "周华健 朋友", "李叔同", "吴奇隆"], bg: "farewell" },
  { name: "青春", keywords: ["老狼", "朴树", "水木年华", "小虎队"], bg: "youth" },
  { name: "治愈", keywords: ["陈百强", "林忆莲", "叶倩文", "王菲"], bg: "healing" },
  { name: "江湖", keywords: ["黄霑", "罗文", "周华健 江湖", "费玉清 江湖"], bg: "jianghu" },
  { name: "故乡", keywords: ["费翔", "腾格尔", "李健", "罗大佑 故乡"], bg: "hometown" },
  { name: "梦境", keywords: ["王菲 梦中", "齐豫", "孟庭苇", "邓丽君 月亮"], bg: "dream" },
  { name: "海", keywords: ["张雨生 大海", "Beyond 海阔天空", "郑智化 水手", "罗大佑 海"], bg: "ocean" },
  { name: "雨", keywords: ["齐秦 大约在冬季", "孟庭苇 雨", "邓丽君 雨", "周华健 雨"], bg: "rain" },
  { name: "风", keywords: ["齐秦 狼", "许巍 风", "Beyond 风", "陈百强 风"], bg: "wind" },
  { name: "花", keywords: ["邓丽君 花", "费玉清 花", "孟庭苇 花", "梅艳芳 花"], bg: "flower" },
  { name: "夜", keywords: ["蔡琴 夜", "邓丽君 月亮", "费玉清 夜", "齐秦 夜"], bg: "night" },
  { name: "时光", keywords: ["罗大佑 光阴", "李宗盛 时光", "周华健 时光", "陈奕迅 时光"], bg: "time" },
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
  let s = seed;
  return function() {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function hashSeed(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function isChineseOrEnglish(text) {
  if (!text || !text.trim()) return false;
  if (/[ぁ-んァ-ヶ]/.test(text) || /[가-힣]/.test(text)) return false;
  const cjk = (text.match(/[一-鿿]/g) || []).length;
  const en = (text.match(/[a-zA-Z]/g) || []).length;
  return (cjk + en) / text.trim().length > 0.5;
}

async function neteaseFetch(url, params) {
  const qs = new URLSearchParams(params).toString();
  const fullUrl = qs ? `${url}?${qs}` : url;
  try {
    const resp = await fetch(fullUrl, {
      headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://music.163.com/" },
    });
    return await resp.json();
  } catch (e) {
    return null;
  }
}

async function searchSongs(keyword) {
  const data = await neteaseFetch("https://music.163.com/api/search/get", {
    s: keyword, type: "1", limit: "30", offset: "0",
  });
  if (!data || data.code !== 200) return [];
  return (data.result?.songs || [])
    .filter(s => isChineseOrEnglish(s.name) || isChineseOrEnglish(s.artists.map(a => a.name).join(",")))
    .map(s => ({ id: s.id, name: s.name, artist: s.artists.map(a => a.name).join(", ") }));
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
  if (!lines || !lines.length) return [];
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

export default async function handler(req) {
  const url = new URL(req.url);
  const offset = parseInt(url.searchParams.get("offset") || "0");

  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const month = now.getMonth() + 1;
  const weekday = ["周日","周一","周二","周三","周四","周五","周六"][now.getDay()];
  const dateDisplay = `${month}月${now.getDate()}日 ${weekday}`;

  const seed = hashSeed(`daily-lyric-${dateStr}-${offset}`);
  const rng = seededRandom(seed);

  const theme = THEMES[Math.floor(rng() * THEMES.length)];
  const season = getSeason(month);
  const seasonKw = SEASON_KW[season] || [];
  const kw1 = theme.keywords[Math.floor(rng() * theme.keywords.length)];
  const kw2 = rng() > 0.5 && seasonKw.length ? seasonKw[Math.floor(rng() * seasonKw.length)] : "";
  const keyword = kw2 ? `${kw1} ${kw2}` : kw1;

  try {
    const songs = await searchSongs(keyword);
    if (!songs.length) {
      return new Response(JSON.stringify({ error: "未找到歌曲" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
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
      return new Response(JSON.stringify({ error: "未找到歌词" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    return new Response(JSON.stringify({
      date: dateDisplay,
      song: song.name,
      artist: song.artist,
      lyric: pickBestLines(lyricLines),
      theme: theme.name,
      theme_bg: theme.bg,
    }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
}
