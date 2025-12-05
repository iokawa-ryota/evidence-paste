// js/image-editor.js
import DOM from "./dom.js";
import {
  getEvidenceById,
  updateEvidenceInState,
  saveData,
  loadEvidenceImage,
} from "./state.js";
import {
  showMessage,
  showLoading,
  hideLoading,
  stampImageWithTextOffthread,
  createObjectUrlForBlob,
  revokeObjectUrl,
  formatDateTime,
  safeOn,
  showConfirmModal,
} from "./utils.js";
import { saveImageToIndexedDB, getImageFromIndexedDB } from "./indexeddb.js";

let isDrawing = false,
  startX = 0,
  startY = 0;
let history = [];
let activeTool = "none";
let currentImageEvidenceId = null;

export async function openEditorForEvidence(evidenceId) {
  currentImageEvidenceId = evidenceId;
  const evidence = getEvidenceById(evidenceId);
  if (!evidence) {
    showMessage("エビデンスが見つかりません。", true);
    return;
  }

  // メモリから解放されている場合は再読み込み
  if (!evidence.baseDataUrl || !evidence.baseDataUrl.startsWith("blob:")) {
    console.log(`編集用画像を再読み込み: ${evidenceId}`);
    DOM.loadingOverlay.style.display = "flex"; // ローディング表示

    try {
      const urls = await loadEvidenceImage(evidenceId);
      if (!urls) {
        showMessage("画像の読み込みに失敗しました。", true);
        DOM.loadingOverlay.style.display = "none";
        return;
      }
    } catch (err) {
      console.error("画像読み込みエラー:", err);
      showMessage("画像の読み込みに失敗しました。", true);
      DOM.loadingOverlay.style.display = "none";
      return;
    } finally {
      DOM.loadingOverlay.style.display = "none";
    }
  }

  const img = new Image();
  img.onload = () => {
    DOM.editorCanvas.width = img.width;
    DOM.editorCanvas.height = img.height;
    DOM.editorCtx.clearRect(0, 0, img.width, img.height);
    DOM.editorCtx.drawImage(img, 0, 0);

    // 初期状態を履歴に保存
    history = [];
    history.push(DOM.editorCtx.getImageData(0, 0, img.width, img.height));

    DOM.editorModalOverlay.style.display = "flex";
  };
  img.onerror = () => {
    showMessage("画像の読み込みに失敗しました。", true);
  };
  img.src = evidence.baseDataUrl; // Always edit the original
}

export function setupEditor() {
  if (!DOM.editorCanvas) return;

  const setActiveToolButton = () => {
    [DOM.drawRectBtn, DOM.drawLineBtn].forEach((btn) =>
      btn.classList.remove("active")
    );
    if (activeTool === "rect") DOM.drawRectBtn.classList.add("active");
    else if (activeTool === "line") DOM.drawLineBtn.classList.add("active");
  };

  safeOn(DOM.drawRectBtn, "click", () => {
    activeTool = "rect";
    setActiveToolButton();
  });
  safeOn(DOM.drawLineBtn, "click", () => {
    activeTool = "line";
    setActiveToolButton();
  });

  // Close button (Cancel): Discard changes and close modal
  safeOn(DOM.closeEditBtn, "click", () => {
    showConfirmModal(
      "編集内容を破棄しますか？",
      () => {
        // Confirmed: Close modal without saving
        DOM.editorModalOverlay.style.display = "none";

        // 状態変数をリセット
        currentImageEvidenceId = null;
        history = [];
        activeTool = "none";
        isDrawing = false;

        // キャンバスをクリア
        DOM.editorCtx.clearRect(
          0,
          0,
          DOM.editorCanvas.width,
          DOM.editorCanvas.height
        );
        DOM.editorCanvas.width = 0;
        DOM.editorCanvas.height = 0;

        // ツールボタンの状態をリセット
        [DOM.drawRectBtn, DOM.drawLineBtn].forEach((btn) => {
          if (btn) btn.classList.remove("active");
        });
      },
      () => {
        // Cancelled: Do nothing, keep modal open
      }
    );
  });

  safeOn(DOM.undoBtn, "click", () => {
    if (history.length > 1) {
      history.pop(); // 現在の状態を破棄
      DOM.editorCtx.putImageData(history[history.length - 1], 0, 0);
    }
  });

  safeOn(DOM.saveEditBtn, "click", async () => {
    if (!currentImageEvidenceId) return;
    showLoading();
    try {
      const evidence = getEvidenceById(currentImageEvidenceId);
      if (!evidence) throw new Error("対象エビデンスが見つかりません。");

      // 初回編集時のみ、元のbase画像を_originalとして保存
      if (!evidence.isEdited) {
        const originalBlob = await getImageFromIndexedDB(
          `${currentImageEvidenceId}_base`
        );
        if (originalBlob) {
          await saveImageToIndexedDB(
            `${currentImageEvidenceId}_original`,
            originalBlob
          );
        }
      }

      // 元の画像形式を取得（デフォルトはJPEG）
      const mimeType = evidence.originalMimeType || "image/jpeg";
      const quality = mimeType === "image/jpeg" ? 0.92 : undefined;

      const editedBlob = await new Promise((resolve) =>
        DOM.editorCanvas.toBlob(resolve, mimeType, quality)
      );
      const stampText = formatDateTime(evidence.originalDate);
      const stampedResult = await stampImageWithTextOffthread(
        editedBlob,
        stampText,
        mimeType
      );

      // IndexedDBを更新: _baseを編集後の画像に、_stampedをスタンプ済みに
      await saveImageToIndexedDB(`${currentImageEvidenceId}_base`, editedBlob);
      await saveImageToIndexedDB(
        `${currentImageEvidenceId}_stamped`,
        stampedResult.blob
      );

      // Revoke old URLs
      revokeObjectUrl(evidence.dataUrl);
      revokeObjectUrl(evidence.baseDataUrl);

      // Update evidence with new URLs and isEdited flag
      updateEvidenceInState(currentImageEvidenceId, {
        baseDataUrl: createObjectUrlForBlob(editedBlob), // Edited is the new base
        dataUrl: stampedResult.url, // Stamped is the new preview
        isEdited: true, // 編集済みフラグを立てる
      });

      document.getElementById(`evidence-img-${evidence.id}`).src =
        stampedResult.url;
      saveData();
      showMessage("編集を保存しました。");
      DOM.editorModalOverlay.style.display = "none";
    } catch (err) {
      console.error("Failed to save edited image:", err);
      showMessage(`編集の保存に失敗しました: ${err.message}`, true);
    } finally {
      hideLoading();
    }
  });

  const getMousePos = (e) => {
    const rect = DOM.editorCanvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDrawing = (e) => {
    if (activeTool === "none") return;
    isDrawing = true;
    const pos = getMousePos(e);
    startX = pos.x;
    startY = pos.y;
    // スナップショットは描画開始前に撮る
    DOM.editorCtx.putImageData(history[history.length - 1], 0, 0);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    // 描画中は前の状態に戻してから新しい図形を描く
    DOM.editorCtx.putImageData(history[history.length - 1], 0, 0);
    const pos = getMousePos(e);
    DOM.editorCtx.strokeStyle = "red";
    DOM.editorCtx.lineWidth = 3;
    DOM.editorCtx.beginPath();
    if (activeTool === "rect") {
      DOM.editorCtx.strokeRect(startX, startY, pos.x - startX, pos.y - startY);
    } else if (activeTool === "line") {
      DOM.editorCtx.moveTo(startX, startY);
      DOM.editorCtx.lineTo(pos.x, pos.y);
      DOM.editorCtx.stroke();
    }
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    isDrawing = false;
    // 描画完了後に新しい状態を履歴に保存
    history.push(
      DOM.editorCtx.getImageData(
        0,
        0,
        DOM.editorCanvas.width,
        DOM.editorCanvas.height
      )
    );
  };

  safeOn(DOM.editorCanvas, "mousedown", startDrawing);
  safeOn(DOM.editorCanvas, "mousemove", draw);
  safeOn(DOM.editorCanvas, "mouseup", stopDrawing);
  safeOn(DOM.editorCanvas, "mouseout", stopDrawing);
}
