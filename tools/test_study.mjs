/**
 * 学习引擎的单元测试：间隔重复、统计、组卡、CSV 导入导出。
 * 运行：node tools/test_study.mjs
 * Node 24 直接以类型擦除方式执行 .ts 源码，无需编译。
 */
import assert from 'node:assert/strict';
import {
  DAY_MS,
  RELEARN_MS,
  MIN_EASE,
  MAX_EVENTS,
  GRADE_LABEL,
  formatDateTime,
  relTime,
  freshProgress,
  intervalLabel,
  isDue,
  isMastered,
  mastery,
  schedule,
} from '../src/lib/srs.ts';
import {
  accuracy,
  addDays,
  bumpStat,
  dayKey,
  getStat,
  lastNDays,
  monthMatrix,
  streak,
  summarize,
  weekSeries,
} from '../src/lib/stats.ts';
import {
  DEFAULT_DRAW_COUNT,
  MAX_DRAW_COUNT,
  applyAnswer,
  buildQueue,
  countByFilter,
  estimateMinutes,
  filterWords,
  isStarred,
  learnedToday,
  normalizeDrawCount,
  queueSummary,
  remainingNew,
  setStars,
  shuffle,
  starredWords,
  toggleStar,
  unstarAll,
} from '../src/lib/study.ts';
import { defaultState, normalizeState } from '../src/lib/storeState.ts';
import { exportCsv, exportWordlistText, parseCsv, splitCsvLine } from '../src/lib/csv.ts';

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
};

const NOW = new Date(2026, 9, 21, 9, 0, 0).getTime(); // 2026-10-21 09:00 本地时间

const emptyState = () => ({
  version: 1,
  progress: {},
  stats: {},
  settings: { dailyGoal: 10, theme: 'system', wrongFirst: true },
  custom: [],
  updatedAt: 0,
});

const makeWords = (count) =>
  Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    word: `word${index + 1}`,
    phoneticUK: '/w/',
    phoneticUS: '/w/',
    senses: [{ pos: 'n.', def: `释义 ${index + 1}` }],
    forms: {},
    altPron: [],
    source: 'test',
    topic: index % 2 === 0 ? '学术' : '社会',
    level: index % 3 === 0 ? 'plus' : 'core',
  }));

/* ---------------- 间隔重复 ---------------- */

check('新词评「会了」→ 间隔 1 天', () => {
  const next = schedule(undefined, 'good', NOW, 'abandon');
  assert.equal(next.interval, 1);
  assert.equal(next.reps, 1);
  assert.equal(next.due, NOW + DAY_MS);
  assert.equal(next.lapses, 0);
  assert.equal(next.correct, 1);
  assert.equal(next.learnedAt, NOW);
});

check('第二次「会了」按 ease 放大间隔', () => {
  const first = schedule(undefined, 'good', NOW, 'abandon');
  const second = schedule(first, 'good', NOW, 'abandon');
  assert.equal(second.ease, 2.7); // 2.5 + 0.1 + 0.1
  assert.equal(second.interval, 2.7); // 1 × 2.7
  assert.equal(second.reps, 2);
  assert.equal(second.due, NOW + Math.round(2.7 * DAY_MS));
});

check('「忘了」→ 10 分钟后重来，lapses +1，ease 下调', () => {
  const prev = schedule(undefined, 'good', NOW, 'abandon');
  const next = schedule(prev, 'again', NOW, 'abandon');
  assert.equal(next.reps, 0);
  assert.equal(next.lapses, 1);
  assert.equal(next.due, NOW + RELEARN_MS);
  assert.equal(next.interval, RELEARN_MS / DAY_MS);
  assert.ok(next.ease < prev.ease);
  assert.equal(next.lastGrade, 'again');
});

check('反复答错时 ease 不会低于下限', () => {
  let progress = freshProgress('abandon', NOW);
  for (let index = 0; index < 12; index += 1) progress = schedule(progress, 'again', NOW);
  assert.equal(progress.ease, MIN_EASE);
});

check('「模糊」小幅推进且降难度', () => {
  const prev = schedule(undefined, 'good', NOW, 'abandon'); // interval 1, ease 2.6
  const next = schedule(prev, 'hard', NOW, 'abandon');
  assert.equal(next.interval, 1.2);
  assert.equal(next.ease, 2.45);
  assert.ok(next.due > NOW);
});

check('间隔不会超过上限 180 天', () => {
  let progress = schedule(undefined, 'good', NOW, 'abandon');
  for (let index = 0; index < 40; index += 1) progress = schedule(progress, 'good', NOW);
  assert.equal(progress.interval, 180);
});

check('isDue 与 isMastered', () => {
  const progress = schedule(undefined, 'good', NOW, 'abandon');
  assert.equal(isDue(progress, NOW), false);
  assert.equal(isDue(progress, NOW + DAY_MS), true);
  assert.equal(isDue(undefined, NOW), false);
  assert.equal(isMastered(schedule(undefined, 'good', NOW, 'a')), false);
});

check('intervalLabel 与 mastery', () => {
  assert.equal(intervalLabel(0), '现在');
  assert.equal(intervalLabel(RELEARN_MS / DAY_MS), '10 分钟');
  assert.equal(intervalLabel(3), '3 天');
  const low = mastery(freshProgress('a', NOW));
  const high = mastery(schedule(undefined, 'good', NOW, 'a'));
  assert.ok(high >= low);
  assert.ok(low >= 0 && high <= 100);
});

/* ---------------- 日期与统计 ---------------- */

check('dayKey / addDays 跨月正确', () => {
  assert.equal(dayKey(NOW), '2026-10-21');
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-11-01', -1), '2026-10-31');
});

check('bumpStat 不改原对象', () => {
  const base = {};
  const next = bumpStat(base, '2026-10-21', { learned: 2, correct: 1 });
  assert.deepEqual(base, {});
  assert.equal(getStat(next, '2026-10-21').learned, 2);
  assert.equal(getStat(base, '2026-10-21').learned, 0);
});

check('连续打卡：今天有活动则计入', () => {
  const stats = {
    '2026-10-21': { learned: 1, reviewed: 0, correct: 1, wrong: 0 },
    '2026-10-20': { learned: 1, reviewed: 0, correct: 1, wrong: 0 },
    '2026-10-18': { learned: 1, reviewed: 0, correct: 1, wrong: 0 },
  };
  assert.equal(streak(stats, NOW), 2);
});

check('连续打卡：今天还没学时从昨天算', () => {
  const stats = { '2026-10-20': { learned: 3, reviewed: 0, correct: 3, wrong: 0 } };
  assert.equal(streak(stats, NOW), 1);
  assert.equal(streak({}, NOW), 0);
});

check('lastNDays 返回按时间正序', () => {
  const days = lastNDays({}, 7, NOW);
  assert.equal(days.length, 7);
  assert.equal(days[6].key, '2026-10-21');
  assert.equal(days[0].key, '2026-10-15');
});

check('weekSeries 从周一开始共 7 天', () => {
  const week = weekSeries({}, NOW);
  assert.equal(week.length, 7);
  assert.equal(week[0].label, '一');
  assert.equal(week[6].key, '2026-10-25'); // 2026-10-21 是周三，周日是 25 号
});

check('monthMatrix 每行 7 格且包含整月', () => {
  const weeks = monthMatrix({}, 2026, 10);
  for (const row of weeks) assert.equal(row.length, 7);
  const inMonth = weeks.flat().filter((cell) => cell.inMonth);
  assert.equal(inMonth.length, 31);
  assert.equal(inMonth[0].day, 1);
  assert.equal(inMonth[30].day, 31);
});

check('accuracy 与 summarize', () => {
  assert.equal(accuracy({ learned: 0, reviewed: 0, correct: 0, wrong: 0 }), null);
  assert.equal(accuracy({ learned: 0, reviewed: 0, correct: 3, wrong: 1 }), 75);

  const progress = {
    a: schedule(undefined, 'good', NOW, 'a'),
    b: schedule(schedule(schedule(undefined, 'good', NOW, 'b'), 'good', NOW, 'b'), 'good', NOW, 'b'),
  };
  const summary = summarize(progress, NOW);
  assert.equal(summary.touched, 2);
  assert.equal(summary.due, 0);
  assert.equal(summary.wrongBook, 0);
  assert.ok(summary.averageMastery >= 0);
  assert.deepEqual(summarize({}, NOW), {
    touched: 0,
    mastered: 0,
    due: 0,
    wrongBook: 0,
    averageMastery: 0,
  });
});

/* ---------------- 组卡与评分 ---------------- */

check('混合模式按每日目标取新词', () => {
  const words = makeWords(30);
  const queue = buildQueue(words, emptyState(), NOW, { limit: 60, dailyGoal: 10 });
  assert.equal(queue.length, 10);
  assert.ok(queue.every((item) => item.kind === 'new'));
});

check('已到期的词优先安排复习', () => {
  const words = makeWords(5);
  const state = emptyState();
  state.progress.word1 = { ...freshProgress('word1', NOW), due: NOW - DAY_MS };
  state.progress.word2 = { ...freshProgress('word2', NOW), due: NOW - 2 * DAY_MS };
  const queue = buildQueue(words, state, NOW, { limit: 10, dailyGoal: 5 });
  assert.deepEqual(
    queue.slice(0, 2).map((item) => item.entry.word),
    ['word2', 'word1'],
  );
  assert.ok(queue.slice(0, 2).every((item) => item.kind === 'review'));
});

check('mode=review 只给到期卡片', () => {
  const words = makeWords(5);
  const state = emptyState();
  state.progress.word1 = { ...freshProgress('word1', NOW), due: NOW - 1000 };
  const queue = buildQueue(words, state, NOW, { limit: 10, dailyGoal: 5, mode: 'review' });
  assert.equal(queue.length, 1);
  assert.equal(queue[0].entry.word, 'word1');
});

check('mode=wrong 只给错题', () => {
  const words = makeWords(5);
  const state = emptyState();
  state.progress.word3 = { ...freshProgress('word3', NOW), lapses: 2, due: NOW + DAY_MS };
  const queue = buildQueue(words, state, NOW, { limit: 10, dailyGoal: 5, mode: 'wrong' });
  assert.equal(queue.length, 1);
  assert.equal(queue[0].kind, 'wrong');
});

check('主题与难度筛选生效', () => {
  const words = makeWords(12);
  const byTopic = buildQueue(words, emptyState(), NOW, {
    limit: 20,
    dailyGoal: 20,
    topic: '学术',
  });
  assert.ok(byTopic.every((item) => item.entry.topic === '学术'));
  const byLevel = buildQueue(words, emptyState(), NOW, {
    limit: 20,
    dailyGoal: 20,
    level: 'plus',
  });
  assert.ok(byLevel.every((item) => item.entry.level === 'plus'));
});

check('limit 生效且不重复', () => {
  const words = makeWords(30);
  const queue = buildQueue(words, emptyState(), NOW, { limit: 4, dailyGoal: 20 });
  assert.equal(queue.length, 4);
  assert.equal(new Set(queue.map((item) => item.entry.word)).size, 4);
});

check('applyAnswer 记录新词与复习', () => {
  const words = makeWords(3);
  let state = emptyState();
  state = applyAnswer(state, words[0].word, 'good', NOW);
  assert.equal(learnedToday(state, NOW), 1);
  assert.equal(remainingNew(state, NOW, 10), 9);
  assert.equal(state.progress[words[0].word].reps, 1);
  assert.equal(getStat(state.stats, '2026-10-21').correct, 1);

  const before = state.progress[words[0].word].due;
  state = applyAnswer(state, words[0].word, 'again', NOW + 1000);
  const day = getStat(state.stats, '2026-10-21');
  assert.equal(day.learned, 1); // 复习不再计新词
  assert.equal(day.reviewed, 1);
  assert.equal(day.wrong, 1);
  assert.equal(state.progress[words[0].word].lapses, 1);
  assert.ok(state.progress[words[0].word].due < before);
});

check('applyAnswer 不改入参状态', () => {
  const state = emptyState();
  const next = applyAnswer(state, 'abandon', 'good', NOW);
  assert.equal(Object.keys(state.progress).length, 0);
  assert.equal(Object.keys(next.progress).length, 1);
});

check('queueSummary 与 estimateMinutes', () => {
  const words = makeWords(4);
  const queue = buildQueue(words, emptyState(), NOW, { limit: 4, dailyGoal: 4 });
  const counts = queueSummary(queue);
  assert.equal(counts.new, 4);
  assert.equal(counts.review, 0);
  assert.equal(estimateMinutes([]), 1);
  assert.ok(estimateMinutes(queue) >= 1);
});

check('答错后该词会再次进入队列（人工模拟）', () => {
  const words = makeWords(3);
  let state = emptyState();
  const queue = buildQueue(words, state, NOW, { limit: 3, dailyGoal: 3 });
  const first = queue[0];
  state = applyAnswer(state, first.entry.word, 'again', NOW);
  const progress = state.progress[first.entry.word];
  assert.equal(progress.lapses, 1);
  assert.equal(isDue(progress, NOW + RELEARN_MS), true);
});

/* ---------------- CSV ---------------- */

check('splitCsvLine 处理引号与逗号', () => {
  assert.deepEqual(splitCsvLine('a,b,c'), ['a', 'b', 'c']);
  assert.deepEqual(splitCsvLine('a,"b,c",d'), ['a', 'b,c', 'd']);
  assert.deepEqual(splitCsvLine('a,"say ""hi""",b'), ['a', 'say "hi"', 'b']);
});

check('中文表头 CSV 可解析', () => {
  const result = parseCsv('单词,词性,释义\nmitigate,v.,减轻\nplausible,adj.,看似合理的');
  assert.equal(result.words.length, 2);
  assert.deepEqual(result.errors, []);
  assert.equal(result.words[0].word, 'mitigate');
  assert.equal(result.words[0].senses[0].pos, 'v.');
  assert.equal(result.words[0].senses[0].def, '减轻');
  assert.equal(result.words[0].custom, true);
});

check('无表头 CSV 按 单词,词性,释义 解析', () => {
  const result = parseCsv('mitigate,v.,减轻\nplausible,adj.,看似合理的');
  assert.equal(result.words.length, 2);
  assert.equal(result.words[1].word, 'plausible');
});

check('完整列头（含例句/主题/难度）', () => {
  const csv = [
    'word,uk,us,pos,def,example,zh,topic,level',
    'resilient,rɪˈzɪliənt,rɪˈzɪliənt,adj.,有弹性的,Children adapt fast.,孩子适应得快。,心理,plus',
  ].join('\n');
  const result = parseCsv(csv);
  assert.equal(result.words.length, 1);
  const entry = result.words[0];
  assert.equal(entry.phoneticUK, 'rɪˈzɪliənt');
  assert.equal(entry.topic, '心理');
  assert.equal(entry.level, 'plus');
  assert.equal(entry.example.en, 'Children adapt fast.');
});

check('非法词条与重复词条被拦下', () => {
  const csv = ['word,pos,def', 'mitigate,v.,减轻', '123abc,n.,数字', 'Mitigate,v.,重复', 'x,v.,'].join('\n');
  const result = parseCsv(csv);
  assert.equal(result.words.length, 1);
  assert.equal(result.words[0].word, 'mitigate');
  assert.equal(result.errors.length, 3);
});

check('空文件给出提示', () => {
  const result = parseCsv('   ');
  assert.equal(result.words.length, 0);
  assert.equal(result.errors.length, 1);
});

check('导出文本与 CSV 往返', () => {
  const words = parseCsv('单词,词性,释义\nmitigate,v.,减轻；缓和\nplausible,adj.,看似合理的').words;
  const text = exportWordlistText(words, '测试生词本');
  assert.ok(text.includes('测试生词本'));
  assert.ok(text.includes('1. mitigate'));
  assert.ok(text.includes('减轻'));

  const csv = exportCsv(words);
  assert.ok(csv.startsWith('word,uk,us,pos,def'));
  const back = parseCsv(csv);
  assert.equal(back.words.length, 2);
  assert.equal(back.words[0].word, 'mitigate');
});

/* ---------------- 作答时间线 ---------------- */

check('每次评分都写入 recent，最新在前', () => {
  const next = schedule(undefined, 'good', NOW, 'abandon');
  assert.equal(next.recent.length, 1);
  assert.deepEqual(next.recent[0], { at: NOW, grade: 'good' });
});

check('答错也记录时间线', () => {
  const next = schedule(undefined, 'again', NOW, 'abandon');
  assert.equal(next.recent[0].grade, 'again');
});

check('recent 最多保留 MAX_EVENTS 条且有序', () => {
  let item;
  for (let index = 0; index < 20; index += 1) {
    item = schedule(item, 'good', NOW + index * 1000, 'abandon');
  }
  assert.equal(item.recent.length, MAX_EVENTS);
  assert.equal(item.recent[0].at, NOW + 19 * 1000);
  for (let index = 1; index < item.recent.length; index += 1) {
    assert.ok(item.recent[index - 1].at > item.recent[index].at);
  }
});

check('时间格式与评分文案', () => {
  assert.equal(formatDateTime(NOW), '10-21 09:00');
  assert.equal(formatDateTime(undefined), '—');
  assert.equal(GRADE_LABEL.again, '忘了');
  assert.equal(GRADE_LABEL.good, '会了');
});

check('相对时间三档文案', () => {
  assert.equal(relTime(NOW - 30 * 1000, NOW), '刚刚');
  assert.equal(relTime(NOW - 2 * 60 * 60 * 1000, NOW), '2 小时前');
  assert.equal(relTime(NOW - 3 * DAY_MS, NOW), '3 天前');
  assert.equal(relTime(NOW - 31 * DAY_MS, NOW).length, 5);
  assert.equal(relTime(undefined, NOW), '—');
});

/* ---------------- 随机抽选 ---------------- */

const lcg = (seed) => {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
};

check('抽选数量：非法输入回落默认值', () => {
  assert.equal(normalizeDrawCount(''), DEFAULT_DRAW_COUNT);
  assert.equal(normalizeDrawCount(undefined), DEFAULT_DRAW_COUNT);
  assert.equal(normalizeDrawCount(Number.NaN), DEFAULT_DRAW_COUNT);
  assert.equal(normalizeDrawCount(0), DEFAULT_DRAW_COUNT);
  assert.equal(normalizeDrawCount(-3), DEFAULT_DRAW_COUNT);
  assert.equal(normalizeDrawCount(3.7), 4);
  assert.equal(normalizeDrawCount('15'), 15);
  assert.equal(normalizeDrawCount(9999), MAX_DRAW_COUNT);
});

check('洗牌可注入随机源，结果确定', () => {
  const source = [1, 2, 3, 4, 5, 6, 7, 8];
  const first = shuffle(source, lcg(7));
  const second = shuffle(source, lcg(7));
  assert.deepEqual(first, second);
  assert.deepEqual([...first].sort((a, b) => a - b), source);
  assert.deepEqual(source, [1, 2, 3, 4, 5, 6, 7, 8]);
});

check('随机抽选只从学过的词里抽', () => {
  const words = makeWords(8);
  let state = emptyState();
  state.progress = {
    word2: schedule(undefined, 'good', NOW, 'word2'),
    word5: schedule(undefined, 'good', NOW, 'word5'),
  };
  const queue = buildQueue(words, state, NOW, {
    limit: 60,
    dailyGoal: 10,
    mode: 'random',
    count: 2,
    random: lcg(3),
  });
  assert.equal(queue.length, 2);
  assert.ok(queue.every((item) => item.kind === 'random'));
  assert.deepEqual([...queue.map((item) => item.entry.word)].sort(), ['word2', 'word5']);
});

check('随机抽选不消耗每日新词额度', () => {
  const words = makeWords(10);
  const state = emptyState();
  const queue = buildQueue(words, state, NOW, {
    limit: 60,
    dailyGoal: 2,
    mode: 'random',
    count: 6,
    random: lcg(5),
  });
  assert.equal(queue.length, 6);
  assert.ok(queue.every((item) => item.kind === 'random'));

  const answered = applyAnswer(state, queue[0].entry.word, 'good', NOW, { countsAsNew: false });
  assert.equal(learnedToday(answered, NOW), 0);
  assert.equal(getStat(answered.stats, dayKey(NOW)).reviewed, 1);
  assert.ok(answered.progress[queue[0].entry.word] !== undefined);
});

check('默认评分仍然计入新词额度', () => {
  const state = emptyState();
  const answered = applyAnswer(state, 'abandon', 'good', NOW);
  assert.equal(learnedToday(answered, NOW), 1);
});

check('抽选张数超过池子时取满池', () => {
  const words = makeWords(4);
  let state = emptyState();
  state.progress = {
    word1: schedule(undefined, 'good', NOW, 'word1'),
    word3: schedule(undefined, 'good', NOW, 'word3'),
  };
  const queue = buildQueue(words, state, NOW, {
    limit: 60,
    dailyGoal: 10,
    mode: 'random',
    count: 999,
    random: lcg(9),
  });
  assert.equal(queue.length, 2);
});

/* ---------------- 重点标记 ---------------- */

check('星标切换与批量操作', () => {
  const state = emptyState();
  const starred = toggleStar(state, 'abandon', NOW);
  assert.ok(isStarred(starred, 'abandon'));
  assert.equal(isStarred(state, 'abandon'), false);
  const unstarred = toggleStar(starred, 'abandon', NOW);
  assert.equal(isStarred(unstarred, 'abandon'), false);

  const many = setStars(state, ['a', 'b', 'c'], NOW);
  assert.deepEqual(starredWords(many).sort(), ['a', 'b', 'c']);
  assert.deepEqual(starredWords(unstarAll(many, NOW)), []);
});

check('星标不影响「已学」判定', () => {
  const words = makeWords(6);
  const state = toggleStar(emptyState(), 'word3', NOW);
  assert.equal(learnedToday(state, NOW), 0);
  const queue = buildQueue(words, state, NOW, { limit: 10, dailyGoal: 10, mode: 'new' });
  assert.ok(queue.some((item) => item.entry.word === 'word3'));
  assert.equal(queue.filter((item) => item.kind === 'new').length, 6);
});

check('starredOnly 只抽重点词', () => {
  const words = makeWords(6);
  const state = setStars(emptyState(), ['word2', 'word5'], NOW);
  const queue = buildQueue(words, state, NOW, {
    limit: 10,
    dailyGoal: 10,
    mode: 'new',
    starredOnly: true,
  });
  assert.deepEqual([...queue.map((item) => item.entry.word)].sort(), ['word2', 'word5']);
});

/* ---------------- 筛选 ---------------- */

check('六种筛选条件各自的命中集合', () => {
  const words = makeWords(6);
  const state = emptyState();
  state.progress = {
    word1: { ...freshProgress('word1', NOW), reps: 5, interval: 30 },
    word2: { ...freshProgress('word2', NOW), reps: 1, interval: 1 },
    word3: { ...freshProgress('word3', NOW), reps: 2, interval: 4, lapses: 2 },
  };

  assert.equal(filterWords(words, state, 'all', NOW).length, 6);
  assert.deepEqual(
    filterWords(words, state, 'wrong', NOW).map((entry) => entry.word),
    ['word3'],
  );
  assert.deepEqual(
    filterWords(words, state, 'mastered', NOW).map((entry) => entry.word),
    ['word1'],
  );
  assert.deepEqual(
    filterWords(words, state, 'learning', NOW).map((entry) => entry.word),
    ['word2', 'word3'],
  );
  assert.deepEqual(
    filterWords(words, state, 'new', NOW).map((entry) => entry.word),
    ['word4', 'word5', 'word6'],
  );

  const starred = setStars(state, ['word6'], NOW);
  assert.deepEqual(
    filterWords(words, starred, 'star', NOW).map((entry) => entry.word),
    ['word6'],
  );

  const counts = countByFilter(words, state, NOW);
  assert.equal(counts.all, 6);
  assert.equal(counts.new, 3);
  assert.equal(counts.learning + counts.mastered + counts.new, 6);
});

/* ---------------- 老数据兼容 ---------------- */

check('老版本 state 经 normalize 补齐字段', () => {
  const legacy = {
    version: 1,
    progress: {
      abandon: {
        word: 'abandon',
        reps: 2,
        interval: 3,
        ease: 2.6,
        due: NOW,
        lapses: 0,
        correct: 2,
        learnedAt: NOW,
      },
    },
    stats: {},
    settings: { dailyGoal: 15, theme: 'dark', wrongFirst: false },
    custom: [],
    updatedAt: 1,
  };
  const next = normalizeState(legacy);
  assert.equal(next.version, 2);
  assert.deepEqual(next.stars, {});
  assert.equal(next.settings.drawCount, 20);
  assert.equal(next.settings.hideMeaning, false);
  assert.equal(next.settings.dailyGoal, 15);
  assert.deepEqual(next.progress.abandon.recent, []);
});

check('脏数据被丢弃：数组型 stars、超长 recent', () => {
  const longRecent = Array.from({ length: 30 }, (_, index) => ({ at: NOW + index, grade: 'good' }));
  const dirty = {
    ...defaultState(),
    stars: ['abandon', 'record'],
    progress: { abandon: { ...freshProgress('abandon', NOW), recent: longRecent } },
  };
  const next = normalizeState(dirty);
  assert.deepEqual(next.stars, {});
  assert.equal(next.progress.abandon.recent.length, MAX_EVENTS);
});

console.log(`\n学习引擎测试：${passed} 项全部通过`);
