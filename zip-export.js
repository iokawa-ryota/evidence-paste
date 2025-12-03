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

    for (const tcId in groupedByTestCase) {
      const group = groupedByTestCase[tcId];
      if (group.evidence.length === 0) continue;

      const folderName = sanitizeFileName(group.name);
      const folder = zip.folder(folderName);

      // Sort evidence by date
      group.evidence.sort(
        (a, b) => new Date(a.originalDate) - new Date(b.originalDate)
      );

      for (const [index, evidence] of group.evidence.entries()) {
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
        while (usedFileNames.has(`${folderName}/${finalFileName}`)) {
          finalFileName = `${String(index + 1).padStart(
            3,
            "0"
          )}_${baseName}_${nameCounter++}.${extension}`;
        }
        usedFileNames.add(`${folderName}/${finalFileName}`);

        // トグル状態に応じて画像を選択
        let blob;
        if (disableTimestamp) {
          // タイムスタンプなし：元画像をIndexedDBから取得
          blob = await getImageFromIndexedDB(`${evidence.id}_base`);
          if (!blob) {
            console.warn(
              `Base image not found for ${evidence.id}, using stamped`
            );
            blob = await getImageFromIndexedDB(`${evidence.id}_stamped`);
          }
        } else {
          // タイムスタンプあり：スタンプ済み画像をIndexedDBから取得
          blob = await getImageFromIndexedDB(`${evidence.id}_stamped`);
          if (!blob) {
            console.warn(
              `Stamped image not found for ${evidence.id}, using base`
            );
            blob = await getImageFromIndexedDB(`${evidence.id}_base`);
          }
        }

        if (!blob) {
          console.error(`No image found for ${evidence.id}`);
          continue;
        }

        folder.file(finalFileName, blob, {
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
