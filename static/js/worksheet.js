/* The assignment's numbered questions, reproduced verbatim (Assignment.docx),
 * grouped into the module's four parts, with localStorage autosave and a
 * plain-text report export for Canvas submission. */
const Worksheet = (() => {

  const PARTS = [
    {
      title: "Part 1 — MATLAB Processing",
      questions: [
        "If the motor voltage is zero for t < 0 and is constant for t ≥ 0, what type of response do you expect to get from this experiment? What type of input is this?",
        "Find analytically an expression for the expected response of the system in terms of the system parameters, the input voltage, and an arbitrary initial condition.",
        "Report your DC gain value and units for 2.5V as well as the method used to calculate the DC gain.",
        "Report your time constant and units for 2.5V as well as the method used to calculate the time constant.",
        "Report your DC gain value and units for 3.5V as well as the method used to calculate the DC gain.",
        "Report your time constants and units for 3.5V as well as the method used to calculate the time constant.",
      ],
    },
    {
      title: "Part 2 — Individual Analysis",
      questions: [
        "List two ways in which you can test for linearity.",
        "Does the system appear to be linear? How did you come to this conclusion?",
        "Regardless of whether your system appears linear, list some possible factors that could contribute to nonlinearity in this system.",
        "Based on the time constants and motor gains you calculated previously, you simulated the response of the system to a 5V input and re-processed the 5V video. Does the simulated (MATLAB) plot match your collected 5V data? Explain why you think this is or is not the case.",
      ],
    },
    {
      title: "Part 3 — Class Analysis (after class data is available)",
      questions: [
        "Does the Steady State Velocity vs. Input Voltage scatter plot for Cart 1 agree with your expectations of linearity?",
        "Does the Steady State Velocity vs. Input Voltage scatter plot for Cart 2 agree with your expectations of linearity?",
        "Does the data seem self-consistent, or do there appear to be one or more outliers?",
        "What other forces exist that we have not modeled in this system? How do these forces impact your answers to the previous two questions (Cart 1 and Cart 2 linearity)?",
      ],
    },
    {
      title: "Part 4 — Reflection Questions",
      questions: [
        "What is the mean and standard deviation of the time constant and DC gain across all of the 2.5V runs for your cart number?",
        "What is the mean and standard deviation of the time constant and DC gain across all of the 3.5V runs for your cart number?",
        "What might the effect of any outliers be on your answers to the previous two questions?",
        "What might be the causes of variability in the time constant?",
        "What might be the causes of variability in the DC gain?",
        "Refer back to the Data Collection Procedure. How might you change the data collection and/or analysis procedure to reduce sources of uncertainty in the data?",
        "Did you run into any challenges tracking the cart or otherwise collecting data? How might challenges in data collection affect your characterization of the system?",
        "What other applications can you think of for these system analysis techniques? What are potential ethical issues with data collection using video?",
        "Imagine you were building 1 million electric vehicles. What would the mean and variance you have computed say about performance of the product?",
      ],
    },
  ];

  const STORAGE_PREFIX = "cartlab_ws_";

  function questionId(partIdx, qIdx) { return `p${partIdx + 1}q${qIdx + 1}`; }

  function render(container) {
    const el = typeof container === "string" ? document.getElementById(container) : container;
    let html = "";
    let counter = 0;
    PARTS.forEach((part, pIdx) => {
      html += `<div class="card ws-part"><h2>${part.title}</h2>`;
      part.questions.forEach((q, qIdx) => {
        counter++;
        const id = questionId(pIdx, qIdx);
        html += `
          <div class="ws-q">
            <label for="ws-${id}"><span class="q-num">${counter}.</span>${q}</label>
            <textarea id="ws-${id}" data-id="${id}"></textarea>
          </div>`;
      });
      html += `</div>`;
    });
    el.innerHTML = html;

    el.querySelectorAll("textarea").forEach(ta => {
      const key = STORAGE_PREFIX + ta.dataset.id;
      const saved = localStorage.getItem(key);
      if (saved) ta.value = saved;
      ta.addEventListener("input", () => localStorage.setItem(key, ta.value));
    });
  }

  function allAnswers() {
    const out = [];
    let counter = 0;
    PARTS.forEach((part, pIdx) => {
      part.questions.forEach((q, qIdx) => {
        counter++;
        const id = questionId(pIdx, qIdx);
        const answer = localStorage.getItem(STORAGE_PREFIX + id) || "";
        out.push({ n: counter, part: part.title, question: q, answer });
      });
    });
    return out;
  }

  function buildReportText(extra) {
    const lines = [];
    lines.push("SYSTEM CHARACTERIZATION FROM DATA — STUDENT REPORT");
    lines.push(new Date().toLocaleString());
    if (extra && extra.cart) lines.push(`Cart: ${extra.cart}`);
    lines.push("");

    if (extra && extra.results && extra.results.length) {
      lines.push("--- Saved run parameters ---");
      extra.results.forEach(r => {
        lines.push(`  ${r.voltage} V: Km = ${r.gain} ${r.gainUnits || ""}, T(63%) = ${r.t63} s, T(fit) = ${r.tfit} s, vss = ${r.vss} m/s`);
      });
      lines.push("");
    }

    let lastPart = null;
    allAnswers().forEach(a => {
      if (a.part !== lastPart) { lines.push(""); lines.push(a.part.toUpperCase()); lines.push("=".repeat(a.part.length)); lastPart = a.part; }
      lines.push("");
      lines.push(`${a.n}. ${a.question}`);
      lines.push(a.answer.trim() ? a.answer.trim() : "[no answer yet]");
    });
    return lines.join("\n");
  }

  function exportReport(extra) {
    const text = buildReportText(extra);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "system_characterization_report.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return { PARTS, render, allAnswers, exportReport };
})();
