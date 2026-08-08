// 生成 TabBar 图标 (81x81 PNG)
const fs = require('fs');
const path = require('path');

const ICON_DIR = path.join(__dirname, '..', 'ai-model-rankings', 'assets', 'tabbar');

// 简单的 PNG 生成器 (无依赖)
function createSimplePNG(width, height, r, g, b) {
  // 创建一个最小的有效 PNG
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // color type (RGB)
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  const ihdrChunk = createChunk('IHDR', ihdrData);

  // IDAT chunk (image data)
  const rawData = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    rawData[y * (width * 3 + 1)] = 0; // filter none
    for (let x = 0; x < width; x++) {
      const offset = y * (width * 3 + 1) + 1 + x * 3;
      rawData[offset] = r;
      rawData[offset + 1] = g;
      rawData[offset + 2] = b;
    }
  }

  const zlib = require('zlib');
  const compressed = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressed);

  // IEND chunk
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuffer, data]);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData), 0);

  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = crc ^ buf[i];
    for (let j = 0; j < 8; j++) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ 0xEDB88320;
      } else {
        crc = crc >>> 1;
      }
    }
  }
  return (crc ^ -1) >>> 0;
}

// 生成图标
const icons = [
  { name: 'rank', color: [100, 116, 139] },          // 灰色
  { name: 'rank-active', color: [15, 94, 240] },      // 蓝色
  { name: 'compare', color: [100, 116, 139] },
  { name: 'compare-active', color: [15, 94, 240] },
  { name: 'calculator', color: [100, 116, 139] },
  { name: 'calculator-active', color: [15, 94, 240] },
  { name: 'recommend', color: [100, 116, 139] },
  { name: 'recommend-active', color: [15, 94, 240] },
];

icons.forEach(icon => {
  const png = createSimplePNG(81, 81, ...icon.color);
  const filePath = path.join(ICON_DIR, icon.name + '.png');
  fs.writeFileSync(filePath, png);
  console.log('Generated:', icon.name + '.png', png.length, 'bytes');
});

console.log('\nDone!');
