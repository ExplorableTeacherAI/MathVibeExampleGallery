// ============================================================================
// MathVibe Example Gallery — data file
//
// This is the ONLY file you need to edit.
//
// The user-study entries (12 participants × 3 conditions) are generated from
// the URL pattern below:
//   https://c{n}-full.mathvibe.space/
//   https://c{n}-no-edits.mathvibe.space/
//   https://c{n}-no-design.mathvibe.space/
//
// To show a real lesson title on a card, add it to TITLES keyed by subdomain.
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

const PARTICIPANT_COUNT = 12;

// Study conditions: URL suffix → group key (suffix is also the group key here).
const CONDITIONS = ["full", "no-design", "no-edits"];

// Known lesson titles, keyed by subdomain. Cards without an entry here just
// show the participant label until you fill the title in.
const TITLES = {
  "c1-full": "Trigonometry on the Unit Circle",
  "c2-full": "One Number, One Shape",
  "c3-full": "Angles in Polygons",
  "c4-full": "Finding a Missing Side",
  "c5-full": "Perpendicular Bisectors and Midpoints",
  "c6-full": "Letters That Stand for Numbers",
  "c7-full": "Linear Feedback Shift Registers",
  "c1-no-design": "The Unit Circle",
  "c2-no-design": "The Central Limit Theorem",
  "c3-no-design": "Angle Sums in Polygons",
  "c4-no-design": "Finding a Missing Side",
  "c5-no-design": "Geometric Construction",
  "c6-no-design": "Letters for Numbers",
  "c7-no-design": "Linear Feedback Shift Registers",
  "c1-no-edits": "Trigonometry on the Unit Circle",
  "c2-no-edits": "The Central Limit Theorem",
  "c3-no-edits": "Angles in Triangles and Polygons",
  "c4-no-edits": "Sine, Cosine and Tangent",
  "c5-no-edits": "Geometric Construction",
  "c6-no-edits": "Letters Standing for Numbers",
  "c7-no-edits": "Linear Feedback Shift Registers",
  // c8–c12: not published yet — add titles here once the sites are up.
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
    const knownTitle = TITLES[subdomain];
    EXAMPLES.push({
      title: knownTitle || "Participant C" + n,
      topic: knownTitle ? "Participant C" + n : "",
      url: "https://" + subdomain + ".mathvibe.space/",
      group: condition,
      notes: "",
    });
  }
}

EXAMPLES.push(...ILLUSTRATIVE_EXAMPLES);
