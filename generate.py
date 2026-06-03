import hashlib
import json
import random
import re

import requests

DAILY_THEMES = [
    {"name": "思念",   "keywords": ["思念", "远方", "等待", "回忆"], "bg": "miss"},
    {"name": "自由",   "keywords": ["自由", "远方", "旅行", "流浪"], "bg": "freedom"},
    {"name": "温柔",   "keywords": ["温柔", "安静", "月光", "晚安"], "bg": "gentle"},
    {"name": "热血",   "keywords": ["热血", "勇敢", "奋斗", "光芒"], "bg": "passion"},
    {"name": "孤独",   "keywords": ["孤独", "夜晚", "独处", "沉默"], "bg": "lonely"},
    {"name": "浪漫",   "keywords": ["浪漫", "星空", "告白", "心动"], "bg": "romantic"},
    {"name": "离别",   "keywords": ["离别", "再见", "送别", "远方"], "bg": "farewell"},
    {"name": "青春",   "keywords": ["青春", "校园", "少年", "奔跑"], "bg": "youth"},
    {"name": "治愈",   "keywords": ["治愈", "温暖", "阳光", "微笑"], "bg": "healing"},
    {"name": "江湖",   "keywords": ["江湖", "沧桑", "天涯", "豪情"], "bg": "jianghu"},
    {"name": "故乡",   "keywords": ["故乡", "回家", "老歌", "童年"], "bg": "hometown"},
    {"name": "梦境",   "keywords": ["梦境", "幻想", "星空", "漫游"], "bg": "dream"},
    {"name": "海",     "keywords": ["海", "海浪", "海边", "潮汐"], "bg": "ocean"},
    {"name": "雨",     "keywords": ["雨", "下雨", "雨天", "雨中"], "bg": "rain"},
    {"name": "风",     "keywords": ["风", "微风", "风中", "飞扬"], "bg": "wind"},
    {"name": "花",     "keywords": ["花", "花开", "樱花", "玫瑰"], "bg": "flower"},
    {"name": "夜",     "keywords": ["夜", "深夜", "夜晚", "夜色"], "bg": "night"},
    {"name": "时光",   "keywords": ["时光", "岁月", "从前", "旧时光"], "bg": "time"},
]

SEASON_KEYWORDS = {
    "spring": ["春天", "花开", "微风"],
    "summer": ["夏天", "海风", "蝉鸣"],
    "autumn": ["秋天", "落叶", "回忆"],
    "winter": ["冬天", "温暖", "安静"],
}

_CJK_RE = re.compile(r'[一-鿿㐀-䶿]')
_KANA_RE = re.compile(r'[ぁ-んァ-ヶ]')
_HANGUL_RE = re.compile(r'[가-힣]')
_EN_RE = re.compile(r'[a-zA-Z]')


def _is_chinese_or_english(text):
    if not text.strip():
        return False
    if _KANA_RE.search(text) or _HANGUL_RE.search(text):
        return False
    cjk_count = len(_CJK_RE.findall(text))
    en_count = len(_EN_RE.findall(text))
    total = len(text.strip())
    if total == 0:
        return False
    return (cjk_count + en_count) / total > 0.5


def _get_season(month):
    if month in (3, 4, 5):
        return "spring"
    elif month in (6, 7, 8):
        return "summer"
    elif month in (9, 10, 11):
        return "autumn"
    return "winter"


def _seed(date_str, offset=0):
    seed_str = f"daily-lyric-{date_str}-{offset}"
    return int(hashlib.md5(seed_str.encode()).hexdigest()[:8], 16)


def _netease_request(url, params=None):
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        "Referer": "https://music.163.com/",
    }
    try:
        resp = requests.get(url, params=params, headers=headers, timeout=8)
        return resp.json()
    except Exception:
        return None


def search_songs(keyword, limit=30):
    url = "https://music.163.com/api/search/get"
    params = {"s": keyword, "type": 1, "limit": limit, "offset": 0}
    data = _netease_request(url, params)
    if not data or data.get("code") != 200:
        return []
    songs = data.get("result", {}).get("songs", [])
    result = []
    for s in songs:
        name = s["name"]
        artist = ", ".join(a["name"] for a in s.get("artists", []))
        if _is_chinese_or_english(name) or _is_chinese_or_english(artist):
            result.append({"id": s["id"], "name": name, "artist": artist})
    return result


def get_lyric(song_id):
    url = "https://music.163.com/api/song/lyric"
    params = {"id": song_id, "lv": 1, "tv": -1}
    data = _netease_request(url, params)
    if not data or data.get("code") != 200:
        return None
    lrc = data.get("lrc", {}).get("lyric", "")
    return _parse_lyric(lrc)


def _parse_lyric(lrc_text):
    lines = []
    for line in lrc_text.strip().split("\n"):
        text = re.sub(r"\[\d+:\d+\.\d+\]", "", line).strip()
        if text and not text.startswith("//") and text not in ("", "作", "词", "曲"):
            if _is_chinese_or_english(text):
                lines.append(text)
    return lines


def pick_best_lines(lyric_lines, count=4):
    if not lyric_lines:
        return []
    candidates = [l for l in lyric_lines if 5 <= len(l) <= 30]
    if not candidates:
        candidates = lyric_lines
    mid = len(candidates) // 2
    window = max(count * 2, 6)
    start = max(0, mid - window // 2)
    end = min(len(candidates), start + window)
    segment = candidates[start:end]
    if len(segment) <= count:
        return segment
    best_start = 0
    best_score = 0
    for i in range(len(segment) - count + 1):
        chunk = segment[i : i + count]
        score = sum(min(len(l), 20) for l in chunk)
        if score > best_score:
            best_score = score
            best_start = i
    return segment[best_start : best_start + count]


def get_one_lyric(date_str, month, offset):
    rng = random.Random(_seed(date_str, offset))
    theme = rng.choice(DAILY_THEMES)
    season = _get_season(month)
    season_kw = SEASON_KEYWORDS.get(season, [])
    kw1 = rng.choice(theme["keywords"])
    kw2 = rng.choice(season_kw) if rng.random() > 0.5 else ""
    keyword = f"{kw1} {kw2}".strip() if kw2 else kw1

    songs = search_songs(keyword, limit=30)
    if not songs:
        songs = search_songs(theme["keywords"][0], limit=30)
    if not songs:
        return None

    song = rng.choice(songs)
    lyric_lines = None
    for s in [song] + [x for x in songs if x["id"] != song["id"]]:
        lines = get_lyric(s["id"])
        if lines and len(lines) >= 3:
            lyric_lines = lines
            song = s
            break

    if not lyric_lines:
        return None

    best = pick_best_lines(lyric_lines, count=4)
    return {
        "song": song["name"],
        "artist": song["artist"],
        "lyric": best,
        "theme": theme["name"],
        "theme_bg": theme["bg"],
    }


def generate_daily_data(count=7):
    from datetime import datetime
    now = datetime.now()
    date_str = now.strftime("%Y-%m-%d")
    weekday = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"][now.weekday()]
    date_display = f"{now.month}月{now.day}日 {weekday}"

    lyrics = []
    for i in range(count):
        print(f"Generating lyric {i+1}/{count}...")
        data = get_one_lyric(date_str, now.month, i)
        if data:
            lyrics.append(data)

    result = {
        "date": date_display,
        "generated_at": now.isoformat(),
        "lyrics": lyrics,
    }

    with open("docs/data.json", "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"Generated {len(lyrics)} lyrics for {date_display}")
    return result


if __name__ == "__main__":
    import os
    os.makedirs("docs", exist_ok=True)
    generate_daily_data(7)
