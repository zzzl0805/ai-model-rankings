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
      var paint = opts.layout === 'detail' ? this.paintDetail
        : (opts.layout === 'compare' ? this.paintCompare : this.paint);

      this.fetchQrCode(opts, function (qrPath) {
        if (!qrPath) return paint.call(that, canvas, ctx, opts, null, cb);

        // drawImage 需要图片对象，不能直接用文件路径
        var img = canvas.createImage();
        var settled = false;
        var done = function (image) {
          if (settled) return;
          settled = true;
          paint.call(that, canvas, ctx, opts, image, cb);
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
        fileType: 'png',
        success: function (res) { cb && cb(null, res.tempFilePath); },
        fail: function (err) { cb && cb(err.errMsg || '导出图片失败'); },
      }, this);
    },

    // 页脚：二维码 or 文字引导（三种版式共用）
    drawFooter: function (ctx, qrImage) {
      var qrDrawn = false;
      if (qrImage) {
        try {
          var qrSize = 120;
          ctx.drawImage(qrImage, W - PAD - qrSize, H - 48 - qrSize, qrSize, qrSize);
          qrDrawn = true;
        } catch (e) {}
      }
      if (qrDrawn) {
        ctx.textAlign = 'left';
        ctx.fillStyle = COLOR.ink;
        ctx.font = 'bold 28px "PingFang SC", sans-serif';
        ctx.fillText('微信扫码查看详情', PAD, H - 120);
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
    },

    // 版式 B：单模型详情卡
    paintDetail: function (canvas, ctx, opts, qrImage, cb) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, W, H);

      var grad = ctx.createLinearGradient(0, 0, W, 360);
      grad.addColorStop(0, '#1A1A2E');
      grad.addColorStop(0.6, '#16213E');
      grad.addColorStop(1, '#0F5EF0');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, 360);

      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = '24px "PingFang SC", sans-serif';
      ctx.fillText('AI模型排行 · 模型详情', PAD, 72);

      if (opts.rankText) {
        ctx.font = 'bold 26px "PingFang SC", sans-serif';
        var tw = ctx.measureText(opts.rankText).width;
        var pillW = tw + 40;
        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        roundRect(ctx, W - PAD - pillW, 42, pillW, 52, 26);
        ctx.fill();
        ctx.fillStyle = '#FCD34D';
        ctx.fillText(opts.rankText, W - PAD - pillW + 20, 76);
      }

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 58px "PingFang SC", sans-serif';
      var nameLines = wrapText(ctx, opts.title || '', W - PAD * 2, 2);
      ctx.fillText(nameLines[0] || '', PAD, 168);
      if (nameLines[1]) ctx.fillText(nameLines[1], PAD, 234);

      ctx.fillStyle = 'rgba(255,255,255,0.78)';
      ctx.font = '30px "PingFang SC", sans-serif';
      ctx.fillText(fitText(ctx, opts.subtitle || '', W - PAD * 2), PAD, nameLines[1] ? 302 : 230);

      // 大号 Elo
      ctx.fillStyle = COLOR.faint;
      ctx.font = '24px "PingFang SC", sans-serif';
      ctx.fillText('综合 Elo', PAD, 432);
      ctx.fillStyle = COLOR.blue;
      ctx.font = 'bold 108px "PingFang SC", sans-serif';
      ctx.fillText(String(opts.elo || '—'), PAD, 542);

      ctx.textAlign = 'right';
      ctx.fillStyle = COLOR.sub;
      ctx.font = '24px "PingFang SC", sans-serif';
      if (opts.votesText) ctx.fillText(opts.votesText, W - PAD, 470);
      if (opts.contextText) ctx.fillText(opts.contextText, W - PAD, 510);
      if (opts.confidenceText) ctx.fillText(opts.confidenceText, W - PAD, 550);
      ctx.textAlign = 'left';

      // 价格
      var cardY = 596;
      ctx.fillStyle = '#F8FAFC';
      roundRect(ctx, PAD, cardY, W - PAD * 2, 156, 18);
      ctx.fill();
      ctx.fillStyle = COLOR.sub;
      ctx.font = '24px "PingFang SC", sans-serif';
      ctx.fillText('API 价格（每百万 tokens）', PAD + 28, cardY + 42);
      if (opts.hasPrice) {
        ctx.fillStyle = COLOR.ink;
        ctx.font = 'bold 38px "PingFang SC", sans-serif';
        ctx.fillText('输入 ' + (opts.priceIn || '—'), PAD + 28, cardY + 110);
        ctx.fillText('输出 ' + (opts.priceOut || '—'), PAD + 430, cardY + 110);
        if (opts.priceProxy) {
          ctx.fillStyle = '#92400E';
          ctx.font = '22px "PingFang SC", sans-serif';
          ctx.fillText('代理', PAD + 28, cardY + 142);
        }
      } else {
        ctx.fillStyle = COLOR.faint;
        ctx.font = '30px "PingFang SC", sans-serif';
        ctx.fillText('暂无公开 API 定价', PAD + 28, cardY + 104);
      }

      // 一句话点评
      var revY = 784;
      ctx.fillStyle = COLOR.blueBg;
      roundRect(ctx, PAD, revY, W - PAD * 2, 170, 18);
      ctx.fill();
      ctx.fillStyle = COLOR.blueDark;
      ctx.font = 'bold 24px "PingFang SC", sans-serif';
      ctx.fillText('一句话点评', PAD + 28, revY + 40);
      ctx.font = '28px "PingFang SC", sans-serif';
      var revLines = wrapText(ctx, opts.review || '', W - PAD * 2 - 56, 3);
      revLines.forEach(function (line, i) {
        ctx.fillText(line, PAD + 28, revY + 82 + i * 38);
      });

      // 分维度（最多 3 条）
      var dims = (opts.dimensions || []).slice(0, 3);
      if (dims.length) {
        var dy = 1006;
        ctx.fillStyle = COLOR.sub;
        ctx.font = 'bold 24px "PingFang SC", sans-serif';
        ctx.fillText('分维度 Elo', PAD, dy);
        var maxElo = 0;
        dims.forEach(function (d) { if (d.elo > maxElo) maxElo = d.elo; });
        dims.forEach(function (d, i) {
          var ry = dy + 52 + i * 56;
          ctx.fillStyle = COLOR.ink;
          ctx.font = '26px "PingFang SC", sans-serif';
          ctx.fillText(d.name, PAD, ry + 8);
          ctx.fillStyle = '#E2E8F0';
          roundRect(ctx, PAD + 120, ry - 8, 520, 16, 8);
          ctx.fill();
          var bw = maxElo ? Math.max(20, (d.elo / maxElo) * 520) : 0;
          ctx.fillStyle = COLOR.blue;
          roundRect(ctx, PAD + 120, ry - 8, bw, 16, 8);
          ctx.fill();
          ctx.textAlign = 'right';
          ctx.fillStyle = COLOR.ink;
          ctx.font = 'bold 26px "PingFang SC", sans-serif';
          ctx.fillText(String(d.elo), W - PAD, ry + 8);
          ctx.textAlign = 'left';
        });
      }

      this.drawFooter(ctx, qrImage);
      this.exportCanvas(canvas, cb);
    },

    // 版式 C：多模型对比表
    paintCompare: function (canvas, ctx, opts, qrImage, cb) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, W, H);

      var grad = ctx.createLinearGradient(0, 0, W, 280);
      grad.addColorStop(0, '#1A1A2E');
      grad.addColorStop(0.6, '#16213E');
      grad.addColorStop(1, '#0F5EF0');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, 280);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 54px "PingFang SC", sans-serif';
      ctx.fillText(fitText(ctx, opts.title || '模型对比', W - PAD * 2), PAD, 140);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = '26px "PingFang SC", sans-serif';
      ctx.fillText(fitText(ctx, opts.subtitle || '', W - PAD * 2), PAD, 210);

      var models = opts.models || [];
      var n = Math.max(models.length, 1);
      var labelW = 200;
      var tableW = W - PAD * 2;
      var colW = (tableW - labelW) / n;

      // 模型名表头（单行，放不下就缩字号/省略，避免切断英文单词）
      models.forEach(function (name, i) {
        var cx = PAD + labelW + colW * i + colW / 2;
        var size = 24;
        var label = name;
        while (size > 17) {
          ctx.font = 'bold ' + size + 'px "PingFang SC", sans-serif';
          if (ctx.measureText(label).width <= colW - 20) break;
          size -= 1;
        }
        ctx.font = 'bold ' + size + 'px "PingFang SC", sans-serif';
        ctx.fillStyle = COLOR.ink;
        ctx.textAlign = 'center';
        ctx.fillText(fitText(ctx, label, colW - 20), cx, 386);
      });
      ctx.textAlign = 'left';

      var y0 = 440;
      var rowH = 110;
      var rows = opts.rows || [];
      rows.forEach(function (r, ri) {
        var ry = y0 + ri * rowH;
        if (ri % 2 === 0) {
          ctx.fillStyle = '#F8FAFC';
          ctx.fillRect(PAD, ry, tableW, rowH);
        }
        ctx.fillStyle = COLOR.sub;
        ctx.font = '24px "PingFang SC", sans-serif';
        ctx.fillText(r.label || '', PAD + 16, ry + 62);
        (r.values || []).forEach(function (v, ci) {
          var cx = PAD + labelW + colW * ci + colW / 2;
          ctx.textAlign = 'center';
          if (r.best === ci) {
            ctx.fillStyle = COLOR.blue;
            ctx.font = 'bold 34px "PingFang SC", sans-serif';
          } else {
            ctx.fillStyle = COLOR.ink;
            ctx.font = '30px "PingFang SC", sans-serif';
          }
          ctx.fillText(fitText(ctx, String(v), colW - 20), cx, ry + 64);
        });
        ctx.textAlign = 'left';
        ctx.strokeStyle = COLOR.line;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(PAD, ry + rowH);
        ctx.lineTo(W - PAD, ry + rowH);
        ctx.stroke();
      });

      // 结论条
      var noteY = y0 + rows.length * rowH + 30;
      if (opts.note) {
        ctx.fillStyle = COLOR.blueBg;
        roundRect(ctx, PAD, noteY, tableW, 110, 16);
        ctx.fill();
        ctx.fillStyle = COLOR.blueDark;
        ctx.font = '26px "PingFang SC", sans-serif';
        var nl = wrapText(ctx, opts.note, tableW - 48, 2);
        ctx.fillText(nl[0] || '', PAD + 24, noteY + 44);
        if (nl[1]) ctx.fillText(nl[1], PAD + 24, noteY + 82);
      }

      ctx.fillStyle = COLOR.faint;
      ctx.font = '22px "PingFang SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('价格单位：美元 / 百万 tokens；≈ 为人民币价按汇率折算，不含缓存与批量折扣', W / 2, noteY + 172);
      ctx.fillText('数据截至 ' + (opts.updated || '') + ' · LMArena 人类盲测', W / 2, H - 190);
      ctx.textAlign = 'left';

      this.drawFooter(ctx, qrImage);
      this.exportCanvas(canvas, cb);
    },
  },
});
