// Renders the gallery from the GROUPS / EXAMPLES data in examples.js.
// Previews are live iframes of the published lessons, scaled down to fit the
// card and lazy-loaded only when scrolled into view.

(function () {
  const galleryEl = document.getElementById("gallery");
  const filtersEl = document.getElementById("filters");

  const groupKeys = Object.keys(GROUPS).filter((key) =>
    EXAMPLES.some((ex) => ex.group === key)
  );

  let activeFilter = "all";

  function renderFilters() {
    filtersEl.innerHTML = "";
    const options = [["all", "All"], ...groupKeys.map((k) => [k, GROUPS[k].label])];
    for (const [key, label] of options) {
      const btn = document.createElement("button");
      btn.className = "filter-btn" + (key === activeFilter ? " active" : "");
      btn.textContent = label;
      btn.addEventListener("click", () => {
        activeFilter = key;
        renderFilters();
        renderGallery();
      });
      filtersEl.appendChild(btn);
    }
  }

  function makeCard(example) {
    const card = document.createElement("article");
    card.className = "card";

    const preview = document.createElement("div");
    preview.className = "preview";
    preview.dataset.url = example.url;
    preview.innerHTML = '<div class="placeholder">Loading preview…</div>';

    const overlay = document.createElement("a");
    overlay.className = "overlay";
    overlay.href = example.url;
    overlay.target = "_blank";
    overlay.rel = "noopener";
    overlay.setAttribute("aria-label", "Open " + example.title);
    preview.appendChild(overlay);

    const body = document.createElement("div");
    body.className = "card-body";
    if (example.topic) {
      const topic = document.createElement("div");
      topic.className = "card-topic";
      topic.textContent = example.topic;
      body.appendChild(topic);
    }
    const title = document.createElement("h3");
    title.className = "card-title";
    const titleLink = document.createElement("a");
    titleLink.href = example.url;
    titleLink.target = "_blank";
    titleLink.rel = "noopener";
    titleLink.textContent = example.title;
    title.appendChild(titleLink);
    body.appendChild(title);

    if (example.notes) {
      const notes = document.createElement("p");
      notes.className = "card-notes";
      notes.textContent = example.notes;
      body.appendChild(notes);
    }

    const footer = document.createElement("div");
    footer.className = "card-footer";
    const open = document.createElement("a");
    open.className = "open-link";
    open.href = example.url;
    open.target = "_blank";
    open.rel = "noopener";
    open.textContent = "Open lesson ↗";
    footer.appendChild(open);
    body.appendChild(footer);

    card.appendChild(preview);
    card.appendChild(body);
    return card;
  }

  function renderGallery() {
    galleryEl.innerHTML = "";
    const keysToShow = activeFilter === "all" ? groupKeys : [activeFilter];
    let shownAny = false;

    for (const key of keysToShow) {
      const items = EXAMPLES.filter((ex) => ex.group === key);
      if (!items.length) continue;
      shownAny = true;

      const section = document.createElement("section");
      section.className = "group-section";

      const heading = document.createElement("h2");
      heading.textContent = GROUPS[key].label;
      section.appendChild(heading);

      if (GROUPS[key].description) {
        const desc = document.createElement("p");
        desc.className = "group-desc";
        desc.textContent = GROUPS[key].description;
        section.appendChild(desc);
      }

      const grid = document.createElement("div");
      grid.className = "grid";
      for (const example of items) grid.appendChild(makeCard(example));
      section.appendChild(grid);
      galleryEl.appendChild(section);
    }

    if (!shownAny) {
      galleryEl.innerHTML =
        '<div class="empty-state">No examples yet — add entries in <code>examples.js</code>.</div>';
    }

    observePreviews();
  }

  // Lazy-load an iframe into each preview once it scrolls into view,
  // scaled so the full 1280px-wide page fits the card width.
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        loadPreview(entry.target);
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: "200px" }
  );

  function loadPreview(preview) {
    if (preview.querySelector("iframe")) return;
    const iframe = document.createElement("iframe");
    iframe.src = preview.dataset.url;
    iframe.loading = "lazy";
    iframe.setAttribute("title", "Lesson preview");
    iframe.setAttribute("tabindex", "-1");
    iframe.setAttribute("scrolling", "no");
    iframe.setAttribute(
      "sandbox",
      "allow-scripts allow-same-origin"
    );
    iframe.addEventListener("load", () => {
      const placeholder = preview.querySelector(".placeholder");
      if (placeholder) placeholder.remove();
    });
    scaleIframe(preview, iframe);
    preview.insertBefore(iframe, preview.firstChild);
  }

  function scaleIframe(preview, iframe) {
    const scale = preview.clientWidth / 1280;
    iframe.style.transform = "scale(" + scale + ")";
    // Height that fills the card at this scale, so the preview shows the top
    // of the lesson without letterboxing.
    iframe.style.height = Math.ceil(preview.clientHeight / scale) + "px";
  }

  function observePreviews() {
    document.querySelectorAll(".preview[data-url]").forEach((el) => observer.observe(el));
  }

  window.addEventListener("resize", () => {
    document.querySelectorAll(".preview").forEach((preview) => {
      const iframe = preview.querySelector("iframe");
      if (iframe) scaleIframe(preview, iframe);
    });
  });

  renderFilters();
  renderGallery();
})();
