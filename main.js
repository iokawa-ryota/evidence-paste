// js/main.js
import DOM from "./dom.js";
import {
  loadData,
  saveData,
  clearAllData,
  addProjectToState,
  getCurrentProject,
  getProjects,
} from "./state.js";
import { renderAllContent, setupBulkAddModal } from "./ui.js";
import { showConfirmModal } from "./utils.js";
import { setupEditor } from "./image-editor.js";
import { handleFileSelect, handlePaste } from "./file-handler.js";
import { setupZipExport } from "./zip-export.js";
import { showMessage, safeOn } from "./utils.js";
import { addProject, addTestCase } from "./actions.js";
import { setupImageModal } from "./ui.js";
import { zipAndDownloadAllImages } from "./zip-export.js";

async function init() {
  await loadData();

  // プロジェクトがない場合はデフォルトプロジェクトを作成
  if (getProjects().length === 0) {
    console.log("プロジェクトがないため、デフォルトプロジェクトを作成します");
    addProject("新規プロジェクト");
  }

  renderAllContent();
  setupBulkAddModal();
  setupEditor();
  setupImageModal();
  console.log("初期化完了 - プロジェクト数:", getProjects().length); // デバッグ用

  // グローバルペーストエリア
  safeOn(DOM.globalPasteArea, "click", () => {
    console.log("globalPasteArea clicked"); // デバッグ用
    DOM.globalFileInput.click();
  });

  safeOn(DOM.globalFileInput, "change", async (e) => {
    console.log("globalFileInput change event"); // デバッグ用
    const files = e.target.files;
    if (files && files.length > 0) {
      await handleFileSelect(files, null);
      e.target.value = "";
    }
  });

  // グローバルペーストイベント
  document.addEventListener("paste", async (e) => {
    console.log("paste event detected"); // デバッグ用
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const blob = items[i].getAsFile();
        if (blob) {
          await handleFileSelect([blob], null);
        }
      }
    }
  });

  // サイドバートグル
  safeOn(DOM.sidebarToggleBtn, "click", () => {
    console.log("sidebarToggleBtn clicked"); // デバッグ用
    DOM.sidebar.classList.toggle("open");
  });

  // プロジェクト追加
  safeOn(DOM.addProjectButton, "click", () => {
    console.log("addProjectButton clicked"); // デバッグ用
    const name = prompt("新しいプロジェクト名を入力してください:");
    if (name) {
      addProject(name.trim());
      renderAllContent();
      showMessage(`プロジェクト「${name}」を作成しました。`);
    }
  });

  // 一括追加ボタン（「テストケースをまとめて追加」）
  safeOn(DOM.addTestCaseButton, "click", () => {
    console.log("addTestCaseButton clicked"); // デバッグ用
    const p = getCurrentProject();
    if (!p) {
      showMessage("プロジェクトを選択してください。", true);
      return;
    }
    DOM.bulkAddTestCaseModal.style.display = "flex";
  });

  // テストケース追加（グローバル）（「＋ 新しいテストケースを追加」）
  safeOn(DOM.addTestCaseButtonGlobal, "click", () => {
    console.log("addTestCaseButtonGlobal clicked"); // デバッグ用
    const p = getCurrentProject();
    if (!p) {
      showMessage("プロジェクトを選択してください。", true);
      return;
    }
    const name = prompt("新しいテストケース名を入力してください:");
    if (name) {
      addTestCase(name.trim());
      renderAllContent();
      showMessage(`テストケース「${name}」を追加しました。`);
    }
  });

  // データ保存
  safeOn(DOM.saveDataButton, "click", () => {
    console.log("saveDataButton clicked"); // デバッグ用
    saveData();
    showMessage("データを保存しました。");
  });

  // 一括画像ダウンロード
  safeOn(DOM.bulkDownloadImagesBtn, "click", async () => {
    console.log("bulkDownloadImagesBtn clicked"); // デバッグ用
    const p = getCurrentProject();
    if (!p) {
      showMessage("プロジェクトを選択してください。", true);
      return;
    }
    DOM.loadingOverlay.style.display = "flex";
    try {
      await zipAndDownloadAllImages();
      showMessage("ZIPファイルのダウンロードを開始しました。");
    } catch (err) {
      console.error("ZIP export error:", err);
      showMessage("ZIPファイルの作成に失敗しました。", true);
    } finally {
      DOM.loadingOverlay.style.display = "none";
    }
  });

  // キャッシュクリア
  safeOn(DOM.clearCacheButton, "click", () => {
    console.log("clearCacheButton clicked"); // デバッグ用
    showConfirmModal(
      "本当にキャッシュをクリアしますか？\n全てのデータが削除されます。",
      async () => {
        await clearAllData();
        location.reload();
      }
    );
  });

  console.log("init completed - all event listeners attached"); // デバッグ用
}

// Start the application
document.addEventListener("DOMContentLoaded", init);
