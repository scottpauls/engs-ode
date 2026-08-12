/* Numerical processing: parsing tracker position data, computing velocity by
 * numerical derivative, and estimating DC gain / time constant -- the
 * browser-side equivalent of the MATLAB steps in the assignment. */
const Analysis = (() => {

  /** Parse a Tracker-style export: whitespace/comma/tab separated columns,
   * first row usually a header like "t (s)  x (m)  y (m)". Returns {t,x,y}. */
  function parsePositionData(text) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    const t = [], x = [], y = [];
    for (const line of lines) {
      const parts = line.split(/[,\t]|\s{2,}|\s+/).filter(p => p.length > 0);
      const nums = parts.map(p => parseFloat(p));
      if (nums.length >= 3 && nums.every(n => !Number.isNaN(n))) {
        t.push(nums[0]); x.push(nums[1]); y.push(nums[2]);
      }
      // rows that don't parse as 3 numbers (headers, etc.) are silently skipped
    }
    return { t, x, y };
  }

  function toCsvText({ t, x, y }) {
    const rows = ["t (s)\tx (m)\ty (m)"];
    for (let i = 0; i < t.length; i++) rows.push(`${t[i]}\t${x[i]}\t${y[i]}`);
    return rows.join("\n");
  }

  /** Per-interval numerical derivative: v_i = (x[i+1]-x[i]) / (t[i+1]-t[i]),
   * associated with time t[i] -- matches the assignment's MATLAB approach. */
  function computeVelocity(t, x, { invert = false } = {}) {
    const vt = [], v = [];
    for (let i = 0; i < t.length - 1; i++) {
      const dt = t[i + 1] - t[i];
      if (dt <= 0) continue;
      let vi = (x[i + 1] - x[i]) / dt;
      if (invert) vi = -vi;
      vt.push(t[i]);
      v.push(vi);
    }
    return { t: vt, v };
  }

  function mean(arr) {
    if (arr.length === 0) return NaN;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  function stdev(arr, sample = true) {
    if (arr.length < 2) return 0;
    const m = mean(arr);
    const ss = arr.reduce((a, b) => a + (b - m) ** 2, 0);
    return Math.sqrt(ss / (arr.length - (sample ? 1 : 0)));
  }

  /** Steady-state estimate: mean of the last `fraction` of samples (by count). */
  function steadyState(v, fraction = 0.15) {
    if (v.length === 0) return NaN;
    const n = Math.max(1, Math.round(v.length * fraction));
    return mean(v.slice(-n));
  }

  /** Time at which v first crosses 63.2% of vss, via linear interpolation
   * between the bracketing samples. Assumes a rising saturating exponential
   * (vss can be negative; handled via sign-aware comparison). */
  function timeConstant63(t, v, vss) {
    if (!isFinite(vss) || vss === 0 || t.length < 2) return NaN;
    const target = 0.632 * vss;
    const rising = vss > 0;
    for (let i = 0; i < v.length - 1; i++) {
      const a = v[i], b = v[i + 1];
      const crossed = rising ? (a < target && b >= target) : (a > target && b <= target);
      if (crossed) {
        const frac = (target - a) / (b - a);
        const crossTime = t[i] + frac * (t[i + 1] - t[i]);
        return crossTime - t[0];
      }
    }
    return NaN;
  }

  function linearRegression(xs, ys) {
    const n = xs.length;
    if (n < 2) return { slope: NaN, intercept: NaN, r2: NaN };
    const mx = mean(xs), my = mean(ys);
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) {
      sxy += (xs[i] - mx) * (ys[i] - my);
      sxx += (xs[i] - mx) ** 2;
      syy += (ys[i] - my) ** 2;
    }
    const slope = sxy / sxx;
    const intercept = my - slope * mx;
    const r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);
    return { slope, intercept, r2 };
  }

  /** Fit v(t) = vss*(1-exp(-(t-t0)/T)) by linearizing:
   * ln(vss - v) = ln(vss) - (t-t0)/T, restricted to points on the correct
   * side of vss. Returns {T, r2} or NaNs if it can't fit. */
  function fitExponentialTimeConstant(t, v, vss) {
    if (!isFinite(vss) || vss === 0 || t.length < 3) return { T: NaN, r2: NaN };
    const t0 = t[0];
    const xs = [], ys = [];
    for (let i = 0; i < t.length; i++) {
      const resid = vss > 0 ? (vss - v[i]) : (v[i] - vss);
      if (resid > 1e-9 * Math.abs(vss)) {
        xs.push(t[i] - t0);
        ys.push(Math.log(resid));
      }
    }
    if (xs.length < 3) return { T: NaN, r2: NaN };
    const { slope, r2 } = linearRegression(xs, ys);
    if (slope >= 0) return { T: NaN, r2 };
    return { T: -1 / slope, r2 };
  }

  return {
    parsePositionData, toCsvText, computeVelocity,
    mean, stdev, steadyState, timeConstant63,
    linearRegression, fitExponentialTimeConstant,
  };
})();
