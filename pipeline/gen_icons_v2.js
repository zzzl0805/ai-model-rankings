const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ICON_DIR = path.join(__dirname, '..', 'ai-model-rankings', 'assets', 'tabbar');
const SIZE = 81;

// PNG 工具函数
function createPNG(width, height, pixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; ihdrData[9] = 6; // 8-bit RGBA
  const ihdr = createChunk('IHDR', ihdrData);

  // IDAT
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = y * (width * 4 + 1) + 1 + x * 4;
      raw[dstIdx] = pixels[srcIdx];
      raw[dstIdx + 1] = pixels[srcIdx + 1];
      raw[dstIdx + 2] = pixels[srcIdx + 2];
      raw[dstIdx + 3] = pixels[srcIdx + 3];
    }
  }
  const compressed = zlib.deflateSync(raw);
  const idat = createChunk('IDAT', compressed);

  // IEND
  const iend = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let j = 0; j < 8; j++) c = (c & 1) ? (c >>> 1) ^ 0xEDB88320 : c >>> 1;
  }
  return (c ^ -1) >>> 0;
}

// 绘制函数
function createCanvas() {
  const pixels = new Uint8Array(SIZE * SIZE * 4);
  return {
    pixels,
    setPixel(x, y, r, g, b, a = 255) {
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
      const i = (y * SIZE + x) * 4;
      pixels[i] = r; pixels[i+1] = g; pixels[i+2] = b; pixels[i+3] = a;
    },
    fillCircle(cx, cy, radius, r, g, b) {
      for (let y = cy - radius; y <= cy + radius; y++) {
        for (let x = cx - radius; x <= cx + radius; x++) {
          if ((x-cx)*(x-cx) + (y-cy)*(y-cy) <= radius*radius) {
            this.setPixel(x, y, r, g, b);
          }
        }
      }
    },
    fillRect(x1, y1, x2, y2, r, g, b) {
      for (let y = y1; y <= y2; y++) {
        for (let x = x1; x <= x2; x++) {
          this.setPixel(x, y, r, g, b);
        }
      }
    },
    fillTriangle(x1, y1, x2, y2, x3, y3, r, g, b) {
      const minY = Math.min(y1, y2, y3);
      const maxY = Math.max(y1, y2, y3);
      const minX = Math.min(x1, x2, x3);
      const maxX = Math.max(x1, x2, x3);
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const d1 = (x-x2)*(y1-y2) - (x1-x2)*(y-y2);
          const d2 = (x-x3)*(y2-y3) - (x2-x3)*(y-y3);
          const d3 = (x-x1)*(y3-y1) - (x3-x1)*(y-y1);
          const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
          const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
          if (!(hasNeg && hasPos)) this.setPixel(x, y, r, g, b);
        }
      }
    }
  };
}

// 生成图标
function genRankIcon(color) {
  const c = createCanvas();
  // 奖杯形状
  c.fillRect(30, 15, 50, 20, ...color); // 顶部横条
  c.fillRect(25, 20, 55, 50, ...color); // 杯身
  c.fillRect(30, 50, 50, 60, ...color); // 杯底
  c.fillRect(35, 60, 45, 70, ...color); // 底座
  // 把手
  c.fillRect(15, 25, 25, 30, ...color);
  c.fillRect(15, 30, 20, 45, ...color);
  c.fillRect(15, 45, 25, 50, ...color);
  c.fillRect(55, 25, 65, 30, ...color);
  c.fillRect(60, 30, 65, 45, ...color);
  c.fillRect(55, 45, 65, 50, ...color);
  return c.pixels;
}

function genCompareIcon(color) {
  const c = createCanvas();
  // 两个柱子对比
  c.fillRect(15, 25, 35, 65, ...color); // 左柱
  c.fillRect(45, 35, 65, 65, ...color); // 右柱
  // 箭头
  c.fillTriangle(35, 20, 45, 20, 40, 10, ...color);
  return c.pixels;
}

function genCalculatorIcon(color) {
  const c = createCanvas();
  // 计算器外框
  c.fillRect(20, 10, 60, 70, ...color);
  // 屏幕
  c.fillRect(25, 15, 55, 30, 255, 255, 255);
  // 按钮
  c.fillRect(25, 35, 35, 45, 255, 255, 255);
  c.fillRect(40, 35, 50, 45, 255, 255, 255);
  c.fillRect(25, 50, 35, 60, 255, 255, 255);
  c.fillRect(40, 50, 50, 60, 255, 255, 255);
  return c.pixels;
}

function genRecommendIcon(color) {
  const c = createCanvas();
  // 目标/靶心
  c.fillCircle(40, 40, 30, ...color);
  c.fillCircle(40, 40, 22, 255, 255, 255);
  c.fillCircle(40, 40, 15, ...color);
  c.fillCircle(40, 40, 8, 255, 255, 255);
  c.fillCircle(40, 40, 3, ...color);
  return c.pixels;
}

// 颜色
const gray = [100, 116, 139];
const blue = [15, 94, 240];

// 生成所有图标
const icons = [
  { name: 'rank', fn: genRankIcon, color: gray },
  { name: 'rank-active', fn: genRankIcon, color: blue },
  { name: 'compare', fn: genCompareIcon, color: gray },
  { name: 'compare-active', fn: genCompareIcon, color: blue },
  { name: 'calculator', fn: genCalculatorIcon, color: gray },
  { name: 'calculator-active', fn: genCalculatorIcon, color: blue },
  { name: 'recommend', fn: genRecommendIcon, color: gray },
  { name: 'recommend-active', fn: genRecommendIcon, color: blue },
];

icons.forEach(icon => {
  const pixels = icon.fn(icon.color);
  const png = createPNG(SIZE, SIZE, pixels);
  fs.writeFileSync(path.join(ICON_DIR, icon.name + '.png'), png);
  console.log(`${icon.name}.png: ${png.length} bytes`);
});

console.log('Done!');
