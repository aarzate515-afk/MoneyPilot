/* Device-pixel-aware canvas charts — no chart library. */
(function (global) {
  function dpr(canvas) {
    const r = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width * r));
    const h = Math.max(1, Math.floor(rect.height * r));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(r, 0, 0, r, 0, 0);
    return { ctx, w: rect.width, h: rect.height };
  }

  function lineChart(canvas, points, opts) {
    const { ctx, w, h } = dpr(canvas);
    ctx.clearRect(0, 0, w, h);
    if (!points || points.length < 1) {
      ctx.strokeStyle = 'rgba(235,235,245,0.3)';
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(16, h / 2);
      ctx.lineTo(w - 16, h / 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(235,235,245,0.6)';
      ctx.font = '13px -apple-system, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(opts.emptyText || 'Waiting for the first trade', w / 2, h / 2 - 12);
      return;
    }
    const pad = 12;
    const vals = points.map((p) => p.v);
    let min = Math.min(...vals);
    let max = Math.max(...vals);
    if (min === max) { min -= 1; max += 1; }
    const start = opts.startValue != null ? opts.startValue : vals[0];
    const xAt = (i) => pad + (i / Math.max(1, points.length - 1)) * (w - pad * 2);
    const yAt = (v) => pad + (1 - (v - min) / (max - min)) * (h - pad * 2);

    // fill
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(0,211,90,0.28)');
    grad.addColorStop(1, 'rgba(0,211,90,0)');
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = xAt(i), y = yAt(p.v);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.lineTo(xAt(points.length - 1), h - pad);
    ctx.lineTo(xAt(0), h - pad);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // start dashed
    ctx.strokeStyle = 'rgba(235,235,245,0.3)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(pad, yAt(start));
    ctx.lineTo(w - pad, yAt(start));
    ctx.stroke();
    ctx.setLineDash([]);

    // line
    ctx.strokeStyle = '#00d35a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = xAt(i), y = yAt(p.v);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // marks
    const marks = opts.marks || [];
    let row = 0;
    marks.forEach((m) => {
      let idx = points.findIndex((p) => p.t >= m.t);
      if (idx < 0) idx = points.length - 1;
      const x = xAt(idx), y = yAt(points[idx].v) - 10 - row * 14;
      ctx.fillStyle = m.color || '#0a84ff';
      ctx.font = '11px -apple-system, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(m.label, x, Math.max(12, y));
      row = (row + 1) % 3;
    });
  }

  function scoreRing(canvas, score) {
    const { ctx, w, h } = dpr(canvas);
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2, r = Math.max(1, Math.min(w, h) / 2 - 6);
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#2c2c2e';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    const pct = Math.max(0, Math.min(100, score || 0)) / 100;
    ctx.strokeStyle = score >= 70 ? '#00d35a' : '#ffd60a';
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '600 18px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(score == null ? '—' : score), cx, cy);
  }

  function candles(canvas, bars, trailY) {
    const { ctx, w, h } = dpr(canvas);
    ctx.clearRect(0, 0, w, h);
    if (!bars || !bars.length) {
      ctx.fillStyle = 'rgba(235,235,245,0.6)';
      ctx.font = '13px -apple-system, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No candles yet', w / 2, h / 2);
      return;
    }
    const pad = 8;
    const chartH = h * 0.72;
    const highs = bars.map((b) => b.h), lows = bars.map((b) => b.l);
    let min = Math.min(...lows), max = Math.max(...highs);
    if (min === max) { min -= 1; max += 1; }
    const bw = Math.max(2, (w - pad * 2) / bars.length - 2);
    bars.forEach((b, i) => {
      const x = pad + i * ((w - pad * 2) / bars.length) + 1;
      const yH = pad + (1 - (b.h - min) / (max - min)) * (chartH - pad);
      const yL = pad + (1 - (b.l - min) / (max - min)) * (chartH - pad);
      const yO = pad + (1 - (b.o - min) / (max - min)) * (chartH - pad);
      const yC = pad + (1 - (b.c - min) / (max - min)) * (chartH - pad);
      const up = b.c >= b.o;
      ctx.strokeStyle = up ? '#00d35a' : '#ff453a';
      ctx.fillStyle = up ? '#00d35a' : '#ff453a';
      ctx.beginPath();
      ctx.moveTo(x + bw / 2, yH);
      ctx.lineTo(x + bw / 2, yL);
      ctx.stroke();
      const top = Math.min(yO, yC), bh = Math.max(1, Math.abs(yC - yO));
      ctx.fillRect(x, top, bw, bh);
    });
    if (trailY != null) {
      const y = pad + (1 - (trailY - min) / (max - min)) * (chartH - pad);
      ctx.strokeStyle = '#ff9f0a';
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(w - pad, y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  global.DeskCharts = { lineChart, scoreRing, candles };
})(window);
