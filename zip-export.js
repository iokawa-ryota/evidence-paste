// js/zip-export.js
import DOM from "./dom.js";
import { getCurrentProject, saveData } from "./state.js";
import { showMessage, showLoading, hideLoading } from "./utils.js";
import { getImageFromIndexedDB } from "./indexeddb.js";

async function exportProjectToZip() {
  const currentProject = getCurrentProject();
  if (!currentProject || currentProject.evidenceList.length === 0) {
    showMessage("エクスポートするエビデンスがありません。", true);
    return;
  }

  // タイムスタンプトグルの状態を確認
  const disableTimestamp = DOM.disableTimestampToggle?.checked || false;

  showLoading();
  showMessage("ZIP生成を開始します...");

  try {
    const zip = new JSZip();
    const usedFileNames = new Set();

    // Before, After, Export フォルダを親フォルダ直下に作成
    const beforeFolder = zip.folder("Before");
    const afterFolder = zip.folder("After");
    const exportFolder = zip.folder("Export");

    // Group evidence by test case
    const groupedByTestCase = currentProject.testCases.reduce((acc, tc) => {
      acc[tc.id] = {
        name: tc.name,
        evidence: [],
      };
      return acc;
    }, {});

    const unclassified = [];

    for (const evidence of currentProject.evidenceList) {
      if (evidence.testCaseId && groupedByTestCase[evidence.testCaseId]) {
        groupedByTestCase[evidence.testCaseId].evidence.push(evidence);
      } else {
        unclassified.push(evidence);
      }
    }
    if (unclassified.length > 0) {
      groupedByTestCase["unclassified"] = {
        name: "未分類",
        evidence: unclassified,
      };
    }

    // テストケースの順序でループ（testCasesの順序を維持）
    const testCaseOrder = [
      ...currentProject.testCases,
      { id: "unclassified", name: "未分類" },
    ];
    let testCaseIndex = 1;

    for (const tc of testCaseOrder) {
      const tcId = tc.id;
      const group = groupedByTestCase[tcId];
      if (!group || group.evidence.length === 0) continue;

      // フォルダ名はテストケース名のみ
      const folderName = sanitizeFileName(group.name);

      // 各フォルダ配下にテストケースフォルダを作成
      const beforeTestCaseFolder = beforeFolder.folder(folderName);
      const afterTestCaseFolder = afterFolder.folder(folderName);
      const exportTestCaseFolder = exportFolder.folder(folderName);

      // UI上の並び順を取得（DOM要素の順序を反映）
      const containerElement = document.getElementById(
        `evidence-container-${tcId}`
      );
      let sortedEvidence = [...group.evidence];

      if (containerElement) {
        // DOM要素の順序でソート
        const evidenceElements = Array.from(containerElement.children);
        const domOrder = evidenceElements
          .map((el) => el.dataset.evidenceId)
          .filter((id) => id); // 有効なIDのみ

        sortedEvidence.sort((a, b) => {
          const indexA = domOrder.indexOf(a.id);
          const indexB = domOrder.indexOf(b.id);
          if (indexA === -1) return 1;
          if (indexB === -1) return -1;
          return indexA - indexB;
        });
      } else {
        // DOMが見つからない場合は日付順にフォールバック
        sortedEvidence.sort(
          (a, b) => new Date(a.originalDate) - new Date(b.originalDate)
        );
      }

      for (const [index, evidence] of sortedEvidence.entries()) {
        const baseName = sanitizeFileName(
          evidence.comment || `evidence-${index + 1}`
        );

        // 元の画像形式を取得（デフォルトはJPEG）
        const mimeType = evidence.originalMimeType || "image/jpeg";
        const extension = mimeType === "image/png" ? "png" : "jpg";

        let finalFileName = `${String(index + 1).padStart(
          3,
          "0"
        )}_${baseName}.${extension}`;

        let nameCounter = 1;
        const baseKey = `${folderName}/${finalFileName}`;
        while (usedFileNames.has(baseKey)) {
          finalFileName = `${String(index + 1).padStart(
            3,
            "0"
          )}_${baseName}_${nameCounter++}.${extension}`;
        }
        usedFileNames.add(baseKey);

        // Before: 常にオリジナル画像を保存
        const originalBlob = evidence.isEdited
          ? await getImageFromIndexedDB(`${evidence.id}_original`)
          : await getImageFromIndexedDB(`${evidence.id}_base`);

        if (originalBlob) {
          beforeTestCaseFolder.file(finalFileName, originalBlob, {
            date: new Date(evidence.originalDate),
          });
        }

        // After: 編集済みの場合のみ、編集後の画像を保存
        if (evidence.isEdited) {
          let afterBlob;
          if (disableTimestamp) {
            // タイムスタンプなし：編集後のbase画像
            afterBlob = await getImageFromIndexedDB(`${evidence.id}_base`);
          } else {
            // タイムスタンプあり：編集後のスタンプ済み画像
            afterBlob = await getImageFromIndexedDB(`${evidence.id}_stamped`);
          }

          if (afterBlob) {
            afterTestCaseFolder.file(finalFileName, afterBlob, {
              date: new Date(evidence.originalDate),
            });
          }
        }

        // Export: 最終的な画像（編集済みなら編集後、未編集ならオリジナル）
        let exportBlob;
        if (disableTimestamp) {
          // タイムスタンプなし：base画像
          exportBlob = await getImageFromIndexedDB(`${evidence.id}_base`);
        } else {
          // タイムスタンプあり：スタンプ済み画像
          exportBlob = await getImageFromIndexedDB(`${evidence.id}_stamped`);
        }

        if (!exportBlob) {
          console.error(`No image found for ${evidence.id}`);
          continue;
        }

        exportTestCaseFolder.file(finalFileName, exportBlob, {
          date: new Date(evidence.originalDate),
        });
      }
    }

    const zipBlob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
    });
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const fileName = `${sanitizeFileName(
      currentProject.name
    )}_${timestamp}.zip`;

    const link = document.createElement("a");
    link.href = URL.createObjectURL(zipBlob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);

    showMessage("ZIPファイルのエクスポートが完了しました。");
  } catch (error) {
    console.error("ZIP export failed:", error);
    showMessage(
      `ZIPエクスポート中にエラーが発生しました: ${error.message}`,
      true
    );
  } finally {
    hideLoading();
  }
}

function sanitizeFileName(name) {
  if (!name) return "untitled";
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 100);
}

export function setupZipExport(button) {
  if (button) {
    button.addEventListener("click", exportProjectToZip);
  }
}

// エクスポート用にエイリアスを追加
export { exportProjectToZip as zipAndDownloadAllImages };
