/* Minimal dependency-free SVG chart helpers: line/scatter charts with
 * shared axes, used across the Analyze / My Results / Class Data tabs. */
const Charts = (() => {

  const PALETTE = ["#2a6f97", "#b8641a", "#2f7d5e", "#7a4fb5", "#b8341f", "#4b5866"];

  function niceTicks(min, max, count = 5) {
    if (min === max) { min -= 1; max += 1; }
    const range = max - min;
    const rough = range / count;
    const mag = Math.pow(10, Math.floor(Math.log10(rough)));
    const norm = rough / mag;
    let step;
    if (norm < 1.5) step = 1 * mag;
    else if (norm < 3) step = 2 * mag;
    else if (norm < 7) step = 5 * mag;
    else step = 10 * mag;
    const start = Math.ceil(min / step) * step;
    const ticks = [];
    for (let v = start; v <= max + 1e-9; v += step) ticks.push(Math.round(v / step) * step);
    return ticks;
  }

  function fmt(v) {
    if (v === 0) return "0";
    const a = Math.abs(v);
    if (a >= 1000 || a < 0.001) return v.toExponential(2);
    return Number(v.toPrecision(4)).toString();
  }

  /**
   * render(container, {series, xLabel, yLabel, markers, width, height, connect})
   * series: [{label, points:[{x,y}], color, dashed, points_only}]
   * markers: [{x, y, label, color}]  -- drawn as small labeled dots (e.g. 63% point)
   */
  function render(container, opts) {
    const el = typeof container === "string" ? document.getElementById(container) : container;
    if (!el) return;
    const width = opts.width || 520;
    const height = opts.height || 300;
    const margin = { top: 16, right: 18, bottom: 40, left: 56 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const allPts = (opts.series || []).flatMap(s => s.points || []);
    const allX = allPts.map(p => p.x).concat((opts.markers || []).map(m => m.x));
    const allY = allPts.map(p => p.y).concat((opts.markers || []).map(m => m.y));

    if (allX.length === 0) {
      el.innerHTML = `<div class="empty-note">No data yet.</div>`;
      return;
    }

    let xmin = Math.min(...allX), xmax = Math.max(...allX);
    let ymin = Math.min(0, Math.min(...allY)), ymax = Math.max(...allY);
    const xpad = (xmax - xmin) * 0.05 || 1;
    const ypad = (ymax - ymin) * 0.1 || 1;
    xmin -= xpad; xmax += xpad; ymin -= ypad; ymax += ypad;

    const sx = x => margin.left + ((x - xmin) / (xmax - xmin)) * innerW;
    const sy = y => margin.top + innerH - ((y - ymin) / (ymax - ymin)) * innerH;

    const xticks = niceTicks(xmin, xmax);
    const yticks = niceTicks(ymin, ymax);

    let svg = `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" font-family="inherit">`;

    // gridlines + ticks
    yticks.forEach(t => {
      const y = sy(t);
      svg += `<line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" stroke="#e7ebef" stroke-width="1"/>`;
      svg += `<text x="${margin.left - 8}" y="${y + 3}" font-size="10" fill="#4b5866" text-anchor="end">${fmt(t)}</text>`;
    });
    xticks.forEach(t => {
      const x = sx(t);
      svg += `<text x="${x}" y="${height - margin.bottom + 16}" font-size="10" fill="#4b5866" text-anchor="middle">${fmt(t)}</text>`;
      svg += `<line x1="${x}" y1="${margin.top}" x2="${x}" y2="${height - margin.bottom}" stroke="#f1f3f5" stroke-width="1"/>`;
    });

    // axes
    svg += `<line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}" stroke="#4b5866" stroke-width="1.2"/>`;
    svg += `<line x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}" stroke="#4b5866" stroke-width="1.2"/>`;

    if (opts.xLabel) {
      svg += `<text x="${margin.left + innerW / 2}" y="${height - 4}" font-size="11" fill="#1c2530" text-anchor="middle">${opts.xLabel}</text>`;
    }
    if (opts.yLabel) {
      svg += `<text x="12" y="${margin.top + innerH / 2}" font-size="11" fill="#1c2530" text-anchor="middle" transform="rotate(-90 12 ${margin.top + innerH / 2})">${opts.yLabel}</text>`;
    }

    // series
    (opts.series || []).forEach((s, i) => {
      const color = s.color || PALETTE[i % PALETTE.length];
      const pts = s.points || [];
      if (pts.length === 0) return;
      if (s.pointsOnly) {
        pts.forEach(p => {
          svg += `<circle cx="${sx(p.x)}" cy="${sy(p.y)}" r="${s.r || 3.5}" fill="${color}" fill-opacity="0.8" stroke="#fff" stroke-width="0.6"/>`;
        });
      } else {
        const d = pts.map((p, idx) => `${idx === 0 ? "M" : "L"}${sx(p.x).toFixed(2)},${sy(p.y).toFixed(2)}`).join(" ");
        svg += `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" ${s.dashed ? 'stroke-dasharray="5,4"' : ""}/>`;
        if (s.showDots) {
          pts.forEach(p => { svg += `<circle cx="${sx(p.x)}" cy="${sy(p.y)}" r="2" fill="${color}"/>`; });
        }
      }
    });

    // markers
    (opts.markers || []).forEach(m => {
      const color = m.color || "#b8341f";
      svg += `<circle cx="${sx(m.x)}" cy="${sy(m.y)}" r="4.5" fill="${color}" stroke="#fff" stroke-width="1.5"/>`;
      if (m.label) {
        svg += `<text x="${sx(m.x) + 7}" y="${sy(m.y) - 7}" font-size="10" fill="${color}" font-weight="600">${m.label}</text>`;
      }
    });

    svg += `</svg>`;

    // legend
    const series = opts.series || [];
    if (series.some(s => s.label)) {
      let legend = `<div style="display:flex;flex-wrap:wrap;gap:.8rem;margin-top:.35rem;font-size:.78rem;color:#4b5866;">`;
      series.forEach((s, i) => {
        if (!s.label) return;
        const color = s.color || PALETTE[i % PALETTE.length];
        legend += `<span style="display:inline-flex;align-items:center;gap:.35rem;"><span style="width:10px;height:10px;border-radius:50%;background:${color};display:inline-block;"></span>${s.label}</span>`;
      });
      legend += `</div>`;
      el.innerHTML = svg + legend;
    } else {
      el.innerHTML = svg;
    }
  }

  return { render, PALETTE };
})();
