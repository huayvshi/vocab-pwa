# -*- coding: utf-8 -*-
"""生成 100 词验证词库 -> public/data/vocab.json
格式紧凑：每条 = (单词, 英音, 美音, 释义, 变形, 多音说明)
释义用 "||" 分隔义项，"|" 分隔词性与释义；变形用 "past=abandoned, pp=abandoned"
"""
import json
import os

from examples_data import EXAMPLES, TAGS
from roots import root_index, roots_of

TOPICS = ("学术", "社会", "经济", "科技", "心理", "环境", "教育", "法律", "健康")

# (word, uk, us, senses, forms, alt_pron_note)
RAW = [
    ("abandon", "əˈbændən", "əˈbændən", "v. | 放弃；抛弃；遗弃", "past=abandoned, pp=abandoned, ing=abandoning", None),
    ("abstract", "ˈæbstrækt", "ˈæbstrækt", "adj. | 抽象的；理论上的 || n. | 摘要；概要", "pl=abstracts", None),
    ("account", "əˈkaʊnt", "əˈkaʊnt", "n. | 账户；解释；描述 || v. | 解释；占比", "pl=accounts, past=accounted, ing=accounting", None),
    ("acknowledge", "əkˈnɒlɪdʒ", "əkˈnɑːlɪdʒ", "v. | 承认；致谢；确认收到", "past=acknowledged, pp=acknowledged, ing=acknowledging", None),
    ("acquire", "əˈkwaɪə", "əˈkwaɪər", "v. | 获得；学到；养成（习惯）", "past=acquired, pp=acquired, ing=acquiring", None),
    ("adapt", "əˈdæpt", "əˈdæpt", "v. | 适应；改编；改写", "past=adapted, pp=adapted, ing=adapting", None),
    ("adequate", "ˈædɪkwət", "ˈædɪkwət", "adj. | 足够的；适当的；胜任的", None, None),
    ("advocate", "ˈædvəkət", "ˈædvəkət", "v. | 提倡；主张 || n. | 拥护者；辩护人", "pl=advocates, past=advocated, ing=advocating", ("v.", "ˈædvəkeɪt")),
    ("ambiguous", "æmˈbɪɡjuəs", "æmˈbɪɡjuəs", "adj. | 模棱两可的；含糊不清的", None, None),
    ("analyze", "ˈænəlaɪz", "ˈænəlaɪz", "v. | 分析；解析", "past=analyzed, pp=analyzed, ing=analyzing", None),
    ("anticipate", "ænˈtɪsɪpeɪt", "ænˈtɪsɪpeɪt", "v. | 预料；期望；预先处理", "past=anticipated, pp=anticipated, ing=anticipating", None),
    ("apparent", "əˈpærənt", "əˈpærənt", "adj. | 明显的；表面上的", None, None),
    ("approach", "əˈprəʊtʃ", "əˈproʊtʃ", "n. | 方法；途径；接近 || v. | 接近；着手处理", "pl=approaches, past=approached, ing=approaching", None),
    ("arbitrary", "ˈɑːbɪtrəri", "ˈɑːrbətreri", "adj. | 任意的；武断的；专横的", None, None),
    ("assess", "əˈses", "əˈses", "v. | 评估；估价；对…处以罚款", "past=assessed, pp=assessed, ing=assessing", None),
    ("assume", "əˈsjuːm", "əˈsuːm", "v. | 假定；认为；承担；呈现", "past=assumed, pp=assumed, ing=assuming", None),
    ("attribute", "əˈtrɪbjuːt", "əˈtrɪbjuːt", "v. | 把…归因于；认为…属于 || n. | 属性；特征", "pl=attributes, past=attributed, ing=attributing", ("n.", "ˈætrɪbjuːt")),
    ("available", "əˈveɪləbl", "əˈveɪləbl", "adj. | 可获得的；可用的；有空的", None, None),
    ("benefit", "ˈbenɪfɪt", "ˈbenɪfɪt", "n. | 利益；好处；津贴 || v. | 使受益；受益", "pl=benefits, past=benefited, ing=benefiting", None),
    ("capacity", "kəˈpæsəti", "kəˈpæsəti", "n. | 容量；能力；身份；职位", "pl=capacities", None),
    ("cognitive", "ˈkɒɡnətɪv", "ˈkɑːɡnətɪv", "adj. | 认知的；认识的", None, None),
    ("compensate", "ˈkɒmpenseɪt", "ˈkɑːmpenseɪt", "v. | 补偿；赔偿；抵消", "past=compensated, pp=compensated, ing=compensating", None),
    ("complex", "ˈkɒmpleks", "kɑːmˈpleks", "adj. | 复杂的；复合的 || n. | 综合体；情结", "pl=complexes", ("n.", "ˈkɒmpleks")),
    ("comprehensive", "ˌkɒmprɪˈhensɪv", "ˌkɑːmprɪˈhensɪv", "adj. | 综合的；全面的；理解的", None, None),
    ("conclude", "kənˈkluːd", "kənˈkluːd", "v. | 得出结论；结束；缔结", "past=concluded, pp=concluded, ing=concluding", None),
    ("consensus", "kənˈsensəs", "kənˈsensəs", "n. | 共识；一致意见", "pl=consensuses", None),
    ("consequence", "ˈkɒnsɪkwəns", "ˈkɑːnsəkwens", "n. | 结果；后果；重要性", "pl=consequences", None),
    ("considerable", "kənˈsɪdərəbl", "kənˈsɪdərəbl", "adj. | 相当大的；值得考虑的", None, None),
    ("constitute", "ˈkɒnstɪtjuːt", "ˈkɑːnstətuːt", "v. | 构成；组成；设立", "past=constituted, pp=constituted, ing=constituting", None),
    ("contradict", "ˌkɒntrəˈdɪkt", "ˌkɑːntrəˈdɪkt", "v. | 反驳；与…矛盾", "past=contradicted, pp=contradicted, ing=contradicting", None),
    ("controversy", "ˈkɒntrəvɜːsi", "ˈkɑːntrəvɜːrsi", "n. | 争议；争论", "pl=controversies", None),
    ("conventional", "kənˈvenʃənl", "kənˈvenʃənl", "adj. | 传统的；常规的；会议的", None, None),
    ("crucial", "ˈkruːʃl", "ˈkruːʃl", "adj. | 关键的；决定性的", None, None),
    ("cultivate", "ˈkʌltɪveɪt", "ˈkʌltɪveɪt", "v. | 培养；耕作；结交", "past=cultivated, pp=cultivated, ing=cultivating", None),
    ("decline", "dɪˈklaɪn", "dɪˈklaɪn", "v. | 下降；衰退；婉拒 || n. | 下降；衰落", "pl=declines, past=declined, ing=declining", None),
    ("demonstrate", "ˈdemənstreɪt", "ˈdemənstreɪt", "v. | 证明；演示；示威", "past=demonstrated, pp=demonstrated, ing=demonstrating", None),
    ("derive", "dɪˈraɪv", "dɪˈraɪv", "v. | 源自；获得；推导", "past=derived, pp=derived, ing=deriving", None),
    ("diminish", "dɪˈmɪnɪʃ", "dɪˈmɪnɪʃ", "v. | 减少；削弱；贬低", "past=diminished, pp=diminished, ing=diminishing", None),
    ("distinguish", "dɪˈstɪŋɡwɪʃ", "dɪˈstɪŋɡwɪʃ", "v. | 区分；辨别；使杰出", "past=distinguished, pp=distinguished, ing=distinguishing", None),
    ("distribute", "dɪˈstrɪbjuːt", "dɪˈstrɪbjuːt", "v. | 分配；分发；分布", "past=distributed, pp=distributed, ing=distributing", None),
    ("diverse", "daɪˈvɜːs", "daɪˈvɜːrs", "adj. | 多样的；不同的", None, None),
    ("dominant", "ˈdɒmɪnənt", "ˈdɑːmɪnənt", "adj. | 占主导的；显性的", None, None),
    ("eliminate", "ɪˈlɪmɪneɪt", "ɪˈlɪmɪneɪt", "v. | 消除；淘汰；排除", "past=eliminated, pp=eliminated, ing=eliminating", None),
    ("emerge", "ɪˈmɜːdʒ", "ɪˈmɜːrdʒ", "v. | 出现；浮现；显露", "past=emerged, pp=emerged, ing=emerging", None),
    ("emphasize", "ˈemfəsaɪz", "ˈemfəsaɪz", "v. | 强调；着重", "past=emphasized, pp=emphasized, ing=emphasizing", None),
    ("enhance", "ɪnˈhɑːns", "ɪnˈhæns", "v. | 提高；增强；增进", "past=enhanced, pp=enhanced, ing=enhancing", None),
    ("enormous", "ɪˈnɔːməs", "ɪˈnɔːrməs", "adj. | 巨大的；庞大的", None, None),
    ("essential", "ɪˈsenʃl", "ɪˈsenʃl", "adj. | 必要的；本质的 || n. | 要素；必需品", "pl=essentials", None),
    ("establish", "ɪˈstæblɪʃ", "ɪˈstæblɪʃ", "v. | 建立；确立；证实", "past=established, pp=established, ing=establishing", None),
    ("evaluate", "ɪˈvæljueɪt", "ɪˈvæljueɪt", "v. | 评价；评估", "past=evaluated, pp=evaluated, ing=evaluating", None),
    ("evident", "ˈevɪdənt", "ˈevɪdənt", "adj. | 明显的；显然的", None, None),
    ("evolve", "ɪˈvɒlv", "ɪˈvɑːlv", "v. | 演变；进化；逐步发展", "past=evolved, pp=evolved, ing=evolving", None),
    ("exceed", "ɪkˈsiːd", "ɪkˈsiːd", "v. | 超过；超越；胜过", "past=exceeded, pp=exceeded, ing=exceeding", None),
    ("explicit", "ɪkˈsplɪsɪt", "ɪkˈsplɪsɪt", "adj. | 明确的；直白的", None, None),
    ("exploit", "ɪkˈsplɔɪt", "ɪkˈsplɔɪt", "v. | 利用；开发；剥削", "past=exploited, pp=exploited, ing=exploiting", None),
    ("facilitate", "fəˈsɪlɪteɪt", "fəˈsɪlɪteɪt", "v. | 促进；使便利", "past=facilitated, pp=facilitated, ing=facilitating", None),
    ("fundamental", "ˌfʌndəˈmentl", "ˌfʌndəˈmentl", "adj. | 根本的；基础的 || n. | 基本原则；基础", "pl=fundamentals", None),
    ("generate", "ˈdʒenəreɪt", "ˈdʒenəreɪt", "v. | 产生；引起；生成", "past=generated, pp=generated, ing=generating", None),
    ("hypothesis", "haɪˈpɒθəsɪs", "haɪˈpɑːθəsɪs", "n. | 假设；前提", "pl=hypotheses", None),
    ("identify", "aɪˈdentɪfaɪ", "aɪˈdentɪfaɪ", "v. | 识别；确认；认同", "past=identified, pp=identified, ing=identifying", None),
    ("illustrate", "ˈɪləstreɪt", "ˈɪləstreɪt", "v. | 说明；举例；给…加插图", "past=illustrated, pp=illustrated, ing=illustrating", None),
    ("implement", "ˈɪmplɪment", "ˈɪmplɪment", "v. | 实施；执行 || n. | 工具；器械", "past=implemented, pp=implemented, ing=implementing", None),
    ("imply", "ɪmˈplaɪ", "ɪmˈplaɪ", "v. | 暗示；意味着", "past=implied, pp=implied, ing=implying", None),
    ("impose", "ɪmˈpəʊz", "ɪmˈpoʊz", "v. | 强加；征收；把…强加于", "past=imposed, pp=imposed, ing=imposing", None),
    ("incentive", "ɪnˈsentɪv", "ɪnˈsentɪv", "n. | 激励；动机；奖励", "pl=incentives", None),
    ("indicate", "ˈɪndɪkeɪt", "ˈɪndɪkeɪt", "v. | 表明；指示；暗示", "past=indicated, pp=indicated, ing=indicating", None),
    ("inevitable", "ɪnˈevɪtəbl", "ɪnˈevɪtəbl", "adj. | 不可避免的；必然的", None, None),
    ("inherit", "ɪnˈherɪt", "ɪnˈherɪt", "v. | 继承；遗传", "past=inherited, pp=inherited, ing=inheriting", None),
    ("innovation", "ˌɪnəˈveɪʃn", "ˌɪnəˈveɪʃn", "n. | 创新；革新；新事物", "pl=innovations", None),
    ("integrate", "ˈɪntɪɡreɪt", "ˈɪntɪɡreɪt", "v. | 整合；使合并；融入", "past=integrated, pp=integrated, ing=integrating", None),
    ("interpret", "ɪnˈtɜːprɪt", "ɪnˈtɜːrprət", "v. | 解释；理解；口译", "past=interpreted, pp=interpreted, ing=interpreting", None),
    ("justify", "ˈdʒʌstɪfaɪ", "ˈdʒʌstɪfaɪ", "v. | 证明…正当；为…辩护", "past=justified, pp=justified, ing=justifying", None),
    ("legitimate", "lɪˈdʒɪtɪmət", "lɪˈdʒɪtɪmət", "adj. | 合法的；合理的；正当的", None, None),
    ("maintain", "meɪnˈteɪn", "meɪnˈteɪn", "v. | 维持；保养；主张", "past=maintained, pp=maintained, ing=maintaining", None),
    ("manipulate", "məˈnɪpjuleɪt", "məˈnɪpjuleɪt", "v. | 操纵；控制；操作", "past=manipulated, pp=manipulated, ing=manipulating", None),
    ("mechanism", "ˈmekənɪzəm", "ˈmekənɪzəm", "n. | 机制；机理；机械装置", "pl=mechanisms", None),
    ("negative", "ˈneɡətɪv", "ˈneɡətɪv", "adj. | 消极的；否定的；负的 || n. | 否定；负数", "pl=negatives", None),
    ("objective", "əbˈdʒektɪv", "əbˈdʒektɪv", "n. | 目标；目的 || adj. | 客观的；无偏见的", "pl=objectives", None),
    ("obtain", "əbˈteɪn", "əbˈteɪn", "v. | 获得；得到；通行", "past=obtained, pp=obtained, ing=obtaining", None),
    ("phenomenon", "fəˈnɒmɪnən", "fəˈnɑːmɪnɑːn", "n. | 现象；非凡的人（事）", "pl=phenomena", None),
    ("potential", "pəˈtenʃl", "pəˈtenʃl", "adj. | 潜在的；可能的 || n. | 潜力；可能性", "pl=potentials", None),
    ("precise", "prɪˈsaɪs", "prɪˈsaɪs", "adj. | 精确的；准确的；严谨的", None, None),
    ("predict", "prɪˈdɪkt", "prɪˈdɪkt", "v. | 预测；预言", "past=predicted, pp=predicted, ing=predicting", None),
    ("principle", "ˈprɪnsəpl", "ˈprɪnsəpl", "n. | 原则；原理；准则", "pl=principles", None),
    ("pursue", "pəˈsjuː", "pərˈsuː", "v. | 追求；追赶；继续从事", "past=pursued, pp=pursued, ing=pursuing", None),
    ("radical", "ˈrædɪkl", "ˈrædɪkl", "adj. | 激进的；根本的；彻底的 || n. | 激进分子", "pl=radicals", None),
    ("reduce", "rɪˈdjuːs", "rɪˈduːs", "v. | 减少；降低；使沦为", "past=reduced, pp=reduced, ing=reducing", None),
    ("reliable", "rɪˈlaɪəbl", "rɪˈlaɪəbl", "adj. | 可靠的；可信赖的", None, None),
    ("restrict", "rɪˈstrɪkt", "rɪˈstrɪkt", "v. | 限制；约束；限定", "past=restricted, pp=restricted, ing=restricting", None),
    ("reveal", "rɪˈviːl", "rɪˈviːl", "v. | 揭示；显示；透露", "past=revealed, pp=revealed, ing=revealing", None),
    ("significant", "sɪɡˈnɪfɪkənt", "sɪɡˈnɪfɪkənt", "adj. | 重要的；显著的；有意义的", None, None),
    ("substantial", "səbˈstænʃl", "səbˈstænʃl", "adj. | 大量的；实质的；坚固的", None, None),
    ("sufficient", "səˈfɪʃnt", "səˈfɪʃnt", "adj. | 充足的；足够的", None, None),
    ("transform", "trænsˈfɔːm", "trænsˈfɔːrm", "v. | 转变；改造；变换", "past=transformed, pp=transformed, ing=transforming", None),
    ("vulnerable", "ˈvʌlnərəbl", "ˈvʌlnərəbl", "adj. | 脆弱的；易受伤的；易受攻击的", None, None),
    # —— 多音词（按词性区分读音）——
    ("record", "ˈrekɔːd", "ˈrekərd", "n. | 记录；档案；唱片 || v. | 记录；录制", "pl=records, past=recorded, ing=recording", ("v.", "rɪˈkɔːd")),
    ("object", "ˈɒbdʒɪkt", "ˈɑːbdʒekt", "n. | 物体；目标；宾语 || v. | 反对；不赞成", "pl=objects, past=objected, ing=objecting", ("v.", "əbˈdʒekt")),
    ("present", "ˈpreznt", "ˈpreznt", "adj. | 现在的；出席的 || n. | 礼物；现在 || v. | 呈现；提出；授予", "pl=presents, past=presented, ing=presenting", ("v.", "prɪˈzent")),
    ("contract", "ˈkɒntrækt", "ˈkɑːntrækt", "n. | 合同；契约 || v. | 收缩；感染；订约", "pl=contracts, past=contracted, ing=contracting", ("v.", "kənˈtrækt")),
    ("project", "ˈprɒdʒekt", "ˈprɑːdʒekt", "n. | 项目；工程；课题 || v. | 投射；预计；投影", "pl=projects, past=projected, ing=projecting", ("v.", "prəˈdʒekt")),
]

SOURCE = "考研英语一 大纲词汇（100 词验证样本）"


def parse_senses(text):
    out = []
    for chunk in text.split("||"):
        chunk = chunk.strip()
        if not chunk:
            continue
        if "|" in chunk:
            pos, definition = chunk.split("|", 1)
            out.append({"pos": pos.strip(), "def": definition.strip()})
        else:
            out.append({"pos": "", "def": chunk})
    return out


def parse_forms(text):
    if not text:
        return {}
    out = {}
    for piece in text.split(","):
        if "=" not in piece:
            continue
        k, v = piece.split("=", 1)
        out[k.strip()] = v.strip()
    return out


def load_ecdict():
    """读取 import_ecdict.py 生成的大词表；没有就只用 100 词精选（便于无网环境构建）。"""
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ecdict_ky.json")
    if not os.path.exists(path):
        print("[warn] 缺少 ecdict_ky.json，只构建精选词表")
        return []
    with open(path, "r", encoding="utf-8") as f:
        payload = json.load(f)
    entries = []
    for item in payload["words"]:
        entries.append(
            {
                "word": item["word"],
                "phoneticUK": ("/%s/" % item["phonetic"]) if item["phonetic"] else "",
                "phoneticUS": "",
                "senses": parse_senses(item["senses"]),
                "forms": parse_forms(item["forms"]),
                "level": item["level"],
            }
        )
    print("[info] 词表 %d 词（%s）" % (len(entries), payload["meta"]["source"]))
    return entries


def build():
    curated = []
    for i, (word, uk, us, senses, forms, alt) in enumerate(RAW, start=1):
        example = EXAMPLES.get(word)
        tag = TAGS.get(word)
        entry = {
            "id": i,
            "word": word,
            "phoneticUK": "/%s/" % uk,
            "phoneticUS": "/%s/" % us,
            "senses": parse_senses(senses),
            "forms": parse_forms(forms),
            "altPron": ([{"pos": alt[0], "ipa": "/%s/" % alt[1]}] if alt else []),
            "source": SOURCE,
            "example": ({"en": example[0], "zh": example[1]} if example else None),
            "topic": (tag[0] if tag else None),
            "level": (tag[1] if tag else None),
        }
        curated.append(entry)

    curated_names = {item["word"].lower() for item in curated}
    merged = curated + [item for item in load_ecdict() if item["word"].lower() not in curated_names]

    words = []
    root_labels = {rid: info["label"] for rid, info in root_index().items()}
    for i, item in enumerate(merged, start=1):
        word = item["word"]
        root_ids = roots_of(word)
        words.append(
            {
                "id": i,
                "word": word,
                "phoneticUK": item["phoneticUK"],
                "phoneticUS": item.get("phoneticUS", ""),
                "senses": item["senses"],
                "forms": item["forms"],
                "altPron": item.get("altPron", []),
                "source": item.get("source", "ECDICT"),
                "example": item.get("example"),
                "topic": item.get("topic"),
                "level": item.get("level") or "plus",
                "roots": [root_labels[rid] for rid in root_ids],
                "rootIds": root_ids,
            }
        )

    # 校验
    names = [w["word"].lower() for w in words]
    assert len(set(names)) == len(names), "存在重复词条"
    assert len(words) >= len(curated), "合并后词条数不应少于精选词"
    for w in words:
        assert w["senses"], "%s 缺释义" % w["word"]
        assert not w["phoneticUK"] or (w["phoneticUK"].startswith("/") and w["phoneticUK"].endswith("/"))
        assert w["level"] in ("core", "plus"), "%s 的难度 %r 非法" % (w["word"], w["level"])
        if w["topic"] is not None:
            assert w["topic"] in TOPICS, "%s 的主题 %r 不在允许范围" % (w["word"], w["topic"])
        if w["example"] is not None:
            assert w["example"]["en"] and w["example"]["zh"], "%s 的例句不完整" % w["word"]

    # 校验变形的键
    valid_forms = {"past", "pp", "ing", "pl", "third", "comp", "sup"}
    for w in words:
        bad = set(w["forms"]) - valid_forms
        assert not bad, "%s 有未知变形键 %s" % (w["word"], bad)

    meta = {
        "name": "考研英语一 大纲词汇",
        "version": "1.0.0",
        "count": len(words),
        "builtAt": "2026-10-22",
        "source": "ECDICT（考研 tag=ky ∪ 高考 tag=gk）＋ 100 词精选（人工音标/例句/标签）",
        "note": "考研大纲词包含高考基础词，故为 6200+ 条；核心词 3053 条。词根为启发式匹配，仅供记忆参考；音频走词典接口，正式版需替换为已授权音频。",
    }
    return {"meta": meta, "words": words}


def main():
    data = build()
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_dir = os.path.join(root, "public", "data")
    os.makedirs(out_dir, exist_ok=True)

    # 词根索引与统计
    index = root_index()
    counts = {}
    for item in data["words"]:
        for root_id in item["rootIds"]:
            counts[root_id] = counts.get(root_id, 0) + 1
    covered = sum(1 for item in data["words"] if item["rootIds"])
    roots_payload = {
        "meta": {
            "count": len(index),
            "covered": covered,
            "total": len(data["words"]),
            "note": "一个词最多归 3 个词根，长词根片段优先；仅供记忆参考。",
        },
        "roots": [
            dict(index[root_id], count=counts.get(root_id, 0))
            for root_id in sorted(index, key=lambda rid: -(counts.get(rid, 0)))
        ],
    }

    out = os.path.join(out_dir, "vocab.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    roots_out = os.path.join(out_dir, "roots.json")
    with open(roots_out, "w", encoding="utf-8") as f:
        json.dump(roots_payload, f, ensure_ascii=False, separators=(",", ":"))

    print("wrote", out, "words", len(data["words"]))
    print("wrote", roots_out, "roots", len(index), "covered words", covered)
    by_pos = {}
    for w in data["words"]:
        for s in w["senses"]:
            by_pos[s["pos"]] = by_pos.get(s["pos"], 0) + 1
    print("senses per pos:", sorted(by_pos.items(), key=lambda kv: -kv[1])[:6])
    print("with forms:", sum(1 for w in data["words"] if w["forms"]))
    print("with phonetic:", sum(1 for w in data["words"] if w["phoneticUK"]))
    print("with example:", sum(1 for w in data["words"] if w["example"]))
    print("multi-pron:", [w["word"] for w in data["words"] if w["altPron"]])
    top = sorted(counts.items(), key=lambda kv: -kv[1])[:8]
    print("top roots:", [(index[rid]["label"], n) for rid, n in top])


if __name__ == "__main__":
    main()
