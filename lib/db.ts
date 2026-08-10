// IndexedDB кэш для оффлайн — сообщения и диалоги
// Работает только на клиенте (window)

const DB_NAME = "telenext";
const DB_VERSION = 1;
const STORES = {
  messages: "messages", // key: `${chatId}:${id}`
  dialogs: "dialogs", // key: id
};

function isClient(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isClient()) return reject(new Error("IDB not available"));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.messages)) {
        const s = db.createObjectStore(STORES.messages, { keyPath: "k" });
        s.createIndex("chatId", "chatId", { unique: false });
        s.createIndex("timestamp", "timestamp", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.dialogs)) {
        db.createObjectStore(STORES.dialogs, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Диалоги — перезаписываем пачку
export async function putDialogs(dialogs: any[]): Promise<void> {
  if (!isClient()) return;
  try {
    const db = await openDB();
    const tx = db.transaction(STORES.dialogs, "readwrite");
    const store = tx.objectStore(STORES.dialogs);
    for (const d of dialogs) store.put(d);
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  } catch {}
}

export async function getDialogsCache(): Promise<any[] | null> {
  if (!isClient()) return null;
  try {
    const db = await openDB();
    const tx = db.transaction(STORES.dialogs, "readonly");
    const store = tx.objectStore(STORES.dialogs);
    const req = store.getAll();
    const result: any[] = await new Promise((res, rej) => {
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    db.close();
    return result.length ? result : null;
  } catch {
    return null;
  }
}

// Сообщения — ключ `${chatId}:${id}` чтобы не коллизить
export async function putMessages(chatId: string, messages: any[]): Promise<void> {
  if (!isClient() || !messages.length) return;
  try {
    const db = await openDB();
    const tx = db.transaction(STORES.messages, "readwrite");
    const store = tx.objectStore(STORES.messages);
    for (const m of messages) {
      store.put({ ...m, chatId, k: `${chatId}:${m.id}` });
    }
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    // чистим старые — оставляем последние 300 на чат
    // (не блокируем)
    const countTx = db.transaction(STORES.messages, "readwrite");
    const idx = countTx.objectStore(STORES.messages).index("chatId");
    const range = IDBKeyRange.only(chatId);
    const allReq = idx.getAll(range);
    allReq.onsuccess = () => {
      const all = allReq.result as any[];
      if (all.length > 300) {
        all.sort((a, b) => a.timestamp - b.timestamp);
        const toDelete = all.slice(0, all.length - 300);
        const delTx = db.transaction(STORES.messages, "readwrite");
        const delStore = delTx.objectStore(STORES.messages);
        for (const item of toDelete) delStore.delete(item.k);
      }
    };
    db.close();
  } catch {}
}

export async function getMessagesCache(chatId: string): Promise<any[] | null> {
  if (!isClient()) return null;
  try {
    const db = await openDB();
    const tx = db.transaction(STORES.messages, "readonly");
    const store = tx.objectStore(STORES.messages);
    const idx = store.index("chatId");
    const req = idx.getAll(IDBKeyRange.only(chatId));
    const result: any[] = await new Promise((res, rej) => {
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    db.close();
    if (!result.length) return null;
    // уже отсортированы по timestamp, но на всякий
    result.sort((a, b) => a.timestamp - b.timestamp);
    // убираем поле k
    return result.map(({ k, chatId: _c, ...rest }) => rest);
  } catch {
    return null;
  }
}

export async function clearCache(): Promise<void> {
  if (!isClient()) return;
  try {
    const db = await openDB();
    const tx = db.transaction([STORES.messages, STORES.dialogs], "readwrite");
    tx.objectStore(STORES.messages).clear();
    tx.objectStore(STORES.dialogs).clear();
    await new Promise<void>((res) => (tx.oncomplete = () => res()));
    db.close();
  } catch {}
}
