let nameIndex = [];

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

async function loadIndex() {
  try {
    const res = await fetch("data/names-index.json");
    if (!res.ok) throw new Error("Kunde inte ladda namnindex.");

    nameIndex = await res.json();

    nameIndex = nameIndex.map(item => ({
      ...item,
      searchName: normalizeText(item.namn)
    }));

    statusEl.textContent = `${nameIndex.length} namn laddade.`;
  } catch (err) {
    statusEl.textContent = "Fel: kunde inte ladda data/names-index.json";
    console.error(err);
  }
}

function searchNames(query) {
  const q = normalizeText(query);

  if (q.length < 2) {
    resultsEl.innerHTML = "";
    personEl.innerHTML = "";
    return;
  }

  const matches = nameIndex
    .filter(item => item.searchName.includes(q))
    .sort((a, b) => {
      const aStarts = a.searchName.startsWith(q);
      const bStarts = b.searchName.startsWith(q);

      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;

      return a.namn.localeCompare(b.namn, "sv");
    })
    .slice(0, 50);

  renderResults(matches, q);
}

function renderResults(matches, q) {
  personEl.innerHTML = "";

  if (matches.length === 0) {
    resultsEl.innerHTML = `<p class="muted">Inga träffar.</p>`;
    return;
  }

  resultsEl.innerHTML = matches.map(item => `
    <div class="result" data-slug="${item.slug}" data-bucket="${item.bucket}">
      <strong>${escapeHtml(item.namn)}</strong>
    </div>
  `).join("");

  document.querySelectorAll(".result").forEach(el => {
    el.addEventListener("click", () => {
      loadPerson(el.dataset.slug);
    });
  });

  statusEl.textContent = `${matches.length} träffar visas.`;
}

async function loadPerson(slug, bucket) {
  try {
    const res = await fetch(`data/people-${bucket}.json`);
    if (!res.ok) throw new Error("Kunde inte ladda bucketfil.");

    const bucketData = await res.json();
    const person = bucketData[slug];

    if (!person) throw new Error("Personen saknas i bucketfilen.");

    renderPerson(person);
  } catch (err) {
    personEl.innerHTML = `<p class="muted">Kunde inte ladda kandidatens uppgifter.</p>`;
    console.error(err);
  }
}

function renderPerson(person) {
  const candidacies = person.kandidaturer || [];

  personEl.innerHTML = `
    <section class="person">
      <h2>${escapeHtml(person.namn)}</h2>
      <p class="muted">${candidacies.length} kandidaturer hittade.</p>

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