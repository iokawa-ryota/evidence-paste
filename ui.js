// js/ui.js
import DOM from "./dom.js";
import {
  getCurrentProject,
  saveData,
  getProjects,
  getEvidenceById,
  setDraggedItem,
  draggedItem,
  loadEvidenceImage,
  selectedEvidenceId,
  setSelectedEvidence,
  clearSelectedEvidence,
} from "./state.js";
import {
  switchProject,
  renameProject,
  deleteProject,
  removeTestCase,
  updateEvidenceDate,
  removeEvidence,
  handleDropOnTestCase,
  addTestCase,
} from "./actions.js";
import { openEditorForEvidence } from "./image-editor.js";
import {
  showMessage,
  safeOn,
  formatDateTimeForInput,
  formatDisplayDateTime,
  stripHtml,
  showConfirmModal,
} from "./utils.js";
import { handleFileSelect, handlePaste } from "./file-handler.js";
import { createInlinePasteArea, addDragDropListeners } from "./file-handler.js";

export function renderAllContent() {
  try {
    renderProjectNav();
    renderTestCases();
    // renderEvidenceはrenderTestCasesから呼ばれるので不要
  } catch (err) {
    console.error("renderAllContent failed:", err);
  }
}

export function renderProjectNav() {
  const projects = getProjects();
  const currentProject = getCurrentProject();
  DOM.projectNav.innerHTML = "";
  projects.forEach((project) => {
    const navItem = document.createElement("div");
    navItem.className = `project-nav-item ${
      project.id === currentProject?.id ? "active" : ""
    }`;
    navItem.dataset.projectId = project.id;

    const nameSpan = document.createElement("span");
    nameSpan.className = "project-name";
    nameSpan.textContent = project.name;

    const editBtn = document.createElement("button");
    editBtn.className = "edit-project-icon hover:text-blue-400";
    editBtn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>`;
    editBtn.onclick = (e) => {
      e.stopPropagation();
      renameProject(project.id);
    };

    const delBtn = document.createElement("button");
    delBtn.className = "delete-project-icon p-1 rounded-full hover:bg-red-700";
    delBtn.innerHTML = `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 000-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"></path></svg>`;
    delBtn.onclick = (e) => {
      e.stopPropagation();
      deleteProject(project.id);
    };

    navItem.appendChild(nameSpan);
    navItem.appendChild(editBtn);
    navItem.appendChild(delBtn);
    navItem.onclick = () => switchProject(project.id);
    DOM.projectNav.appendChild(navItem);
  });
}

export function renderTestCases() {
  DOM.testCaseListContainer.innerHTML = "";
  const p = getCurrentProject();
  if (!p) {
    DOM.testCaseListContainer.innerHTML =
      '<p class="text-center text-gray-500 text-xl mt-12">サイドバーからプロジェクトを選択するか、新しいプロジェクトを作成してください。</p>';
    return;
  }
  p.testCases.forEach((tc) => {
    const div = document.createElement("div");
    div.id = tc.id;
    div.className =
      "test-case-section-container mb-8 p-4 bg-white rounded-lg shadow-md";
    div.innerHTML = `
          <div class="flex items-center justify-between mb-4 no-print-on-pdf">
            <input id="case-name-${tc.id}" type="text" value="${tc.name}" placeholder="テストケース名" class="test-case-name-input text-2xl font-bold p-2 flex-grow bg-transparent" />
            <button data-id="${tc.id}" class="remove-test-case-btn ml-4 text-gray-500 hover:text-red-600 transition-colors"><svg class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 000-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"></path></svg></button>
          </div>
          <h2 class="test-case-section print-only" style="display:none;">${tc.name}</h2>
          <div class="inline-paste-area-wrapper"></div>
          <div id="evidence-container-${tc.id}" class="evidence-list-for-case space-y-6 min-h-[50px] p-2 border border-dashed border-gray-200 rounded-md bg-gray-50"></div>`;

    const wrap = div.querySelector(".inline-paste-area-wrapper");
    wrap.appendChild(createInlinePasteArea(tc.id));

    div.querySelector(".remove-test-case-btn").onclick = (e) => {
      e.stopPropagation();
      removeTestCase(tc.id);
    };

    DOM.testCaseListContainer.appendChild(div);
  });
  renderEvidence();
  addDragDropListeners();
}

export function renderEvidence() {
  document
    .querySelectorAll(".evidence-list-for-case")
    .forEach((c) => (c.innerHTML = ""));
  const p = getCurrentProject();
  if (!p) return;
  p.evidenceList.forEach((ev) => {
    const el = createEvidenceElement(ev);
    const container = document.getElementById(
      `evidence-container-${ev.testCaseId}`
    );
    if (container) container.appendChild(el);
  });
  addDragDropListeners();
  reapplySelection(); // 選択状態を復元
}

let evidenceObserver = null;

/**
 * Intersection Observer をセットアップ
 */
function setupEvidenceObserver() {
  if (evidenceObserver) {
    evidenceObserver.disconnect();
  }

  evidenceObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach(async (entry) => {
        if (!entry.isIntersecting) return;

        const evidenceId = entry.target.dataset.evidenceId;
        if (!evidenceId) return;

        const imgElement = entry.target.querySelector(".evidence-preview-img");
        const loadingOverlay = entry.target.querySelector(".loading-overlay");
        if (!imgElement) return;

        // すでに読み込み済みの場合はスキップ
        if (imgElement.src && imgElement.src.startsWith("blob:")) return;

        // ローディング表示を表示
        if (loadingOverlay) {
          loadingOverlay.style.display = "flex";
        }

        // IndexedDBから画像を読み込み
        try {
          const urls = await loadEvidenceImage(evidenceId);
          if (urls) {
            imgElement.src = urls.dataUrl;
            imgElement.dataset.loaded = "true";
          } else {
            imgElement.src =
              "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect fill='%23fee' width='100' height='100'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dominant-baseline='middle' fill='%23c00' font-size='12'%3E読込失敗%3C/text%3E%3C/svg%3E";
          }
        } catch (err) {
          console.error(`画像読み込みエラー: ${evidenceId}`, err);
          imgElement.src =
            "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect fill='%23fee' width='100' height='100'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dominant-baseline='middle' fill='%23f00' font-size='12'%3Eエラー%3C/text%3E%3C/svg%3E";
        } finally {
          // ローディング表示を非表示
          if (loadingOverlay) {
            loadingOverlay.style.display = "none";
          }
        }
      });
    },
    {
      rootMargin: "200px", // 画面外200pxから読み込み開始
      threshold: 0.01,
    }
  );

  // すべてのエビデンス要素を監視
  document.querySelectorAll(".evidence-item-wrapper").forEach((el) => {
    evidenceObserver.observe(el);
  });
}

function createEvidenceElement(evidence) {
  const div = document.createElement("div");
  div.id = evidence.id;
  div.dataset.id = evidence.id;
  div.dataset.evidenceId = evidence.id; // Intersection Observer用
  div.className =
    "evidence-item-wrapper bg-white p-4 rounded-lg shadow-sm border border-gray-200 transition-shadow hover:shadow-md relative";
  div.draggable = true;

  const formattedDateForInput = formatDateTimeForInput(evidence.originalDate);

  div.innerHTML = `
    <div class="evidence-item-layout">
      <div class="evidence-item-info-container">
        <div class="flex items-center justify-between">
          <input type="text" placeholder="ファイル名" data-id="${evidence.id}" class="evidence-comment-input text-lg font-semibold w-full p-1 bg-transparent border-b border-gray-200 focus:outline-none focus:border-indigo-500" />
          <button data-id="${evidence.id}" class="remove-evidence-btn ml-2 text-gray-400 hover:text-red-600"><svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 000-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"></path></svg></button>
        </div>
        <div class="mt-2 flex items-center gap-2">
          <label class="text-sm text-gray-600 flex-shrink-0">取得日時:</label>
          <input type="datetime-local" value="${formattedDateForInput}" data-id="${evidence.id}" class="evidence-date-input text-sm p-1 border border-gray-300 rounded-md" />
        </div>
        <div class="mt-2">
          <label class="text-sm text-gray-600 block mb-1">メモ・備考:</label>
          <textarea class="evidence-memo w-full text-sm p-2 border border-gray-300 rounded-md" rows="2" placeholder="補足事項"></textarea>
        </div>
        <button data-id="${evidence.id}" class="edit-image-btn mt-3 w-full bg-blue-500 hover:bg-blue-600 text-white text-sm font-bold py-1.5 rounded-lg">編集（マーキング）</button>
      </div>
      <div class="relative">
        <img id="evidence-img-${evidence.id}" src="./preview-icon.svg" alt="エビデンス画像" data-id="${evidence.id}" class="evidence-preview-img evidence-item-image-preview rounded cursor-pointer" />
        <div class="loading-overlay absolute inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center rounded" style="display: none;">
          <div class="text-white text-sm text-center">
            <svg class="animate-spin h-8 w-8 mx-auto mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            読込中...
          </div>
        </div>
      </div>
    </div>`;

  div.querySelector(".evidence-comment-input").value = evidence.comment || "";
  div.querySelector(".evidence-memo").value = evidence.memo || "";

  div.querySelector(".evidence-date-input").onchange = (e) =>
    updateEvidenceDate(evidence.id, e.target.value, e.target);
  div.querySelector(".remove-evidence-btn").onclick = () =>
    removeEvidence(evidence.id);
  div.querySelector(".evidence-item-image-preview").onclick = () =>
    openImageModal(evidence.id);
  div.querySelector(".edit-image-btn").onclick = () =>
    openEditorForEvidence(evidence.id);

  // エビデンス全体をクリックで選択（入力欄以外）
  div.onclick = (e) => {
    // 入力欄やボタンのクリックは無視
    if (
      e.target.matches("input, textarea, button, svg, path") ||
      e.target.closest("button")
    ) {
      return;
    }
    toggleEvidenceSelection(evidence.id);
  };

  return div;
}

/**
 * 画像モーダルを開く（メモリから解放されている場合は再読み込み）
 */
async function openImageModal(evidenceId) {
  const evidence = getEvidenceById(evidenceId);
  if (!evidence) return;

  // メモリから解放されている場合は再読み込み
  if (!evidence.dataUrl || !evidence.dataUrl.startsWith("blob:")) {
    console.log(`画像を再読み込み: ${evidenceId}`);
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

  // モーダル表示
  DOM.imageModalContent.src = evidence.dataUrl;
  DOM.imageModalOverlay.style.display = "flex";
}

/**
 * 画像モーダルを閉じる
 */
function closeImageModal() {
  DOM.imageModalOverlay.style.display = "none";
  DOM.imageModalContent.src = "";
}

/**
 * 画像モーダルのイベントリスナーをセットアップ
 */
export function setupImageModal() {
  // オーバーレイクリックで閉じる
  safeOn(DOM.imageModalOverlay, "click", (e) => {
    if (e.target === DOM.imageModalOverlay) {
      closeImageModal();
    }
  });

  // ESCキーで閉じる
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && DOM.imageModalOverlay.style.display === "flex") {
      closeImageModal();
    }
  });
}

export function closeSidebar() {
  DOM.sidebar.classList.remove("open");
  document.body.classList.remove("sidebar-open");
}

/**
 * エビデンスの選択状態をトグル
 */
function toggleEvidenceSelection(evidenceId) {
  // state.jsから最新のselectedEvidenceIdを取得
  import("./state.js").then((stateModule) => {
    const current = stateModule.selectedEvidenceId;

    // 前の選択を解除
    if (current) {
      const prevElement = document.getElementById(current);
      if (prevElement) {
        prevElement.classList.remove("selected");
      }
    }

    // 同じものをクリックした場合は選択解除
    if (current === evidenceId) {
      clearSelectedEvidence();
    } else {
      // 新しく選択
      setSelectedEvidence(evidenceId);
      const element = document.getElementById(evidenceId);
      if (element) {
        element.classList.add("selected");
      }
    }
  });
}

/**
 * 選択状態を再適用（再レンダリング後）
 */
export function reapplySelection() {
  import("./state.js").then((stateModule) => {
    const current = stateModule.selectedEvidenceId;
    if (current) {
      const element = document.getElementById(current);
      if (element) {
        element.classList.add("selected");
      }
    }
  });
}

export function setupBulkAddModal() {
  if (!DOM.bulkAddTestCaseModal) return;

  const hide = () => (DOM.bulkAddTestCaseModal.style.display = "none");

  // ボタンのイベントはmain.jsで管理するため、ここでは設定しない
  DOM.bulkAddCancelBtn.onclick = hide;

  DOM.bulkAddConfirmBtn.onclick = () => {
    const start = parseInt(DOM.startTestNoInput.value, 10);
    const end = parseInt(DOM.endTestNoInput.value, 10);
    if (isNaN(start) || isNaN(end) || start < 1 || end < start) {
      showMessage("正しい番号を入力してください。", true);
      return;
    }
    for (let i = start; i <= end; i++) {
      addTestCase(`No.${i}`);
    }
    hide();
    showMessage(`テストケース No.${start}～No.${end} を追加しました。`);
  };
}
