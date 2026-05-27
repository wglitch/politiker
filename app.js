let candidateIndex = [];
let assignmentIndex = [];
let searchIndex = [];

const searchInput = document.getElementById("searchInput");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");
const personEl = document.getElementById("person");

function normalizeText(text) {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

async function fetchJson(url, required = true) {
  const res = await fetch(url);
  if (!res.ok) {
    if (required) throw new Error(`Kunde inte ladda ${url}`);
    return null;
  }
  return res.json();
}

async function loadIndex() {
  try {
    const [candidateRaw, assignmentRaw] = await Promise.all([
      fetchJson("data/names-index.json", false),
      fetchJson("data/uppdrag-index.json", false)
    ]);

    candidateIndex = (candidateRaw || []).map(item => ({
      ...item,
      source: "kandidat",
      searchName: normalizeText(item.namn)
    }));

    assignmentIndex = (assignmentRaw || []).map(item => ({
      ...item,
      source: "uppdrag",
      searchName: normalizeText(item.namn)
    }));

    searchIndex = mergeIndexes(candidateIndex, assignmentIndex);

    const candidateCount = candidateIndex.length;
    const assignmentCount = assignmentIndex.length;
    statusEl.textContent = `${searchIndex.length} namn laddade. ${candidateCount} kandidater, ${assignmentCount} personer med nuvarande uppdrag.`;
  } catch (err) {
    statusEl.textContent = "Fel: kunde inte ladda sökindex.";
    console.error(err);
  }
}

function mergeIndexes(candidates, assignments) {
  const bySlug = new Map();

  function upsert(item, kind) {
    const key = item.slug;
    const existing = bySlug.get(key) || {
      namn: item.namn,
      slug: item.slug,
      bucket: item.bucket,
      candidateBucket: null,
      assignmentBucket: null,
      hasCandidate: false,
      hasAssignment: false,
      uppdragCount: 0,
      searchName: normalizeText(item.namn)
    };

    if (kind === "candidate") {
      existing.hasCandidate = true;
      existing.candidateBucket = item.bucket;
    }

    if (kind === "assignment") {
      existing.hasAssignment = true;
      existing.assignmentBucket = item.bucket;
      existing.uppdragCount = item.uppdragCount || 0;
    }

    // Behåll snyggaste namnvarianten, men låt längre namn vinna vid behov.
    if ((item.namn || "").length > (existing.namn || "").length) {
      existing.namn = item.namn;
      existing.searchName = normalizeText(item.namn);
    }

    bySlug.set(key, existing);
  }

  candidates.forEach(item => upsert(item, "candidate"));
  assignments.forEach(item => upsert(item, "assignment"));

  return Array.from(bySlug.values());
}

function searchNames(query) {
  const q = normalizeText(query);

  if (q.length < 2) {
    resultsEl.innerHTML = "";
    personEl.innerHTML = "";
    statusEl.textContent = `${searchIndex.length} namn laddade.`;
    return;
  }

  const matches = searchIndex
    .filter(item => item.searchName.includes(q))
    .sort((a, b) => {
      const aStarts = a.searchName.startsWith(q);
      const bStarts = b.searchName.startsWith(q);

      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;

      // Personer som både kandiderar och har uppdrag först.
      const aBoth = a.hasCandidate && a.hasAssignment;
      const bBoth = b.hasCandidate && b.hasAssignment;
      if (aBoth && !bBoth) return -1;
      if (!aBoth && bBoth) return 1;

      return a.namn.localeCompare(b.namn, "sv");
    })
    .slice(0, 75);

  renderResults(matches);
}

function renderResults(matches) {
  personEl.innerHTML = "";

  if (matches.length === 0) {
    resultsEl.innerHTML = `<p class="muted">Inga träffar.</p>`;
    return;
  }

  resultsEl.innerHTML = matches.map(item => `
    <div
      class="result"
      data-slug="${escapeHtml(item.slug)}"
      data-candidate-bucket="${escapeHtml(item.candidateBucket || "")}"
      data-assignment-bucket="${escapeHtml(item.assignmentBucket || "")}"
    >
      <strong>${escapeHtml(item.namn)}</strong>
      <div class="result-tags">
        ${item.hasCandidate ? `<span class="tag">Kandidat</span>` : ""}
        ${item.hasAssignment ? `<span class="tag">Nuvarande uppdrag${item.uppdragCount ? `: ${escapeHtml(item.uppdragCount)}` : ""}</span>` : ""}
      </div>
    </div>
  `).join("");

  document.querySelectorAll(".result").forEach(el => {
    el.addEventListener("click", () => {
      loadPerson(
        el.dataset.slug,
        el.dataset.candidateBucket || null,
        el.dataset.assignmentBucket || null
      );
    });
  });

  statusEl.textContent = `${matches.length} träffar visas.`;
}

async function loadPerson(slug, candidateBucket, assignmentBucket) {
  try {
    const [candidatePerson, assignmentPerson] = await Promise.all([
      loadCandidatePerson(slug, candidateBucket),
      loadAssignmentPerson(slug, assignmentBucket)
    ]);

    if (!candidatePerson && !assignmentPerson) {
      throw new Error("Personen saknas i datafilerna.");
    }

    const person = {
      namn: candidatePerson?.namn || assignmentPerson?.namn || slug,
      kandidaturer: candidatePerson?.kandidaturer || [],
      uppdrag: assignmentPerson?.uppdrag || []
    };

    renderPerson(person);
  } catch (err) {
    personEl.innerHTML = `<p class="muted">Kunde inte ladda personens uppgifter.</p>`;
    console.error(err);
  }
}

async function loadCandidatePerson(slug, bucket) {
  if (!bucket) return null;

  const bucketData = await fetchJson(`data/people-${bucket}.json`, false);
  return bucketData?.[slug] || null;
}

async function loadAssignmentPerson(slug, bucket) {
  if (!bucket) return null;

  const bucketData = await fetchJson(`data/uppdrag-${bucket}.json`, false);
  return bucketData?.[slug] || null;
}

function renderPerson(person) {
  const candidacies = person.kandidaturer || [];
  const assignments = person.uppdrag || [];

  personEl.innerHTML = `
    <section class="person">
      <h2>${escapeHtml(person.namn)}</h2>

      <p class="muted">
        ${candidacies.length} kandidaturer · ${assignments.length} nuvarande uppdrag/ersättarplatser
      </p>

      ${candidacies.length ? `
        <h3>Kandidaturer</h3>
        ${candidacies.map(c => `
          <div class="candidacy">
            <div>
              <span class="tag">${escapeHtml(c.valtyp)}</span>
              ${c.ordning ? `<span class="tag">Plats ${escapeHtml(c.ordning)}</span>` : ""}
            </div>

            <p>
              <strong>${escapeHtml(c.parti)}</strong>
              ${c.partiförkortning ? ` (${escapeHtml(c.partiförkortning)})` : ""}
            </p>

            <p class="muted">
              ${escapeHtml(c.område)}
              ${c.valkrets ? ` · ${escapeHtml(c.valkrets)}` : ""}
            </p>

            ${c.kandidatnummer ? `<p class="muted">Kandidatnummer: ${escapeHtml(c.kandidatnummer)}</p>` : ""}
          </div>
        `).join("")}
      ` : ""}

      ${assignments.length ? `
        <h3>Nuvarande mandatperiod</h3>
        ${assignments.map(u => `
          <div class="candidacy">
            <div>
              <span class="tag">${escapeHtml(u.roll)}</span>
              <span class="tag">${escapeHtml(u.nivå || u.valtyp)}</span>
              ${u.ordning ? `<span class="tag">Ersättare ${escapeHtml(u.ordning)}</span>` : ""}
            </div>

            <p>
              <strong>${escapeHtml(u.parti)}</strong>
              ${u.partiförkortning ? ` (${escapeHtml(u.partiförkortning)})` : ""}
            </p>

            <p class="muted">
              ${escapeHtml(u.organ)}
              ${u.område ? ` · ${escapeHtml(u.område)}` : ""}
              ${u.valkrets ? ` · ${escapeHtml(u.valkrets)}` : ""}
            </p>
          </div>
        `).join("")}
      ` : ""}
    </section>
  `;

  personEl.scrollIntoView({ behavior: "smooth", block: "start" });
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

searchInput.addEventListener("input", e => {
  searchNames(e.target.value);
});

loadIndex();
