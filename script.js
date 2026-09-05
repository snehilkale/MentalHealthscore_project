(() => {
  "use strict";

  const API_BASE = "https://mansik-santulan-score.onrender.com";

  const form = document.getElementById("predict-form");
  const submitBtn = document.getElementById("submit-btn");
  const resetBtn = document.getElementById("reset-btn");
  const errorRetryBtn = document.getElementById("error-retry-btn");

  const stateIdle = document.getElementById("state-idle");
  const stateLoading = document.getElementById("state-loading");
  const stateResult = document.getElementById("state-result");
  const stateError = document.getElementById("state-error");

  const scoreNumberEl = document.getElementById("score-number");
  const scoreBandEl = document.getElementById("score-band");
  const scoreContextEl = document.getElementById("score-context");
  const gaugeFill = document.getElementById("gauge-fill");
  const errorLabelEl = document.getElementById("error-label");
  const errorCopyEl = document.getElementById("error-copy");

  const GAUGE_ARC_LENGTH = 314; // approx pi * r(100)

  // ---------------------------------------------------------
  // Draw tick marks on both gauges (0..10, every 2 units)
  // ---------------------------------------------------------
  function drawTicks() {
    document.querySelectorAll(".gauge-ticks").forEach((g) => {
      g.innerHTML = "";
      const cx = 120, cy = 140, rOuter = 100, rInner = 90;
      for (let i = 0; i <= 10; i += 2) {
        const angle = Math.PI - (i / 10) * Math.PI; // 180deg -> 0deg
        const x1 = cx + rOuter * Math.cos(angle);
        const y1 = cy - rOuter * Math.sin(angle);
        const x2 = cx + rInner * Math.cos(angle);
        const y2 = cy - rInner * Math.sin(angle);
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", x1.toFixed(1));
        line.setAttribute("y1", y1.toFixed(1));
        line.setAttribute("x2", x2.toFixed(1));
        line.setAttribute("y2", y2.toFixed(1));
        g.appendChild(line);
      }
    });
  }
  drawTicks();

  // ---------------------------------------------------------
  // Segmented control (stress_level) wiring
  // ---------------------------------------------------------
  const segGroup = document.getElementById("stress_level_group");
  const stressHiddenInput = document.getElementById("stress_level");
  segGroup.querySelectorAll(".seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      segGroup.querySelectorAll(".seg-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      stressHiddenInput.value = btn.dataset.value;
      clearFieldError(stressHiddenInput);
    });
  });

  // ---------------------------------------------------------
  // Field-level error helpers
  // ---------------------------------------------------------
  function fieldWrapper(input) {
    return input.closest(".field");
  }

  function setFieldError(input, message) {
    const wrap = fieldWrapper(input);
    if (!wrap) return;
    wrap.classList.add("field-error");
    const msgEl = wrap.querySelector(".error-msg");
    if (msgEl) msgEl.textContent = message;
  }

  function clearFieldError(input) {
    const wrap = fieldWrapper(input);
    if (!wrap) return;
    wrap.classList.remove("field-error");
    const msgEl = wrap.querySelector(".error-msg");
    if (msgEl) msgEl.textContent = "";
  }

  function clearAllErrors() {
    form.querySelectorAll(".field").forEach((f) => f.classList.remove("field-error"));
    form.querySelectorAll(".error-msg").forEach((m) => (m.textContent = ""));
  }

  // ---------------------------------------------------------
  // Client-side validation mirroring the StudentData model
  // ---------------------------------------------------------
  function validate(payload) {
    const errors = [];

    const numericChecks = [
      ["age", 10, 100],
      ["avg_daily_usage_hours", 0, 24],
      ["daily_unlocks", 0, Infinity],
      ["study_hours", 0, 24],
      ["physical_activity_hours", 0, 24],
      ["sleep_hours_per_night", 0, 24],
    ];

    numericChecks.forEach(([key, min, max]) => {
      const input = document.getElementById(key);
      const val = payload[key];
      if (val === "" || val === null || Number.isNaN(val)) {
        errors.push([input, "This field is required."]);
      } else if (val < min || val > max) {
        errors.push([input, `Must be between ${min} and ${max === Infinity ? "0+" : max}.`]);
      }
    });

    ["gender", "country", "academic_level", "most_used_platform", "purpose_of_use"].forEach((key) => {
      const input = document.getElementById(key);
      if (!payload[key] || String(payload[key]).trim() === "") {
        errors.push([input, "This field is required."]);
      }
    });

    if (!payload.stress_level) {
      errors.push([stressHiddenInput, "Pick a stress level."]);
    }

    return errors;
  }

  // ---------------------------------------------------------
  // Gather form data into the exact StudentData shape
  // ---------------------------------------------------------
  function collectPayload() {
    const fd = new FormData(form);
    return {
      age: fd.get("age") === "" ? NaN : parseInt(fd.get("age"), 10),
      gender: fd.get("gender") || "",
      country: (fd.get("country") || "").trim(),
      academic_level: fd.get("academic_level") || "",
      most_used_platform: fd.get("most_used_platform") || "",
      purpose_of_use: fd.get("purpose_of_use") || "",
      avg_daily_usage_hours: fd.get("avg_daily_usage_hours") === "" ? NaN : parseFloat(fd.get("avg_daily_usage_hours")),
      daily_unlocks: fd.get("daily_unlocks") === "" ? NaN : parseInt(fd.get("daily_unlocks"), 10),
      study_hours: fd.get("study_hours") === "" ? NaN : parseFloat(fd.get("study_hours")),
      physical_activity_hours: fd.get("physical_activity_hours") === "" ? NaN : parseFloat(fd.get("physical_activity_hours")),
      sleep_hours_per_night: fd.get("sleep_hours_per_night") === "" ? NaN : parseFloat(fd.get("sleep_hours_per_night")),
      stress_level: fd.get("stress_level") || "",
    };
  }

  // ---------------------------------------------------------
  // UI state switching
  // ---------------------------------------------------------
  function showState(name) {
    [stateIdle, stateLoading, stateResult, stateError].forEach((el) => (el.hidden = true));
    ({ idle: stateIdle, loading: stateLoading, result: stateResult, error: stateError }[name]).hidden = false;
  }

  function setSubmitting(isSubmitting) {
    submitBtn.disabled = isSubmitting;
    submitBtn.classList.toggle("loading", isSubmitting);
  }

  function bandFor(score) {
    if (score < 4) {
      return {
        label: "Signal: strained",
        context: "Your responses suggest elevated strain right now. Small shifts in sleep or screen time can go a long way.",
      };
    }
    if (score < 7) {
      return {
        label: "Signal: balanced",
        context: "Your rhythm looks fairly steady, with some room to recover and reset.",
      };
    }
    return {
      label: "Signal: strong",
      context: "Your habits point to a well-supported, resilient baseline. Keep it up.",
    };
  }

  function renderResult(score, payload) {
    const clamped = Math.max(0, Math.min(10, score));
    const { label, context } = bandFor(clamped);

    scoreNumberEl.textContent = score.toFixed(2);
    scoreBandEl.textContent = label;
    scoreContextEl.textContent = context;

    // reset then animate the arc fill on next frame
    gaugeFill.style.transition = "none";
    gaugeFill.style.strokeDashoffset = String(GAUGE_ARC_LENGTH);
    requestAnimationFrame(() => {
      gaugeFill.style.transition = "";
      const offset = GAUGE_ARC_LENGTH * (1 - clamped / 10);
      gaugeFill.style.strokeDashoffset = String(offset);
    });

    showState("result");

    // Save this submission to local history and refresh the charts
    // in case the history panel is currently open.
    if (payload) {
      addHistoryRecord(payload, score);
      if (!historyPanel.hidden) refreshHistoryUI();
    }
  }

  function renderError(label, copy) {
    errorLabelEl.textContent = label;
    errorCopyEl.textContent = copy;
    showState("error");
  }

  // ---------------------------------------------------------
  // Parse FastAPI / Pydantic 422 error responses into
  // field-level messages where possible
  // ---------------------------------------------------------
  function applyServerValidationErrors(detail) {
    if (!Array.isArray(detail)) return false;
    let matched = false;
    detail.forEach((err) => {
      const field = Array.isArray(err.loc) ? err.loc[err.loc.length - 1] : null;
      const input = field ? document.getElementById(field) : null;
      const target = field === "stress_level" ? stressHiddenInput : input;
      if (target) {
        setFieldError(target, err.msg || "Invalid value.");
        matched = true;
      }
    });
    return matched;
  }

  // ---------------------------------------------------------
  // Submit handler
  // ---------------------------------------------------------
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAllErrors();

    const payload = collectPayload();
    const clientErrors = validate(payload);

    if (clientErrors.length > 0) {
      clientErrors.forEach(([input, msg]) => input && setFieldError(input, msg));
      clientErrors[0][0]?.focus?.();
      return;
    }

    setSubmitting(true);
    showState("loading");

    try {
      const res = await fetch(`${API_BASE}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.status === 422) {
        const body = await res.json().catch(() => null);
        const matched = body && applyServerValidationErrors(body.detail);
        renderError(
          "Check your inputs",
          matched
            ? "The API rejected a few fields — details are marked on the form."
            : "The API rejected this submission. Please review your inputs and try again."
        );
        return;
      }

      if (!res.ok) {
        let detailMsg = `The API responded with status ${res.status}.`;
        const body = await res.json().catch(() => null);
        if (body && typeof body.detail === "string") detailMsg = body.detail;
        renderError("Prediction failed", detailMsg);
        return;
      }

      const data = await res.json();
      if (typeof data.predicted_mental_health_score !== "number") {
        renderError("Unexpected response", "The API responded, but the score was missing or malformed.");
        return;
      }

      renderResult(data.predicted_mental_health_score, payload);
    } catch (err) {
      renderError(
        "Can't reach the server",
        `Couldn't connect to ${API_BASE}. Make sure the backend is running (uvicorn main:app --port 2200 --reload) and reachable from this page.`
      );
    } finally {
      setSubmitting(false);
    }
  });

  // live-clear errors as the user edits
  form.querySelectorAll("input, select").forEach((el) => {
    el.addEventListener("input", () => clearFieldError(el));
    el.addEventListener("change", () => clearFieldError(el));
  });

  resetBtn.addEventListener("click", () => {
    showState("idle");
  });

  errorRetryBtn.addEventListener("click", () => {
    showState("idle");
  });

  // =========================================================
  // HISTORY: localStorage-backed record keeping + charts
  // =========================================================
  const HISTORY_KEY = "maanrakshak_history";

  // Fixed "recommended" benchmark per field, used for the compare chart.
  // These are placeholder targets — swap in real values (e.g. dataset
  // averages from the training notebook) whenever you have them.
  const BENCHMARKS = {
    avg_daily_usage_hours:   { label: "Screen time (hrs)", recommended: 3,  max: 12 },
    daily_unlocks:           { label: "Phone unlocks",     recommended: 40, max: 150 },
    study_hours:             { label: "Study (hrs)",       recommended: 3,  max: 12 },
    physical_activity_hours: { label: "Activity (hrs)",    recommended: 1,  max: 5 },
    sleep_hours_per_night:   { label: "Sleep (hrs)",       recommended: 8,  max: 12 },
  };

  function loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveHistory(records) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(records));
    } catch {
      /* storage unavailable — fail silently, chart just won't persist */
    }
  }

  function addHistoryRecord(payload, score) {
    const records = loadHistory();
    records.push({ timestamp: Date.now(), score, payload });
    const trimmed = records.slice(-30); // keep the last 30 to stay light
    saveHistory(trimmed);
    return trimmed;
  }

  function scoreClass(score) {
    if (score < 4) return "low";
    if (score < 7) return "mid";
    return "high";
  }

  function fmtDate(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
      " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }

  // --- Trend chart (score over time) ---
  function renderTrendChart(records) {
    const svg = document.getElementById("trend-svg");
    const empty = document.getElementById("trend-empty");
    svg.innerHTML = "";

    if (records.length === 0) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    const W = 640, H = 220, padL = 36, padR = 20, padT = 20, padB = 30;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const n = records.length;
    const xFor = (i) => padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
    const yFor = (score) => padT + plotH - (Math.max(0, Math.min(10, score)) / 10) * plotH;

    const ns = "http://www.w3.org/2000/svg";

    const axis = document.createElementNS(ns, "line");
    axis.setAttribute("class", "trend-axis");
    axis.setAttribute("x1", padL); axis.setAttribute("y1", padT + plotH);
    axis.setAttribute("x2", padL + plotW); axis.setAttribute("y2", padT + plotH);
    svg.appendChild(axis);

    [0, 5, 10].forEach((v) => {
      const y = yFor(v);
      const t = document.createElementNS(ns, "text");
      t.setAttribute("class", "trend-tick-label");
      t.setAttribute("x", padL - 8);
      t.setAttribute("y", y + 3);
      t.setAttribute("text-anchor", "end");
      t.textContent = v;
      svg.appendChild(t);
    });

    const points = records.map((r, i) => `${xFor(i)},${yFor(r.score)}`).join(" ");
    const polyline = document.createElementNS(ns, "polyline");
    polyline.setAttribute("class", "trend-line");
    polyline.setAttribute("points", points);
    svg.appendChild(polyline);

    records.forEach((r, i) => {
      const c = document.createElementNS(ns, "circle");
      c.setAttribute("class", `trend-dot ${scoreClass(r.score)}`);
      c.setAttribute("cx", xFor(i));
      c.setAttribute("cy", yFor(r.score));
      c.setAttribute("r", 4.5);
      const title = document.createElementNS(ns, "title");
      title.textContent = `${fmtDate(r.timestamp)} — ${r.score.toFixed(2)}`;
      c.appendChild(title);
      svg.appendChild(c);
    });
  }

  // --- Compare chart (most recent record vs recommended, per field) ---
  function renderCompareChart(records) {
    const svg = document.getElementById("compare-svg");
    const empty = document.getElementById("compare-empty");
    svg.innerHTML = "";

    if (records.length === 0) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    const latest = records[records.length - 1].payload;
    const fields = Object.keys(BENCHMARKS);

    const W = 640, rowH = 58, padL = 150, padR = 60, padT = 10;
    const H = padT + fields.length * rowH + 10;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

    const barMaxW = W - padL - padR;
    const ns = "http://www.w3.org/2000/svg";

    fields.forEach((key, i) => {
      const { label, recommended, max } = BENCHMARKS[key];
      const value = Number(latest[key]) || 0;
      const y = padT + i * rowH;

      const labelEl = document.createElementNS(ns, "text");
      labelEl.setAttribute("class", "bar-label");
      labelEl.setAttribute("x", 0);
      labelEl.setAttribute("y", y + 22);
      labelEl.textContent = label;
      svg.appendChild(labelEl);

      const recW = Math.min(1, recommended / max) * barMaxW;
      const recRect = document.createElementNS(ns, "rect");
      recRect.setAttribute("class", "bar-rec");
      recRect.setAttribute("x", padL);
      recRect.setAttribute("y", y);
      recRect.setAttribute("width", Math.max(recW, 2));
      recRect.setAttribute("height", 14);
      recRect.setAttribute("rx", 3);
      svg.appendChild(recRect);

      const valW = Math.min(1, value / max) * barMaxW;
      const valRect = document.createElementNS(ns, "rect");
      valRect.setAttribute("class", "bar-you");
      valRect.setAttribute("x", padL);
      valRect.setAttribute("y", y + 20);
      valRect.setAttribute("width", Math.max(valW, 2));
      valRect.setAttribute("height", 14);
      valRect.setAttribute("rx", 3);
      svg.appendChild(valRect);

      const valText = document.createElementNS(ns, "text");
      valText.setAttribute("class", "bar-value");
      valText.setAttribute("x", padL + Math.max(valW, 2) + 8);
      valText.setAttribute("y", y + 31);
      valText.textContent = `${value} (rec. ~${recommended})`;
      svg.appendChild(valText);
    });
  }

  // --- Record list ---
  function renderHistList(records) {
    const list = document.getElementById("hist-list");
    list.innerHTML = "";

    if (records.length === 0) return;

    [...records].reverse().forEach((r) => {
      const row = document.createElement("div");
      row.className = "hist-row";
      row.innerHTML = `
        <span class="hist-row-date">${fmtDate(r.timestamp)}</span>
        <span class="hist-row-score">${r.score.toFixed(2)}/10</span>
      `;
      list.appendChild(row);
    });

    const clearAll = document.createElement("button");
    clearAll.type = "button";
    clearAll.className = "hist-clear-all";
    clearAll.textContent = "Clear all history";
    clearAll.addEventListener("click", () => {
      saveHistory([]);
      refreshHistoryUI();
    });
    list.appendChild(clearAll);
  }

  function refreshHistoryUI() {
    const records = loadHistory();
    renderTrendChart(records);
    renderCompareChart(records);
    renderHistList(records);
  }

  // --- panel + tab wiring ---
  const historyToggle = document.getElementById("history-toggle");
  const historyPanel = document.getElementById("history-panel");
  const historyClose = document.getElementById("history-close");
  const histTabs = document.querySelectorAll(".hist-tab");
  const histViewTrend = document.getElementById("hist-view-trend");
  const histViewCompare = document.getElementById("hist-view-compare");

  historyToggle.addEventListener("click", () => {
    historyPanel.hidden = !historyPanel.hidden;
    if (!historyPanel.hidden) {
      refreshHistoryUI();
      historyPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
  historyClose.addEventListener("click", () => { historyPanel.hidden = true; });

  histTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      histTabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const showTrend = tab.dataset.tab === "trend";
      histViewTrend.hidden = !showTrend;
      histViewCompare.hidden = showTrend;
    });
  });
})();
