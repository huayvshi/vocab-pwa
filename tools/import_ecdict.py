"""从 ECDICT（skywind3000/ECDICT，ecdict.csv）抽出考研大纲词，生成精简词表。

只做数据清洗与字段映射，不做任何 UI 相关的事：
    python tools/import_ecdict.py            # 读 tools/.cache/ecdict.csv → 写 tools/ecdict_ky.json

输出每条： (word, phonetic, senses, forms, level, collins, oxford, frq)
  senses  : "pos.|释义||pos.|释义"（与 build_vocab.py 的 senses 语法一致）
  forms   : "past=x, pp=y" 形式
  level   : core / plus
"""

from __future__ import annotations

import csv
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CACHE = ROOT / ".cache" / "ecdict.csv"
OUT = ROOT / "ecdict_ky.json"

# ECDICT 的 exchange 字段单字母含义 → 本项目 forms 的键
EXCHANGE_KEYS = {
    "p": "past",
    "d": "pp",
    "i": "ing",
    "3": "third",
    "s": "pl",
    "r": "comp",
    "t": "sup",
}

POS_MAP = {
    "n": "n.",
    "v": "v.",
    "vt": "vt.",
    "vi": "vi.",
    "adj": "adj.",
    "a": "adj.",
    "ad": "adj.",
    "adv": "adv.",
    "prep": "prep.",
    "conj": "conj.",
    "pron": "pron.",
    "num": "num.",
    "art": "art.",
    "int": "int.",
    "aux": "aux.",
    "abbr": "abbr.",
    "prefix": "pref.",
    "suffix": "suf.",
}
# 长的先匹配，否则 vt 会被 v 抢先吃掉
_POS_ALT = "|".join(sorted(POS_MAP, key=len, reverse=True))
POS_RE = re.compile(rf"^({_POS_ALT})\.?\s*", re.IGNORECASE)
WORD_RE = re.compile(r"^[A-Za-z][A-Za-z'’\-]{1,38}$")


def parse_senses(translation: str) -> str:
    """ECDICT 的 translation 常是「v. 放弃，抛弃\nn. 放任」这种多行文本。"""
    parts: list[str] = []
    # ECDICT 在 CSV 里把换行写成字面量「\n」，先还原成真换行再拆行
    for raw_line in translation.replace("\\n", "\n").replace("\\r", "\n").replace("\r", "\n").split("\n"):
        line = raw_line.strip()
        if not line:
            continue
        # 有些行是「1. 放弃」这种编号，去掉编号
        line = re.sub(r"^[0-9]+[.、)．]\s*", "", line)
        # ECDICT 还有「[计] 规程」「【医】…」这类专业领域标记，掉它才不会占一个词性位
        line = re.sub(r"^(?:\[[^\]]{1,8}\]\s*|【[^】]{1,8}】\s*)+", "", line)
        pos = ""
        match = POS_RE.match(line)
        if match:
            pos = POS_MAP[match.group(1).lower()]
            line = line[match.end() :].strip()
        if not line:
            continue
        # 同一词性下多个释义合并成一条，用「；」分隔已足够
        line = re.sub(r"\s+", " ", line).strip(" ,，;；")
        if not line:
            continue
        entry = f"{pos}|{line}" if pos else f"|{line}"
        if entry not in parts:
            parts.append(entry)
    # 最多 4 条，避免超长词条
    return "||".join(parts[:4])


def parse_forms(exchange: str) -> str:
    if not exchange:
        return ""
    pairs: list[str] = []
    for chunk in exchange.split("/"):
        if ":" not in chunk:
            continue
        key, value = chunk.split(":", 1)
        key = key.strip()
        value = value.strip()
        if key == "0" or not value or not WORD_RE.match(value):
            continue
        label = EXCHANGE_KEYS.get(key)
        if label and value.lower() != "":
            pairs.append(f"{label}={value}")
    return ", ".join(pairs[:5])


def main() -> int:
    if not CACHE.exists():
        print(f"缺少词典文件：{CACHE}", file=sys.stderr)
        print("先下载 https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv", file=sys.stderr)
        return 1

    # 考研大纲 ≈ 高考基础词（gk）＋ 考研新增词（ky）。两者并集约 6200 条，全部收录，
    # 不再按频率截断——截断会把 telephone / apple 这类基础词挤掉，查词体验直接崩。
    target = 10**9
    rows: dict[str, dict] = {}
    skipped = 0
    gk_extra: list[dict] = []
    cet6_extra: list[dict] = []
    with CACHE.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            tag = (row.get("tag") or "").split()
            # 考研大纲 5500 词里有很多基础词（telephone / dictionary）在 ECDICT 只有 gk 标记，
            # 所以取 ky 为主干，gk 高频词补基础盘，还不够才用 cet6 兜底。
            if "ky" not in tag and "gk" not in tag and "cet6" not in tag:
                continue
            word = (row.get("word") or "").strip()
            if not WORD_RE.match(word):
                skipped += 1
                continue
            translation = (row.get("translation") or "").strip()
            if not translation:
                skipped += 1
                continue
            senses = parse_senses(translation)
            if not senses:
                skipped += 1
                continue
            frq = int(row.get("frq") or 0)
            collins = int(row.get("collins") or 0)
            oxford = int(row.get("oxford") or 0)
            level = "core" if (oxford == 1 or collins >= 3 or (0 < frq <= 5000)) else "plus"
            item = {
                "word": word if word.islower() else word.lower(),
                "phonetic": (row.get("phonetic") or "").strip(),
                "senses": senses,
                "forms": parse_forms(row.get("exchange") or ""),
                "level": level,
                "collins": collins,
                "oxford": oxford,
                "frq": frq,
            }
            key = item["word"].lower()
            if "ky" in tag:
                existing = rows.get(key)
                if existing and len(existing["senses"]) >= len(senses):
                    continue
                rows[key] = item
            elif "gk" in tag:
                gk_extra.append(item)
            else:
                cet6_extra.append(item)

    # 考研大纲 ≈ 高考基础词（gk）＋ 考研新增词（ky）。两者并集约 6200 条，全部收录，
    # 不再按频率截断——截断会把 telephone / apple 这类基础词挤掉，查词体验直接崩。
    # 只有连 5500 都凑不齐时才用 cet6 词兜底（正常不会触发）。
    floor = 5500
    added = {"gk": 0, "cet6": 0}
    for bucket, name, cap in ((gk_extra, "gk", 10**9), (cet6_extra, "cet6", floor)):
        bucket.sort(key=lambda item: (item["frq"] or 10**9, item["word"]))
        for item in bucket:
            if len(rows) >= cap:
                break
            key = item["word"].lower()
            if key in rows:
                continue
            rows[key] = dict(item, level="plus", supplement=name)
            added[name] += 1

    words = sorted(rows.values(), key=lambda item: (item["level"] != "core", item["frq"] or 10**9, item["word"]))
    payload = {
        "meta": {
            "source": "ECDICT（skywind3000/ECDICT）ky 大纲词 ＋ gk 基础词补齐 ＋ cet6 兜底",
            "count": len(words),
            "skipped": skipped,
            "supplement_gk": added["gk"],
            "supplement_cet6": added["cet6"],
            "core": sum(1 for item in words if item["level"] == "core"),
            "plus": sum(1 for item in words if item["level"] == "plus"),
            "with_phonetic": sum(1 for item in words if item["phonetic"]),
            "with_forms": sum(1 for item in words if item["forms"]),
        },
        "words": words,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=0), encoding="utf-8", newline="\n")
    meta = payload["meta"]
    print(f"写入 {OUT.name}: {meta['count']} 词（core {meta['core']} / plus {meta['plus']}）")
    print(f"有音标 {meta['with_phonetic']}，有词形 {meta['with_forms']}，跳过 {meta['skipped']}")
    print("样例：")
    for item in words[:3]:
        print(f"  {item['word']}  /{item['phonetic']}/  {item['senses'][:60]}  {item['forms'][:40]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
