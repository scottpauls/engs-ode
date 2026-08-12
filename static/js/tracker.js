/* In-browser point tracker: replicates the core Tracker-software workflow
 * (calibrate a known length, set an axis along the direction of travel,
 * then click the target frame-by-frame) directly against the <video>
 * element, producing the same (t, x, y) triples the assignment expects. */
const CartTracker = (() => {
  let video, canvas, ctx;
  let fps = 30;
  let mode = null; // 'calibrate' | 'axis' | 'track' | null
  let calibPts = [];      // pixel-space points, up to 2
  let calibLengthMeters = null;
  let axisPts = [];       // pixel-space points, up to 2
  let points = [];        // {t, xpx, ypx}

  function init(videoEl, canvasEl) {
    video = videoEl;
    canvas = canvasEl;
    ctx = canvas.getContext("2d");
    video.addEventListener("loadedmetadata", () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      draw();
    });
    video.addEventListener("seeked", draw);
    video.addEventListener("play", () => { mode = null; });
    canvas.addEventListener("click", onClick);
  }

  function reset() {
    calibPts = []; calibLengthMeters = null; axisPts = []; points = []; mode = null;
    draw();
  }

  function setFps(v) { fps = v > 0 ? v : 30; }

  function setMode(m) { mode = m; draw(); }
  function getMode() { return mode; }

  function pixelFromEvent(evt) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (evt.clientX - rect.left) * scaleX,
      y: (evt.clientY - rect.top) * scaleY,
    };
  }

  function onClick(evt) {
    if (!mode) return;
    const p = pixelFromEvent(evt);
    if (mode === "calibrate") {
      calibPts.push(p);
      if (calibPts.length > 2) calibPts = [p];
    } else if (mode === "axis") {
      axisPts.push(p);
      if (axisPts.length > 2) axisPts = [p];
    } else if (mode === "track") {
      points.push({ t: video.currentTime, xpx: p.x, ypx: p.y });
      stepFrame(1);
    }
    draw();
    if (onChange) onChange();
  }

  function setCalibLength(meters) { calibLengthMeters = meters; }

  function calibScale() {
    if (calibPts.length < 2 || !calibLengthMeters) return null;
    const dx = calibPts[1].x - calibPts[0].x, dy = calibPts[1].y - calibPts[0].y;
    const pxDist = Math.hypot(dx, dy);
    if (pxDist === 0) return null;
    return calibLengthMeters / pxDist; // meters per pixel
  }

  function axisAngle() {
    if (axisPts.length < 2) return 0;
    const dx = axisPts[1].x - axisPts[0].x, dy = axisPts[1].y - axisPts[0].y;
    return Math.atan2(dy, dx);
  }

  /** Convert a pixel point to real-world (x,y) meters using calibration
   * scale, axis origin, and axis rotation so travel direction is +x. */
  function toReal(xpx, ypx) {
    const scale = calibScale();
    if (!scale || axisPts.length < 2) return null;
    const origin = axisPts[0];
    const theta = axisAngle();
    const dx = (xpx - origin.x) * scale;
    const dy = (ypx - origin.y) * scale;
    const cos = Math.cos(-theta), sin = Math.sin(-theta);
    return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
  }

  function stepFrame(dir) {
    video.pause();
    const dt = 1 / fps;
    const next = Math.min(Math.max(video.currentTime + dir * dt, 0), video.duration || Infinity);
    video.currentTime = next;
  }

  function undoLast() { points.pop(); draw(); if (onChange) onChange(); }
  function clearPoints() { points = []; draw(); if (onChange) onChange(); }

  function draw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const r = Math.max(3, canvas.width / 250);

    // calibration segment
    if (calibPts.length >= 1) {
      ctx.fillStyle = "#f4c400";
      calibPts.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill(); });
      if (calibPts.length === 2) {
        ctx.strokeStyle = "#f4c400"; ctx.lineWidth = Math.max(2, canvas.width / 400);
        ctx.beginPath(); ctx.moveTo(calibPts[0].x, calibPts[0].y); ctx.lineTo(calibPts[1].x, calibPts[1].y); ctx.stroke();
      }
    }
    // axis
    if (axisPts.length >= 1) {
      ctx.fillStyle = "#e64ac9";
      axisPts.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill(); });
      if (axisPts.length === 2) {
        ctx.strokeStyle = "#e64ac9"; ctx.lineWidth = Math.max(2, canvas.width / 400);
        ctx.beginPath(); ctx.moveTo(axisPts[0].x, axisPts[0].y); ctx.lineTo(axisPts[1].x, axisPts[1].y); ctx.stroke();
      }
    }
    // tracked points + trail
    if (points.length > 0) {
      ctx.strokeStyle = "rgba(42,111,151,0.7)"; ctx.lineWidth = Math.max(1.5, canvas.width / 500);
      ctx.beginPath();
      points.forEach((p, i) => { if (i === 0) ctx.moveTo(p.xpx, p.ypx); else ctx.lineTo(p.xpx, p.ypx); });
      ctx.stroke();
      ctx.fillStyle = "#2a6f97";
      points.forEach(p => { ctx.beginPath(); ctx.arc(p.xpx, p.ypx, r * 0.8, 0, 7); ctx.fill(); });
      const last = points[points.length - 1];
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(last.xpx, last.ypx, r * 1.4, 0, 7); ctx.stroke();
    }
  }

  /** Export the collected points as real-world (t,x,y) after calibration
   * and axis are set. Returns null fields as NaN if not yet calibrated. */
  function exportSeries() {
    const scale = calibScale();
    const t = [], x = [], y = [];
    for (const p of points) {
      const real = toReal(p.xpx, p.ypx);
      t.push(p.t);
      x.push(real ? real.x : NaN);
      y.push(real ? real.y : NaN);
    }
    return { t, x, y };
  }

  function status() {
    return {
      calibrated: calibPts.length === 2 && !!calibLengthMeters,
      calibScale: calibScale(),
      axisSet: axisPts.length === 2,
      pointCount: points.length,
    };
  }

  let onChange = null;
  function setOnChange(fn) { onChange = fn; }

  return {
    init, reset, setFps, setMode, getMode, setCalibLength,
    stepFrame, undoLast, clearPoints, exportSeries, status, setOnChange, draw,
  };
})();
