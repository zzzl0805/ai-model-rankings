// components/poster — 榜单海报生成（Canvas 2D，1080×1440）
// 用法：
//   this.selectComponent('#poster').generate({
//     title, subtitle, rows: [{rank, name, provider, elo, priceText}],
//     conclusion, updated, deepPage
//   }, (err, tempFilePath) => { ... })
// 小程序码拿不到时自动降级为「微信搜一搜」文字引导。

var W = 1080;
var H = 1440;
var PAD = 64;
var HEADER_H = 300;
var BODY_TOP = 344;
var ROW_H = 80;
var MAX_ROWS = 10;

var COLOR = {
  ink: '#0F172A',
  sub: '#64748B',
  faint: '#94A3B8',
  line: '#F1F5F9',
  blue: '#0F5EF0',
  blueDark: '#1E3A8A',
  blueBg: '#EFF6FF',
};

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitText(ctx, text, maxWidth) {
  text = String(text || '');
  if (ctx.measureText(text).width <= maxWidth) return text;
  var out = text;
  while (out.length > 1 && ctx.measureText(out + '…').width > maxWidth) {
    out = out.slice(0, -1);
  }
  return out + '…';
}

function wrapText(ctx, text, maxWidth, maxLines) {
  text = String(text || '');
  var lines = [];
  var line = '';
  for (var i = 0; i < text.length; i++) {
    var next = line + text[i];
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = text[i];
      if (lines.length === maxLines) break;
    } else {
      line = next;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines) {
    var last = lines[maxLines - 1];
    if (ctx.measureText(last).width > maxWidth) {
      lines[maxLines - 1] = fitText(ctx, last, maxWidth);
    }
  }
  return lines;
}

Component({
  data: {
    generating: false,
  },

  methods: {
    generate: function (opts, cb) {
      var that = this;
      if (this.data.generating) return;
      this.setData({ generating: true });

      this.createSelectorQuery()
        .select('#poster-canvas')
        .fields({ node: true })
        .exec(function (res) {
          var canvas = res && res[0] && res[0].node;
          if (!canvas) {
            that.setData({ generating: false });
            cb && cb('canvas 初始化失败');
            return;
          }
          that.draw(canvas, opts || {}, function (err, path) {
            that.setData({ generating: false });
            cb && cb(err, path);
          });
        });
    },

    // 尝试拿小程序码（失败/超时返回 null，不影响出图）
    fetchQrCode: function (opts, callback) {
      var that = this;
      var page = opts.qrPage || 'pages/index/index';
      var scene = opts.qrScene || '';
      var key = page + '|' + scene;

      // 同一入口 10 分钟内复用，避免重复调用云函数
      this._qrCache = this._qrCache || {};
      var hit = this._qrCache[key];
      if (hit && Date.now() - hit.at < 10 * 60 * 1000) return callback(hit.path);

      var done = false;
      var timer = null;
      var finish = function (path) {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        if (path) that._qrCache[key] = { path: path, at: Date.now() };
        callback(path || null);
      };
      if (!wx.cloud) return finish(null);
      timer = setTimeout(function () { finish(null); }, 5000);

      wx.cloud.callFunction({
        name: 'wxacode',
        data: { page: page, scene: scene },
        success: function (res) {
          var url = res.result && res.result.code === 0 && res.result.url;
          if (!url) return finish(null);
          wx.downloadFile({
            url: url,
            success: function (dl) {
              finish(dl.statusCode === 200 ? dl.tempFilePath : null);
            },
            fail: function () { finish(null); },
          });
        },
        fail: function () { finish(null); },
      });
    },

    draw: function (canvas, opts, cb) {
      var that = this;
      canvas.width = W;
      canvas.height = H;
      var ctx = canvas.getContext('2d');

      this.fetchQrCode(opts, function (qrPath) {
        if (!qrPath) return that.paint(canvas, ctx, opts, null, cb);

        // drawImage 需要图片对象，不能直接用文件路径
        var img = canvas.createImage();
        var settled = false;
        var done = function (image) {
          if (settled) return;
          settled = true;
          that.paint(canvas, ctx, opts, image, cb);
        };
        img.onload = function () { done(img); };
        img.onerror = function () { done(null); };
        setTimeout(function () { done(null); }, 3000);
        img.src = qrPath;
      });
    },

    paint: function (canvas, ctx, opts, qrPath, cb) {
      var rows = (opts.rows || []).slice(0, MAX_ROWS);
      var updated = opts.updated || '';

      // 背景
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, W, H);

      // 头部渐变
      var grad = ctx.createLinearGradient(0, 0, W, HEADER_H);
      grad.addColorStop(0, '#1A1A2E');
      grad.addColorStop(0.6, '#16213E');
      grad.addColorStop(1, '#0F5EF0');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, HEADER_H);

      // 标题
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 60px "PingFang SC", sans-serif';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(fitText(ctx, opts.title || 'AI模型排行', W - PAD * 2), PAD, 150);

      // 副标题
      ctx.fillStyle = 'rgba(255,255,255,0.78)';
      ctx.font = '30px "PingFang SC", sans-serif';
      ctx.fillText(fitText(ctx, opts.subtitle || '', W - PAD * 2), PAD, 212);

      // 数据日期
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = '26px "PingFang SC", sans-serif';
      ctx.fillText('LMArena 人类盲测 · 数据截至 ' + updated, PAD, 260);

      // 榜单
      var y = BODY_TOP;
      rows.forEach(function (r, i) {
        var rowY = y + i * ROW_H;

        // 前三名底色
        if (i < 3) {
          ctx.fillStyle = 'rgba(15,94,240,0.05)';
          roundRect(ctx, PAD - 16, rowY - 10, W - (PAD - 16) * 2, ROW_H - 8, 14);
          ctx.fill();
        }

        // 名次
        ctx.fillStyle = i < 3 ? COLOR.blue : COLOR.faint;
        ctx.font = 'italic bold 40px "PingFang SC", sans-serif';
        ctx.fillText(String(r.rank || i + 1), PAD, rowY + 50);

        // 模型名
        var nameMax = W - PAD - 360;
        ctx.fillStyle = COLOR.ink;
        ctx.font = 'bold 34px "PingFang SC", sans-serif';
        ctx.fillText(fitText(ctx, r.name, nameMax), PAD + 76, rowY + 38);

        // 厂商 + 价格
        ctx.fillStyle = COLOR.sub;
        ctx.font = '24px "PingFang SC", sans-serif';
        var meta = (r.provider || '') + (r.priceText ? '   ' + r.priceText : '');
        ctx.fillText(fitText(ctx, meta, nameMax), PAD + 76, rowY + 68);

        // Elo（右对齐）
        ctx.fillStyle = COLOR.blue;
        ctx.font = 'bold 38px "PingFang SC", sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(String(r.elo || ''), W - PAD, rowY + 46);
        ctx.textAlign = 'left';

        // 分隔线
        if (i < rows.length - 1) {
          ctx.strokeStyle = COLOR.line;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(PAD, rowY + ROW_H - 4);
          ctx.lineTo(W - PAD, rowY + ROW_H - 4);
          ctx.stroke();
        }
      });

      var listBottom = y + rows.length * ROW_H;

      // 结论卡（高度固定，给底部二维码留出空间）
      if (opts.conclusion) {
        var boxY = listBottom + 12;
        var boxH = 96;
        ctx.fillStyle = COLOR.blueBg;
        roundRect(ctx, PAD, boxY, W - PAD * 2, boxH, 16);
        ctx.fill();
        ctx.fillStyle = COLOR.blueDark;
        ctx.font = 'bold 26px "PingFang SC", sans-serif';
        var lines = wrapText(ctx, opts.conclusion, W - PAD * 2 - 48, 2);
        ctx.fillText(lines[0] || '', PAD + 24, boxY + (lines.length > 1 ? 42 : 60));
        if (lines[1]) ctx.fillText(lines[1], PAD + 24, boxY + 78);
      }

      // 页脚：二维码 or 文字引导
      var qrDrawn = false;
      if (qrPath) {
        try {
          var qrSize = 120;
          ctx.drawImage(qrPath, W - PAD - qrSize, H - 48 - qrSize, qrSize, qrSize);
          qrDrawn = true;
        } catch (e) {}
      }

      if (qrDrawn) {
        ctx.fillStyle = COLOR.ink;
        ctx.font = 'bold 28px "PingFang SC", sans-serif';
        ctx.fillText('微信扫码看完整榜单', PAD, H - 120);
        ctx.fillStyle = COLOR.sub;
        ctx.font = '24px "PingFang SC", sans-serif';
        ctx.fillText('AI模型排行 · 每日自动更新', PAD, H - 76);
      } else {
        ctx.textAlign = 'center';
        ctx.fillStyle = COLOR.blue;
        ctx.font = 'bold 30px "PingFang SC", sans-serif';
        ctx.fillText('微信搜一搜「AI模型排行」', W / 2, H - 100);
        ctx.fillStyle = COLOR.faint;
        ctx.font = '22px "PingFang SC", sans-serif';
        ctx.fillText('LMArena 人类盲测 · 每日自动更新', W / 2, H - 60);
        ctx.textAlign = 'left';
      }

      // 导出
      wx.canvasToTempFilePath({
        canvas: canvas,
        x: 0,
        y: 0,
        width: W,
        height: H,
        destWidth: W,
        destHeight: H,
        fileType: 'png',
        success: function (res) { cb && cb(null, res.tempFilePath); },
        fail: function (err) { cb && cb(err.errMsg || '导出图片失败'); },
      }, this);
    },
  },
});
