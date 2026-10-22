# -*- coding: utf-8 -*-
"""词根归类：把单词按 roots_data.ROOTS 归到词根族里。

规则刻意保守：
  * 只有命中 variants 里某个片段才算（contains 匹配）
  * 先看 exclude 清单（人工排除的误伤词）
  * 一个词最多归属 MAX_ROOTS_PER_WORD 个词根，长的片段优先（区分度更高）
"""
from roots_data import ROOTS

MAX_ROOTS_PER_WORD = 3

_BY_VARIANT = []
for _root in ROOTS:
    for _variant in _root["variants"]:
        _BY_VARIANT.append((_variant, _root["id"]))
# 长片段优先：`ceed` 比 `ced` 更能说明问题
_BY_VARIANT.sort(key=lambda pair: -len(pair[0]))

_EXCLUDE = {root["id"]: {word.lower() for word in root.get("exclude", [])} for root in ROOTS}
_INDEX = {root["id"]: root for root in ROOTS}


def roots_of(word):
    """返回该词命中的词根 id 列表（可能为空）。"""
    lowered = word.lower()
    hits = []
    for variant, root_id in _BY_VARIANT:
        if root_id in hits:
            continue
        if variant not in lowered:
            continue
        if lowered in _EXCLUDE[root_id]:
            continue
        hits.append(root_id)
        if len(hits) >= MAX_ROOTS_PER_WORD:
            break
    return hits


def root_index():
    """给前端用的词根字典（不含匹配规则）。"""
    return {
        root["id"]: {
            "id": root["id"],
            "label": root["label"],
            "meaning": root["meaning"],
            "gloss": root.get("gloss", ""),
            "examples": root.get("examples", []),
            "note": root.get("note", ""),
        }
        for root in ROOTS
    }


def audit(words):
    """统计覆盖情况，便于构建时打印与人眼核对。"""
    covered = []
    empty = []
    for word in words:
        if root_of := roots_of(word):
            covered.append((word, root_of))
        else:
            empty.append(word)
    return covered, empty
