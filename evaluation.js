// ============================================================================
// MathVibe Teacher Evaluation page
//
// Recruited raters (IDs configured in assignments.js) each evaluate the lesson
// sets of several study participants. For every assigned participant ("set"),
// the rater rates the 3 condition lessons (blinded as Lesson A/B/C, order
// counterbalanced per rater × set) and then compares them; each lesson set is
// assigned to RATINGS_PER_LESSON raters overall.
//
// Reuses TOPICS / URL_OVERRIDES from examples.js (loaded before this file).
// Rater IDs and their assigned participants are stored in the Supabase
// rater_assignments table and managed from dashboard.html; the assignment is
// fetched when the rater starts and frozen into their saved session, so
// editing assignments later never reshuffles an in-progress rater.
//
// Answers autosave to localStorage (resume support) and sync to Supabase at
// each step transition and on final submit. Run evaluation-schema.sql once in
// the Supabase SQL editor before using this page.
// ============================================================================

(function () {
  "use strict";

  // --- Supabase (same project as TeacherAIFrontend) -------------------------
  const SUPABASE_URL = "https://oxjrjdtrijhksqeohyka.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94anJqZHRyaWpoa3NxZW9oeWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyMzMwNDEsImV4cCI6MjA3NzgwOTA0MX0.N8K06cV93EeU5hAPqQ3VjnbqJBKaisUdGuvVdN3N81M";

  const RATINGS_TABLE = "lesson_evaluations";
  const COMPARISONS_TABLE = "lesson_comparisons";
  const ASSIGNMENTS_TABLE = "rater_assignments";

  // --- Questionnaire ---------------------------------------------------------
  const LIKERT = [
    { value: 1, label: "Strongly Disagree" },
    { value: 2, label: "Disagree" },
    { value: 3, label: "Neutral" },
    { value: 4, label: "Agree" },
    { value: 5, label: "Strongly Agree" },
  ];

  const DIMENSIONS = [
    {
      key: "pedagogical_quality",
      label: "Pedagogical Quality",
      items: [
        { key: "pq1", text: "The lesson is appropriate for the intended grade level." },
        { key: "pq2", text: "The lesson introduces concepts in a logical sequence." },
        { key: "pq3", text: "The lesson encourages active exploration of the concept." },
        { key: "pq4", text: "The relationship between the interactions and the mathematical ideas is clearly explained." },
      ],
    },
    {
      key: "mathematical_correctness",
      label: "Mathematical Correctness",
      items: [
        { key: "mc1", text: "The mathematical concepts are presented accurately." },
        { key: "mc2", text: "The formulas and equations are correct." },
        { key: "mc3", text: "The visualizations accurately represent the underlying mathematics." },
        { key: "mc4", text: "The lesson remains mathematically correct across all interaction states." },
      ],
    },
    {
      key: "visualization_quality",
      label: "Visualization Quality",
      items: [
        { key: "vq1", text: "The lesson uses appropriate visualizations (e.g., graphs, diagrams, or simulations) for the concept being taught." },
        { key: "vq2", text: "The visualizations are clear and easy to understand." },
        { key: "vq3", text: "The visualizations are well designed (layout, colors, and labels)." },
        { key: "vq4", text: "The explanations in the lesson are clearly linked with the visualizations." },
      ],
    },
    {
      key: "interactive_explanation_quality",
      label: "Interactive Explanation Quality",
      items: [
        { key: "ie1", text: "The interactive controls are relevant to the concept being taught." },
        { key: "ie2", text: "Manipulating the controls helps reveal important mathematical relationships." },
        { key: "ie3", text: "Changes in the visualization are easy to interpret." },
        { key: "ie4", text: "The interactions help connect abstract mathematical ideas with their visual representations." },
      ],
    },
  ];

  const COMPARISON_QUESTIONS = [
    { key: "best_pedagogical_quality", text: "Which lesson has the best Pedagogical Quality?" },
    { key: "best_mathematical_correctness", text: "Which lesson has the best Mathematical Correctness?" },
    { key: "best_visualization_quality", text: "Which lesson has the best Visualization Quality?" },
    { key: "best_interactive_quality", text: "Which lesson has the best Interactive Explanation Quality?" },
    { key: "preferred_overall", text: "Overall, which lesson would you prefer to use with your students?" },
  ];

  const COMPARISON_TEXT_QUESTIONS = [
    { key: "preference_reason", text: "Please explain your choice for the overall preferred lesson." },
    { key: "general_feedback", text: "Any other feedback about these lessons?" },
  ];

  // All 6 orderings of the three conditions; rater × participant picks one,
  // so lesson order is counterbalanced and stable on resume.
  const ORDERINGS = [
    ["full", "no-design", "no-edits"],
    ["full", "no-edits", "no-design"],
    ["no-design", "full", "no-edits"],
    ["no-design", "no-edits", "full"],
    ["no-edits", "full", "no-design"],
    ["no-edits", "no-design", "full"],
  ];

  const LABELS = ["A", "B", "C"];
  const STEPS_PER_SET = 4; // 3 lesson ratings + 1 comparison

  // --- State -----------------------------------------------------------------
  const STORAGE_PREFIX = "mathvibe-eval-v2:";
  const LAST_RATER_KEY = STORAGE_PREFIX + "last-rater";

  // evaluation.html?fresh=1 — for test runs: discard any saved progress for
  // the entered rater ID and start over instead of resuming.
  const FRESH_START = new URLSearchParams(window.location.search).get("fresh") === "1";

  // state = { rater, pos, ratings: {pid: {condition: {pq1..ie4}}},
  //           comparisons: {pid: {...}}, synced: {key: bool}, startedAt }
  // pos: -1 = intro (never stored), 0..totalSteps-1 = working, totalSteps = done.
  let state = null;
  let activeCompareTab = 0; // which lesson tab is shown on a comparison step

  const appEl = document.getElementById("app");
  const progressEl = document.getElementById("progress");

  function storageKey(rater) {
    return STORAGE_PREFIX + "r-" + rater;
  }

  function loadState(rater) {
    try {
      const raw = localStorage.getItem(storageKey(rater));
      if (raw) return JSON.parse(raw);
    } catch (e) { /* corrupted state → start fresh */ }
    return null;
  }

  function saveState() {
    if (!state) return;
    try {
      localStorage.setItem(storageKey(state.rater), JSON.stringify(state));
      localStorage.setItem(LAST_RATER_KEY, state.rater);
    } catch (e) { /* storage unavailable; Supabase sync still covers us */ }
  }

  function normalizeRater(input) {
    return input.trim().toUpperCase().replace(/\s+/g, "");
  }

  function assignedPids() {
    return (state && state.assigned) || [];
  }

  function totalSteps() {
    return assignedPids().length * STEPS_PER_SET;
  }

  // Deterministic ordering per rater × participant (stable on resume).
  function hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  }

  function lessonUrl(pid, condition) {
    const subdomain = "c" + pid + "-" + condition;
    return (typeof URL_OVERRIDES !== "undefined" && URL_OVERRIDES[subdomain]) ||
      "https://" + subdomain + ".mathvibe.space/";
  }

  function lessonsFor(rater, pid) {
    const order = ORDERINGS[hashStr(rater + ":" + pid) % ORDERINGS.length];
    return order.map((condition, i) => ({
      pid: pid,
      condition: condition,
      label: LABELS[i],
      url: lessonUrl(pid, condition),
      topic: TOPICS[pid] || "Mathematics",
    }));
  }

  // Current position → which set and which step inside it.
  function posInfo() {
    const pids = assignedPids();
    const setIndex = Math.floor(state.pos / STEPS_PER_SET);
    return {
      setIndex: setIndex,
      setCount: pids.length,
      pid: pids[setIndex],
      sub: state.pos % STEPS_PER_SET, // 0..2 = lesson rating, 3 = comparison
    };
  }

  // --- Supabase REST ---------------------------------------------------------
  async function sbSelect(table, query) {
    const res = await fetch(SUPABASE_URL + "/rest/v1/" + table + "?" + query, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error("Load failed (" + res.status + "): " + text);
    }
    return res.json();
  }

  // Look up a rater's assigned participant numbers (case-insensitive).
  async function fetchAssignment(rater) {
    const rows = await sbSelect(ASSIGNMENTS_TABLE, "select=rater_id,participants");
    const row = rows.find((r) => String(r.rater_id).toUpperCase() === rater);
    if (!row) return null;
    const pids = (Array.isArray(row.participants) ? row.participants : [])
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= PARTICIPANT_COUNT);
    return pids;
  }

  async function sbUpsert(table, rows, onConflict) {
    const res = await fetch(
      SUPABASE_URL + "/rest/v1/" + table + "?on_conflict=" + encodeURIComponent(onConflict),
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: "Bearer " + SUPABASE_ANON_KEY,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(rows),
      }
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error("Save failed (" + res.status + "): " + text);
    }
  }

  function ratingSyncKey(pid, condition) { return "r:" + pid + ":" + condition; }
  function comparisonSyncKey(pid) { return "c:" + pid; }

  async function syncLesson(lesson) {
    const answers = (state.ratings[lesson.pid] || {})[lesson.condition] || {};
    await sbUpsert(
      RATINGS_TABLE,
      [{
        rater_id: state.rater,
        participant_id: "C" + lesson.pid,
        condition: lesson.condition,
        lesson_label: lesson.label,
        lesson_url: lesson.url,
        answers: answers,
        updated_at: new Date().toISOString(),
      }],
      "rater_id,participant_id,condition"
    );
    state.synced[ratingSyncKey(lesson.pid, lesson.condition)] = true;
    saveState();
  }

  async function syncComparison(pid) {
    const lessons = lessonsFor(state.rater, pid);
    const order = {};
    lessons.forEach((l) => { order[l.label] = l.condition; });
    await sbUpsert(
      COMPARISONS_TABLE,
      [{
        rater_id: state.rater,
        participant_id: "C" + pid,
        condition_order: order,
        answers: state.comparisons[pid] || {},
        updated_at: new Date().toISOString(),
      }],
      "rater_id,participant_id"
    );
    state.synced[comparisonSyncKey(pid)] = true;
    saveState();
  }

  // Retry anything answered but not yet synced (e.g. after a network failure).
  async function syncPending() {
    for (const pid of assignedPids()) {
      for (const lesson of lessonsFor(state.rater, pid)) {
        const answered = state.ratings[pid] && state.ratings[pid][lesson.condition] &&
          Object.keys(state.ratings[pid][lesson.condition]).length;
        if (answered && !state.synced[ratingSyncKey(pid, lesson.condition)]) {
          await syncLesson(lesson);
        }
      }
      const compared = state.comparisons[pid] && Object.keys(state.comparisons[pid]).length;
      if (compared && !state.synced[comparisonSyncKey(pid)]) {
        await syncComparison(pid);
      }
    }
  }

  // --- Rendering helpers -----------------------------------------------------
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function renderProgress() {
    progressEl.innerHTML = "";
    if (!state || state.pos < 0) return;
    const total = totalSteps();
    const done = Math.min(state.pos, total);
    const info = state.pos < total ? posInfo() : null;

    const label = info
      ? "Set " + (info.setIndex + 1) + " of " + info.setCount +
        (info.sub < 3 ? " · Lesson " + LABELS[info.sub] : " · Comparison")
      : "Completed";
    progressEl.appendChild(el("span", "progress-text", label));

    const bar = el("div", "progress-bar");
    const fill = el("div", "progress-bar-fill");
    fill.style.width = (total ? (done / total) * 100 : 0) + "%";
    bar.appendChild(fill);
    progressEl.appendChild(bar);
  }

  function render() {
    renderProgress();
    appEl.innerHTML = "";
    if (!state) {
      renderIntro();
      return;
    }
    const total = totalSteps();
    if (state.pos >= total) {
      renderDone();
    } else {
      const info = posInfo();
      if (info.sub < 3) renderLessonStep(info);
      else renderComparisonStep(info);
    }
    window.scrollTo(0, 0);
  }

  function goTo(pos) {
    state.pos = Math.max(0, pos);
    activeCompareTab = 0;
    saveState();
    render();
  }

  // --- Step: rater ID --------------------------------------------------------
  function renderIntro() {
    const wrap = el("div", "center-step");
    const card = el("div", "intro-card");

    card.appendChild(el("h1", null, "MathVibe Lesson Evaluation"));
    card.appendChild(el("p", null,
      "Thank you for taking part in this evaluation. You will review several " +
      "sets of interactive mathematics lessons. Each set contains three " +
      "lessons on the same topic, created by a teacher using different systems."));

    const list = el("ol");
    [
      "For each lesson (A, B, and C in a set): explore it on the left, then answer the questions on the right. Please interact with the lesson before answering.",
      "After the three lessons in a set, you will compare them, then move on to the next set.",
      "All questions are required. Your answers are saved as you go — you can close this page and continue later by entering the same rater ID.",
    ].forEach((t) => list.appendChild(el("li", null, t)));
    card.appendChild(list);

    const label = el("label", "field-label", "Rater ID");
    label.setAttribute("for", "pid-input");
    card.appendChild(label);

    const input = el("input", "pid-input");
    input.id = "pid-input";
    input.type = "text";
    input.placeholder = "e.g. R1";
    input.autocomplete = "off";
    const lastRater = localStorage.getItem(LAST_RATER_KEY);
    if (lastRater) input.value = lastRater;
    card.appendChild(input);

    const error = el("p", "field-error", "");
    card.appendChild(error);

    if (FRESH_START) {
      card.appendChild(el("div", "resume-note",
        "Fresh-start mode: any saved progress on this device is discarded when you press Start."));
    } else if (lastRater && loadState(lastRater)) {
      card.appendChild(el("div", "resume-note",
        "Saved progress found for rater " + lastRater +
        " — press Start to continue where you left off."));
    }

    const footer = el("div");
    footer.style.marginTop = "16px";
    const startBtn = el("button", "btn primary", "Start");
    footer.appendChild(startBtn);
    card.appendChild(footer);

    async function start() {
      const rater = normalizeRater(input.value);
      if (!rater) {
        error.textContent = "Please enter the rater ID you were given (e.g. R1).";
        return;
      }

      if (FRESH_START) {
        try { localStorage.removeItem(storageKey(rater)); } catch (e) {}
      }

      startBtn.disabled = true;
      error.textContent = "";
      startBtn.textContent = "Checking…";

      let saved = FRESH_START ? null : loadState(rater);

      // Stale-session check: if this saved session has synced answers to the
      // server before, but the server now holds none for this rater, the
      // researcher cleared the data — discard the local session and restart.
      // (If the check itself fails, e.g. offline, keep the local session.)
      if (saved && Object.values(saved.synced || {}).some(Boolean)) {
        try {
          const filter = "select=id&rater_id=eq." + encodeURIComponent(rater) + "&limit=1";
          const results = await Promise.all([
            sbSelect(RATINGS_TABLE, filter),
            sbSelect(COMPARISONS_TABLE, filter),
          ]);
          if (!results[0].length && !results[1].length) {
            try { localStorage.removeItem(storageKey(rater)); } catch (e) {}
            saved = null;
          }
        } catch (e) { /* keep the local session */ }
      }

      // Resume a saved session as-is (its assignment is frozen at first start).
      if (saved && Array.isArray(saved.assigned) && saved.assigned.length) {
        startBtn.disabled = false;
        startBtn.textContent = "Start";
        state = saved;
        if (typeof state.pos !== "number" || state.pos < 0) state.pos = 0;
        saveState();
        render();
        return;
      }
      let pids = null;
      try {
        pids = await fetchAssignment(rater);
      } catch (err) {
        console.error(err);
        startBtn.disabled = false;
        startBtn.textContent = "Start";
        error.textContent = "Could not reach the server — please check your connection and try again.";
        return;
      }
      startBtn.disabled = false;
      startBtn.textContent = "Start";
      if (!pids) {
        error.textContent = "Unknown rater ID. Please use the ID you were given (e.g. R1).";
        return;
      }
      if (!pids.length) {
        error.textContent = "No lesson sets are assigned to this rater ID yet. Please contact the research team.";
        return;
      }

      state = {
        rater: rater,
        assigned: pids,
        pos: 0,
        ratings: {},
        comparisons: {},
        synced: {},
        startedAt: new Date().toISOString(),
      };
      saveState();
      render();
    }

    startBtn.addEventListener("click", start);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") start(); });

    wrap.appendChild(card);
    appEl.appendChild(wrap);
    input.focus();
  }

  // --- Lesson pane (left side) ----------------------------------------------
  function makeLessonPane(lessons, initialIndex, withTabs, setText) {
    const pane = el("div", "lesson-pane");
    const header = el("div", "lesson-pane-header");

    const title = el("div", "lesson-pane-title");
    header.appendChild(title);

    let tabs = null;
    if (withTabs) {
      tabs = el("div", "lesson-tabs");
      header.appendChild(tabs);
    }

    const frameWrap = el("div", "lesson-frame-wrap");
    frameWrap.appendChild(el("div", "frame-loading", "Loading lesson…"));
    const iframe = document.createElement("iframe");
    iframe.setAttribute("title", "Lesson");
    frameWrap.appendChild(iframe);

    function show(index) {
      const lesson = lessons[index];
      title.innerHTML = "";
      title.appendChild(document.createTextNode("Lesson " + lesson.label + " "));
      title.appendChild(el("span", "topic", "— " + lesson.topic + (setText ? " (" + setText + ")" : "")));
      if (iframe.src !== lesson.url) iframe.src = lesson.url;
      if (tabs) {
        tabs.innerHTML = "";
        lessons.forEach((l, i) => {
          const btn = el("button", "lesson-tab" + (i === index ? " active" : ""), "Lesson " + l.label);
          btn.addEventListener("click", () => {
            activeCompareTab = i;
            show(i);
          });
          tabs.appendChild(btn);
        });
      }
    }

    show(initialIndex);
    pane.appendChild(header);
    pane.appendChild(frameWrap);
    return pane;
  }

  // Shared footer for questionnaire panes.
  function makeFooter(backHidden) {
    const footer = el("div", "pane-footer");
    const backBtn = el("button", "btn", "← Back");
    const status = el("div", "status", "");
    const nextBtn = el("button", "btn primary", "");
    if (backHidden) backBtn.style.visibility = "hidden";
    footer.appendChild(backBtn);
    footer.appendChild(status);
    footer.appendChild(nextBtn);
    return { footer: footer, backBtn: backBtn, status: status, nextBtn: nextBtn };
  }

  // --- Steps 0..2 of a set: rate one lesson ---------------------------------
  function renderLessonStep(info) {
    const lessons = lessonsFor(state.rater, info.pid);
    const lesson = lessons[info.sub];
    if (!state.ratings[info.pid]) state.ratings[info.pid] = {};
    if (!state.ratings[info.pid][lesson.condition]) state.ratings[info.pid][lesson.condition] = {};
    const answers = state.ratings[info.pid][lesson.condition];
    const setText = "set " + (info.setIndex + 1) + " of " + info.setCount;

    const layout = el("div", "eval-layout");
    layout.appendChild(makeLessonPane(lessons, info.sub, false, setText));

    const pane = el("div", "question-pane");
    const scroll = el("div", "question-scroll");

    scroll.appendChild(el("h2", null,
      "Rate Lesson " + lesson.label + " (" + (info.sub + 1) + " of 3)"));
    scroll.appendChild(el("p", "pane-sub",
      lesson.topic + " — set " + (info.setIndex + 1) + " of " + info.setCount + ". " +
      "Please explore the lesson on the left before answering. Rate how much you agree with each statement."));

    const validation = el("p", "validation-summary", "");
    scroll.appendChild(validation);

    for (const dim of DIMENSIONS) {
      const block = el("div", "dimension-block");
      block.appendChild(el("h3", null, dim.label));
      for (const item of dim.items) {
        const itemEl = el("div", "likert-item");
        itemEl.dataset.qkey = item.key;
        itemEl.appendChild(el("p", "q-text", item.text));
        const scale = el("div", "likert-scale");
        for (const opt of LIKERT) {
          const optWrap = el("label", "likert-option");
          const input = document.createElement("input");
          input.type = "radio";
          input.name = info.pid + ":" + lesson.condition + ":" + item.key;
          input.value = String(opt.value);
          if (answers[item.key] === opt.value) input.checked = true;
          input.addEventListener("change", () => {
            answers[item.key] = opt.value;
            state.synced[ratingSyncKey(info.pid, lesson.condition)] = false;
            itemEl.classList.remove("missing");
            saveState();
          });
          optWrap.appendChild(input);
          optWrap.appendChild(el("span", null, opt.label));
          scale.appendChild(optWrap);
        }
        itemEl.appendChild(scale);
        block.appendChild(itemEl);
      }
      scroll.appendChild(block);
    }

    const nav = makeFooter(state.pos === 0);
    nav.nextBtn.textContent =
      info.sub === 2 ? "Next: Comparison →" : "Next: Lesson " + LABELS[info.sub + 1] + " →";

    nav.backBtn.addEventListener("click", () => goTo(state.pos - 1));

    nav.nextBtn.addEventListener("click", async () => {
      const missing = [];
      for (const dim of DIMENSIONS) {
        for (const item of dim.items) {
          if (!answers[item.key]) missing.push(item.key);
        }
      }
      scroll.querySelectorAll(".likert-item").forEach((n) => {
        n.classList.toggle("missing", missing.includes(n.dataset.qkey));
      });
      if (missing.length) {
        validation.textContent =
          "Please answer all questions — " + missing.length + " remaining.";
        const first = scroll.querySelector(".likert-item.missing");
        if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      validation.textContent = "";

      nav.nextBtn.disabled = true;
      nav.status.className = "status";
      nav.status.textContent = "Saving…";
      try {
        await syncLesson(lesson);
        await syncPending();
      } catch (err) {
        // Answers are kept locally; syncing retries on later steps.
        console.error(err);
      }
      nav.nextBtn.disabled = false;
      goTo(state.pos + 1);
    });

    pane.appendChild(scroll);
    pane.appendChild(nav.footer);
    layout.appendChild(pane);
    appEl.appendChild(layout);
  }

  // --- Step 3 of a set: comparison + feedback -------------------------------
  function renderComparisonStep(info) {
    const lessons = lessonsFor(state.rater, info.pid);
    if (!state.comparisons[info.pid]) state.comparisons[info.pid] = {};
    const answers = state.comparisons[info.pid];
    const isLastSet = info.setIndex === info.setCount - 1;
    const setText = "set " + (info.setIndex + 1) + " of " + info.setCount;

    const layout = el("div", "eval-layout");
    layout.appendChild(makeLessonPane(lessons, activeCompareTab, true, setText));

    const pane = el("div", "question-pane");
    const scroll = el("div", "question-scroll");

    scroll.appendChild(el("h2", null, "Compare the Lessons"));
    scroll.appendChild(el("p", "pane-sub",
      lessons[0].topic + " — set " + (info.setIndex + 1) + " of " + info.setCount + ". " +
      "Use the tabs on the left to revisit each lesson, then choose the lesson " +
      "you found best on each dimension."));

    const validation = el("p", "validation-summary", "");
    scroll.appendChild(validation);

    const block = el("div", "dimension-block");
    block.appendChild(el("h3", null, "Comparison"));

    for (const q of COMPARISON_QUESTIONS) {
      const itemEl = el("div", "choice-item");
      itemEl.dataset.qkey = q.key;
      itemEl.appendChild(el("p", "q-text", q.text));
      const options = el("div", "choice-options");
      for (const lesson of lessons) {
        const optWrap = el("label", "choice-option");
        const input = document.createElement("input");
        input.type = "radio";
        input.name = info.pid + ":" + q.key;
        input.value = lesson.condition;
        if (answers[q.key] === lesson.condition) input.checked = true;
        input.addEventListener("change", () => {
          answers[q.key] = lesson.condition;
          state.synced[comparisonSyncKey(info.pid)] = false;
          itemEl.classList.remove("missing");
          saveState();
        });
        optWrap.appendChild(input);
        optWrap.appendChild(el("span", null, "Lesson " + lesson.label));
        options.appendChild(optWrap);
      }
      itemEl.appendChild(options);
      block.appendChild(itemEl);
    }
    scroll.appendChild(block);

    const fbBlock = el("div", "dimension-block");
    fbBlock.appendChild(el("h3", null, "Feedback"));
    for (const q of COMPARISON_TEXT_QUESTIONS) {
      const itemEl = el("div", "choice-item");
      itemEl.dataset.qkey = q.key;
      itemEl.appendChild(el("p", "q-text", q.text));
      const ta = el("textarea", "feedback-input");
      ta.value = answers[q.key] || "";
      ta.addEventListener("input", () => {
        answers[q.key] = ta.value;
        state.synced[comparisonSyncKey(info.pid)] = false;
        if (ta.value.trim()) itemEl.classList.remove("missing");
        saveState();
      });
      itemEl.appendChild(ta);
      fbBlock.appendChild(itemEl);
    }
    scroll.appendChild(fbBlock);

    const nav = makeFooter(false);
    nav.nextBtn.textContent = isLastSet ? "Submit" : "Next set →";

    nav.backBtn.addEventListener("click", () => goTo(state.pos - 1));

    nav.nextBtn.addEventListener("click", async () => {
      const missing = [];
      for (const q of COMPARISON_QUESTIONS) {
        if (!answers[q.key]) missing.push(q.key);
      }
      for (const q of COMPARISON_TEXT_QUESTIONS) {
        if (!answers[q.key] || !answers[q.key].trim()) missing.push(q.key);
      }
      scroll.querySelectorAll(".choice-item").forEach((n) => {
        n.classList.toggle("missing", missing.includes(n.dataset.qkey));
      });
      if (missing.length) {
        validation.textContent =
          "Please answer all questions — " + missing.length + " remaining.";
        const first = scroll.querySelector(".choice-item.missing");
        if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      validation.textContent = "";

      nav.nextBtn.disabled = true;
      nav.backBtn.disabled = true;
      nav.status.className = "status";
      nav.status.textContent = isLastSet ? "Submitting…" : "Saving…";
      try {
        await syncComparison(info.pid);
        await syncPending();
        goTo(state.pos + 1);
      } catch (err) {
        console.error(err);
        if (isLastSet) {
          // The final submit must actually reach the server.
          nav.status.className = "status error";
          nav.status.textContent =
            "Submission failed — please check your connection and press Submit again. Your answers are saved locally.";
          nav.nextBtn.disabled = false;
          nav.backBtn.disabled = false;
        } else {
          goTo(state.pos + 1); // retried on later steps
        }
      }
    });

    pane.appendChild(scroll);
    pane.appendChild(nav.footer);
    layout.appendChild(pane);
    appEl.appendChild(layout);
  }

  // --- Done ------------------------------------------------------------------
  function renderDone() {
    const wrap = el("div", "center-step");
    const card = el("div", "intro-card");
    card.appendChild(el("div", "done-icon", "✅"));
    card.appendChild(el("h1", null, "Thank you!"));
    card.appendChild(el("p", null,
      "Your evaluation of all " + assignedPids().length +
      " lesson sets has been submitted successfully. You can now close this page."));
    const back = el("p");
    const reviewBtn = el("button", "btn", "Review my answers");
    reviewBtn.addEventListener("click", () => goTo(totalSteps() - 1));
    back.appendChild(reviewBtn);
    card.appendChild(back);
    wrap.appendChild(card);
    appEl.appendChild(wrap);
  }

  render();
})();
