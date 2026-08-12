/* Wires together tabs, the video library, the tracker, the analyzer,
 * saved results, class-data aggregation, and the worksheet. */
(() => {
  "use strict";

  // NaN round-trips through JSON (localStorage, fetch) as null, and
  // isFinite(null) is true (null coerces to 0) -- always use this instead
  // of bare isFinite() on any value that passed through storage or the API.
  const isNum = v => typeof v === "number" && isFinite(v);

  // ------------------------------------------------------------- storage --
  const LS = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); }
      catch { return fallback; }
    },
    set(key, val) { localStorage.setItem(key, JSON.stringify(val)); },
  };
  const RESULTS_KEY = "cartlab_results";
  const CART_KEY = "cartlab_my_cart";
  const RUN_KEY = "cartlab_my_run";

  function getResults() { return LS.get(RESULTS_KEY, []); }
  function setResults(arr) { LS.set(RESULTS_KEY, arr); }
  function myCart() { return localStorage.getItem(CART_KEY) || ""; }
  function myRun() { return localStorage.getItem(RUN_KEY) || ""; }

  // ---------------------------------------------------------------- tabs --
  function initTabs() {
    document.querySelectorAll(".tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
        btn.classList.add("active");
        document.getElementById("panel-" + btn.dataset.tab).classList.add("active");
        if (btn.dataset.tab === "results") renderResultsTab();
        if (btn.dataset.tab === "classdata") loadClassData();
      });
    });
  }

  function initAssignment() {
    const cartSel = document.getElementById("my-cart-select");
    const runInp = document.getElementById("my-run-input");
    cartSel.value = myCart();
    runInp.value = myRun();
    cartSel.addEventListener("change", () => { localStorage.setItem(CART_KEY, cartSel.value); renderVideoBrowser(); });
    runInp.addEventListener("input", () => { localStorage.setItem(RUN_KEY, runInp.value.trim()); renderVideoBrowser(); });
  }

  // -------------------------------------------------------------- videos --
  let videoData = { carts: {}, extras: [], videosAvailable: true };

  async function loadVideos() {
    const statusEl = document.getElementById("videos-status");
    try {
      const res = await fetch("/api/videos");
      videoData = await res.json();
      if (!videoData.videosAvailable) {
        statusEl.textContent = "No bundled video folder found on this server — you can still upload your own video in the Track tab.";
      } else {
        const total = Object.values(videoData.carts).reduce((acc, v) => acc + Object.values(v).reduce((a, l) => a + l.length, 0), 0);
        statusEl.textContent = `${total} videos available.`;
      }
    } catch (e) {
      statusEl.textContent = "Could not reach the server for the video list.";
    }
    renderVideoBrowser();
    renderExtras();
    populateTrackSelect();
  }

  function renderExtras() {
    const card = document.getElementById("extras-card");
    const list = document.getElementById("extras-list");
    if (!videoData.extras || videoData.extras.length === 0) { card.style.display = "none"; return; }
    card.style.display = "";
    list.innerHTML = videoData.extras.map(e =>
      `<div><button class="run-chip" data-url="${e.url}">${e.name}</button></div>`
    ).join("");
    list.querySelectorAll("button").forEach(b => b.addEventListener("click", () => playInline(list, b.dataset.url)));
  }

  function playInline(container, url) {
    let v = container.querySelector("video.video-inline");
    if (!v) {
      v = document.createElement("video");
      v.className = "video-inline";
      v.controls = true;
      container.appendChild(v);
    }
    v.src = url;
    v.play().catch(() => {});
  }

  function renderVideoBrowser() {
    const el = document.getElementById("video-browser");
    const carts = Object.keys(videoData.carts).sort();
    if (carts.length === 0) {
      el.innerHTML = `<div class="empty-note">No videos found.</div>`;
      return;
    }
    const assigned = { cart: myCart(), run: myRun() };
    let html = "";
    carts.forEach(cart => {
      html += `<div class="cart-group"><h3>${cart}</h3>`;
      const voltages = Object.keys(videoData.carts[cart]).sort((a, b) => parseFloat(a) - parseFloat(b));
      voltages.forEach(v => {
        html += `<div class="voltage-block"><h4>${v} V</h4><div class="run-chip-row">`;
        videoData.carts[cart][v].forEach(f => {
          const isAssigned = assigned.cart === cart && assigned.run && assigned.run === f.run;
          html += `<button class="run-chip${isAssigned ? " assigned" : ""}" data-url="${f.url}" title="${f.name}">run ${f.run}</button>`;
        });
        html += `</div><div class="video-holder" data-cart="${cart}" data-v="${v}"></div></div>`;
      });
      html += `</div>`;
    });
    el.innerHTML = html;
    el.querySelectorAll(".run-chip").forEach(btn => {
      btn.addEventListener("click", () => {
        const holder = btn.closest(".voltage-block").querySelector(".video-holder");
        playInline(holder, btn.dataset.url);
      });
    });
  }

  function populateTrackSelect() {
    const sel = document.getElementById("track-video-select");
    let html = `<option value="">Select a video&hellip;</option>`;
    Object.keys(videoData.carts).sort().forEach(cart => {
      Object.keys(videoData.carts[cart]).sort((a, b) => parseFloat(a) - parseFloat(b)).forEach(v => {
        html += `<optgroup label="${cart} — ${v}V">`;
        videoData.carts[cart][v].forEach(f => {
          html += `<option value="${f.url}" data-cart="${cart}" data-voltage="${v}">${f.name}</option>`;
        });
        html += `</optgroup>`;
      });
    });
    sel.innerHTML = html;
  }

  // -------------------------------------------------------------- tracker --
  let trackerReady = false;

  function initTrackerUI() {
    const video = document.getElementById("track-video");
    const canvas = document.getElementById("track-canvas");
    CartTracker.init(video, canvas);
    CartTracker.setOnChange(updateTrackerStatuses);

    document.getElementById("track-video-select").addEventListener("change", (e) => {
      const opt = e.target.selectedOptions[0];
      if (!opt || !opt.value) return;
      loadVideoIntoTracker(opt.value);
      if (opt.dataset.voltage) document.getElementById("track-voltage").value = opt.dataset.voltage;
    });
    document.getElementById("track-file-input").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) loadVideoIntoTracker(URL.createObjectURL(file));
    });
    document.getElementById("track-fps").addEventListener("input", (e) => CartTracker.setFps(parseFloat(e.target.value) || 30));

    document.getElementById("btn-playpause").addEventListener("click", () => {
      if (video.paused) { CartTracker.setMode(null); setActiveModeBtn(null); video.play(); } else video.pause();
    });
    document.getElementById("btn-step-back").addEventListener("click", () => CartTracker.stepFrame(-1));
    document.getElementById("btn-step-fwd").addEventListener("click", () => CartTracker.stepFrame(1));
    video.addEventListener("timeupdate", () => {
      document.getElementById("time-readout").textContent = `t = ${video.currentTime.toFixed(3)} s`;
    });

    document.getElementById("btn-mode-calibrate").addEventListener("click", () => setTrackerMode("calibrate"));
    document.getElementById("btn-mode-axis").addEventListener("click", () => setTrackerMode("axis"));
    document.getElementById("btn-mode-track").addEventListener("click", () => setTrackerMode("track"));

    document.getElementById("calib-length").addEventListener("input", updateCalibLength);
    document.getElementById("calib-units").addEventListener("change", updateCalibLength);

    document.getElementById("btn-undo-point").addEventListener("click", () => CartTracker.undoLast());
    document.getElementById("btn-clear-points").addEventListener("click", () => CartTracker.clearPoints());

    document.getElementById("btn-send-to-analyze").addEventListener("click", sendTrackerToAnalyze);
    document.getElementById("btn-download-txt").addEventListener("click", downloadTrackerTxt);

    updateCalibLength();
  }

  function setTrackerMode(m) {
    const current = CartTracker.getMode();
    const next = current === m ? null : m;
    CartTracker.setMode(next);
    setActiveModeBtn(next);
  }
  function setActiveModeBtn(mode) {
    document.getElementById("btn-mode-calibrate").classList.toggle("active", mode === "calibrate");
    document.getElementById("btn-mode-axis").classList.toggle("active", mode === "axis");
    document.getElementById("btn-mode-track").classList.toggle("active", mode === "track");
  }

  function updateCalibLength() {
    const val = parseFloat(document.getElementById("calib-length").value);
    const unit = document.getElementById("calib-units").value;
    const toMeters = { ft: 0.3048, in: 0.0254, m: 1 };
    if (!isNaN(val)) CartTracker.setCalibLength(val * toMeters[unit]);
    updateTrackerStatuses();
  }

  function loadVideoIntoTracker(url) {
    const video = document.getElementById("track-video");
    CartTracker.reset();
    // reset() clears the tracker's known-length value along with the pixel
    // calibration points; re-apply whatever the length field already shows
    // (the real-world ruler length doesn't change between videos).
    updateCalibLength();
    video.src = url;
    document.getElementById("tracker-workspace").style.display = "";
    trackerReady = true;
    updateTrackerStatuses();
  }

  function updateTrackerStatuses() {
    const s = CartTracker.status();
    document.getElementById("calib-status").textContent = s.calibrated
      ? `Set — ${(s.calibScale * 1000).toFixed(2)} mm/px`
      : "Click two points on the reference stick";
    document.getElementById("axis-status").textContent = s.axisSet ? "Set" : "Click origin, then a point along the travel direction";
    document.getElementById("track-status").textContent = `${s.pointCount} point${s.pointCount === 1 ? "" : "s"} captured`;
  }

  function requireTrackerData() {
    const s = CartTracker.status();
    if (!s.calibrated) { alert("Set the calibration length first (two clicks on the reference stick)."); return null; }
    if (!s.axisSet) { alert("Set the axis first (origin, then a point along the direction of travel)."); return null; }
    if (s.pointCount < 5) { alert("Track at least a few frames of the cart first."); return null; }
    return CartTracker.exportSeries();
  }

  function sendTrackerToAnalyze() {
    const data = requireTrackerData();
    if (!data) return;
    currentDataset = data;
    document.getElementById("analyze-source-label").textContent = "Loaded from Track tab.";
    const voltage = document.getElementById("track-voltage").value;
    if (voltage) document.getElementById("param-voltage").value = voltage;
    document.querySelector('.tab-btn[data-tab="analyze"]').click();
    computeAndRender();
  }

  function downloadTrackerTxt() {
    const data = requireTrackerData();
    if (!data) return;
    const text = Analysis.toCsvText(data);
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "tracked_position_data.txt"; document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  // -------------------------------------------------------------- analyze --
  let currentDataset = null;   // {t,x,y}
  let currentComputed = null;  // last computed result object

  function initAnalyzeUI() {
    document.getElementById("analyze-file-input").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      currentDataset = Analysis.parsePositionData(text);
      document.getElementById("analyze-source-label").textContent = `Loaded ${currentDataset.t.length} rows from ${file.name}.`;
      computeAndRender();
    });
    document.getElementById("btn-recompute").addEventListener("click", computeAndRender);
    document.getElementById("btn-save-result").addEventListener("click", saveCurrentResult);
  }

  function computeAndRender() {
    if (!currentDataset || currentDataset.t.length < 3) return;
    document.getElementById("analyze-workspace").style.display = "";
    const { t, x, y } = currentDataset;
    const invert = document.getElementById("param-invert").checked;
    const windowPct = parseFloat(document.getElementById("param-window").value) || 15;
    const Vin = parseFloat(document.getElementById("param-voltage").value);

    Charts.render("chart-position", {
      series: [
        { label: "x (m)", points: t.map((tt, i) => ({ x: tt, y: x[i] })), color: "#2a6f97" },
        { label: "y (m)", points: t.map((tt, i) => ({ x: tt, y: y[i] })), color: "#b8641a", dashed: true },
      ],
      xLabel: "time (s)", yLabel: "position (m)",
    });

    const { t: vt, v } = Analysis.computeVelocity(t, x, { invert });
    const vss = Analysis.steadyState(v, windowPct / 100);
    const t63 = Analysis.timeConstant63(vt, v, vss);
    const fit = Analysis.fitExponentialTimeConstant(vt, v, vss);

    const fitSeries = [];
    if (isFinite(fit.T) && vt.length) {
      const t0 = vt[0];
      const n = 60;
      const tMax = vt[vt.length - 1];
      for (let i = 0; i <= n; i++) {
        const tt = t0 + (i / n) * (tMax - t0);
        fitSeries.push({ x: tt, y: vss * (1 - Math.exp(-(tt - t0) / fit.T)) });
      }
    }

    const markers = [];
    if (isFinite(t63)) markers.push({ x: vt[0] + t63, y: 0.632 * vss, label: "T (63%)", color: "#b8341f" });

    Charts.render("chart-velocity", {
      series: [
        { label: "measured v", points: vt.map((tt, i) => ({ x: tt, y: v[i] })), color: "#2a6f97", showDots: true },
        ...(fitSeries.length ? [{ label: "exponential fit", points: fitSeries, color: "#7a4fb5", dashed: true }] : []),
        { label: "steady state", points: vt.length ? [{ x: vt[0], y: vss }, { x: vt[vt.length - 1], y: vss }] : [], color: "#2f7d5e", dashed: true },
      ],
      markers,
      xLabel: "time (s)", yLabel: "velocity (m/s)",
    });

    const gain = isFinite(Vin) && Vin !== 0 ? vss / Vin : NaN;
    document.getElementById("res-vss").textContent = isFinite(vss) ? `${vss.toFixed(4)} m/s` : "—";
    document.getElementById("res-gain").textContent = isFinite(gain) ? `${gain.toFixed(4)} (m/s)/V` : "— (enter V_in)";
    document.getElementById("res-t63").textContent = isFinite(t63) ? `${t63.toFixed(3)} s` : "—";
    document.getElementById("res-tfit").textContent = isFinite(fit.T) ? `${fit.T.toFixed(3)} s (R² = ${fit.r2.toFixed(3)})` : "—";

    currentComputed = {
      voltage: Vin, vss, gain, gainUnits: "(m/s)/V",
      t63, tfit: fit.T, r2fit: fit.r2,
      t: vt, v,
      method: `steady-state = mean of last ${windowPct}% of samples; T via 63.2%-crossing and via ln-linearized exponential fit (R²=${isFinite(fit.r2) ? fit.r2.toFixed(3) : "n/a"}).`,
    };
    document.getElementById("analyze-save-msg").textContent = "";
  }

  function saveCurrentResult() {
    if (!currentComputed) return;
    if (!isFinite(currentComputed.voltage)) { alert("Enter the input voltage for this run first."); return; }
    const cart = myCart() || "Unassigned";
    const results = getResults();
    results.push({
      id: Date.now(),
      cart,
      voltage: currentComputed.voltage,
      vss: currentComputed.vss,
      gain: currentComputed.gain,
      gainUnits: currentComputed.gainUnits,
      t63: currentComputed.t63,
      tfit: currentComputed.tfit,
      r2fit: currentComputed.r2fit,
      timeConstant: isFinite(currentComputed.tfit) ? currentComputed.tfit : currentComputed.t63,
      method: currentComputed.method,
      t: currentComputed.t, v: currentComputed.v,
      savedAt: new Date().toISOString(),
    });
    setResults(results);
    document.getElementById("analyze-save-msg").textContent = `Saved (${cart}, ${currentComputed.voltage} V).`;
  }

  // ------------------------------------------------------------- results --
  function renderResultsTab() {
    const cart = myCart();
    const all = getResults();
    const mine = cart ? all.filter(r => r.cart === cart) : all;

    const wrap = document.getElementById("results-table-wrap");
    if (mine.length === 0) {
      wrap.innerHTML = `<div class="empty-note">No saved runs yet. Analyze a run and click "Save this run to My Results".</div>`;
    } else {
      wrap.innerHTML = `<table><thead><tr>
          <th>Cart</th><th>V<sub>in</sub></th><th>v<sub>ss</sub></th><th>K<sub>m</sub></th>
          <th>T (63%)</th><th>T (fit)</th><th>Saved</th><th></th>
        </tr></thead><tbody>
        ${mine.map(r => `<tr>
            <td>${r.cart}</td><td>${r.voltage} V</td>
            <td>${fmt(r.vss)}</td><td>${fmt(r.gain)}</td>
            <td>${fmt(r.t63)} s</td><td>${fmt(r.tfit)} s</td>
            <td>${new Date(r.savedAt).toLocaleString()}</td>
            <td><button data-id="${r.id}" class="btn-del-result">Delete</button></td>
          </tr>`).join("")}
        </tbody></table>`;
      wrap.querySelectorAll(".btn-del-result").forEach(b => b.addEventListener("click", () => {
        setResults(getResults().filter(r => String(r.id) !== b.dataset.id));
        renderResultsTab();
      }));
    }

    Charts.render("chart-linearity", {
      series: [{ label: "steady-state velocity", points: mine.filter(r => isNum(r.vss)).map(r => ({ x: r.voltage, y: r.vss })), pointsOnly: true, color: "#2a6f97", r: 5 }],
      xLabel: "input voltage (V)", yLabel: "steady-state velocity (m/s)",
    });

    renderPredict5v(mine);
  }

  function fmt(v) { return isNum(v) ? v.toFixed(4) : "—"; }

  function renderPredict5v(mine) {
    const nonFive = mine.filter(r => Math.abs(r.voltage - 5) > 0.01 && isNum(r.gain) && (isNum(r.tfit) || isNum(r.t63)));
    const fiveRun = mine.filter(r => Math.abs(r.voltage - 5) <= 0.01).slice(-1)[0];
    if (nonFive.length === 0) {
      document.getElementById("chart-predict5v").innerHTML = `<div class="empty-note">Save at least one non-5V run (with a fitted time constant) to generate a prediction.</div>`;
      return;
    }
    const avgKm = Analysis.mean(nonFive.map(r => r.gain));
    const avgT = Analysis.mean(nonFive.map(r => isNum(r.tfit) ? r.tfit : r.t63));
    const tMax = fiveRun && fiveRun.t.length ? fiveRun.t[fiveRun.t.length - 1] : (avgT * 5);
    const predicted = [];
    const n = 60;
    for (let i = 0; i <= n; i++) {
      const tt = (i / n) * tMax;
      predicted.push({ x: tt, y: avgKm * 5 * (1 - Math.exp(-tt / avgT)) });
    }
    const series = [{ label: `predicted (Km=${avgKm.toFixed(3)}, T=${avgT.toFixed(3)}s)`, points: predicted, color: "#7a4fb5", dashed: true }];
    if (fiveRun) series.push({ label: "measured 5V run", points: fiveRun.t.map((tt, i) => ({ x: tt, y: fiveRun.v[i] })), color: "#2a6f97", showDots: true });
    Charts.render("chart-predict5v", { series, xLabel: "time (s)", yLabel: "velocity (m/s)" });
  }

  function initResultsUI() {
    document.getElementById("btn-submit-class").addEventListener("click", submitToClass);
  }

  async function submitToClass() {
    const cart = myCart();
    const results = getResults().filter(r => !cart || r.cart === cart);
    if (results.length === 0) { alert("No saved runs for your selected cart yet."); return; }
    const student = document.getElementById("submit-name").value.trim() || "anonymous";
    const statusEl = document.getElementById("submit-status");
    statusEl.textContent = "Submitting…";
    let ok = 0, fail = 0;
    for (const r of results) {
      try {
        const res = await fetch("/api/submissions", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            student, cart: r.cart, voltage: r.voltage, gain: r.gain, gainUnits: r.gainUnits,
            timeConstant: r.timeConstant, steadyState: r.vss, method: r.method,
          }),
        });
        if (res.ok) ok++; else fail++;
      } catch { fail++; }
    }
    statusEl.textContent = `Submitted ${ok} run(s)${fail ? `, ${fail} failed` : ""}.`;
  }

  // ----------------------------------------------------------- class data --
  let classSubmissions = [];

  function initClassDataUI() {
    document.getElementById("btn-refresh-class").addEventListener("click", loadClassData);
    document.getElementById("classdata-import").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      classSubmissions = classSubmissions.concat(parseClassCsv(text));
      renderClassData();
    });
    document.getElementById("btn-export-class-csv").addEventListener("click", exportClassCsv);
  }

  async function loadClassData() {
    try {
      const res = await fetch("/api/submissions");
      classSubmissions = await res.json();
    } catch { classSubmissions = []; }
    renderClassData();
  }

  function parseClassCsv(text) {
    const lines = text.trim().split(/\r?\n/);
    const header = lines[0].split(",").map(h => h.trim());
    return lines.slice(1).filter(Boolean).map(line => {
      const parts = line.split(",");
      const obj = {};
      header.forEach((h, i) => { obj[h] = parts[i]; });
      return {
        id: obj.id || Math.random(), student: obj.student || "imported", cart: obj.cart,
        voltage: parseFloat(obj.voltage), gain: parseFloat(obj.gain), gainUnits: obj.gainUnits || "(m/s)/V",
        timeConstant: parseFloat(obj.timeConstant), steadyState: parseFloat(obj.steadyState),
        method: obj.method || "", timestamp: obj.timestamp || "",
      };
    });
  }

  function renderClassData() {
    ["Cart1", "Cart2"].forEach(cart => {
      const pts = classSubmissions.filter(s => s.cart === cart && isNum(s.steadyState));
      Charts.render(`chart-class-${cart.toLowerCase()}`, {
        series: [{ points: pts.map(s => ({ x: s.voltage, y: s.steadyState })), pointsOnly: true, color: "#2a6f97", r: 5 }],
        xLabel: "input voltage (V)", yLabel: "steady-state velocity (m/s)",
      });
    });

    const statsEl = document.getElementById("class-stats");
    const groups = {};
    classSubmissions.forEach(s => {
      const key = `${s.cart} @ ${s.voltage}V`;
      (groups[key] = groups[key] || []).push(s);
    });
    const keys = Object.keys(groups).sort();
    if (keys.length === 0) {
      statsEl.innerHTML = `<div class="empty-note">No submissions yet.</div>`;
    } else {
      statsEl.innerHTML = `<table><thead><tr><th>Group</th><th>n</th>
          <th>K<sub>m</sub> mean ± sd</th><th>T mean ± sd</th></tr></thead><tbody>
        ${keys.map(k => {
          const g = groups[k];
          const gains = g.map(s => s.gain).filter(isNum);
          const ts = g.map(s => s.timeConstant).filter(isNum);
          return `<tr><td>${k}</td><td>${g.length}</td>
            <td>${fmt(Analysis.mean(gains))} ± ${fmt(Analysis.stdev(gains))}</td>
            <td>${fmt(Analysis.mean(ts))} ± ${fmt(Analysis.stdev(ts))}</td></tr>`;
        }).join("")}
      </tbody></table>`;
    }

    const tableWrap = document.getElementById("class-table-wrap");
    if (classSubmissions.length === 0) {
      tableWrap.innerHTML = `<div class="empty-note">Nothing submitted yet.</div>`;
    } else {
      // flag outliers within each cart+voltage group by gain z-score
      const outlierIds = new Set();
      keys.forEach(k => {
        const g = groups[k];
        const gains = g.map(s => s.gain).filter(isNum);
        const m = Analysis.mean(gains), sd = Analysis.stdev(gains);
        if (sd > 0) g.forEach(s => { if (isNum(s.gain) && Math.abs(s.gain - m) > 2 * sd) outlierIds.add(s.id); });
      });
      tableWrap.innerHTML = `<table><thead><tr>
          <th>Student</th><th>Cart</th><th>V</th><th>K<sub>m</sub></th><th>T</th><th>v<sub>ss</sub></th><th></th>
        </tr></thead><tbody>
        ${classSubmissions.map(s => `<tr>
            <td>${s.student}</td><td>${s.cart}</td><td>${s.voltage}</td>
            <td>${fmt(s.gain)}</td><td>${fmt(s.timeConstant)}</td><td>${fmt(s.steadyState)}</td>
            <td>${outlierIds.has(s.id) ? '<span class="tag tag-warn">possible outlier</span>' : ""}</td>
          </tr>`).join("")}
        </tbody></table>`;
    }
  }

  function exportClassCsv() {
    const header = "id,student,cart,voltage,gain,gainUnits,timeConstant,steadyState,method,timestamp";
    const rows = classSubmissions.map(s => [s.id, s.student, s.cart, s.voltage, s.gain, s.gainUnits, s.timeConstant, s.steadyState, JSON.stringify(s.method || ""), s.timestamp].join(","));
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "class_data.csv"; document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  // ------------------------------------------------------------ worksheet --
  function initWorksheet() {
    Worksheet.render("worksheet-content");
    document.getElementById("btn-export-report").addEventListener("click", () => {
      const cart = myCart();
      const results = getResults().filter(r => !cart || r.cart === cart).map(r => ({
        voltage: r.voltage, gain: fmt(r.gain), gainUnits: r.gainUnits, t63: fmt(r.t63), tfit: fmt(r.tfit), vss: fmt(r.vss),
      }));
      Worksheet.exportReport({ cart, results });
    });
  }

  // ------------------------------------------------------------------ go --
  document.addEventListener("DOMContentLoaded", () => {
    initTabs();
    initAssignment();
    initTrackerUI();
    initAnalyzeUI();
    initResultsUI();
    initClassDataUI();
    initWorksheet();
    loadVideos();
  });
})();
