// 新規ファイル: IndexedDB管理モジュール

const DB_NAME = "webEvidenceToolDB";
const DB_VERSION = 1;
const STORE_NAME = "images";

let dbInstance = null;

/**
 * IndexedDBを開く（初期化）
 */
export async function openDatabase() {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // 画像保存用のストア作成
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

/**
 * 画像をIndexedDBに保存
 * @param {string} evidenceId
 * @param {Blob} blob
 */
export async function saveImageToIndexedDB(evidenceId, blob) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(blob, evidenceId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * IndexedDBから画像を読み込み
 * @param {string} evidenceId
 * @returns {Promise<Blob|null>}
 */
export async function getImageFromIndexedDB(evidenceId) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(evidenceId);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * IndexedDBから画像を削除
 * @param {string} evidenceId
 */
export async function deleteImageFromIndexedDB(evidenceId) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(evidenceId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * IndexedDB全体をクリア
 */
export async function clearAllImagesFromIndexedDB() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
