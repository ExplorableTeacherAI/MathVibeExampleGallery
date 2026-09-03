// ============================================================================
// MathVibe Evaluation Dashboard
//
// Read-only view of the teacher evaluation data saved by evaluation.html:
//   lesson_evaluations  — 16 Likert answers per (rater, participant, condition)
//   lesson_comparisons  — per-dimension comparison picks + free-text feedback
//                         per (rater, participant)
//
// Rater assignments live in the rater_assignments table and are managed from
// the "Raters & assignments" panel here: add a rater ID, tick the lesson sets
// they will evaluate, save. Each lesson set should be covered by
// RATINGS_PER_LESSON raters — the coverage table flags gaps.
//
// Static page: fetches straight from Supabase with the public anon key.
// The access key below only deters casual visitors (e.g. raters finding the
// URL); it is not real security — the data is readable via the anon key.
// ============================================================================

(function () {
  "use strict";

  const SUPABASE_URL = "https://oxjrjdtrijhksqeohyka.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94anJqZHRyaWpoa3NxZW9oeWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyMzMwNDEsImV4cCI6MjA3NzgwOTA0MX0.N8K06cV93EeU5hAPqQ3VjnbqJBKaisUdGuvVdN3N81M";

  const ACCESS_KEY = "mathvibe2026";
  const GATE_STORAGE = "mathvibe-dash-key";

  // Condition metadata — color follows the entity, fixed order.
  const CONDITION_META = {
    "full": { label: "Full", color: "var(--c-full)" },
    "no-design": { label: "No Design", color: "var(--c-no-design)" },
    "no-edits": { label: "No Edits", color: "var(--c-no-edits)" },
  };
  const CONDITION_KEYS = ["full", "no-design", "no-edits"];

  const DIMENSIONS = [
    { key: "pedagogical_quality", label: "Pedagogical Quality", items: ["q13", "q14", "q15", "q16"] },
    { key: "mathematical_correctness", label: "Mathematical Correctness", items: ["q17", "q18", "q19", "q20"] },
    { key: "visual_quality", label: "Visual Quality", items: ["q21", "q22", "q23", "q24"] },
    { key: "interaction_quality", label: "Interaction Quality", items: ["q25", "q26", "q27", "q28"] },
  ];

  const ITEM_TEXT = {
    q13: "The lesson is appropriate for the intended grade level.",
    q14: "The lesson introduces concepts in a logical sequence.",
    q15: "The relationship between the interactions and the mathematical ideas is clearly explained.",
    q16: "The lesson clearly introduces the mathematical concept.",
    q17: "The mathematical concepts are presented accurately.",
    q18: "The formulas and equations are correct.",
    q19: "The visualizations accurately represent the underlying mathematics.",
    q20: "The lesson remains mathematically correct across all interaction states.",
    q21: "The lesson used appropriate visualizations (e.g., graphs, diagrams or simulations).",
    q22: "The visual design effectively highlights important mathematical concepts and relationships.",
    q23: "The visual representation is clear and easy to understand.",
    q24: "The lesson’s visualizations are accurate and free of errors.",
    q25: "The interactive controls are relevant to the concept being taught.",
    q26: "Manipulating the controls helps reveal important mathematical relationships.",
    q27: "The interactions help connect abstract mathematical ideas with their visual representations.",
    q28: "Changes in the visualization are easy to interpret.",
  };
  const ALL_ITEMS = Object.keys(ITEM_TEXT);

  const COMPARISON_QUESTIONS = [
    { key: "best_pedagogical_quality", label: "Best Pedagogical Quality", text: "Which lesson has the best Pedagogical Quality?" },
    { key: "best_mathematical_correctness", label: "Best Mathematical Correctness", text: "Which lesson has the best Mathematical Correctness?" },
    { key: "best_visual_quality", label: "Best Visual Quality", text: "Which lesson has the best Visual Quality?" },
    { key: "best_interaction_quality", label: "Best Interaction Quality", text: "Which lesson has the best Interaction Quality?" },
    { key: "preferred_overall", label: "Overall preference", text: "Overall, which lesson would you prefer to use with your students?" },
  ];

  const ASSIGNMENTS_TABLE = "rater_assignments";
  const RATINGS_PER_LESSON = 2; // ratings each lesson should receive

  const appEl = document.getElementById("app");
  let ratings = [];      // rows from lesson_evaluations
  let comparisons = [];  // rows from lesson_comparisons
  let assignments = [];  // rows from rater_assignments
  const assignDrafts = {}; // rater_id → { pids: Set, dirty: bool } (edit state)

  function raterIds() { return assignments.map((a) => a.rater_id); }

  function raterPids(rater) {
    const row = assignments.find((a) => a.rater_id === rater);
    return row && Array.isArray(row.participants)
      ? row.participants.map(Number)
          .filter((n) => Number.isInteger(n) && n >= 1 && n <= PARTICIPANT_COUNT)
      : [];
  }

  function raterHasData(rater) {
    return ratings.some((r) => r.rater_id === rater) ||
      comparisons.some((c) => c.rater_id === rater);
  }

  // The rater's own study-participant number, if they were a creator.
  // Stored in own_participant; a rater ID of the form "C5" implies it too.
  function inferOwnFromId(raterId) {
    const m = /^C(\d+)$/i.exec(String(raterId).trim());
    const n = m ? parseInt(m[1], 10) : NaN;
    return Number.isInteger(n) && n >= 1 && n <= PARTICIPANT_COUNT ? n : null;
  }

  function raterOwn(rater) {
    const row = assignments.find((a) => a.rater_id === rater);
    const own = row && Number(row.own_participant);
    if (Number.isInteger(own) && own >= 1 && own <= PARTICIPANT_COUNT) return own;
    return inferOwnFromId(rater);
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  // How many more raters each lesson set still needs.
  function slotsRemaining() {
    let remaining = 0;
    for (let n = 1; n <= PARTICIPANT_COUNT; n++) {
      remaining += Math.max(0, RATINGS_PER_LESSON - assignedRaterCount(n));
    }
    return remaining;
  }

  // Evenly re-distribute the lesson sets among all raters who have not
  // started yet (started raters keep their lists — their sessions are frozen
  // anyway). Every lesson ends up with RATINGS_PER_LESSON raters wherever
  // possible, never a rater's own set, and set counts differ by at most one
  // (3 raters → 12 each, 4 → 9 each, 5 → 8/7/7/7/7, …). Within a workload
  // level the picks are random, as is each rater's presentation order.
  // Mutates the local assignment rows; returns the rows that changed.
  function rebalancePlan() {
    const fixed = assignments.filter((a) => raterHasData(a.rater_id));
    const free = assignments.filter((a) => !raterHasData(a.rater_id));
    if (!free.length) return [];

    const need = {};
    for (let n = 1; n <= PARTICIPANT_COUNT; n++) {
      const c = fixed.filter((f) => raterPids(f.rater_id).indexOf(n) !== -1).length;
      need[n] = Math.max(0, RATINGS_PER_LESSON - c);
    }
    const totalNeed = Object.values(need).reduce((a, b) => a + b, 0);

    const base = Math.floor(totalNeed / free.length);
    const extra = totalNeed % free.length;
    const target = {};
    shuffle(free.slice()).forEach((row, i) => {
      target[row.rater_id] = base + (i < extra ? 1 : 0);
    });
    const load = {};
    const picks = {};
    for (const row of free) { load[row.rater_id] = 0; picks[row.rater_id] = []; }

    // Hand out the most-constrained sets first: those still needing both
    // raters, and those that are someone's own (fewer people may take them).
    const ownSets = new Set(free.map((row) => raterOwn(row.rater_id)).filter(Boolean));
    const sets = shuffle(Array.from({ length: PARTICIPANT_COUNT }, (_, i) => i + 1)
      .filter((n) => need[n] > 0));
    sets.sort((a, b) =>
      (need[b] - need[a]) || ((ownSets.has(b) ? 1 : 0) - (ownSets.has(a) ? 1 : 0)));

    for (const n of sets) {
      for (let c = 0; c < need[n]; c++) {
        const eligible = shuffle(free.filter((row) =>
          raterOwn(row.rater_id) !== n && picks[row.rater_id].indexOf(n) === -1));
        if (!eligible.length) continue; // left under-covered; coverage table flags it
        eligible.sort((a, b) =>
          (target[b.rater_id] - load[b.rater_id]) - (target[a.rater_id] - load[a.rater_id]));
        picks[eligible[0].rater_id].push(n);
        load[eligible[0].rater_id]++;
      }
    }

    const changed = [];
    for (const row of free) {
      const oldKey = raterPids(row.rater_id).slice().sort((a, b) => a - b).join(",");
      const newPids = shuffle(picks[row.rater_id]);
      const newKey = newPids.slice().sort((a, b) => a - b).join(",");
      row.participants = newPids;
      if (newKey !== oldKey) {
        changed.push(row);
        delete assignDrafts[row.rater_id];
      }
    }
    return changed;
  }

  function assignmentPayload(rows) {
    const now = new Date().toISOString();
    return rows.map((row) => ({
      rater_id: row.rater_id,
      participants: row.participants,
      own_participant: row.own_participant || null,
      updated_at: now,
    }));
  }

  // --- Helpers ---------------------------------------------------------------
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function mean(values) {
    if (!values.length) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  function fmt(value, digits) {
    return value == null ? "—" : value.toFixed(digits == null ? 2 : digits);
  }

  // Mean of the given items over a set of rating rows.
  function itemsMean(rows, items) {
    const values = [];
    for (const row of rows) {
      for (const item of items) {
        const v = row.answers && row.answers[item];
        if (typeof v === "number") values.push(v);
      }
    }
    return mean(values);
  }

  function assignedRaterCount(pid) {
    return raterIds().filter((r) => raterPids(r).indexOf(pid) !== -1).length;
  }

  // --- Data ------------------------------------------------------------------
  async function sbSelect(table) {
    const res = await fetch(SUPABASE_URL + "/rest/v1/" + table + "?select=*", {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY },
    });
    if (!res.ok) throw new Error(table + " " + res.status + ": " + (await res.text()));
    return res.json();
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
    if (!res.ok) throw new Error("Save failed (" + res.status + "): " + (await res.text()));
  }

  async function sbDelete(table, filterQuery) {
    const res = await fetch(SUPABASE_URL + "/rest/v1/" + table + "?" + filterQuery, {
      method: "DELETE",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY },
    });
    if (!res.ok) throw new Error("Delete failed (" + res.status + "): " + (await res.text()));
  }

  async function loadData() {
    [ratings, comparisons, assignments] = await Promise.all([
      sbSelect("lesson_evaluations"),
      sbSelect("lesson_comparisons"),
      sbSelect(ASSIGNMENTS_TABLE),
    ]);
    const key = (r) => r.rater_id + ":" + r.participant_id;
    ratings.sort((a, b) => key(a).localeCompare(key(b), undefined, { numeric: true }));
    comparisons.sort((a, b) => key(a).localeCompare(key(b), undefined, { numeric: true }));
    assignments.sort((a, b) =>
      String(a.rater_id).localeCompare(String(b.rater_id), undefined, { numeric: true }));
  }

  // --- Tooltip ---------------------------------------------------------------
  const tooltip = el("div", "dash-tooltip");
  document.body.appendChild(tooltip);

  function attachTooltip(node, textFn) {
    node.addEventListener("mousemove", (e) => {
      tooltip.textContent = textFn();
      tooltip.style.display = "block";
      tooltip.style.left = e.clientX + "px";
      tooltip.style.top = e.clientY + "px";
    });
    node.addEventListener("mouseleave", () => { tooltip.style.display = "none"; });
  }

  // --- Access gate -----------------------------------------------------------
  function renderGate() {
    appEl.innerHTML = "";
    const wrap = el("div", "gate-wrap");
    const card = el("div", "gate-card");
    card.appendChild(el("h1", null, "Evaluation Dashboard"));
    card.appendChild(el("p", null, "Enter the access key to view the results."));
    const input = el("input");
    input.type = "password";
    input.placeholder = "Access key";
    card.appendChild(input);
    const error = el("p", "gate-error", "");
    card.appendChild(error);
    const btn = el("button", "dash-btn", "View dashboard");
    card.appendChild(btn);

    function tryEnter() {
      if (input.value.trim() === ACCESS_KEY) {
        try { sessionStorage.setItem(GATE_STORAGE, ACCESS_KEY); } catch (e) {}
        init();
      } else {
        error.textContent = "Incorrect access key.";
      }
    }
    btn.addEventListener("click", tryEnter);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") tryEnter(); });

    wrap.appendChild(card);
    appEl.appendChild(wrap);
    input.focus();
  }

  // --- Sections --------------------------------------------------------------
  function makeLegend() {
    const legend = el("div", "legend");
    for (const key of CONDITION_KEYS) {
      const item = el("div", "legend-item");
      const swatch = el("span", "legend-swatch");
      swatch.style.background = CONDITION_META[key].color;
      item.appendChild(swatch);
      item.appendChild(el("span", null, CONDITION_META[key].label));
      legend.appendChild(item);
    }
    return legend;
  }

  function condDot(cond) {
    const dot = el("span", "cond-dot");
    dot.style.background = CONDITION_META[cond].color;
    return dot;
  }

  function renderTiles(container) {
    const tiles = el("div", "tiles");

    const ids = raterIds();
    const expectedRatings = ids.reduce((sum, r) => sum + raterPids(r).length * 3, 0);
    const expectedComparisons = ids.reduce((sum, r) => sum + raterPids(r).length, 0);

    const ratersDone = ids.filter((r) => {
      const pids = raterPids(r);
      return pids.length && pids.every((pid) =>
        comparisons.some((c) => c.rater_id === r && c.participant_id === "C" + pid));
    });

    // Lesson instances (participant × condition) with enough ratings.
    const totalInstances = PARTICIPANT_COUNT * CONDITION_KEYS.length;
    let covered = 0;
    for (let n = 1; n <= PARTICIPANT_COUNT; n++) {
      for (const cond of CONDITION_KEYS) {
        const count = ratings.filter((r) =>
          r.participant_id === "C" + n && r.condition === cond).length;
        if (count >= RATINGS_PER_LESSON) covered++;
      }
    }

    function tile(label, value, sub) {
      const t = el("div", "tile");
      t.appendChild(el("div", "tile-label", label));
      t.appendChild(el("div", "tile-value", value));
      if (sub) t.appendChild(el("div", "tile-sub", sub));
      return t;
    }

    tiles.appendChild(tile("Raters completed", ratersDone.length + " / " + ids.length,
      ratersDone.length ? ratersDone.join(", ") : "Finished all assigned sets"));
    tiles.appendChild(tile("Lesson ratings", ratings.length + " / " + expectedRatings,
      "Comparisons: " + comparisons.length + " / " + expectedComparisons));
    tiles.appendChild(tile("Lessons fully covered", covered + " / " + totalInstances,
      RATINGS_PER_LESSON + " ratings per lesson"));
    tiles.appendChild(tile("Mean rating (all lessons)", fmt(itemsMean(ratings, ALL_ITEMS)),
      "Across all 16 items, scale 1–5"));

    const latest = ratings.concat(comparisons)
      .map((r) => r.updated_at || r.created_at)
      .filter(Boolean).sort().pop();
    tiles.appendChild(tile("Last response", latest ? new Date(latest).toLocaleString() : "—", ""));

    container.appendChild(tiles);
  }

  // Grouped horizontal bars: mean per condition within each dimension.
  function renderMeansChart(container) {
    const panel = el("div", "panel");
    panel.appendChild(el("h2", null, "Mean ratings by condition"));
    panel.appendChild(el("p", "panel-sub", "Mean of the 4 items in each dimension, across all raters, scale 1–5. Hover a bar for details."));
    panel.appendChild(makeLegend());

    if (!ratings.length) {
      panel.appendChild(el("p", "stack-empty", "No ratings yet."));
      container.appendChild(panel);
      return;
    }

    const chart = el("div", "bar-chart");
    const groups = DIMENSIONS.concat([{ key: "overall", label: "Overall (all 16 items)", items: ALL_ITEMS }]);

    for (const dim of groups) {
      const group = el("div", "bar-group");
      group.appendChild(el("div", "bar-group-label", dim.label));

      for (const cond of CONDITION_KEYS) {
        const rows = ratings.filter((r) => r.condition === cond);
        const value = itemsMean(rows, dim.items);

        const row = el("div", "bar-row");
        row.appendChild(el("div", "bar-name", CONDITION_META[cond].label));

        const track = el("div", "bar-track");
        const fill = el("div", "bar-fill");
        fill.style.background = CONDITION_META[cond].color;
        fill.style.width = value == null ? "0%" : (value / 5) * 100 + "%";
        fill.appendChild(el("span", "bar-value", fmt(value)));
        attachTooltip(track, () =>
          CONDITION_META[cond].label + " — " + dim.label + ": " + fmt(value) +
          " (n=" + rows.length + " ratings)");
        track.appendChild(fill);
        row.appendChild(track);
        group.appendChild(row);
      }
      chart.appendChild(group);
    }
    panel.appendChild(chart);

    const axis = el("div", "axis-row");
    axis.appendChild(el("div"));
    const ticks = el("div", "axis-ticks");
    for (let i = 0; i <= 5; i++) ticks.appendChild(el("span", null, String(i)));
    axis.appendChild(ticks);
    panel.appendChild(axis);

    container.appendChild(panel);
  }

  // Comparison results: one row per question, pick counts per condition.
  function renderComparisonChart(container) {
    const panel = el("div", "panel");
    panel.appendChild(el("h2", null, "Comparison results"));
    panel.appendChild(el("p", "panel-sub",
      "How many times each condition was picked as best (one pick per rater per lesson set)."));

    const scrollWrap = el("div", "table-scroll");
    const table = el("table", "dash-table");
    const thead = el("thead");
    const headRow = el("tr");
    headRow.appendChild(el("th", "q-col", "Question"));
    for (const key of CONDITION_KEYS) {
      const th = el("th", "num");
      th.appendChild(condDot(key));
      th.appendChild(document.createTextNode(CONDITION_META[key].label));
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = el("tbody");
    for (const q of COMPARISON_QUESTIONS) {
      const counts = {};
      let total = 0;
      for (const key of CONDITION_KEYS) counts[key] = 0;
      for (const row of comparisons) {
        const pick = row.answers && row.answers[q.key];
        if (counts[pick] != null) { counts[pick]++; total++; }
      }

      const tr = el("tr");
      tr.appendChild(el("td", "q-col", q.text));
      const best = Math.max.apply(null, CONDITION_KEYS.map((key) => counts[key]));
      for (const key of CONDITION_KEYS) {
        const td = el("td", "num", total ? String(counts[key]) : "—");
        if (total && counts[key] === best && best > 0) td.classList.add("top-pick");
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    scrollWrap.appendChild(table);
    panel.appendChild(scrollWrap);
    container.appendChild(panel);
  }

  // Per-submission comparison answers: one row per rater × lesson set.
  function renderComparisonTable(container) {
    const panel = el("div", "panel");
    panel.appendChild(el("h2", null, "Comparison answers"));
    panel.appendChild(el("p", "panel-sub",
      "Each rater's pick per comparison question, for every lesson set they compared."));

    if (!comparisons.length) {
      panel.appendChild(el("p", "stack-empty", "No comparison submissions yet."));
      container.appendChild(panel);
      return;
    }

    const scrollWrap = el("div", "table-scroll");
    const table = el("table", "dash-table");
    const thead = el("thead");
    const headRow = el("tr");
    headRow.appendChild(el("th", null, "Rater"));
    headRow.appendChild(el("th", null, "Lesson set"));
    for (const q of COMPARISON_QUESTIONS) {
      headRow.appendChild(el("th", null, q.label.replace(/^Best /, "")));
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    function pickCell(pick) {
      const td = el("td");
      if (pick && CONDITION_META[pick]) {
        td.appendChild(condDot(pick));
        td.appendChild(document.createTextNode(CONDITION_META[pick].label));
      } else {
        td.textContent = "—";
      }
      return td;
    }

    const tbody = el("tbody");
    for (const row of comparisons) {
      const tr = el("tr");
      tr.appendChild(el("td", null, row.rater_id));
      const pidNum = parseInt(String(row.participant_id).replace(/\D/g, ""), 10);
      tr.appendChild(el("td", "muted",
        row.participant_id + (TOPICS[pidNum] ? " — " + TOPICS[pidNum] : "")));
      for (const q of COMPARISON_QUESTIONS) {
        tr.appendChild(pickCell(row.answers && row.answers[q.key]));
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    scrollWrap.appendChild(table);
    panel.appendChild(scrollWrap);
    container.appendChild(panel);
  }

  // --- Raters & assignments management ---------------------------------------
  function renderAssignmentsPanel(container) {
    const panel = el("div", "panel");
    panel.appendChild(el("h2", null, "Raters & assignments"));
    const remaining = slotsRemaining();
    panel.appendChild(el("p", "panel-sub",
      "Add raters by ID — the " + PARTICIPANT_COUNT + " lesson sets are automatically split evenly " +
      "across all raters, with every set going to " + RATINGS_PER_LESSON + " raters " +
      "(3 raters → 12 sets each, 4 → 9, and so on). Adding or removing a rater re-distributes the " +
      "sets of raters who have not started; started raters keep their lists. Use a study participant " +
      "ID as the rater ID (e.g. C5) and their own lessons are excluded automatically. " +
      (remaining ? remaining + " set-slot" + (remaining === 1 ? "" : "s") + " still need a rater. " :
        "All lessons currently have " + RATINGS_PER_LESSON + " raters. ") +
      "Give each teacher their rater ID together with the evaluation.html link."));

    // Add-rater row: just the ID; everything else is derived.
    const addRow = el("div", "assign-add");
    const addInput = el("input", "assign-input");
    addInput.type = "text";
    addInput.placeholder = "New rater ID (e.g. C5 or R1)";
    addRow.appendChild(addInput);

    const addBtn = el("button", "dash-btn", "+ Add rater");
    const addError = el("span", "gate-error", "");
    addRow.appendChild(addBtn);
    addRow.appendChild(addError);
    panel.appendChild(addRow);

    async function addRater() {
      const id = addInput.value.trim().toUpperCase().replace(/\s+/g, "");
      if (!/^[A-Z0-9_-]{1,20}$/.test(id)) {
        addError.textContent = "Use letters, digits, - or _ (max 20 chars).";
        return;
      }
      if (raterIds().some((r) => r.toUpperCase() === id)) {
        addError.textContent = "That rater ID already exists.";
        return;
      }
      addBtn.disabled = true;
      addError.textContent = "";
      const ownPid = inferOwnFromId(id);
      const newRow = { rater_id: id, participants: [], own_participant: ownPid };
      assignments.push(newRow);
      const changed = rebalancePlan();
      if (changed.indexOf(newRow) === -1) changed.push(newRow);
      try {
        await sbUpsert(ASSIGNMENTS_TABLE, assignmentPayload(changed), "rater_id");
        const freeRows = assignments.filter((a) => !raterHasData(a.rater_id));
        window.alert(
          (ownPid ? id + " created participant C" + ownPid + "'s lessons — those are excluded for them.\n" : "") +
          "Sets per rater after re-distribution: " +
          freeRows.map((r) => r.rater_id + ": " + r.participants.length).join(", ") + ".");
        renderDashboard();
      } catch (err) {
        // The rebalance already adjusted rows locally before the failed
        // save — reload from the server so the view stays consistent.
        console.error(err);
        window.alert("Could not save: " + err.message);
        init();
      }
    }
    addBtn.addEventListener("click", addRater);
    addInput.addEventListener("keydown", (e) => { if (e.key === "Enter") addRater(); });

    if (!assignments.length) {
      panel.appendChild(el("p", "stack-empty", "No raters yet — add the first one above."));
      container.appendChild(panel);
      return;
    }

    for (const row of assignments) {
      const rater = row.rater_id;
      if (!assignDrafts[rater]) {
        assignDrafts[rater] = { pids: new Set(raterPids(rater)), dirty: false };
      }
      const draft = assignDrafts[rater];

      const own = raterOwn(rater);

      const block = el("div", "rater-block");
      const head = el("div", "rater-head");
      head.appendChild(el("span", "rater-name", rater));

      const countEl = el("span", "rater-count", "");
      head.appendChild(countEl);

      if (own) head.appendChild(el("span", "rater-count", "was C" + own));
      if (raterHasData(rater)) {
        head.appendChild(el("span", "status-pill partial", "started"));
      }

      const spacer = el("span", "rater-spacer");
      head.appendChild(spacer);

      const statusEl = el("span", "rater-status", "");
      head.appendChild(statusEl);

      const saveBtn = el("button", "dash-btn", "Save");
      head.appendChild(saveBtn);

      if (raterHasData(rater)) {
        const clearBtn = el("button", "dash-btn danger", "Clear data");
        clearBtn.addEventListener("click", async () => {
          const nRatings = ratings.filter((r) => r.rater_id === rater).length;
          const nComparisons = comparisons.filter((c) => c.rater_id === rater).length;
          if (!window.confirm("Delete " + rater + "'s responses (" + nRatings +
            " ratings, " + nComparisons + " comparisons)? Their assignment is kept, " +
            "but they become reshuffleable again. This cannot be undone.")) return;
          clearBtn.disabled = true;
          try {
            const filter = "rater_id=eq." + encodeURIComponent(rater);
            await sbDelete("lesson_evaluations", filter);
            await sbDelete("lesson_comparisons", filter);
            init();
          } catch (err) {
            console.error(err);
            window.alert("Clear failed: " + err.message);
            init();
          }
        });
        head.appendChild(clearBtn);
      }

      const removeBtn = el("button", "dash-btn danger", "Remove");
      head.appendChild(removeBtn);
      block.appendChild(head);

      function refreshHead() {
        const n = draft.pids.size;
        countEl.textContent = n + " set" + (n === 1 ? "" : "s") + " · " + n * 3 + " lessons";
        saveBtn.disabled = !draft.dirty;
        statusEl.textContent = draft.dirty ? "Unsaved changes" : "";
      }

      const grid = el("div", "assign-grid");
      for (let n = 1; n <= PARTICIPANT_COUNT; n++) {
        const chip = el("label", "assign-chip");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = draft.pids.has(n);
        if (n === own) {
          // Never let a rater be assigned their own lessons.
          cb.checked = false;
          draft.pids.delete(n);
          cb.disabled = true;
          chip.classList.add("own");
          chip.title = "This rater's own lessons — cannot be assigned to them.";
        }
        cb.addEventListener("change", () => {
          if (cb.checked) draft.pids.add(n); else draft.pids.delete(n);
          draft.dirty = true;
          refreshHead();
        });
        chip.appendChild(cb);
        const span = el("span");
        span.appendChild(el("b", null, "C" + n));
        span.appendChild(document.createTextNode(" " + (TOPICS[n] || "") + (n === own ? " (own)" : "")));
        chip.appendChild(span);
        grid.appendChild(chip);
      }
      block.appendChild(grid);

      saveBtn.addEventListener("click", async () => {
        saveBtn.disabled = true;
        statusEl.textContent = "Saving…";
        const pids = Array.from(draft.pids).sort((a, b) => a - b);
        try {
          await sbUpsert(ASSIGNMENTS_TABLE,
            [{ rater_id: rater, participants: pids, updated_at: new Date().toISOString() }],
            "rater_id");
          row.participants = pids;
          draft.dirty = false;
          renderDashboard(); // refresh coverage / tiles with the new assignment
        } catch (err) {
          console.error(err);
          statusEl.textContent = "Save failed: " + err.message;
          saveBtn.disabled = false;
        }
      });

      removeBtn.addEventListener("click", async () => {
        const warning = raterHasData(rater)
          ? "Rater " + rater + " already has submitted data (which will be kept). Remove their assignment anyway?"
          : "Remove rater " + rater + "? Their sets will be re-distributed among the remaining raters.";
        if (!window.confirm(warning)) return;
        removeBtn.disabled = true;
        try {
          await sbDelete(ASSIGNMENTS_TABLE, "rater_id=eq." + encodeURIComponent(rater));
          assignments = assignments.filter((a) => a.rater_id !== rater);
          delete assignDrafts[rater];
          const changed = rebalancePlan();
          if (changed.length) {
            await sbUpsert(ASSIGNMENTS_TABLE, assignmentPayload(changed), "rater_id");
          }
          renderDashboard();
        } catch (err) {
          console.error(err);
          window.alert("Remove/re-distribute failed: " + err.message);
          init();
        }
      });

      refreshHead();
      panel.appendChild(block);
    }

    container.appendChild(panel);
  }

  // Per-rater progress.
  function renderRaterTable(container) {
    const panel = el("div", "panel");
    panel.appendChild(el("h2", null, "Rater progress"));
    panel.appendChild(el("p", "panel-sub", "How far each rater has got through their assigned sets."));

    if (!assignments.length) {
      panel.appendChild(el("p", "stack-empty", "No raters yet — add them in the Raters & assignments panel above."));
      container.appendChild(panel);
      return;
    }

    const scrollWrap = el("div", "table-scroll");
    const table = el("table", "dash-table");
    const thead = el("thead");
    const headRow = el("tr");
    ["Rater", "Assigned sets", "Lessons rated", "Comparisons", "Status"].forEach((h, i) => {
      headRow.appendChild(el("th", i >= 2 && i <= 3 ? "num" : null, h));
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = el("tbody");
    for (const rater of raterIds()) {
      const pids = raterPids(rater);
      const rRatings = ratings.filter((r) => r.rater_id === rater).length;
      const rComparisons = comparisons.filter((c) => c.rater_id === rater).length;

      const tr = el("tr");
      tr.appendChild(el("td", null, rater));
      tr.appendChild(el("td", "muted", pids.map((p) => "C" + p).join(", ")));
      tr.appendChild(el("td", "num", rRatings + " / " + pids.length * 3));
      tr.appendChild(el("td", "num", rComparisons + " / " + pids.length));

      const statusTd = el("td");
      let cls = "none", text = "Not started";
      if (!pids.length) {
        text = "No sets assigned";
      } else if (rComparisons >= pids.length && rRatings >= pids.length * 3) {
        cls = "done"; text = "Completed";
      } else if (rRatings || rComparisons) {
        cls = "partial"; text = "In progress";
      }
      statusTd.appendChild(el("span", "status-pill " + cls, text));
      tr.appendChild(statusTd);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    scrollWrap.appendChild(table);
    panel.appendChild(scrollWrap);
    container.appendChild(panel);
  }

  // Coverage: ratings received per lesson (participant × condition).
  function renderCoverageTable(container) {
    const panel = el("div", "panel");
    panel.appendChild(el("h2", null, "Lesson coverage"));
    panel.appendChild(el("p", "panel-sub",
      "Ratings received per lesson (target: " + RATINGS_PER_LESSON +
      " each). “Assigned” is how many raters have this set in the Raters & assignments panel — anything other than " +
      RATINGS_PER_LESSON + " is flagged."));

    const scrollWrap = el("div", "table-scroll");
    const table = el("table", "dash-table");
    const thead = el("thead");
    const headRow = el("tr");
    headRow.appendChild(el("th", null, "Participant"));
    headRow.appendChild(el("th", null, "Topic"));
    for (const key of CONDITION_KEYS) {
      const th = el("th", "num");
      th.appendChild(condDot(key));
      th.appendChild(document.createTextNode(CONDITION_META[key].label));
      headRow.appendChild(th);
    }
    headRow.appendChild(el("th", null, "Comparisons"));
    headRow.appendChild(el("th", null, "Assigned"));
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = el("tbody");
    for (let n = 1; n <= PARTICIPANT_COUNT; n++) {
      const pid = "C" + n;
      const tr = el("tr");
      tr.appendChild(el("td", null, pid));
      tr.appendChild(el("td", "muted", TOPICS[n] || ""));

      for (const cond of CONDITION_KEYS) {
        const count = ratings.filter((r) =>
          r.participant_id === pid && r.condition === cond).length;
        const td = el("td", "num");
        const cls = count >= RATINGS_PER_LESSON ? "done" : count > 0 ? "partial" : "none";
        td.appendChild(el("span", "status-pill " + cls, count + "/" + RATINGS_PER_LESSON));
        tr.appendChild(td);
      }

      const compCount = comparisons.filter((c) => c.participant_id === pid).length;
      const compTd = el("td");
      const compCls = compCount >= RATINGS_PER_LESSON ? "done" : compCount > 0 ? "partial" : "none";
      compTd.appendChild(el("span", "status-pill " + compCls, compCount + "/" + RATINGS_PER_LESSON));
      tr.appendChild(compTd);

      const assigned = assignedRaterCount(n);
      const assignedTd = el("td");
      const assignedCls = assigned === RATINGS_PER_LESSON ? "done" : "partial";
      assignedTd.appendChild(el("span", "status-pill " + assignedCls,
        assigned + " rater" + (assigned === 1 ? "" : "s")));
      tr.appendChild(assignedTd);

      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    scrollWrap.appendChild(table);
    panel.appendChild(scrollWrap);
    container.appendChild(panel);
  }

  // Per-item mean table (16 rows × 3 conditions).
  function renderItemTable(container) {
    const panel = el("div", "panel");
    panel.appendChild(el("h2", null, "Item-level means"));
    panel.appendChild(el("p", "panel-sub", "Mean rating per questionnaire item and condition (1–5), across all raters."));

    const scrollWrap = el("div", "table-scroll");
    const table = el("table", "dash-table");
    const thead = el("thead");
    const headRow = el("tr");
    headRow.appendChild(el("th", "q-col", "Statement"));
    for (const key of CONDITION_KEYS) {
      const th = el("th", "num");
      th.appendChild(condDot(key));
      th.appendChild(document.createTextNode(CONDITION_META[key].label));
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = el("tbody");
    for (const dim of DIMENSIONS) {
      for (const item of dim.items) {
        const tr = el("tr");
        tr.appendChild(el("td", "q-col", ITEM_TEXT[item]));
        for (const cond of CONDITION_KEYS) {
          const rows = ratings.filter((r) => r.condition === cond);
          tr.appendChild(el("td", "num", fmt(itemsMean(rows, [item]))));
        }
        tbody.appendChild(tr);
      }
    }
    table.appendChild(tbody);
    scrollWrap.appendChild(table);
    panel.appendChild(scrollWrap);
    container.appendChild(panel);
  }

  function renderFeedback(container) {
    const panel = el("div", "panel");
    panel.appendChild(el("h2", null, "Feedback"));
    panel.appendChild(el("p", "panel-sub", "Free-text answers from each comparison step."));

    if (!comparisons.length) {
      panel.appendChild(el("p", "stack-empty", "No feedback yet."));
      container.appendChild(panel);
      return;
    }

    const list = el("div", "feedback-list");
    for (const row of comparisons) {
      const card = el("div", "feedback-card");
      const head = el("div", "fb-head");
      head.appendChild(el("span", "fb-pid",
        row.rater_id + " on " + row.participant_id));
      const pick = row.answers && row.answers.preferred_overall;
      if (pick && CONDITION_META[pick]) {
        const pref = el("span", "fb-pref");
        pref.appendChild(condDot(pick));
        pref.appendChild(document.createTextNode("Preferred: " + CONDITION_META[pick].label));
        head.appendChild(pref);
      }
      card.appendChild(head);

      const reason = el("p");
      reason.appendChild(el("span", "fb-q", "Why the preferred lesson:"));
      reason.appendChild(document.createTextNode((row.answers && row.answers.preference_reason) || "—"));
      card.appendChild(reason);

      const fb = el("p");
      fb.appendChild(el("span", "fb-q", "Other feedback:"));
      fb.appendChild(document.createTextNode((row.answers && row.answers.general_feedback) || "—"));
      card.appendChild(fb);

      list.appendChild(card);
    }
    panel.appendChild(list);
    container.appendChild(panel);
  }

  // --- Reset / testing tools --------------------------------------------------
  function renderTestingPanel(container) {
    const panel = el("div", "panel");
    panel.appendChild(el("h2", null, "Reset / testing tools"));
    panel.appendChild(el("p", "panel-sub",
      "For test runs. Deleting responses cannot be undone — export the CSVs first if in doubt. " +
      "Browsers also keep a rater's local progress: to redo a test on the same device, open " +
      "evaluation.html?fresh=1 — entering a rater ID there starts over instead of resuming."));

    const row = el("div", "dash-actions");

    const clearRespBtn = el("button", "dash-btn danger", "Clear all responses");
    clearRespBtn.addEventListener("click", async () => {
      if (!window.confirm("Delete ALL responses — " + ratings.length + " lesson ratings and " +
        comparisons.length + " comparisons? Raters and their assignments are kept. This cannot be undone.")) return;
      clearRespBtn.disabled = true;
      try {
        await sbDelete("lesson_evaluations", "id=not.is.null");
        await sbDelete("lesson_comparisons", "id=not.is.null");
        init();
      } catch (err) {
        console.error(err);
        window.alert("Clear failed: " + err.message);
        init();
      }
    });
    row.appendChild(clearRespBtn);

    const clearAllBtn = el("button", "dash-btn danger", "Clear everything (responses + raters)");
    clearAllBtn.addEventListener("click", async () => {
      if (!window.confirm("Delete ALL responses AND all " + assignments.length +
        " raters with their assignments? This resets the study completely and cannot be undone.")) return;
      clearAllBtn.disabled = true;
      try {
        await sbDelete("lesson_evaluations", "id=not.is.null");
        await sbDelete("lesson_comparisons", "id=not.is.null");
        await sbDelete(ASSIGNMENTS_TABLE, "id=not.is.null");
        init();
      } catch (err) {
        console.error(err);
        window.alert("Clear failed: " + err.message);
        init();
      }
    });
    row.appendChild(clearAllBtn);

    panel.appendChild(row);
    container.appendChild(panel);
  }

  // --- CSV export ------------------------------------------------------------
  function csvEscape(value) {
    const s = value == null ? "" : String(value);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function downloadCsv(filename, rows) {
    const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportRatingsCsv() {
    const header = ["rater_id", "participant_id", "condition", "lesson_label", "lesson_url"]
      .concat(ALL_ITEMS).concat(["time_spent_s", "created_at", "updated_at"]);
    const rows = [header];
    for (const r of ratings) {
      rows.push([r.rater_id, r.participant_id, r.condition, r.lesson_label, r.lesson_url]
        .concat(ALL_ITEMS.map((item) => (r.answers && r.answers[item]) || ""))
        .concat([(r.answers && r.answers.time_spent_s) || "", r.created_at, r.updated_at]));
    }
    downloadCsv("lesson_evaluations.csv", rows);
  }

  function exportComparisonsCsv() {
    const qKeys = COMPARISON_QUESTIONS.map((q) => q.key)
      .concat(["preference_reason", "general_feedback"]);
    const header = ["rater_id", "participant_id", "order_A", "order_B", "order_C"]
      .concat(qKeys).concat(["created_at", "updated_at"]);
    const rows = [header];
    for (const c of comparisons) {
      const order = c.condition_order || {};
      rows.push([c.rater_id, c.participant_id, order.A || "", order.B || "", order.C || ""]
        .concat(qKeys.map((k) => (c.answers && c.answers[k]) || ""))
        .concat([c.created_at, c.updated_at]));
    }
    downloadCsv("lesson_comparisons.csv", rows);
  }

  // --- Page ------------------------------------------------------------------
  function renderDashboard() {
    appEl.innerHTML = "";

    const header = el("div", "dash-header");
    const titleWrap = el("div");
    titleWrap.appendChild(el("h1", null, "Evaluation Dashboard"));
    titleWrap.appendChild(el("p", "updated", "Fetched " + new Date().toLocaleString()));
    header.appendChild(titleWrap);

    const actions = el("div", "dash-actions");
    const refreshBtn = el("button", "dash-btn", "↻ Refresh");
    refreshBtn.addEventListener("click", init);
    const csv1 = el("button", "dash-btn", "Export ratings CSV");
    csv1.addEventListener("click", exportRatingsCsv);
    const csv2 = el("button", "dash-btn", "Export comparisons CSV");
    csv2.addEventListener("click", exportComparisonsCsv);
    actions.appendChild(refreshBtn);
    actions.appendChild(csv1);
    actions.appendChild(csv2);
    header.appendChild(actions);
    appEl.appendChild(header);

    renderTiles(appEl);
    renderAssignmentsPanel(appEl);
    renderMeansChart(appEl);
    renderComparisonChart(appEl);
    renderComparisonTable(appEl);
    renderRaterTable(appEl);
    renderCoverageTable(appEl);
    renderItemTable(appEl);
    renderFeedback(appEl);
    renderTestingPanel(appEl);
  }

  async function init() {
    appEl.innerHTML = '<div class="dash-loading">Loading data…</div>';
    try {
      await loadData();
      renderDashboard();
    } catch (err) {
      console.error(err);
      appEl.innerHTML = "";
      const errorEl = el("div", "dash-error");
      errorEl.appendChild(el("p", null, "Could not load data: " + err.message));
      errorEl.appendChild(el("p", null,
        "If the tables do not exist yet, run evaluation-schema.sql in the Supabase SQL editor."));
      const retry = el("button", "dash-btn", "Retry");
      retry.addEventListener("click", init);
      errorEl.appendChild(retry);
      appEl.appendChild(errorEl);
    }
  }

  let hasKey = false;
  try { hasKey = sessionStorage.getItem(GATE_STORAGE) === ACCESS_KEY; } catch (e) {}
  if (hasKey) init(); else renderGate();
})();
