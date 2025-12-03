// js/utils.js

import DOM from "./dom.js";

/**
 * ユーザーにメッセージをトースト表示します。
 * @param {string} message 表示するメッセージ
 * @param {boolean} isError エラーメッセージかどうか
 */
export function showMessage(message, isError = false) {
  const appMessage = document.getElementById("appMessage");
  if (!appMessage) return;
  appMessage.textContent = message;
  appMessage.classList.remove("opacity-0");
  appMessage.style.opacity = "1";
  appMessage.style.backgroundColor = isError ? "#dc2626" : "#10b981";
  appMessage.style.display = "block";
  setTimeout(() => {
    appMessage.style.opacity = "0";
    appMessage.addEventListener(
      "transitionend",
      () => {
        if (appMessage.style.opacity === "0") {
          appMessage.style.display = "none";
        }
      },
      { once: true }
    );
  }, 3000);
}

/**
 * ローディングオーバーレイを表示します。
 */
export function showLoading() {
  const loadingOverlay = document.getElementById("loadingOverlay");
  if (loadingOverlay) loadingOverlay.style.display = "flex";
}

/**
 * ローディングオーバーレイを非表示にします。
 */
export function hideLoading() {
  const loadingOverlay = document.getElementById("loadingOverlay");
  if (loadingOverlay) loadingOverlay.style.display = "none";
}

/**
 * タイムゾーンを考慮して日付オブジェクトを正規化します。
 * @param {Date | string} date
 * @returns {Date}
 */
export function normalizeToLocalDate(date) {
  if (!date) return new Date();
  return new Date(date);
}

/**
 * UTC日付をJST表示用の文字列にフォーマットします。
 * @param {Date | string} utcDate
 * @returns {string}
 */
export function formatDisplayDateTime(utcDate) {
  return new Date(utcDate).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Tokyo",
  });
}

/**
 * UTC日付を `datetime-local` input用のJST文字列にフォーマットします。
 * @param {Date | string} utcDate
 * @returns {string}
 */
export function formatDateTimeForInput(utcDate) {
  const jstOptions = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Tokyo",
  };

  const date = new Date(utcDate);
  const parts = new Intl.DateTimeFormat("ja-JP", jstOptions).formatToParts(
    date
  );
  const getPart = (type) => parts.find((p) => p.type === type)?.value || "";

  const year = getPart("year");
  const month = getPart("month");
  const day = getPart("day");
  const hours = getPart("hour");
  const minutes = getPart("minute");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * 画像のタイムスタンプ用のフォーマット関数（実質 formatDisplayDateTime と同じ）
 * @param {Date | string} utcDate
 * @returns {string}
 */
export function formatDateTime(utcDate) {
  return formatDisplayDateTime(utcDate);
}

/**
 * 安全にイベントリスナーを登録します。
 * @param {EventTarget} el
 * @param {string} event
 * @param {EventListener} handler
 * @param {object} opts
 */
export function safeOn(el, event, handler, opts) {
  try {
    if (el && typeof el.addEventListener === "function") {
      el.addEventListener(event, handler, opts);
    }
  } catch (e) {
    console.warn("safeOn failed for", el, event, e);
  }
}

/**
 * HTML文字列からタグを除去します。
 * @param {string} html
 * @returns {string}
 */
export function stripHtml(html) {
  try {
    const div = document.createElement("div");
    div.innerHTML = html;
    return div.textContent || div.innerText || "";
  } catch (e) {
    return String(html);
  }
}

export function showConfirmModal(message, onConfirm, onCancel) {
  // フォールバック: 確認モーダルが存在しない場合はブラウザ標準の confirm を使用
  if (!DOM.confirmModalOverlay || !DOM.confirmModalMessage) {
    const result = window.confirm(stripHtml(message));
    if (result && typeof onConfirm === "function") {
      onConfirm();
    } else if (!result && typeof onCancel === "function") {
      onCancel();
    }
    return;
  }

  // カスタムモーダルを表示
  DOM.confirmModalMessage.innerHTML = message;
  DOM.confirmModalOverlay.style.display = "flex";

  const cleanup = () => {
    DOM.confirmModalOverlay.style.display = "none";
    DOM.confirmModalConfirmBtn.removeEventListener("click", handleConfirm);
    DOM.confirmModalCancelBtn.removeEventListener("click", handleCancel);
  };

  const handleConfirm = () => {
    cleanup();
    if (typeof onConfirm === "function") onConfirm();
  };

  const handleCancel = () => {
    cleanup();
    if (typeof onCancel === "function") onCancel();
  };

  safeOn(DOM.confirmModalConfirmBtn, "click", handleConfirm);
  safeOn(DOM.confirmModalCancelBtn, "click", handleCancel);
}

// --- Worker and Blob Handling ---

let stampWorker;
try {
  stampWorker =
    typeof Worker !== "undefined" ? new Worker("./stampWorker.js") : null;
} catch (e) {
  console.error("Failed to create stampWorker", e);
  stampWorker = null;
}

const objectUrlCache = new Map();

export function createObjectUrlForBlob(blob) {
  const url = URL.createObjectURL(blob);
  objectUrlCache.set(url, true);
  return url;
}

export function revokeObjectUrl(url) {
  if (!url) return;
  try {
    if (objectUrlCache.has(url)) {
      URL.revokeObjectURL(url);
      objectUrlCache.delete(url);
    }
  } catch (e) {
    console.warn(`Failed to revoke object URL: ${url}`, e);
  }
}

export function revokeAllObjectUrls() {
  for (const url of Array.from(objectUrlCache.keys())) {
    revokeObjectUrl(url);
  }
}

export function dataURLToBlob(dataURL) {
  const [meta, base64] = dataURL.split(",");
  const mime = (meta.match(/:(.*?);/) || [])[1] || "image/png";
  const bin = atob(base64 || "");
  const len = bin.length;
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

/**
 * Web Workerを使って画像にテキストをスタンプします。
 * @param {Blob} blob
 * @param {string} text
 * @returns {Promise<{blob: Blob, url: string}>}
 */
export function stampImageWithTextOffthread(blob, text, mimeType = null) {
  // mimeTypeが指定されていない場合はblob.typeを使用
  const finalMimeType = mimeType || blob.type || "image/jpeg";

  if (!stampWorker || typeof OffscreenCanvas === "undefined") {
    // メインスレッドでのフォールバック
    return (async () => {
      console.warn(
        "Worker or OffscreenCanvas not available. Falling back to main thread."
      );
      const dataUrl = await blobToDataURL(blob);
      const stampedDataUrl = await stampImageWithText(
        dataUrl,
        text,
        finalMimeType
      ); // stampImageWithTextがグローバルに必要
      const stampedBlob = dataURLToBlob(stampedDataUrl);
      const url = createObjectUrlForBlob(stampedBlob);
      return { blob: stampedBlob, url };
    })();
  }

  return new Promise(async (resolve, reject) => {
    const id = `${Date.now()}-${Math.random()}`;
    const onmsg = (ev) => {
      if (!ev.data || ev.data.id !== id) return;
      stampWorker.removeEventListener("message", onmsg);
      if (ev.data.error) return reject(new Error(ev.data.error));

      const returnedBlob = ev.data.blob;
      if (returnedBlob instanceof Blob) {
        const url = createObjectUrlForBlob(returnedBlob);
        resolve({ blob: returnedBlob, url });
      } else {
        reject(new Error("Worker returned unexpected payload"));
      }
    };
    stampWorker.addEventListener("message", onmsg);
    try {
      const ab = await blob.arrayBuffer();
      stampWorker.postMessage(
        { id, buffer: ab, type: blob.type, text, mimeType: finalMimeType },
        [ab]
      );
    } catch (err) {
      stampWorker.removeEventListener("message", onmsg);
      reject(err);
    }
  });
}

// メインスレッドでのスタンプ関数（フォールバック用）
export async function stampImageWithText(
  base64,
  text,
  mimeType = "image/jpeg"
) {
  const img = new Image();
  await new Promise((res) => {
    img.onload = res;
    img.src = base64;
  });

  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);

  const pad = 12;
  ctx.font = "bold 20px sans-serif";
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  const textWidth = ctx.measureText(text).width;
  const boxW = textWidth + 180;
  const boxH = 34;
  ctx.fillRect(pad, c.height - 42, boxW, boxH);
  ctx.fillStyle = "#fff";
  ctx.fillText(text, pad + 10, c.height - 18);

  const quality = mimeType === "image/jpeg" ? 0.92 : undefined;
  return c.toDataURL(mimeType, quality);
}
