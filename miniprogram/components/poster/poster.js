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
  sub: '#5B6675',
  faint: '#66707C',
  line: '#E4E8EE',
  blue: '#0F5EF0',
  gold: '#C8A24A',
  blueDark: '#0F172A',
  blueBg: '#EEF3FF',
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
      // 英文尽量在空格处断行，避免把单词切成两半
      var sp = line.lastIndexOf(' ');
      if (sp > 0) {
        lines.push(line.slice(0, sp));
        line = line.slice(sp + 1) + text[i];
      } else {
        lines.push(line);
        line = text[i];
      }
      if (lines.length === maxLines) break;
    } else {
      line = next;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && line && lines[maxLines - 1] !== line) {
    lines[maxLines - 1] = fitText(ctx, lines[maxLines - 1] + '…', maxWidth);
  }
  return lines;
}

function drawStar(ctx, cx, cy, r, color) {
  ctx.beginPath();
  for (var i = 0; i < 10; i++) {
    var ang = -Math.PI / 2 + i * Math.PI / 5;
    var rad = i % 2 === 0 ? r : r * 0.42;
    var x = cx + Math.cos(ang) * rad;
    var y = cy + Math.sin(ang) * rad;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

Component({
  data: {
    generating: false,
  },

  methods: {
    generate: function (opts, cb) {
      var that = this;
      if (this.data.generating) return;
      opts = opts || {};
      var key = this.posterKey(opts);
      if (this._lastPoster && this._lastPoster.key === key && Date.now() - this._lastPoster.at < 5 * 60 * 1000) {
        cb && cb(null, this._lastPoster.path);
        return;
      }
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
          that.draw(canvas, opts, function (err, path) {
            that.setData({ generating: false });
            if (!err && path) that._lastPoster = { key: key, path: path, at: Date.now() };
            cb && cb(err, path);
          });
        });
    },

    posterKey: function (opts) {
      return JSON.stringify({
        layout: opts.layout || 'ranking',
        title: opts.title || '',
        subtitle: opts.subtitle || '',
        updated: opts.updated || '',
        rows: opts.rows || [],
        models: opts.models || [],
        elo: opts.elo || '',
        note: opts.note || '',
        review: opts.review || '',
        dimensions: opts.dimensions || [],
        scoreLabel: opts.scoreLabel || '',
        rankText: opts.rankText || '',
        priceIn: opts.priceIn || '',
        priceOut: opts.priceOut || '',
        hasPrice: !!opts.hasPrice,
        priceProxy: !!opts.priceProxy,
        contextText: opts.contextText || '',
        votesText: opts.votesText || '',
        confidenceText: opts.confidenceText || '',
      });
    },

    // 静态二维码：不打云函数、不下载，直接读包内资源
    loadQr: function (canvas, cb) {
      var that = this;
      if (this._qrImage) return cb(this._qrImage);
      var settled = false;
      var done = function (img) {
        if (settled) return;
        settled = true;
        if (img) that._qrImage = img;
        cb(img || null);
      };
      var load = function (path) {
        var img = canvas.createImage();
        img.onload = function () { done(img); };
        img.onerror = function () { done(null); };
        img.src = path;
      };
      wx.getImageInfo({
        src: '/assets/poster/qr-home.png',
        success: function (res) { load(res.path.indexOf('/') === 0 ? res.path : '/' + res.path); },
        fail: function () { load('/assets/poster/qr-home.png'); },
      });
      setTimeout(function () { done(null); }, 800);
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
      var paint = opts.layout === 'detail' ? this.paintDetail
        : (opts.layout === 'compare' ? this.paintCompare : this.paint);

      this.loadQr(canvas, function (qrImage) {
        paint.call(that, canvas, ctx, opts, qrImage, cb);
      });
    },

    paint: function (canvas, ctx, opts, qrImage, cb) {
      // 分享海报只展示前 8 名，给行距留呼吸；完整榜单由二维码承接
      var rows = (opts.rows || []).slice(0, 8);
      var updated = opts.updated || '';

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, W, H);

      // Header：品牌 + 榜单名 + 日期
      ctx.fillStyle = COLOR.ink;
      ctx.fillRect(0, 0, W, HEADER_H);
      ctx.fillStyle = 'rgba(255,255,255,0.68)';
      ctx.font = '22px "PingFang SC", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('AI 模型排行', PAD, 50);
      ctx.textAlign = 'right';
      ctx.fillText(updated, W - PAD, 50);
      ctx.textAlign = 'left';

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 60px "PingFang SC", sans-serif';
      ctx.fillText(fitText(ctx, opts.title || 'AI模型排行', W - PAD * 2), PAD, 146);

      ctx.fillStyle = 'rgba(255,255,255,0.76)';
      ctx.font = '27px "PingFang SC", sans-serif';
      ctx.fillText(fitText(ctx, opts.subtitle || '', W - PAD * 2), PAD, 204);

      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(PAD, HEADER_H - 3, W - PAD * 2, 3);

      // 今日结论：先给读者一个“为什么看”
      if (opts.conclusion) {
        var boxY = 324;
        ctx.fillStyle = COLOR.blueBg;
        roundRect(ctx, PAD, boxY, W - PAD * 2, 92, 14);
        ctx.fill();
        ctx.fillStyle = COLOR.blue;
        ctx.font = 'bold 19px "PingFang SC", sans-serif';
        ctx.fillText('今日结论', PAD + 22, boxY + 30);
        ctx.fillStyle = COLOR.ink;
        ctx.font = '25px "PingFang SC", sans-serif';
        var cl = wrapText(ctx, opts.conclusion, W - PAD * 2 - 44, 2);
        if (cl[0]) ctx.fillText(cl[0], PAD + 22, boxY + 62);
        if (cl[1]) ctx.fillText(cl[1], PAD + 22, boxY + 88);
      }

      // 冠军块
      var top = rows[0];
      if (top) {
        var cy = 442;
        ctx.fillStyle = '#F4F7FF';
        roundRect(ctx, PAD, cy, W - PAD * 2, 150, 18);
        ctx.fill();
        ctx.fillStyle = COLOR.ink;
        ctx.font = 'bold 42px "PingFang SC", sans-serif';
        ctx.fillText('01', PAD + 24, cy + 76);
        drawStar(ctx, PAD + 106, cy + 62, 16, COLOR.gold);
        ctx.fillStyle = COLOR.ink;
        ctx.font = 'bold 44px "PingFang SC", sans-serif';
        ctx.fillText(fitText(ctx, top.name || '', W - PAD * 2 - 400), PAD + 136, cy + 72);
        ctx.fillStyle = COLOR.sub;
        ctx.font = '23px "PingFang SC", sans-serif';
        var topMeta = (top.provider || '') + (top.priceText ? '   ' + top.priceText : '');
        ctx.fillText(fitText(ctx, topMeta, W - PAD * 2 - 400), PAD + 136, cy + 112);
        ctx.textAlign = 'right';
        ctx.fillStyle = COLOR.ink;
        ctx.font = 'bold 52px "PingFang SC", sans-serif';
        ctx.fillText(String(top.elo || ''), W - PAD - 24, cy + 82);
        if (top.delta) {
          ctx.fillStyle = COLOR.blue;
          ctx.font = 'bold 20px "PingFang SC", sans-serif';
          ctx.fillText(top.delta, W - PAD - 24, cy + 112);
        }
        var second = rows[1];
        var gap = second ? (parseFloat(top.elo) - parseFloat(second.elo)) : 0;
        if (gap > 0) {
          ctx.fillStyle = COLOR.sub;
          ctx.font = '19px "PingFang SC", sans-serif';
          ctx.fillText('领先第 2 名 ' + gap.toFixed(1), W - PAD - 24, cy + 140);
        }
        ctx.textAlign = 'left';
      }

      // 2–3 名
      rows.slice(1, 3).forEach(function (r, i) {
        var ry = 620 + i * 78;
        ctx.fillStyle = COLOR.ink;
        ctx.font = 'bold 32px "PingFang SC", sans-serif';
        ctx.fillText('0' + (i + 2), PAD, ry + 36);
        ctx.fillStyle = COLOR.ink;
        ctx.font = 'bold 32px "PingFang SC", sans-serif';
        ctx.fillText(fitText(ctx, r.name || '', W - PAD * 2 - 300), PAD + 72, ry + 34);
        ctx.fillStyle = COLOR.sub;
        ctx.font = '21px "PingFang SC", sans-serif';
        ctx.fillText(fitText(ctx, (r.provider || '') + (r.priceText ? '   ' + r.priceText : ''), W - PAD * 2 - 300), PAD + 72, ry + 62);
        ctx.textAlign = 'right';
        ctx.fillStyle = COLOR.ink;
        ctx.font = 'bold 34px "PingFang SC", sans-serif';
        ctx.fillText(String(r.elo || ''), W - PAD, ry + 38);
        ctx.textAlign = 'left';
        ctx.strokeStyle = COLOR.line;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(PAD, ry + 74);
        ctx.lineTo(W - PAD, ry + 74);
        ctx.stroke();
      });

      // 4–8 名：留出行距
      rows.slice(3, 8).forEach(function (r, i) {
        var ry = 800 + i * 76;
        ctx.fillStyle = COLOR.sub;
        ctx.font = '24px "PingFang SC", sans-serif';
        ctx.fillText(String(r.rank || i + 4), PAD, ry + 34);
        ctx.fillStyle = COLOR.ink;
        ctx.font = '26px "PingFang SC", sans-serif';
        ctx.fillText(fitText(ctx, r.name || '', W - PAD * 2 - 270), PAD + 64, ry + 34);
        ctx.fillStyle = COLOR.sub;
        ctx.font = '20px "PingFang SC", sans-serif';
        ctx.fillText(fitText(ctx, (r.provider || '') + (r.priceText ? '   ' + r.priceText : ''), W - PAD * 2 - 270), PAD + 64, ry + 60);
        ctx.textAlign = 'right';
        ctx.fillStyle = COLOR.ink;
        ctx.font = 'bold 28px "PingFang SC", sans-serif';
        ctx.fillText(String(r.elo || ''), W - PAD, ry + 36);
        ctx.textAlign = 'left';
        ctx.strokeStyle = COLOR.line;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(PAD, ry + 76);
        ctx.lineTo(W - PAD, ry + 76);
        ctx.stroke();
      });

      this.drawFooter(ctx, qrImage);
      this.exportCanvas(canvas, cb);
    },

    exportCanvas: function (canvas, cb) {
      wx.canvasToTempFilePath({
        canvas: canvas,
        x: 0,
        y: 0,
        width: W,
        height: H,
        destWidth: W,
        destHeight: H,
        fileType: 'jpg',
        quality: 0.92,
        success: function (res) { cb && cb(null, res.tempFilePath); },
        fail: function (err) { cb && cb(err.errMsg || '导出图片失败'); },
      }, this);
    },

    // 页脚：二维码 or 文字引导（三种版式共用）
    drawFooter: function (ctx, qrImage) {
      var top = H - 220;
      ctx.fillStyle = COLOR.ink;
      ctx.fillRect(0, top, W, 220);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(PAD, top, W - PAD * 2, 2);

      var qrDrawn = false;
      if (qrImage) {
        try {
          var tile = 156;
          var qrSize = 132;
          var tx = W - PAD - tile;
          var ty = H - 54 - tile;
          ctx.fillStyle = '#FFFFFF';
          roundRect(ctx, tx, ty, tile, tile, 14);
          ctx.fill();
          ctx.drawImage(qrImage, tx + (tile - qrSize) / 2, ty + (tile - qrSize) / 2, qrSize, qrSize);
          qrDrawn = true;
        } catch (e) {}
      }

      ctx.textAlign = 'left';
      if (qrDrawn) {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 30px "PingFang SC", sans-serif';
        ctx.fillText('扫码看完整榜单', PAD, H - 130);
        ctx.fillStyle = 'rgba(255,255,255,0.66)';
        ctx.font = '22px "PingFang SC", sans-serif';
        ctx.fillText('AI模型排行 · 每日自动更新', PAD, H - 88);
        ctx.fillText('数据来自 LMArena 人类盲测', PAD, H - 52);
      } else {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 28px "PingFang SC", sans-serif';
        ctx.fillText('微信搜一搜「AI模型排行」', PAD, H - 110);
        ctx.fillStyle = 'rgba(255,255,255,0.66)';
        ctx.font = '21px "PingFang SC", sans-serif';
        ctx.fillText('LMArena 人类盲测 · 每日自动更新', PAD, H - 68);
      }
    },

    // 版式 B：单模型详情卡
    paintDetail: function (canvas, ctx, opts, qrImage, cb) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, W, H);

      // Header
      ctx.fillStyle = COLOR.ink;
      ctx.fillRect(0, 0, W, 340);
      ctx.fillStyle = 'rgba(255,255,255,0.68)';
      ctx.font = '22px "PingFang SC", sans-serif';
      ctx.fillText('AI 模型排行 · 模型详情', PAD, 56);

      if (opts.rankText) {
        ctx.font = 'bold 24px "PingFang SC", sans-serif';
        var tw = ctx.measureText(opts.rankText).width;
        var pillW = tw + 40;
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        roundRect(ctx, W - PAD - pillW, 34, pillW, 48, 24);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'right';
        ctx.fillText(opts.rankText, W - PAD - 20, 66);
        ctx.textAlign = 'left';
      }

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 54px "PingFang SC", sans-serif';
      var nameLines = wrapText(ctx, opts.title || '', W - PAD * 2, 2);
      ctx.fillText(nameLines[0] || '', PAD, 154);
      if (nameLines[1]) ctx.fillText(nameLines[1], PAD, 218);

      ctx.fillStyle = 'rgba(255,255,255,0.76)';
      ctx.font = '27px "PingFang SC", sans-serif';
      ctx.fillText(fitText(ctx, opts.subtitle || '', W - PAD * 2), PAD, nameLines[1] ? 286 : 250);

      // 分数
      ctx.fillStyle = COLOR.sub;
      ctx.font = '22px "PingFang SC", sans-serif';
      ctx.fillText(opts.scoreLabel || '综合 Elo', PAD, 400);
      ctx.fillStyle = COLOR.ink;
      ctx.font = 'bold 104px "PingFang SC", sans-serif';
      ctx.fillText(String(opts.elo || '—'), PAD, 512);
      ctx.fillStyle = COLOR.blue;
      ctx.fillRect(PAD, 540, 260, 5);

      ctx.textAlign = 'right';
      ctx.fillStyle = COLOR.sub;
      ctx.font = '22px "PingFang SC", sans-serif';
      if (opts.votesText) ctx.fillText(opts.votesText, W - PAD, 404);
      if (opts.contextText) ctx.fillText(opts.contextText, W - PAD, 444);
      if (opts.confidenceText) ctx.fillText(opts.confidenceText, W - PAD, 484);
      ctx.textAlign = 'left';

      // 价格
      var cardY = 590;
      ctx.fillStyle = '#F8FAFC';
      roundRect(ctx, PAD, cardY, W - PAD * 2, 136, 16);
      ctx.fill();
      ctx.fillStyle = COLOR.sub;
      ctx.font = '21px "PingFang SC", sans-serif';
      ctx.fillText('API 价格（每百万 tokens）', PAD + 24, cardY + 36);
      if (opts.hasPrice) {
        ctx.fillStyle = COLOR.ink;
        ctx.font = 'bold 34px "PingFang SC", sans-serif';
        ctx.fillText('输入 ' + (opts.priceIn || '—'), PAD + 24, cardY + 92);
        ctx.fillText('输出 ' + (opts.priceOut || '—'), PAD + 470, cardY + 92);
        if (opts.priceProxy) {
          ctx.fillStyle = COLOR.sub;
          ctx.font = '20px "PingFang SC", sans-serif';
          ctx.fillText('代理价', PAD + 24, cardY + 120);
        }
      } else {
        ctx.fillStyle = COLOR.faint;
        ctx.font = '28px "PingFang SC", sans-serif';
        ctx.fillText('暂无公开 API 定价', PAD + 24, cardY + 92);
      }

      // 点评（最多 2 行，超出省略）
      var revY = 752;
      ctx.fillStyle = COLOR.blueBg;
      roundRect(ctx, PAD, revY, W - PAD * 2, 158, 16);
      ctx.fill();
      ctx.fillStyle = COLOR.blue;
      ctx.font = 'bold 20px "PingFang SC", sans-serif';
      ctx.fillText('一句话点评', PAD + 24, revY + 32);
      ctx.fillStyle = COLOR.ink;
      ctx.font = '27px "PingFang SC", sans-serif';
      var revLines = wrapText(ctx, opts.review || '', W - PAD * 2 - 48, 2);
      revLines.forEach(function (line, i) {
        ctx.fillText(line, PAD + 24, revY + 72 + i * 36);
      });

      // 分维度：文本，不画几乎一样长的满格条
      var dims = (opts.dimensions || []).slice(0, 3);
      if (dims.length) {
        var dy = 960;
        ctx.fillStyle = COLOR.sub;
        ctx.font = 'bold 21px "PingFang SC", sans-serif';
        ctx.fillText('分维度 Elo', PAD, dy);
        dims.forEach(function (d, i) {
          var ry = dy + 38 + i * 46;
          ctx.fillStyle = COLOR.ink;
          ctx.font = '25px "PingFang SC", sans-serif';
          ctx.fillText(fitText(ctx, d.name || '', W - PAD * 2 - 180), PAD, ry);
          ctx.textAlign = 'right';
          ctx.fillStyle = COLOR.ink;
          ctx.font = 'bold 26px "PingFang SC", sans-serif';
          ctx.fillText(String(d.elo || ''), W - PAD, ry);
          ctx.textAlign = 'left';
          ctx.strokeStyle = COLOR.line;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(PAD, ry + 16);
          ctx.lineTo(W - PAD, ry + 16);
          ctx.stroke();
        });
      }

      this.drawFooter(ctx, qrImage);
      this.exportCanvas(canvas, cb);
    },

    paintCompare: function (canvas, ctx, opts, qrImage, cb) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = COLOR.ink;
      ctx.fillRect(0, 0, W, 250);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(PAD, 246, W - PAD * 2, 3);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 50px "PingFang SC", sans-serif';
      ctx.fillText(fitText(ctx, opts.title || '模型对比', W - PAD * 2), PAD, 116);
      ctx.fillStyle = 'rgba(255,255,255,0.74)';
      ctx.font = '24px "PingFang SC", sans-serif';
      ctx.fillText(fitText(ctx, opts.subtitle || '', W - PAD * 2), PAD, 176);

      var models = opts.models || [];
      var n = Math.max(models.length, 1);
      var labelW = 190;
      var tableW = W - PAD * 2;
      var colW = (tableW - labelW) / n;

      // 模型名：卡片 + 最多两行，避免切断英文
      models.forEach(function (name, i) {
        var cardX = PAD + labelW + colW * i + 8;
        var cardW = colW - 16;
        ctx.fillStyle = '#F4F7FF';
        roundRect(ctx, cardX, 274, cardW, 84, 12);
        ctx.fill();
        var cx = cardX + cardW / 2;
        var lines = wrapText(ctx, name, cardW - 24, 2);
        ctx.fillStyle = COLOR.ink;
        ctx.font = 'bold 22px "PingFang SC", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(lines[0] || '', cx, 312);
        if (lines[1]) ctx.fillText(lines[1], cx, 340);
      });
      ctx.textAlign = 'left';

      // 只保留至少两个模型有值的行
      var rows = (opts.rows || []).filter(function (r) {
        return (r.values || []).filter(function (v) { return v && v !== '-'; }).length >= 2;
      });
      var y0 = 382;
      var noteH = 140;
      var maxBottom = H - 270;
      var rowH = Math.max(72, Math.min(120, Math.floor((maxBottom - y0 - noteH - 30) / Math.max(rows.length, 1))));

      rows.forEach(function (r, ri) {
        var ry = y0 + ri * rowH;
        if (ri % 2 === 0) {
          ctx.fillStyle = '#FAFBFD';
          ctx.fillRect(PAD, ry, tableW, rowH);
        }
        ctx.fillStyle = COLOR.sub;
        ctx.font = '22px "PingFang SC", sans-serif';
        ctx.fillText(fitText(ctx, r.label || '', labelW - 16), PAD + 16, ry + rowH / 2 + 8);
        (r.values || []).forEach(function (v, ci) {
          var cx = PAD + labelW + colW * ci + colW / 2;
          ctx.textAlign = 'center';
          if (r.best === ci) {
            ctx.fillStyle = COLOR.ink;
            ctx.font = 'bold 30px "PingFang SC", sans-serif';
          } else {
            ctx.fillStyle = COLOR.ink;
            ctx.font = '27px "PingFang SC", sans-serif';
          }
          ctx.fillText(fitText(ctx, String(v), colW - 22), cx, ry + rowH / 2 + 8);
        });
        ctx.textAlign = 'left';
        ctx.strokeStyle = COLOR.line;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(PAD, ry + rowH);
        ctx.lineTo(W - PAD, ry + rowH);
        ctx.stroke();
      });

      var noteY = y0 + rows.length * rowH + 30;
      if (noteY + noteH > H - 230) noteY = H - 230 - noteH;
      if (opts.note) {
        ctx.fillStyle = COLOR.blueBg;
        roundRect(ctx, PAD, noteY, tableW, noteH, 14);
        ctx.fill();
        ctx.fillStyle = COLOR.blue;
        ctx.font = 'bold 20px "PingFang SC", sans-serif';
        ctx.fillText('对比结论', PAD + 24, noteY + 36);
        ctx.fillStyle = COLOR.ink;
        ctx.font = '25px "PingFang SC", sans-serif';
        var nl = wrapText(ctx, opts.note, tableW - 48, 2);
        ctx.fillText(nl[0] || '', PAD + 24, noteY + 76);
        if (nl[1]) ctx.fillText(nl[1], PAD + 24, noteY + 112);
      }

      this.drawFooter(ctx, qrImage);
      this.exportCanvas(canvas, cb);
    },
  },
});
