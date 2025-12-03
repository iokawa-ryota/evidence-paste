// js/file-handler.js
import { addTestCase, addEvidence } from "./actions.js";
import { getCurrentProject } from "./state.js";
import DOM from "./dom.js";
import { getExifDateFromImage } from "./exif-reader.js";

/**
 * ファイルリストからエビデンスを追加します。
 * @param {FileList} fileList
 * @param {string | null} testCaseId
 */
export async function handleFileSelect(fileList, testCaseId = null) {
  console.log("handleFileSelect called", fileList, testCaseId); // デバッグ用
  const files = Array.from(fileList || []);
  console.log("files:", files); // デバッグ用
  let tcId = testCaseId;

  for (const f of files) {
    console.log("Processing file:", f.name, f.type); // デバッグ用
    if (!f.type || !f.type.startsWith("image/")) {
      console.log("Skipping non-image file:", f.name); // デバッグ用
      continue;
    }

    // If no test case is specified, create a new one for each file
    if (!tcId) {
      const p = getCurrentProject();
      console.log("Current project:", p); // デバッグ用
      if (p) {
        // ファイル名ではなくNo.x形式で統一
        tcId = addTestCase("");
        console.log("Created test case:", tcId); // デバッグ用
      } else {
        console.warn("No project selected!"); // デバッグ用
        // プロジェクトがない場合はメッセージを表示して処理を中断
        import("./utils.js").then(({ showMessage }) => {
          showMessage(
            "プロジェクトを選択してください。サイドバーから作成できます。",
            true
          );
        });
        return;
      }
    }

    console.log("Adding evidence for file:", f.name); // デバッグ用

    // EXIF情報から撮影日時を取得
    const exifDate = await getExifDateFromImage(f);
    console.log("EXIF date:", exifDate); // デバッグ用

    // EXIF日時があればそれを使用、なければ現在時刻を使用
    // lastModifiedは信頼できない場合が多いため使用しない
    const fileDate = exifDate || new Date();
    console.log("File lastModified:", f.lastModified); // デバッグ用
    console.log("Final date used:", fileDate); // デバッグ用

    await addEvidence(f, f.name || "", tcId, f.name || "", fileDate);
    console.log("Evidence added successfully"); // デバッグ用

    // 複数ファイル選択時は同じテストケースに追加するため、tcIdをリセットしない
  }
  console.log("handleFileSelect completed"); // デバッグ用
}

/**
 * クリップボードの貼り付けイベントを処理します。
 * @param {ClipboardEvent} e
 * @param {string | null} targetTestCaseId
 */
export async function handlePaste(e, targetTestCaseId = null) {
  if (!e || !e.clipboardData) return;
  const items = Array.from(e.clipboardData.items || []);
  for (const it of items) {
    if (it.kind === "file" && it.type.startsWith("image/")) {
      const file = it.getAsFile();
      if (file) {
        // No.x形式で統一
        const tcId = targetTestCaseId || addTestCase("");
        await handleFileSelect([file], tcId);
      }
    }
  }
}

/**
 * インラインペーストエリアを作成します。
 * @param {string} testCaseId
 * @returns {HTMLElement}
 */
export function createInlinePasteArea(testCaseId) {
  const wrapper = document.createElement("div");
  wrapper.className =
    "inline-paste-area p-3 border border-dashed border-gray-300 rounded-md bg-white text-center text-sm text-gray-500";
  wrapper.innerHTML = `<div class="inline-paste-message">ここにファイルをドロップ / クリックして選択 / Ctrl+Vで貼り付け</div>`;

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.multiple = true;
  fileInput.style.display = "none";

  wrapper.onclick = (e) => {
    e.stopPropagation();
    fileInput.click();
  };
  fileInput.onchange = (e) => handleFileSelect(e.target.files, testCaseId);
  wrapper.onpaste = (e) => {
    e.preventDefault();
    e.stopPropagation();
    handlePaste(e, testCaseId);
  };
  wrapper.ondragover = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    wrapper.classList.add("bg-blue-50");
  };
  wrapper.ondragleave = (e) => {
    e.preventDefault();
    wrapper.classList.remove("bg-blue-50");
  };
  wrapper.ondrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    wrapper.classList.remove("bg-blue-50");
    if (e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files, testCaseId);
    }
  };

  wrapper.appendChild(fileInput);
  return wrapper;
}

/**
 * ドラッグ＆ドロップのイベントリスナーを設定します。
 */
export function addDragDropListeners() {
  // 必要なモジュールをインポート
  import("./state.js").then((stateModule) => {
    import("./actions.js").then((actionsModule) => {
      const { setDraggedItem } = stateModule;
      const { handleDropOnTestCase } = actionsModule;

      document.querySelectorAll(".evidence-item-wrapper").forEach((el) => {
        el.ondragstart = (e) => {
          console.log("Drag start:", el.id);
          setDraggedItem(el);
          el.classList.add("dragging");
          e.dataTransfer.setData("text/plain", el.id);
          e.dataTransfer.effectAllowed = "move";
        };
        el.ondragend = () => {
          console.log("Drag end:", el.id);
          setDraggedItem(null);
          el.classList.remove("dragging");
        };
      });

      document
        .querySelectorAll(".evidence-list-for-case")
        .forEach((container) => {
          container.ondragover = (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            container.classList.add("drop-target");
          };
          container.ondragleave = () =>
            container.classList.remove("drop-target");
          container.ondrop = (e) => {
            e.preventDefault();
            console.log("Drop on container:", container.id);
            container.classList.remove("drop-target");
            // ドロップ時に最新のdraggedItemを取得
            const currentDraggedItem = stateModule.draggedItem;
            console.log("Current dragged item:", currentDraggedItem);
            if (currentDraggedItem) {
              const evidenceId = currentDraggedItem.dataset.id;
              const newTestCaseId = container.id.replace(
                "evidence-container-",
                ""
              );
              console.log(`Moving ${evidenceId} to ${newTestCaseId}`);
              handleDropOnTestCase(evidenceId, newTestCaseId);
            } else {
              console.warn("No dragged item found!");
            }
          };
        });
    });
  });
}
