// js/state.js
import { revokeAllObjectUrls } from "./utils.js";
import {
  saveImageToIndexedDB,
  getImageFromIndexedDB,
  deleteImageFromIndexedDB,
  clearAllImagesFromIndexedDB,
  openDatabase,
} from "./indexeddb.js";

const LOCAL_STORAGE_KEY = "webEvidenceToolProjects_v1";

// エビデンスデータ構造を変更（dataUrl/baseDataUrlはメモリ上のみ）
// localStorageには保存しない
export const projects = [];
export let currentProjectId = null;

// メモリ管理用: 現在読み込まれているObject URLのマップ
const loadedImageUrls = new Map(); // evidenceId -> { dataUrl, baseDataUrl }
const MAX_LOADED_IMAGES = 50; // メモリに保持する画像の最大数
const loadQueue = []; // LRUキューとして使用
const loadingEvidences = new Set(); // 現在読み込み中のエビデンスID

// ドラッグ中のアイテムを保持
export let draggedItem = null;

// 選択中のエビデンスID
export let selectedEvidenceId = null;

/**
 * ドラッグ中のアイテムを設定
 */
export function setDraggedItem(item) {
  draggedItem = item;
}

/**
 * ドラッグ中のアイテムをクリア
 */
export function clearDraggedItem() {
  draggedItem = null;
}

/**
 * エビデンスを選択
 */
export function setSelectedEvidence(evidenceId) {
  selectedEvidenceId = evidenceId;
}

/**
 * エビデンス選択をクリア
 */
export function clearSelectedEvidence() {
  selectedEvidenceId = null;
}

export function getProjects() {
  return projects;
}

export function getCurrentProject() {
  return projects.find((p) => p.id === currentProjectId) || null;
}

export function getEvidenceById(evidenceId) {
  const p = getCurrentProject();
  if (!p) return null;
  return p.evidenceList.find((ev) => ev.id === evidenceId) || null;
}

export function getNextTestCaseNumber(project) {
  if (project.testCases.length === 0) return 1;
  const nums = project.testCases
    .map((tc) => {
      const m = tc.name.match(/^No\.(\d+)/);
      return m ? parseInt(m[1]) : 0;
    })
    .filter((n) => n > 0);
  return nums.length > 0 ? Math.max(...nums) + 1 : 1;
}

export function addProjectToState(project) {
  projects.push(project);
  currentProjectId = project.id;
}

export function switchCurrentProject(projectId) {
  if (currentProjectId !== projectId) {
    currentProjectId = projectId;
    return true;
  }
  return false;
}

export function deleteProjectFromState(projectId) {
  const idx = projects.findIndex((x) => x.id === projectId);
  if (idx > -1) {
    projects.splice(idx, 1);
    if (currentProjectId === projectId) {
      currentProjectId = projects[0]?.id || null;
    }
    return true;
  }
  return false;
}

export function addTestCaseToState(testCase, indexToInsert = -1) {
  const p = getCurrentProject();
  if (!p) return false;
  if (indexToInsert === -1 || indexToInsert >= p.testCases.length) {
    p.testCases.push(testCase);
  } else {
    p.testCases.splice(indexToInsert, 0, testCase);
  }
  return true;
}

export function removeTestCaseFromState(testCaseId) {
  const p = getCurrentProject();
  if (!p) return false;
  const tcIdx = p.testCases.findIndex((tc) => tc.id === testCaseId);
  if (tcIdx > -1) {
    p.testCases.splice(tcIdx, 1);
    // 関連するエビデンスも削除
    p.evidenceList = p.evidenceList.filter(
      (ev) => ev.testCaseId !== testCaseId
    );
    return true;
  }
  return false;
}

export function addEvidenceToState(evidence) {
  const p = getCurrentProject();
  if (!p) return false;
  p.evidenceList.push(evidence);
  return true;
}

export function removeEvidenceFromState(evidenceId) {
  const p = getCurrentProject();
  if (!p) return false;
  const idx = p.evidenceList.findIndex((ev) => ev.id === evidenceId);
  if (idx > -1) {
    p.evidenceList.splice(idx, 1);
    return true;
  }
  return false;
}

export function updateEvidenceInState(evidenceId, newProps) {
  const evidence = getEvidenceById(evidenceId);
  if (evidence) {
    Object.assign(evidence, newProps);
    return true;
  }
  return false;
}

/**
 * エビデンスに画像を追加（IndexedDB に保存）
 */
export async function addEvidenceWithImage(
  evidenceData,
  baseBlob,
  stampedBlob
) {
  const evidenceId = evidenceData.id;

  // IndexedDBに保存
  await saveImageToIndexedDB(`${evidenceId}_base`, baseBlob);
  await saveImageToIndexedDB(`${evidenceId}_stamped`, stampedBlob);

  // メモリ上には一旦Object URLを作成（後でLRU管理）
  const baseDataUrl = URL.createObjectURL(baseBlob);
  const dataUrl = URL.createObjectURL(stampedBlob);

  evidenceData.dataUrl = dataUrl;
  evidenceData.baseDataUrl = baseDataUrl;

  // プロジェクトに追加
  const project = getCurrentProject();
  if (project) {
    project.evidenceList.push(evidenceData);
  }

  // メモリ管理に登録
  registerLoadedImage(evidenceId, dataUrl, baseDataUrl);

  // localStorageに保存（画像URLは含めない）
  saveData();
}

/**
 * エビデンス画像をメモリに読み込む（ロック付き）
 */
export async function loadEvidenceImage(evidenceId) {
  // すでに読み込み中の場合は待機
  if (loadingEvidences.has(evidenceId)) {
    console.log(`既に読み込み中: ${evidenceId}`);
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (!loadingEvidences.has(evidenceId)) {
          clearInterval(checkInterval);
          resolve(loadedImageUrls.get(evidenceId));
        }
      }, 100);
    });
  }

  // すでにメモリにあり、かつObject URLが有効な場合はキューの末尾に移動
  const existingUrls = loadedImageUrls.get(evidenceId);
  if (existingUrls) {
    // Object URLが有効かチェック（blob: で始まるか）
    if (existingUrls.dataUrl && existingUrls.dataUrl.startsWith("blob:")) {
      const index = loadQueue.indexOf(evidenceId);
      if (index !== -1) {
        loadQueue.splice(index, 1);
        loadQueue.push(evidenceId);
      }
      console.log(`既にメモリにあります: ${evidenceId}`);
      return existingUrls;
    } else {
      // Object URLが無効な場合は再読み込み
      console.log(`Object URLが無効なため再読み込み: ${evidenceId}`);
      loadedImageUrls.delete(evidenceId);
      const index = loadQueue.indexOf(evidenceId);
      if (index !== -1) {
        loadQueue.splice(index, 1);
      }
    }
  }

  // ロック開始
  loadingEvidences.add(evidenceId);

  try {
    // IndexedDBから読み込み
    const [baseBlob, stampedBlob] = await Promise.all([
      getImageFromIndexedDB(`${evidenceId}_base`),
      getImageFromIndexedDB(`${evidenceId}_stamped`),
    ]);

    if (!baseBlob || !stampedBlob) {
      console.warn(`画像が見つかりません: ${evidenceId}`);
      return null;
    }

    // Object URL作成
    const baseDataUrl = URL.createObjectURL(baseBlob);
    const dataUrl = URL.createObjectURL(stampedBlob);

    // メモリに登録
    registerLoadedImage(evidenceId, dataUrl, baseDataUrl);

    // エビデンスオブジェクトにも設定
    const evidence = getEvidenceById(evidenceId);
    if (evidence) {
      evidence.dataUrl = dataUrl;
      evidence.baseDataUrl = baseDataUrl;
    }

    console.log(`画像読み込み完了: ${evidenceId}`);
    return { dataUrl, baseDataUrl };
  } catch (error) {
    console.error(`画像読み込みエラー: ${evidenceId}`, error);
    return null;
  } finally {
    // ロック解除
    loadingEvidences.delete(evidenceId);
  }
}

/**
 * メモリに画像を登録（LRU管理）
 */
function registerLoadedImage(evidenceId, dataUrl, baseDataUrl) {
  loadedImageUrls.set(evidenceId, { dataUrl, baseDataUrl });
  loadQueue.push(evidenceId);

  // 上限を超えたら古い画像を解放
  if (loadQueue.length > MAX_LOADED_IMAGES) {
    const oldestId = loadQueue.shift();
    unloadEvidenceImage(oldestId);
  }
}

/**
 * メモリから画像を解放
 */
function unloadEvidenceImage(evidenceId) {
  // 読み込み中の場合は解放しない
  if (loadingEvidences.has(evidenceId)) {
    console.warn(`読み込み中のため解放をスキップ: ${evidenceId}`);
    return;
  }

  const urls = loadedImageUrls.get(evidenceId);
  if (!urls) return;

  // Object URLを解放
  URL.revokeObjectURL(urls.dataUrl);
  URL.revokeObjectURL(urls.baseDataUrl);
  loadedImageUrls.delete(evidenceId);

  // エビデンスオブジェクトからも削除
  const evidence = getEvidenceById(evidenceId);
  if (evidence) {
    delete evidence.dataUrl;
    delete evidence.baseDataUrl;
  }

  console.log(`メモリ解放: ${evidenceId}`);
}

/**
 * localStorageに保存（画像URLは含めない）
 */
export function saveData() {
  try {
    const data = {
      projects: projects.map((proj) => ({
        ...proj,
        evidenceList: proj.evidenceList.map((ev) => ({
          id: ev.id,
          originalFilename: ev.originalFilename,
          comment: ev.comment,
          testCaseId: ev.testCaseId,
          originalDate: ev.originalDate,
          // dataUrl, baseDataUrl は保存しない
        })),
      })),
      currentProjectId,
    };
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.error("データ保存エラー:", err);
    showMessage("データの保存に失敗しました。", true);
  }
}

/**
 * localStorageから読み込み（画像はIndexedDBから別途読み込む）
 */
export async function loadData() {
  try {
    await openDatabase(); // IndexedDB初期化
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      projects.length = 0;
      projects.push(...(data.projects || []));
      currentProjectId = data.currentProjectId || null;
    }
  } catch (err) {
    console.error("データ読み込みエラー:", err);
  }
}

/**
 * エビデンス削除時にIndexedDBからも削除
 */
export async function removeEvidenceCompletely(evidenceId) {
  // 読み込み中の場合は完了を待つ
  while (loadingEvidences.has(evidenceId)) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // メモリから解放
  unloadEvidenceImage(evidenceId);

  // IndexedDBから削除
  await deleteImageFromIndexedDB(`${evidenceId}_base`);
  await deleteImageFromIndexedDB(`${evidenceId}_stamped`);

  // プロジェクトから削除
  const project = getCurrentProject();
  if (project) {
    project.evidenceList = project.evidenceList.filter(
      (ev) => ev.id !== evidenceId
    );
  }

  saveData();
}

/**
 * すべてのデータをクリア
 */
export async function clearAllData() {
  // メモリ上のすべてのObject URLを解放
  for (const evidenceId of loadedImageUrls.keys()) {
    unloadEvidenceImage(evidenceId);
  }

  // IndexedDBをクリア
  await clearAllImagesFromIndexedDB();

  // localStorageをクリア
  localStorage.removeItem(LOCAL_STORAGE_KEY);

  projects.length = 0;
  currentProjectId = null;
}
