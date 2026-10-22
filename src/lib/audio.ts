import type { Accent } from '../types';

export type PlayState = 'idle' | 'loading' | 'playing' | 'fallback' | 'error';

/** 词典音频接口：type=0 英音，type=1 美音 */
export function audioUrl(word: string, accent: Accent): string {
  const type = accent === 'uk' ? 0 : 1;
  return `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=${type}`;
}

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

let el: HTMLAudioElement | null = null;
let token = 0;

function element(): HTMLAudioElement {
  if (!el) {
    el = new Audio();
    el.preload = 'auto';
  }
  return el;
}

export function stopAudio(): void {
  token += 1;
  if (el) {
    el.pause();
    el.removeAttribute('src');
    el.load();
  }
  if (speechSupported()) {
    window.speechSynthesis.cancel();
  }
}

function speakFallback(word: string, accent: Accent): Promise<boolean> {
  if (!speechSupported()) return Promise.resolve(false);
  return new Promise((resolve) => {
    const utter = new SpeechSynthesisUtterance(word);
    utter.lang = accent === 'uk' ? 'en-GB' : 'en-US';
    utter.rate = 0.9;
    utter.onend = () => resolve(true);
    utter.onerror = () => resolve(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  });
}

/**
 * 播放读音。连续点击不同词时会先停掉上一段，避免声音重叠。
 * 音频加载失败时退回浏览器系统朗读，并把状态标为 fallback。
 */
export async function playPronunciation(
  word: string,
  accent: Accent,
  onState: (state: PlayState, detail?: string) => void,
): Promise<void> {
  const myToken = ++token;
  const audio = element();

  audio.pause();
  onState('loading');

  try {
    audio.src = audioUrl(word, accent);
    await audio.play();
    if (myToken !== token) return;
    onState('playing');

    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        audio.removeEventListener('ended', finish);
        audio.removeEventListener('error', finish);
        resolve();
      };
      audio.addEventListener('ended', finish, { once: true });
      audio.addEventListener('error', finish, { once: true });
    });

    if (myToken !== token) return;
    onState('idle');
  } catch (error) {
    if (myToken !== token) return;
    const message = error instanceof Error ? error.message : String(error);
    const spoken = await speakFallback(word, accent);
    if (myToken !== token) return;
    if (spoken) {
      onState('fallback', '发音音频不可用，已改用系统朗读');
    } else {
      onState('error', `发音加载失败：${message}`);
    }
  }
}

export function preload(word: string, accent: Accent): void {
  const audio = element();
  audio.pause();
  audio.preload = 'auto';
  audio.src = audioUrl(word, accent);
}
