/**
 * 学习数据的持久层：优先 IndexedDB，不可用时（隐私模式、老浏览器）退回 localStorage。
 * 两边的键名与值结构完全一致，切换实现不影响调用方。
 */
const DB_NAME = 'vocab-pwa';
const DB_VERSION = 1;
const STORE = 'kv';
const LS_PREFIX = 'vocab-pwa.kv.';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return dbPromise;
}

/** 是否有可用的 IndexedDB（用于在设置页展示存储方式） */
export const isIdbAvailable = (): boolean => typeof indexedDB !== 'undefined';

function lsGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function lsSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
  } catch {
    /* 配额满或隐私模式：忽略 */
  }
}

export async function kvGet<T>(key: string): Promise<T | null> {
  const db = await openDb();
  if (!db) return lsGet<T>(key);
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(key);
      request.onsuccess = () => {
        const value = request.result;
        if (value === undefined) {
          // IndexedDB 里没有时回退读取旧版 localStorage 数据，实现无痛迁移
          const fallback = lsGet<T>(key);
          resolve(fallback);
          return;
        }
        resolve(value as T);
      };
      request.onerror = () => resolve(lsGet<T>(key));
    } catch {
      resolve(lsGet<T>(key));
    }
  });
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  if (!db) {
    lsSet(key, value);
    return;
  }
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        lsSet(key, value);
        resolve();
      };
      tx.onabort = () => {
        lsSet(key, value);
        resolve();
      };
    } catch {
      lsSet(key, value);
      resolve();
    }
  });
}

export async function kvDelete(key: string): Promise<void> {
  try {
    localStorage.removeItem(LS_PREFIX + key);
  } catch {
    /* ignore */
  }
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** 粗略估算已用存储体积（字节），用于设置页展示 */
export function estimateBytes(value: unknown): number {
  try {
    return new Blob([JSON.stringify(value)]).size;
  } catch {
    return 0;
  }
}
