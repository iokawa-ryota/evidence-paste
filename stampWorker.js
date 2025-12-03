self.addEventListener("message", async (e) => {
  const data = e.data;
  const id = data.id;
  try {
    // 受け取った ArrayBuffer を Blob に戻す
    const buf = data.buffer;
    const type = data.type || "image/png";
    const blob = new Blob([buf], { type });

    // 元の画像形式を取得（デフォルトはJPEG）
    const mimeType = data.mimeType || type || "image/jpeg";

    // createImageBitmap は worker 内で使用可能（ブラウザ依存）
    const imageBitmap = await createImageBitmap(blob);

    // OffscreenCanvas を使って描画
    const c = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
    const ctx = c.getContext("2d");
    ctx.drawImage(imageBitmap, 0, 0);

    // テキストを描画（例: 右下にタイムスタンプ）
    const text = data.text || "";
    const pad = 12;
    ctx.font = "bold 20px sans-serif";
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    const textWidth = ctx.measureText(text).width;
    const boxW = textWidth + 180;
    const boxH = 34;
    ctx.fillRect(pad, c.height - 42, boxW, boxH);
    ctx.fillStyle = "#fff";
    ctx.fillText(text, pad + 10, c.height - 18);

    // 元の形式で Blob に変換（JPEGは品質0.92、PNGは品質指定なし）
    const quality = mimeType === "image/jpeg" ? 0.92 : undefined;
    const outBlob = await c.convertToBlob({ type: mimeType, quality });

    // postMessage で返却（Blob はそのまま送れる）
    self.postMessage({ id, blob: outBlob });
  } catch (err) {
    self.postMessage({ id, error: err.message || String(err) });
  }
});
