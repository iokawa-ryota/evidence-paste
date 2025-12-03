// js/actions.js
import {
  getCurrentProject,
  getEvidenceById,
  addProjectToState,
  switchCurrentProject,
  deleteProjectFromState,
  addTestCaseToState,
  getNextTestCaseNumber,
  removeTestCaseFromState,
  addEvidenceToState,
  removeEvidenceFromState,
  updateEvidenceInState,
  saveData,
  getProjects,
} from "./state.js";
import { renderAllContent, closeSidebar } from "./ui.js";
import {
  showMessage,
  formatDateTime,
  stampImageWithTextOffthread,
  createObjectUrlForBlob,
  dataURLToBlob,
  revokeObjectUrl,
  showConfirmModal,
} from "./utils.js";
import DOM from "./dom.js";
import { addEvidenceWithImage, removeEvidenceCompletely } from "./state.js";

export function addProject(name) {
  const newName = name || `新規プロジェクト-${Date.now()}`;
  const newProjectId = `project-${Date.now()}`;
  const proj = {
    id: newProjectId,
    name: newName,
    testCases: [],
    evidenceList: [],
  };
  addProjectToState(proj);
  renderAllContent();
  saveData();
  showMessage(`新しいプロジェクト「${newName}」を追加しました！`);
}

export function switchProject(projectId) {
  if (switchCurrentProject(projectId)) {
    renderAllContent();
    saveData();
    showMessage(
      `プロジェクト「${getCurrentProject().name}」に切り替えました。`
    );
  }
  closeSidebar();
}

export function renameProject(projectId) {
  const projects = getProjects();
  const project = projects.find((p) => p.id === projectId);
  if (!project) return;

  const newName = prompt(
    "新しいプロジェクト名を入力してください:",
    project.name
  );
  if (newName && newName.trim() !== "") {
    project.name = newName.trim();
    renderAllContent();
    saveData();
    showMessage(`プロジェクト名を「${newName.trim()}」に変更しました。`);
  }
}

export function deleteProject(projectId) {
  const p = getCurrentProject();
  if (!p || p.id !== projectId) return;
  showConfirmModal(
    `プロジェクト「${p.name}」を削除しますか？<br>このプロジェクト内の全てのテストケースとエビデンスが削除されます。`,
    () => {
      if (deleteProjectFromState(projectId)) {
        if (!getCurrentProject()) {
          addProject("新規プロジェクト");
        }
        renderAllContent();
        saveData();
        showMessage(`プロジェクト「${p.name}」を削除しました。`);
      }
    }
  );
}

export function addTestCase(name = "", indexToInsert = -1) {
  const p = getCurrentProject();
  if (!p) {
    showMessage("プロジェクトが選択されていません。", true);
    return null;
  }
  const id = `tc-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const num = getNextTestCaseNumber(p);
  const tcName = name === "" ? `No.${num}` : name;
  const tc = {
    id,
    number: num,
    name: tcName,
    evidenceIds: [], // This seems unused, can be removed later
    timestamp: new Date().toISOString(),
  };

  if (addTestCaseToState(tc, indexToInsert)) {
    renderAllContent();
    saveData();
    showMessage(`テストケース「${tcName}」を追加しました。`);
    return id;
  }
  return null;
}

export function removeTestCase(testCaseId) {
  showConfirmModal(
    "このテストケースを削除しますか？<br>関連するエビデンスも全て削除されます。",
    () => {
      if (removeTestCaseFromState(testCaseId)) {
        renderAllContent();
        saveData();
        showMessage("テストケースを削除しました。");
      }
    }
  );
}

export async function addEvidence(
  imageSource,
  originalFilename = "",
  testCaseId = null,
  comment = "",
  date = null
) {
  const p = getCurrentProject();
  if (!p) return;

  let blob;
  if (typeof imageSource === "string") {
    blob = imageSource.startsWith("data:")
      ? dataURLToBlob(imageSource)
      : await fetch(imageSource).then((res) => res.blob());
  } else if (imageSource instanceof Blob) {
    blob = imageSource;
  } else {
    showMessage("サポートされていない画像形式です。", true);
    return;
  }

  // 元の画像形式を保持
  const originalMimeType = blob.type || "image/jpeg";
  console.log("Original image type:", originalMimeType);

  const evidenceDate = date ? new Date(date) : new Date();
  console.log("addEvidence - received date:", date); // デバッグ用
  console.log("addEvidence - evidenceDate:", evidenceDate); // デバッグ用
  const stampText = formatDateTime(evidenceDate);
  console.log("addEvidence - stampText:", stampText); // デバッグ用

  let stamped;
  try {
    stamped = await stampImageWithTextOffthread(
      blob,
      stampText,
      originalMimeType
    );
  } catch (err) {
    console.warn("Worker stamp failed, falling back to original blob:", err);
    const fallbackUrl = createObjectUrlForBlob(blob);
    stamped = { blob, url: fallbackUrl };
  }

  const generatedId = `evidence-${crypto.randomUUID()}`;

  // IndexedDBに保存
  await addEvidenceWithImage(
    {
      id: generatedId,
      originalFilename: originalFilename || "",
      comment: comment || originalFilename,
      testCaseId: testCaseId || null,
      originalDate: evidenceDate.toISOString(),
      originalMimeType: originalMimeType, // 画像形式を保存
    },
    blob, // baseBlob (元画像)
    stamped.blob // stampedBlob (タイムスタンプ付き画像)
  );

  saveData();
  renderAllContent();
  showMessage("新しいエビデンスを追加しました。");
}

export async function removeEvidence(evidenceId) {
  await removeEvidenceCompletely(evidenceId);
  renderAllContent();
}

export async function updateEvidenceDate(
  evidenceId,
  newDateString,
  inputElement
) {
  const ev = getEvidenceById(evidenceId);
  if (!ev) return;

  const newJSTDate = new Date(newDateString.replace("T", " ") + ":00");

  if (isNaN(newJSTDate.getTime())) {
    showMessage("無効な日付形式です。", true);
    inputElement.value = formatDateTimeForInput(ev.originalDate); // Revert
    return;
  }

  const newDateISO = newJSTDate.toISOString();
  const formattedNewDate = formatDateTime(newDateISO);

  // Re-stamp the base image with the new date
  const baseBlob = await fetch(ev.baseDataUrl).then((r) => r.blob());
  const stampedResult = await stampImageWithTextOffthread(
    baseBlob,
    formattedNewDate
  );

  // Revoke old stamped URL
  revokeObjectUrl(ev.dataUrl);

  // Update state
  updateEvidenceInState(evidenceId, {
    originalDate: newDateISO,
    dataUrl: stampedResult.url,
  });

  // Update UI
  const previewImage = document.querySelector(`#evidence-img-${evidenceId}`);
  if (previewImage) {
    previewImage.src = stampedResult.url;
  }

  saveData();
  showMessage("取得日時とタイムスタンプを更新しました。");
}

export function handleDropOnTestCase(evidenceId, newTestCaseId) {
  const ev = getEvidenceById(evidenceId);
  if (ev && ev.testCaseId !== newTestCaseId) {
    updateEvidenceInState(evidenceId, { testCaseId: newTestCaseId });
    saveData();
    renderAllContent(); // Re-render to move the element
  }
}
