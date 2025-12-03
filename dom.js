// dom.js - DOM要素の参照を一元管理

const DOM = {
  // Sidebar
  sidebar: document.getElementById("sidebar"),
  sidebarToggleBtn: document.getElementById("sidebarToggleBtn"),
  projectNav: document.getElementById("projectNav"),
  addProjectButton: document.getElementById("addProjectButton"),

  // Main content
  testCaseListContainer: document.getElementById("testCaseList"),
  addTestCaseButtonGlobal: document.getElementById("addTestCaseButtonGlobal"),

  // Buttons
  addTestCaseButton: document.getElementById("addTestCaseButton"),
  saveDataButton: document.getElementById("saveDataButton"),
  bulkDownloadImagesBtn: document.getElementById("bulkDownloadImages"),
  clearCacheButton: document.getElementById("clearCacheButton"),
  disableTimestampToggle: document.getElementById("disableTimestampToggle"),

  // Global paste area
  globalPasteArea: document.getElementById("globalPasteArea"),
  globalFileInput: document.getElementById("globalFileInput"),

  // Modals
  bulkAddTestCaseModal: document.getElementById("bulkAddTestCaseModal"),
  startTestNoInput: document.getElementById("startTestNo"),
  endTestNoInput: document.getElementById("endTestNo"),
  bulkAddConfirmBtn: document.getElementById("bulkAddConfirmBtn"),
  bulkAddCancelBtn: document.getElementById("bulkAddCancelBtn"),

  // Image modal
  imageModalOverlay: document.getElementById("imageModalOverlay"),
  imageModalContent: document.getElementById("imageModalContent"),

  // Confirm modal
  confirmModalOverlay: document.getElementById("confirmModalOverlay"),
  confirmModalMessage: document.getElementById("confirmModalMessage"),
  confirmModalConfirmBtn: document.getElementById("confirmModalConfirmBtn"),
  confirmModalCancelBtn: document.getElementById("confirmModalCancelBtn"),

  // Editor modal
  editorModalOverlay: document.getElementById("editorModalOverlay"),
  editorCanvas: document.getElementById("editorCanvas"),
  get editorCtx() {
    return this.editorCanvas
      ? this.editorCanvas.getContext("2d", { willReadFrequently: true })
      : null;
  },
  drawRectBtn: document.getElementById("drawRectBtn"),
  drawLineBtn: document.getElementById("drawLineBtn"),
  undoBtn: document.getElementById("undoBtn"),
  saveEditBtn: document.getElementById("saveEditBtn"),
  closeEditBtn: document.getElementById("closeEditBtn"),

  // Loading overlay
  loadingOverlay: document.getElementById("loadingOverlay"),
};

export default DOM;
