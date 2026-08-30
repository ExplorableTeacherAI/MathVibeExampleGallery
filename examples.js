// ============================================================================
// MathVibe Example Gallery — data file
//
// This is the ONLY file you need to edit.
//
// The user-study entries (18 participants × 3 conditions) are generated from
// the URL pattern below:
//   https://c{n}-full.mathvibe.space/
//   https://c{n}-no-edits.mathvibe.space/
//   https://c{n}-no-design.mathvibe.space/
//
// Study cards show the participant's lesson topic (TOPICS below), which is
// the same across all three conditions.
// To add illustrative (non-study) examples, append to ILLUSTRATIVE_EXAMPLES.
// ============================================================================

// Section definitions, in display order.
const GROUPS = {
  "full": {
    label: "User Study — Full System",
    description:
      "Lessons created by teachers using the complete MathVibe system.",
  },
  "no-design": {
    label: "User Study — No Design Knowledge",
    description:
      "Lessons created with the design-knowledge layer removed (control condition).",
  },
  "no-edits": {
    label: "User Study — No Edits",
    description:
      "Lessons created with chat-only editing (no visual cards or direct edits).",
  },
  "illustrative": {
    label: "Illustrative Examples — Mathematics",
    description:
      "Examples created by the authors to illustrate the capabilities of the system.",
  },
  "other-domains": {
    label: "Applicability in Other Domains",
    description:
      "Examples showing that the system generalizes beyond mathematics to other subjects.",
  },
};

const PARTICIPANT_COUNT = 18;

// Lesson topic per participant, shared across all three conditions.
// Source: the study analysis participants data (MathVibeAnalysis/data/
// participants.csv, "Topic" column), lightly normalized; where the sheet was
// vague or empty (C16–C18) the topic is inferred from the deployed lessons.
const TOPICS = {
  1: "Trigonometry",
  2: "Central Limit Theorem",
  3: "Angles in Polygons",
  4: "Trigonometry",
  5: "Geometric Construction",
  6: "Algebra",
  7: "Linear Feedback Shift Registers",
  8: "Algebra",
  9: "Matrices",
  10: "Complex Numbers",
  11: "Probability",
  12: "Integration",
  13: "Differential Equations",
  14: "Probability",
  15: "Circle Theorems",
  16: "Differentiation",
  17: "Coordinate Geometry",
  18: "Solving Equations",
};

// Study conditions: URL suffix → group key (suffix is also the group key here).
const CONDITIONS = ["full", "no-design", "no-edits"];

// One-off URL fixes, keyed by subdomain. c13-no-design was deployed with a
// double-dash custom domain; remove this entry once the Pages domain is
// corrected to c13-no-design.mathvibe.space.
const URL_OVERRIDES = {
  "c13-no-design": "https://c13--no-design.mathvibe.space/",
};

// Extra examples created for illustration (outside the study). Add freely.
const ILLUSTRATIVE_EXAMPLES = [
  {
    title: "Quadratic Functions: The Shape of a Parabola",
    url: "https://quadratic-functions.mathvibe.space/",
    group: "illustrative",
    topic: "Mathematics",
    notes: "",
  },
  {
    title: "Circle Theorems",
    url: "https://circle-theorems.mathvibe.space/",
    group: "illustrative",
    topic: "Mathematics",
    notes: "",
  },
  {
    title: "The A* Algorithm",
    url: "https://introduction-to-the-a-algorithm.mathvibe.space/",
    group: "other-domains",
    topic: "Computer Science",
    notes: "",
  },
  {
    title: "Collisions",
    url: "https://collisions---physics.mathvibe.space/",
    group: "other-domains",
    topic: "Physics",
    notes: "",
  },
  // {
  //   title: "Lesson title",
  //   url: "https://example.mathvibe.space/",
  //   group: "illustrative",              // or "other-domains"
  //   topic: "Mathematics",               // optional subject line
  //   notes: "One-line description.",     // optional
  // },
];

// --- Generated study entries (no need to edit below) ------------------------

const EXAMPLES = [];

for (const condition of CONDITIONS) {
  for (let n = 1; n <= PARTICIPANT_COUNT; n++) {
    const subdomain = "c" + n + "-" + condition;
    EXAMPLES.push({
      title: TOPICS[n] || "Participant C" + n,
      topic: "Participant C" + n,
      url: URL_OVERRIDES[subdomain] || "https://" + subdomain + ".mathvibe.space/",
      group: condition,
      notes: "",
    });
  }
}

EXAMPLES.push(...ILLUSTRATIVE_EXAMPLES);
