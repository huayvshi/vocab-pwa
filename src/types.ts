export interface Sense {
  pos: string;
  def: string;
}

export interface AltPron {
  pos: string;
  ipa: string;
}

export interface Example {
  en: string;
  zh: string;
}

export interface WordEntry {
  id: number;
  word: string;
  phoneticUK: string;
  phoneticUS: string;
  senses: Sense[];
  forms: Record<string, string>;
  altPron: AltPron[];
  source: string;
  /** 例句：学习卡片与详情页共用 */
  example?: Example;
  /** 主题标签，如「学术」「社会」 */
  topic?: string;
  /** core = 高频核心，plus = 进阶 */
  level?: WordLevel;
  /** 词根标签，如 -ced- / -ceed- / -cess- */
  roots?: string[];
  /** 词根 id，用于按词根归类 */
  rootIds?: string[];
  /** 用户导入的自定义词条不参与内置统计 */
  custom?: boolean;
}

export interface RootInfo {
  id: string;
  /** 展示用标签，如「-ced- / -ceed- / -cess-」 */
  label: string;
  /** 词根含义，如「走；行进」 */
  meaning: string;
  /** 更口语的一句话解释 */
  gloss: string;
  /** 该词根下的代表词 */
  examples: string[];
  note?: string;
  /** 词库里命中该词根的词数 */
  count?: number;
}

export interface RootsMeta {
  count: number;
  covered: number;
  total: number;
  note: string;
}

export interface RootsFile {
  meta: RootsMeta;
  roots: RootInfo[];
}

export type WordLevel = 'core' | 'plus';

export interface VocabMeta {
  name: string;
  version: string;
  count: number;
  builtAt: string;
  source: string;
  note: string;
}

export interface VocabFile {
  meta: VocabMeta;
  words: WordEntry[];
}

export type Accent = 'uk' | 'us';

export type HitKind = 'exact' | 'form' | 'prefix' | 'contains' | 'zh' | 'fuzzy';

export interface SearchHit {
  entry: WordEntry;
  kind: HitKind;
  /** 命中说明，例如「studied 是 study 的过去式」 */
  note?: string;
}

export interface HistoryItem {
  word: string;
  at: number;
}

export interface PlayFallback {
  used: boolean;
  reason?: string;
}

/* ---------------- 学习与复习 ---------------- */

/** 一次回忆的自我评价：忘了 / 模糊 / 会了 */
export type Grade = 'again' | 'hard' | 'good';

/** 单次作答记录，用于词条的学习时间线 */
export interface ReviewEvent {
  at: number;
  grade: Grade;
}

/** 单个词的学习进度（间隔重复状态机） */
export interface WordProgress {
  word: string;
  /** 已连续答对次数（答错清零） */
  reps: number;
  /** 当前间隔天数，可为小数（10 分钟 = 0.0069 天） */
  interval: number;
  /** 难度系数，答错下调、答对上调 */
  ease: number;
  /** 下次到期时间戳（毫秒） */
  due: number;
  /** 答错次数，用于错题本 */
  lapses: number;
  /** 累计答对次数 */
  correct: number;
  /** 最近一次评分 */
  lastGrade?: Grade;
  lastAt?: number;
  /** 首次学习时间戳 */
  learnedAt: number;
  /** 最近若干次作答，最新的在前，最多 12 条 */
  recent?: ReviewEvent[];
}

/** 单日学习统计，key 为本地日期 YYYY-MM-DD */
export interface DailyStat {
  /** 当天首次接触的新词数 */
  learned: number;
  /** 当天复习次数（含答错的重复出现） */
  reviewed: number;
  /** 当天答对的次数 */
  correct: number;
  /** 当天答错的次数 */
  wrong: number;
}

export type ThemeMode = 'system' | 'light' | 'dark';

export interface Settings {
  /** 每日新词目标 */
  dailyGoal: number;
  theme: ThemeMode;
  /** 学习队列是否优先只练错题 */
  wrongFirst: boolean;
  /** 卡片是否默认盖住中文释义（自测用），缺省视为 false */
  hideMeaning?: boolean;
  /** 随机抽选的默认张数，缺省视为 20 */
  drawCount?: number;
}

/** 持久化到 IndexedDB 的全部学习状态 */
export interface StudyState {
  version: number;
  progress: Record<string, WordProgress>;
  stats: Record<string, DailyStat>;
  settings: Settings;
  /** 用户通过 CSV 导入的词条 */
  custom: WordEntry[];
  /** 重点标记：单词（原样）→ 标记时间戳 */
  stars?: Record<string, number>;
  /** 记录最近一次写入时间，便于调试与迁移 */
  updatedAt: number;
}

export interface QueueItem {
  entry: WordEntry;
  /** new = 从未学过；review = 到期复习；wrong = 错题重练；again = 本轮答错后再出现；random = 随机抽选 */
  kind: 'new' | 'review' | 'wrong' | 'again' | 'random';
  /** again 类型时的插入位置标记 */
  due?: number;
}

export interface SessionAnswer {
  word: string;
  grade: Grade;
  at: number;
}

export interface SessionSummary {
  answered: number;
  correct: number;
  wrong: number;
  newWords: number;
  startedAt: number;
}
