// exif-reader.js - EXIF情報から撮影日時を取得

/**
 * 画像ファイルからEXIF情報の撮影日時を取得
 * @param {File|Blob} file
 * @returns {Promise<Date|null>}
 */
export async function getExifDateFromImage(file) {
  try {
    console.log("getExifDateFromImage: 開始", file.name, file.type); // デバッグ用
    const arrayBuffer = await file.arrayBuffer();
    const dataView = new DataView(arrayBuffer);
    console.log("getExifDateFromImage: ファイルサイズ", dataView.byteLength); // デバッグ用

    // JPEGヘッダーチェック (0xFFD8)
    const header = dataView.getUint16(0);
    console.log("getExifDateFromImage: ヘッダー", header.toString(16)); // デバッグ用
    if (header !== 0xffd8) {
      console.log("Not a JPEG file, header:", header.toString(16));
      return null;
    }

    let offset = 2;
    const length = dataView.byteLength;

    // APP1マーカー (0xFFE1) を探す
    while (offset < length) {
      const marker = dataView.getUint16(offset);

      if (marker === 0xffe1) {
        // APP1セグメント発見
        offset += 2;
        const segmentLength = dataView.getUint16(offset);
        offset += 2;

        // Exifヘッダーチェック
        const exifHeader = String.fromCharCode(
          dataView.getUint8(offset),
          dataView.getUint8(offset + 1),
          dataView.getUint8(offset + 2),
          dataView.getUint8(offset + 3)
        );

        if (exifHeader !== "Exif") {
          offset += segmentLength - 2;
          continue;
        }

        offset += 6; // "Exif\0\0"をスキップ

        // TIFFヘッダー
        const tiffOffset = offset;
        const byteOrder = dataView.getUint16(tiffOffset);
        const littleEndian = byteOrder === 0x4949; // "II"

        // IFD0のオフセット
        const ifd0Offset =
          tiffOffset + getUint32(dataView, tiffOffset + 4, littleEndian);

        // IFD0のエントリ数
        const entryCount = getUint16(dataView, ifd0Offset, littleEndian);

        // IFD0のエントリを走査
        for (let i = 0; i < entryCount; i++) {
          const entryOffset = ifd0Offset + 2 + i * 12;
          const tag = getUint16(dataView, entryOffset, littleEndian);

          // DateTime (0x0132) または DateTimeOriginal を含むExif IFD (0x8769)
          if (tag === 0x8769) {
            // Exif IFDのオフセット
            const exifIfdOffset =
              tiffOffset + getUint32(dataView, entryOffset + 8, littleEndian);
            const exifEntryCount = getUint16(
              dataView,
              exifIfdOffset,
              littleEndian
            );

            for (let j = 0; j < exifEntryCount; j++) {
              const exifEntryOffset = exifIfdOffset + 2 + j * 12;
              const exifTag = getUint16(
                dataView,
                exifEntryOffset,
                littleEndian
              );

              // DateTimeOriginal (0x9003)
              if (exifTag === 0x9003) {
                const valueOffset =
                  tiffOffset +
                  getUint32(dataView, exifEntryOffset + 8, littleEndian);
                const dateString = readString(dataView, valueOffset, 19);
                return parseExifDate(dateString);
              }
            }
          } else if (tag === 0x0132) {
            // DateTime
            const valueOffset =
              tiffOffset + getUint32(dataView, entryOffset + 8, littleEndian);
            const dateString = readString(dataView, valueOffset, 19);
            return parseExifDate(dateString);
          }
        }

        break;
      }

      // 次のマーカーへ
      if (marker === 0xffd9) break; // EOI
      offset += 2;
      if (offset < length) {
        const segmentLength = dataView.getUint16(offset);
        offset += segmentLength;
      }
    }

    console.log("getExifDateFromImage: EXIF日時が見つかりませんでした"); // デバッグ用
    return null;
  } catch (error) {
    console.error("Error reading EXIF data:", error);
    return null;
  }
}

function getUint16(dataView, offset, littleEndian) {
  return dataView.getUint16(offset, littleEndian);
}

function getUint32(dataView, offset, littleEndian) {
  return dataView.getUint32(offset, littleEndian);
}

function readString(dataView, offset, length) {
  let str = "";
  for (let i = 0; i < length; i++) {
    const char = dataView.getUint8(offset + i);
    if (char === 0) break;
    str += String.fromCharCode(char);
  }
  return str;
}

function parseExifDate(dateString) {
  console.log("parseExifDate: 日時文字列", dateString); // デバッグ用
  if (!dateString) return null;

  // EXIF日時フォーマット: "YYYY:MM:DD HH:MM:SS"
  const match = dateString.match(
    /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/
  );
  if (!match) {
    console.log("parseExifDate: フォーマット不一致"); // デバッグ用
    return null;
  }

  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(
    parseInt(year),
    parseInt(month) - 1, // 月は0-11
    parseInt(day),
    parseInt(hour),
    parseInt(minute),
    parseInt(second)
  );
  console.log("parseExifDate: パース成功", date); // デバッグ用
  return date;
}
