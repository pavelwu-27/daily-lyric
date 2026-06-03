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
  { name: "R&B", keywords: ["陶喆", "王力宏 R&B", "方大同", "周杰伦 R&B"], bg: "rnb" },
  { name: "港台情歌", keywords: ["张学友 情歌", "陈奕迅 情歌", "林俊杰", "孙燕姿"], bg: "canto" },
  { name: "粤语经典", keywords: ["陈奕迅 粤语", "张国荣 粤语", "谭咏麟 粤语", "Beyond 粤语"], bg: "cantonese" },
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
  let cands = lines.filter(l => l.length >= 4 && l.length <= 40);
  if (cands.length < count) cands = lines;

  // Try to find chorus (repeated segment)
  const chorus = findChorus(cands, count);
  if (chorus) return ensureCompleteSentences(chorus, lines);

  // Find most complete segment
  return findCompleteSegment(cands, count);
}

function isSentenceStart(text) {
  if (!text) return false;
  const first = text[0];
  return !"而但却就才还也又的地得和与及因为所以如果虽然".includes(first);
}

function isSentenceEnd(text) {
  if (!text) return false;
  const last = text[text.length - 1];
  return "。！？；…~—》」』\"\"".includes(last);
}

function ensureCompleteSentences(segment, allLines) {
  const result = [...segment];
  if (!result.length) return result;

  // If first line is not a sentence start, try prepending the previous line
  if (!isSentenceStart(result[0])) {
    const idx = allLines.indexOf(result[0]);
    if (idx > 0 && !isSentenceStart(allLines[idx])) {
      // The line before might be the real start
      if (isSentenceStart(allLines[idx - 1])) {
        result.unshift(allLines[idx - 1]);
      }
    }
  }

  // If last line is not a sentence end, check if next line continues the sentence
  if (!isSentenceEnd(result[result.length - 1])) {
    const lastIdx = allLines.indexOf(result[result.length - 1]);
    if (lastIdx < allLines.length - 1) {
      const nextLine = allLines[lastIdx + 1];
      // If next line is not a new sentence start, it's a continuation — include it
      if (!isSentenceStart(nextLine)) {
        result.push(nextLine);
      }
    }
  }

  return result;
}

function findChorus(lines, count) {
  if (lines.length < count * 2) return null;
  const chunks = [];
  for (let i = 0; i <= lines.length - count; i++) {
    chunks.push(lines.slice(i, i + count).join("|"));
  }
  const freq = {};
  for (const c of chunks) {
    freq[c] = (freq[c] || 0) + 1;
  }
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  for (const [chunk, cnt] of sorted.slice(0, 3)) {
    if (cnt >= 2) return chunk.split("|");
  }
  return null;
}

function findCompleteSegment(lines, count) {
  if (lines.length <= count) return lines;
  let bestI = 0, bestS = -1;
  for (let i = 0; i <= lines.length - count; i++) {
    const seg = lines.slice(i, i + count);
    let score = 0;
    for (const line of seg) {
      const last = line[line.length - 1];
      if ("。！？；".includes(last)) score += 5;
      else if ("，、：…~".includes(last)) score += 2;
      const first = line[0];
      if (!"而但却就才还也又的地得和与及".includes(first)) score += 3;
      if (line.length >= 8 && line.length <= 20) score += 2;
    }
    const lens = seg.map(l => l.length);
    const avg = lens.reduce((a, b) => a + b, 0) / lens.length;
    const variance = lens.reduce((s, l) => s + (l - avg) ** 2, 0) / lens.length;
    if (variance < 16) score += 5;
    if (i > 0) score += 1;
    // Key bonus: first line is sentence start + last line is sentence end
    if (isSentenceStart(seg[0])) score += 8;
    if (isSentenceEnd(seg[seg.length - 1])) score += 8;
    if (score > bestS) { bestS = score; bestI = i; }
  }
  return lines.slice(bestI, bestI + count);
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
