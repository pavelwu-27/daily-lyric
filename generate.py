import hashlib
import json
import random
import re

import requests

DAILY_THEMES = [
    {"name": "思念",   "keywords": ["邓丽君", "蔡琴", "费玉清", "罗大佑"], "bg": "miss"},
    {"name": "自由",   "keywords": ["崔健", "Beyond", "黑豹", "许巍"], "bg": "freedom"},
    {"name": "温柔",   "keywords": ["李宗盛", "周华健", "齐秦", "张信哲"], "bg": "gentle"},
    {"name": "热血",   "keywords": ["黄家驹", "唐朝乐队", "张雨生", "郑智化"], "bg": "passion"},
    {"name": "孤独",   "keywords": ["齐秦 冬天", "王杰", "姜育恒", "陈百强"], "bg": "lonely"},
    {"name": "浪漫",   "keywords": ["张国荣", "谭咏麟", "刘德华", "张学友"], "bg": "romantic"},
    {"name": "离别",   "keywords": ["陈奕迅", "周华健 朋友", "李叔同", "吴奇隆"], "bg": "farewell"},
    {"name": "青春",   "keywords": ["老狼", "朴树", "水木年华", "小虎队"], "bg": "youth"},
    {"name": "治愈",   "keywords": ["陈百强", "林忆莲", "叶倩文", "王菲"], "bg": "healing"},
    {"name": "江湖",   "keywords": ["黄霑", "罗文", "周华健 江湖", "费玉清 江湖"], "bg": "jianghu"},
    {"name": "故乡",   "keywords": ["费翔", "腾格尔", "李健", "罗大佑 故乡"], "bg": "hometown"},
    {"name": "梦境",   "keywords": ["王菲 梦中", "齐豫", "孟庭苇", "邓丽君 月亮"], "bg": "dream"},
    {"name": "海",     "keywords": ["张雨生 大海", "Beyond 海阔天空", "郑智化 水手", "罗大佑 海"], "bg": "ocean"},
    {"name": "雨",     "keywords": ["齐秦 大约在冬季", "孟庭苇 雨", "邓丽君 雨", "周华健 雨"], "bg": "rain"},
    {"name": "风",     "keywords": ["齐秦 狼", "许巍 风", "Beyond 风", "陈百强 风"], "bg": "wind"},
    {"name": "花",     "keywords": ["邓丽君 花", "费玉清 花", "孟庭苇 花", "梅艳芳 花"], "bg": "flower"},
    {"name": "夜",     "keywords": ["蔡琴 夜", "邓丽君 月亮", "费玉清 夜", "齐秦 夜"], "bg": "night"},
    {"name": "时光",   "keywords": ["罗大佑 光阴", "李宗盛 时光", "周华健 时光", "陈奕迅 时光"], "bg": "time"},
    {"name": "R&B",    "keywords": ["陶喆", "王力宏 R&B", "方大同", "周杰伦 R&B"], "bg": "rnb"},
    {"name": "港台情歌", "keywords": ["张学友 情歌", "陈奕迅 情歌", "林俊杰", "孙燕姿"], "bg": "canto"},
    {"name": "粤语经典", "keywords": ["陈奕迅 粤语", "张国荣 粤语", "谭咏麟 粤语", "Beyond 粤语"], "bg": "cantonese"},
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
    """从歌词中选取完整的连续段落，优先副歌，确保句子完整"""
    if not lyric_lines:
        return []

    # 过滤太短和太长的行，但保留原文不截断
    candidates = [l for l in lyric_lines if 4 <= len(l) <= 40]
    if len(candidates) < count:
        candidates = lyric_lines

    # 找副歌：重复出现的连续片段
    chorus = _find_chorus(candidates, count)
    if chorus:
        # 副歌也要确保句子完整
        return _ensure_complete_sentences(chorus, lyric_lines)

    # 没找到副歌，找最完整的一段连续句子
    return _find_complete_segment(candidates, count)


def _find_chorus(lines, count):
    """基于行重复密度找副歌区域。

    核心思路：副歌的特征是其中每一行在整首歌词中至少出现2次。
    扫描歌词，找出"连续 count 行都在全曲重复≥2次"的区域，
    这就是副歌。
    """
    if len(lines) < count + 2:
        return None

    # 统计每行在全曲出现的次数
    from collections import Counter
    line_freq = Counter(lines)

    # 找出重复行（出现≥2次）的索引
    repeat_indices = [i for i, line in enumerate(lines) if line_freq[line] >= 2]

    if len(repeat_indices) < count:
        return None

    # 找连续区域：连续 count 个索引都在 repeat_indices 中
    # 即找最长的连续 repeat_indices 片段
    best_segment = None
    best_score = 0

    for i in range(len(lines) - count + 1):
        segment = lines[i : i + count]
        # 每行重复次数之和
        score = sum(line_freq[line] for line in segment)
        # 所有行都重复至少1次（即出现≥2次）
        all_repeat = all(line_freq[line] >= 2 for line in segment)
        if all_repeat:
            # 额外奖励：连续区域越长越好
            # 检查 i-1 和 i+count 是否也是重复行（扩展连续性）
            extend_bonus = 0
            if i > 0 and line_freq[lines[i - 1]] >= 2:
                extend_bonus += 1
            if i + count < len(lines) and line_freq[lines[i + count]] >= 2:
                extend_bonus += 1
            score += extend_bonus * 2

            # 句子完整性加分
            if _is_sentence_start(segment[0]):
                score += 3
            if _is_sentence_end(segment[-1]):
                score += 3

            if score > best_score:
                best_score = score
                best_segment = segment

    return best_segment


def _is_sentence_start(text):
    """判断一行是否是完整句子的开始（不是连接词/助词开头）"""
    if not text:
        return False
    first = text[0]
    # 连接词、助词、标点开头 → 不是句子开始
    if first in "而但却就才还也又的地得和与及因为所以如果虽然哪怕哪怕哪怕哪":
        return False
    return True


def _is_sentence_end(text):
    """判断一行是否以完整句子结尾（有句末标点）"""
    if not text:
        return False
    last = text[-1]
    return last in "。！？；…~—》」』\"\""


def _ensure_complete_sentences(segment, all_lines):
    """确保选取的歌词段首行是句子开始，末行是句子结束。
    如果首行不是句子开始，向前扩展；如果末行不是句子结束，向后扩展。"""
    result = list(segment)
    if not result:
        return result

    # 首行不是句子开始，尝试向前扩展
    if not _is_sentence_start(result[0]):
        for line in all_lines:
            idx = all_lines.index(line)
            # 在 all_lines 中找到 result[0] 的位置，向前找句子开始
            if line == result[0] and idx > 0:
                for j in range(idx - 1, -1, -1):
                    if _is_sentence_end(all_lines[j]) or _is_sentence_start(all_lines[j + 1]):
                        # j+1 是句子开始，但 result[0] 不是，
                        # 说明 j 行是上一句结尾，j+1 行应该是当前句开始
                        # 把 j+1 到 result[0] 之间的行加入
                        # 但只加 result[0] 前面一行试试
                        if _is_sentence_start(all_lines[idx - 1]):
                            result.insert(0, all_lines[idx - 1])
                        break
                break

    # 末行不是句子结束，尝试向后扩展
    if not _is_sentence_end(result[-1]):
        for line in all_lines:
            idx = all_lines.index(line)
            if line == result[-1] and idx < len(all_lines) - 1:
                next_line = all_lines[idx + 1]
                # 如果下一行是新句子开始，当前行可能省略了句末标点（歌词常见）
                # 这种情况可以接受，不强制扩展
                # 但如果下一行是当前句的延续，则扩展
                if not _is_sentence_start(next_line):
                    result.append(next_line)
                break

    return result


def _find_complete_segment(lines, count):
    """找一段语义完整的连续歌词，确保首行是句子开始、末行是句子结束"""
    if len(lines) <= count:
        return lines

    best_start = 0
    best_score = -1

    for i in range(len(lines) - count + 1):
        segment = lines[i : i + count]
        score = 0

        for j, line in enumerate(segment):
            # 行尾有完整标点
            if line[-1] in "。！？；":
                score += 5
            elif line[-1] in "，、：…~":
                score += 2

            # 行首不是连接词（说明是完整句子的开始）
            first_char = line[0]
            if first_char not in "而但却就才还也又的地得和与及":
                score += 3

            # 字数在8-20之间（节奏感好）
            if 8 <= len(line) <= 20:
                score += 2

        # 相邻行字数差异小 → 韵律感好
        lengths = [len(l) for l in segment]
        avg_len = sum(lengths) / len(lengths)
        variance = sum((l - avg_len) ** 2 for l in lengths) / len(lengths)
        if variance < 16:  # 标准差 < 4
            score += 5

        # 不从歌词最开头取（前奏部分可能不完整）
        if i > 0:
            score += 1

        # 关键加分：首行是句子开始 + 末行是句子结束
        if _is_sentence_start(segment[0]):
            score += 8
        if _is_sentence_end(segment[-1]):
            score += 8

        if score > best_score:
            best_score = score
            best_start = i

    return lines[best_start : best_start + count]


def get_one_lyric(date_str, month, offset):
    rng = random.Random(_seed(date_str, offset))

    # 用洗牌循环确保主题均匀覆盖：每轮洗牌所有主题，按顺序取
    num_themes = len(DAILY_THEMES)
    round_idx = offset // num_themes      # 第几轮
    pos_in_round = offset % num_themes     # 轮内位置
    # 每轮用不同种子洗牌
    shuffle_rng = random.Random(_seed(date_str, round_idx * 1000))
    shuffled = list(DAILY_THEMES)
    shuffle_rng.shuffle(shuffled)
    theme = shuffled[pos_in_round]

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


def generate_daily_data(count=50):
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
    generate_daily_data(50)
