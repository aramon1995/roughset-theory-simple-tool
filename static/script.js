// Rough Set Theory POC - frontend logic (vanilla JS, no build step).
"use strict";

const state = {
  csvText: null,
  columns: [],
  decisionAttribute: null,
  idLikeColumns: [],
  analysis: null,
};

const el = (id) => document.getElementById(id);

async function jsonFetch(url, options) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.detail || `Error ${res.status}`);
  }
  return body;
}

function showError(message) {
  const box = el("load-error");
  box.textContent = message;
  box.classList.remove("hidden");
}

function clearError() {
  el("load-error").classList.add("hidden");
}

// ---------------------------------------------------------------------
// Step 1: sample datasets + upload
// ---------------------------------------------------------------------

async function initSampleDatasets() {
  const data = await jsonFetch("/api/datasets");
  const select = el("sample-select");
  select.innerHTML = "";
  data.datasets.forEach((ds) => {
    const opt = document.createElement("option");
    opt.value = ds.key;
    opt.textContent = ds.name;
    opt.dataset.description = ds.description;
    select.appendChild(opt);
  });
  updateSampleDescription();
  select.addEventListener("change", updateSampleDescription);
}

function updateSampleDescription() {
  const select = el("sample-select");
  const opt = select.selectedOptions[0];
  el("sample-description").textContent = opt ? opt.dataset.description : "";
}

async function loadSample() {
  clearError();
  const key = el("sample-select").value;
  try {
    const data = await jsonFetch(`/api/datasets/${key}`);
    onDataLoaded(data);
  } catch (err) {
    showError(`No se pudo cargar el dataset de ejemplo: ${err.message}`);
  }
}

async function uploadFile() {
  clearError();
  const input = el("file-input");
  if (!input.files.length) {
    showError("Selecciona primero un archivo CSV.");
    return;
  }
  const form = new FormData();
  form.append("file", input.files[0]);
  try {
    const data = await jsonFetch("/api/upload", { method: "POST", body: form });
    onDataLoaded(data);
  } catch (err) {
    showError(`No se pudo subir el archivo: ${err.message}`);
  }
}

// ---------------------------------------------------------------------
// Step 2: configuration + preview
// ---------------------------------------------------------------------

function onDataLoaded(data) {
  state.csvText = data.csv_text;
  state.columns = data.columns;
  state.decisionAttribute = data.decision_attribute || data.columns[data.columns.length - 1];
  state.idLikeColumns = data.id_like_columns || [];

  el("bins-input").value = data.suggested_bins || 4;

  const decisionSelect = el("decision-select");
  decisionSelect.innerHTML = "";
  data.columns.forEach((col) => {
    const opt = document.createElement("option");
    opt.value = col;
    opt.textContent = col;
    if (col === state.decisionAttribute) opt.selected = true;
    decisionSelect.appendChild(opt);
  });
  decisionSelect.addEventListener("change", () => {
    state.decisionAttribute = decisionSelect.value;
    renderConditionCheckboxes();
  });

  renderConditionCheckboxes();
  renderPreviewTable(data.columns, data.preview, data.row_count);

  el("config-section").classList.remove("hidden");
  el("results-section").classList.add("hidden");
  el("overlap-section").classList.add("hidden");
  el("membership-section").classList.add("hidden");
  el("discernibility-section").classList.add("hidden");
  el("reducts-section").classList.add("hidden");
  el("granule-treemap-section").classList.add("hidden");
  el("granule-graph-section").classList.add("hidden");
  el("reducts-container").innerHTML = "";
  el("reducts-note").textContent = "";
}

function renderConditionCheckboxes() {
  const container = el("condition-attrs");
  container.innerHTML = "";
  state.columns.forEach((col) => {
    if (col === state.decisionAttribute) return;
    const isIdLike = state.idLikeColumns.includes(col);
    const label = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = col;
    cb.checked = !isIdLike;
    label.appendChild(cb);
    label.appendChild(document.createTextNode(isIdLike ? `${col} (id)` : col));
    container.appendChild(label);
  });
}

function renderPreviewTable(columns, rows, totalCount) {
  el("preview-count").textContent = totalCount ?? rows.length;
  const table = el("preview-table");
  const thead = table.querySelector("thead");
  const tbody = table.querySelector("tbody");
  thead.innerHTML = `<tr>${columns.map((c) => `<th>${c}</th>`).join("")}</tr>`;
  tbody.innerHTML = rows
    .map((row) => `<tr>${columns.map((c) => `<td>${row[c] ?? ""}</td>`).join("")}</tr>`)
    .join("");
}

// ---------------------------------------------------------------------
// Step 3: analysis
// ---------------------------------------------------------------------

async function analyze() {
  clearError();
  const conditionAttributes = Array.from(
    document.querySelectorAll("#condition-attrs input:checked")
  ).map((cb) => cb.value);

  if (!conditionAttributes.length) {
    showError("Selecciona al menos un atributo de condicion.");
    return;
  }

  const payload = {
    csv_text: state.csvText,
    decision_attribute: state.decisionAttribute,
    condition_attributes: conditionAttributes,
    bins: parseInt(el("bins-input").value, 10) || 4,
  };

  try {
    const data = await jsonFetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    state.analysis = data;
    renderResults(data);
  } catch (err) {
    showError(`No se pudo analizar el dataset: ${err.message}`);
  }
}

function renderResults(data) {
  el("summary-universe").textContent = data.universe_size;
  el("summary-classes").textContent = data.equivalence_class_count;
  el("summary-quality").textContent = data.quality_of_classification.toFixed(3);
  el("summary-positive").textContent = data.positive_region_size;

  const tbody = document.querySelector("#classes-table tbody");
  tbody.innerHTML = data.classes
    .map((cls) => {
      const total = cls.size || 1;
      const lowerPct = (cls.lower_size / total) * 100;
      const boundaryPct = (cls.boundary_size / total) * 100;
      const negativePct = Math.max(0, 100 - lowerPct - boundaryPct);
      return `<tr>
        <td>${cls.value}</td>
        <td>${cls.size}</td>
        <td>${cls.lower_size}</td>
        <td>${cls.upper_size}</td>
        <td>${cls.boundary_size}</td>
        <td>${cls.accuracy.toFixed(3)}</td>
        <td>
          <div class="bar">
            <span class="seg-lower" style="width:${lowerPct}%"></span>
            <span class="seg-boundary" style="width:${boundaryPct}%"></span>
            <span class="seg-negative" style="width:${negativePct}%"></span>
          </div>
        </td>
      </tr>`;
    })
    .join("");

  const regionSelect = el("region-class-select");
  regionSelect.innerHTML = data.classes
    .map((cls) => `<option value="${cls.value}">${data.decision_attribute} = ${cls.value}</option>`)
    .join("");
  regionSelect.onchange = () => renderRegionGrid(data, regionSelect.value);

  el("results-section").classList.remove("hidden");
  if (data.classes.length) {
    renderRegionGrid(data, data.classes[0].value);
  }
  renderOverlapDiagram(data);
  renderMembershipDiagram(data);
  renderDiscernibilityMatrix(data);
  renderGranuleTreemap(data);
  renderGranuleGraph(data);
  el("reducts-section").classList.remove("hidden");
  el("reducts-container").innerHTML = "";
  el("reducts-note").textContent = "";
  el("results-section").scrollIntoView({ behavior: "smooth" });
}

function renderRegionGrid(data, classValue) {
  const grid = el("region-grid");
  grid.innerHTML = "";
  const tooltip = el("tooltip");

  data.rows.forEach((row) => {
    const region = row.regions[String(classValue)] || "negative";
    const cell = document.createElement("div");
    cell.className = `region-cell ${region}`;
    cell.addEventListener("mouseenter", (evt) => {
      const values = Object.entries(row.values)
        .map(([k, v]) => `<b>${k}</b>: ${v}`)
        .join("<br/>");
      tooltip.innerHTML = `#${row.id} &middot; region: ${region}<br/>${values}`;
      tooltip.classList.remove("hidden");
      positionTooltip(evt);
    });
    cell.addEventListener("mousemove", positionTooltip);
    cell.addEventListener("mouseleave", () => tooltip.classList.add("hidden"));
    grid.appendChild(cell);
  });
}

function positionTooltip(evt) {
  const tooltip = el("tooltip");
  tooltip.style.left = `${evt.clientX + 14}px`;
  tooltip.style.top = `${evt.clientY + 14}px`;
}

// ---------------------------------------------------------------------
// Step 4: class overlap diagram (Venn for <=3 classes, UpSet otherwise)
// ---------------------------------------------------------------------

const OVERLAP_COLORS = [
  "#5b8cff", "#2ecc71", "#f39c12", "#e74c3c",
  "#9b59b6", "#1abc9c", "#e67e22", "#34495e",
];

function comboKey(values) {
  return values.map(String).slice().sort().join("||");
}

function findRegion(overlap, comboValues) {
  const key = comboKey(comboValues);
  return (
    overlap.regions.find((r) => comboKey(r.combo) === key) || {
      combo: comboValues,
      count: 0,
      objects: [],
    }
  );
}

function renderOverlapDiagram(data) {
  const section = el("overlap-section");
  const overlap = data.class_overlap;
  const container = el("venn-container");
  container.innerHTML = "";
  el("overlap-detail").classList.add("hidden");

  if (!overlap || overlap.mode === "single") {
    container.innerHTML = `<p class="hint">Solo hay una clase de decision: no existe otra clase con la que solaparse.</p>`;
    section.classList.remove("hidden");
    return;
  }

  if (overlap.mode === "venn2") {
    renderVenn2(container, overlap);
  } else if (overlap.mode === "venn3") {
    renderVenn3(container, overlap);
  } else {
    renderUpset(container, overlap);
  }
  section.classList.remove("hidden");
}

function renderVenn2(container, overlap) {
  const values = overlap.class_values;
  const colors = OVERLAP_COLORS;
  const only0 = findRegion(overlap, [values[0]]);
  const only1 = findRegion(overlap, [values[1]]);
  const both = findRegion(overlap, [values[0], values[1]]);

  container.innerHTML = `
    <svg viewBox="0 0 300 220" class="venn-svg" role="img" aria-label="Diagrama de Venn de 2 clases">
      <circle id="venn-circle-0" cx="110" cy="110" r="90" fill="${colors[0]}" opacity="0.45"></circle>
      <circle id="venn-circle-1" cx="190" cy="110" r="90" fill="${colors[1]}" opacity="0.45"></circle>
      <g class="venn-label" data-idx="0"><circle class="venn-hit" cx="65" cy="108" r="28"></circle><text x="65" y="112" text-anchor="middle">${values[0]}<tspan x="65" dy="18">${only0.count}</tspan></text></g>
      <g class="venn-label" data-idx="1"><circle class="venn-hit" cx="235" cy="108" r="28"></circle><text x="235" y="112" text-anchor="middle">${values[1]}<tspan x="235" dy="18">${only1.count}</tspan></text></g>
      <g class="venn-label" data-idx="2"><circle class="venn-hit" cx="150" cy="108" r="28"></circle><text x="150" y="112" text-anchor="middle">&cap;<tspan x="150" dy="18">${both.count}</tspan></text></g>
    </svg>
    <div class="venn-legend">
      <span class="legend-chip"><i style="background:${colors[0]}"></i>${values[0]}</span>
      <span class="legend-chip"><i style="background:${colors[1]}"></i>${values[1]}</span>
    </div>`;

  wireVennInteractivity(container, [
    { region: only0, circles: [0] },
    { region: only1, circles: [1] },
    { region: both, circles: [0, 1] },
  ]);
}

function renderVenn3(container, overlap) {
  const values = overlap.class_values;
  const colors = OVERLAP_COLORS;
  const r0 = findRegion(overlap, [values[0]]);
  const r1 = findRegion(overlap, [values[1]]);
  const r2 = findRegion(overlap, [values[2]]);
  const r01 = findRegion(overlap, [values[0], values[1]]);
  const r02 = findRegion(overlap, [values[0], values[2]]);
  const r12 = findRegion(overlap, [values[1], values[2]]);
  const r012 = findRegion(overlap, [values[0], values[1], values[2]]);

  container.innerHTML = `
    <svg viewBox="0 0 320 280" class="venn-svg" role="img" aria-label="Diagrama de Venn de 3 clases">
      <circle id="venn-circle-0" cx="120" cy="110" r="90" fill="${colors[0]}" opacity="0.4"></circle>
      <circle id="venn-circle-1" cx="200" cy="110" r="90" fill="${colors[1]}" opacity="0.4"></circle>
      <circle id="venn-circle-2" cx="160" cy="190" r="90" fill="${colors[2]}" opacity="0.4"></circle>
      <g class="venn-label" data-idx="0"><circle class="venn-hit" cx="75" cy="76" r="24"></circle><text x="75" y="80" text-anchor="middle">${values[0]}<tspan x="75" dy="16">${r0.count}</tspan></text></g>
      <g class="venn-label" data-idx="1"><circle class="venn-hit" cx="245" cy="76" r="24"></circle><text x="245" y="80" text-anchor="middle">${values[1]}<tspan x="245" dy="16">${r1.count}</tspan></text></g>
      <g class="venn-label" data-idx="2"><circle class="venn-hit" cx="160" cy="246" r="24"></circle><text x="160" y="250" text-anchor="middle">${values[2]}<tspan x="160" dy="16">${r2.count}</tspan></text></g>
      <g class="venn-label" data-idx="3"><circle class="venn-hit" cx="160" cy="76" r="22"></circle><text x="160" y="80" text-anchor="middle">&cap;<tspan x="160" dy="16">${r01.count}</tspan></text></g>
      <g class="venn-label" data-idx="4"><circle class="venn-hit" cx="105" cy="171" r="22"></circle><text x="105" y="175" text-anchor="middle">&cap;<tspan x="105" dy="16">${r02.count}</tspan></text></g>
      <g class="venn-label" data-idx="5"><circle class="venn-hit" cx="215" cy="171" r="22"></circle><text x="215" y="175" text-anchor="middle">&cap;<tspan x="215" dy="16">${r12.count}</tspan></text></g>
      <g class="venn-label" data-idx="6"><circle class="venn-hit" cx="160" cy="146" r="22"></circle><text x="160" y="150" text-anchor="middle">&cap;<tspan x="160" dy="16">${r012.count}</tspan></text></g>
    </svg>
    <div class="venn-legend">
      <span class="legend-chip"><i style="background:${colors[0]}"></i>${values[0]}</span>
      <span class="legend-chip"><i style="background:${colors[1]}"></i>${values[1]}</span>
      <span class="legend-chip"><i style="background:${colors[2]}"></i>${values[2]}</span>
    </div>`;

  wireVennInteractivity(container, [
    { region: r0, circles: [0] },
    { region: r1, circles: [1] },
    { region: r2, circles: [2] },
    { region: r01, circles: [0, 1] },
    { region: r02, circles: [0, 2] },
    { region: r12, circles: [1, 2] },
    { region: r012, circles: [0, 1, 2] },
  ]);
}

function wireVennInteractivity(container, entries) {
  container.querySelectorAll(".venn-label").forEach((label) => {
    const idx = parseInt(label.dataset.idx, 10);
    const entry = entries[idx];
    const circles = entry.circles.map((i) => container.querySelector(`#venn-circle-${i}`));

    label.addEventListener("mouseenter", () => {
      circles.forEach((c) => c && c.classList.add("hover"));
    });
    label.addEventListener("mouseleave", () => {
      circles.forEach((c) => c && c.classList.remove("hover"));
    });
    label.addEventListener("click", () => showOverlapDetail(entry.region));
  });
}

function renderUpset(container, overlap) {
  const values = overlap.class_values;
  const colors = OVERLAP_COLORS;
  const colorOf = {};
  values.forEach((v, i) => (colorOf[v] = colors[i % colors.length]));

  const maxCount = Math.max(1, ...overlap.regions.map((r) => r.count));

  const rowsHtml = overlap.regions
    .map((region, idx) => {
      const dots = values
        .map((v) => {
          const included = region.combo.map(String).includes(String(v));
          const color = colorOf[v];
          return `<span class="upset-dot" style="border-color:${color}; background:${included ? color : "transparent"}"></span>`;
        })
        .join("");
      const widthPct = (region.count / maxCount) * 100;
      const label = region.combo.length === 1
        ? "region de certeza"
        : `frontera compartida (${region.combo.length} clases)`;
      return `<div class="upset-row" data-idx="${idx}" title="${label}">
        <div class="upset-dots">${dots}</div>
        <div class="upset-bar-track">
          <div class="upset-bar" style="width:${widthPct}%"></div>
          <span class="upset-count">${region.count}</span>
        </div>
      </div>`;
    })
    .join("");

  const legend = values
    .map((v) => `<span class="legend-chip"><i style="background:${colorOf[v]}"></i>${v}</span>`)
    .join("");

  container.innerHTML = `
    <p class="hint">Mas de 3 clases: se muestra un diagrama UpSet (matriz de combinaciones) en vez de un Venn, ya que los circulos dejan de ser legibles a partir de 4 conjuntos.</p>
    <div class="venn-legend">${legend}</div>
    <div class="upset-table">${rowsHtml}</div>`;

  container.querySelectorAll(".upset-row").forEach((row) => {
    const idx = parseInt(row.dataset.idx, 10);
    row.addEventListener("mouseenter", () => row.classList.add("hover"));
    row.addEventListener("mouseleave", () => row.classList.remove("hover"));
    row.addEventListener("click", () => showOverlapDetail(overlap.regions[idx]));
  });
}

function showOverlapDetail(region) {
  const panel = el("overlap-detail");
  if (!region.count) {
    panel.innerHTML = `<p class="hint">Esta combinacion no tiene objetos.</p>`;
    panel.classList.remove("hidden");
    return;
  }

  const analysis = state.analysis;
  const rowsById = new Map(analysis.rows.map((r) => [r.id, r]));
  const objectRows = region.objects
    .map((id) => rowsById.get(id))
    .filter(Boolean);

  const columns = objectRows.length ? Object.keys(objectRows[0].values) : [];
  const kind = region.combo.length === 1
    ? `Region de certeza (aproximacion inferior) de la clase <strong>${region.combo[0]}</strong>.`
    : `Frontera compartida entre las clases <strong>${region.combo.join(", ")}</strong> (objetos indiscernibles con decisiones distintas).`;

  const tableRows = objectRows
    .map(
      (row) =>
        `<tr><td>#${row.id}</td>${columns.map((c) => `<td>${row.values[c]}</td>`).join("")}</tr>`
    )
    .join("");

  panel.innerHTML = `
    <h4>${region.combo.join(" &cap; ")} &middot; ${region.count} objeto(s)</h4>
    <p class="hint">${kind}</p>
    <div class="table-scroll">
      <table>
        <thead><tr><th>id</th>${columns.map((c) => `<th>${c}</th>`).join("")}</tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>`;
  panel.classList.remove("hidden");
}

// ---------------------------------------------------------------------
// Shared color helper (keeps every visualization using the same palette)
// ---------------------------------------------------------------------

function classColor(data, value) {
  const idx = data.classes.findIndex((c) => String(c.value) === String(value));
  return OVERLAP_COLORS[(idx < 0 ? 0 : idx) % OVERLAP_COLORS.length];
}

function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ---------------------------------------------------------------------
// Step 5: rough membership function (mu)
// ---------------------------------------------------------------------

function renderMembershipDiagram(data) {
  const select = el("membership-class-select");
  select.innerHTML = data.classes
    .map((cls) => `<option value="${cls.value}">${data.decision_attribute} = ${cls.value}</option>`)
    .join("");
  select.onchange = () => renderMembershipGrid(data, select.value);
  el("membership-section").classList.remove("hidden");
  if (data.classes.length) renderMembershipGrid(data, data.classes[0].value);
}

function renderMembershipGrid(data, classValue) {
  const grid = el("membership-grid");
  grid.innerHTML = "";
  const tooltip = el("tooltip");
  const color = classColor(data, classValue);

  data.rows.forEach((row) => {
    const m = row.membership[String(classValue)] || { score: 0, count: 0, size: 0 };
    const cell = document.createElement("div");
    cell.className = "membership-cell";
    cell.style.background = hexToRgba(color, Math.max(0.08, m.score));
    cell.addEventListener("mouseenter", (evt) => {
      tooltip.innerHTML = `#${row.id} &middot; &mu;<sub>${classValue}</sub> = ${m.score.toFixed(2)} (${m.count}/${m.size})`;
      tooltip.classList.remove("hidden");
      positionTooltip(evt);
    });
    cell.addEventListener("mousemove", positionTooltip);
    cell.addEventListener("mouseleave", () => tooltip.classList.add("hidden"));
    grid.appendChild(cell);
  });
}

// ---------------------------------------------------------------------
// Step 6: discernibility matrix
// ---------------------------------------------------------------------

function renderDiscernibilityMatrix(data) {
  const disc = data.discernibility;
  const section = el("discernibility-section");
  const unavailable = el("discernibility-unavailable");
  const coreBox = el("discernibility-core");
  const container = el("discernibility-container");
  el("discernibility-detail").classList.add("hidden");

  if (!disc || !disc.available) {
    unavailable.textContent = disc
      ? `|U| = ${disc.universe_size} supera el limite de ${disc.limit} objetos: la matriz de discernibilidad (O(n^2) pares) no se calcula para evitar sobrecargar el navegador.`
      : "No hay datos de discernibilidad disponibles.";
    unavailable.classList.remove("hidden");
    coreBox.innerHTML = "";
    container.innerHTML = "";
    section.classList.remove("hidden");
    return;
  }
  unavailable.classList.add("hidden");

  coreBox.innerHTML = disc.core_attributes.length
    ? `Atributos core (indispensables, presentes en todo reducto): ${disc.core_attributes
        .map((a) => `<span class="core-chip">${a}</span>`)
        .join("")}`
    : "No hay atributos core: ningun atributo es el unico discernidor de algun par.";

  const pairMap = new Map();
  disc.pairs.forEach((p) => pairMap.set(`${p.i},${p.j}`, p));

  const n = disc.universe_size;
  let html = '<table class="disc-matrix"><thead><tr><th class="row-head">#</th>';
  for (let j = 0; j < n; j++) html += `<th>${j}</th>`;
  html += "</tr></thead><tbody>";
  for (let i = 0; i < n; i++) {
    html += `<tr><th class="row-head">${i}</th>`;
    for (let j = 0; j < n; j++) {
      if (i === j) {
        html += '<td class="disc-cell diag"></td>';
        continue;
      }
      const key = i < j ? `${i},${j}` : `${j},${i}`;
      const pair = pairMap.get(key);
      if (!pair) {
        html += '<td class="disc-cell same-decision" title="Misma decision">&middot;</td>';
      } else {
        const empty = pair.attributes.length === 0;
        html += `<td class="disc-cell${empty ? " empty-discerner" : ""}" data-i="${pair.i}" data-j="${pair.j}">${pair.attributes.length}</td>`;
      }
    }
    html += "</tr>";
  }
  html += "</tbody></table>";
  container.innerHTML = html;

  container.querySelectorAll(".disc-cell[data-i]").forEach((td) => {
    td.addEventListener("click", () => {
      const i = parseInt(td.dataset.i, 10);
      const j = parseInt(td.dataset.j, 10);
      const pair = pairMap.get(`${i},${j}`);
      showDiscernibilityDetail(data, pair);
    });
  });

  section.classList.remove("hidden");
}

function showDiscernibilityDetail(data, pair) {
  const panel = el("discernibility-detail");
  const rowsById = new Map(data.rows.map((r) => [r.id, r]));
  const rowI = rowsById.get(pair.i);
  const rowJ = rowsById.get(pair.j);
  const columns = rowI ? Object.keys(rowI.values) : [];
  const kind = pair.attributes.length === 0
    ? `<strong>Conjunto discernidor vacio:</strong> estos dos objetos son C-indiscernibles pero tienen decisiones distintas -- caen en la frontera.`
    : `Atributos que distinguen este par: ${pair.attributes.map((a) => `<span class="core-chip">${a}</span>`).join("")}`;

  panel.innerHTML = `
    <h4>Par (#${pair.i}, #${pair.j})</h4>
    <p class="hint">${kind}</p>
    <div class="table-scroll">
      <table>
        <thead><tr><th>id</th>${columns.map((c) => `<th>${c}</th>`).join("")}</tr></thead>
        <tbody>
          <tr><td>#${pair.i}</td>${columns.map((c) => `<td>${rowI.values[c]}</td>`).join("")}</tr>
          <tr><td>#${pair.j}</td>${columns.map((c) => `<td>${rowJ.values[c]}</td>`).join("")}</tr>
        </tbody>
      </table>
    </div>`;
  panel.classList.remove("hidden");
}

// ---------------------------------------------------------------------
// Step 7: reduct explorer
// ---------------------------------------------------------------------

async function exploreReducts() {
  const conditionAttributes = Array.from(
    document.querySelectorAll("#condition-attrs input:checked")
  ).map((cb) => cb.value);
  if (!conditionAttributes.length) {
    showError("Selecciona al menos un atributo de condicion.");
    return;
  }

  const payload = {
    csv_text: state.csvText,
    decision_attribute: state.decisionAttribute,
    condition_attributes: conditionAttributes,
    bins: parseInt(el("bins-input").value, 10) || 4,
  };

  const container = el("reducts-container");
  const note = el("reducts-note");
  note.textContent = "Calculando...";
  container.innerHTML = "";
  try {
    const data = await jsonFetch("/api/reducts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    renderReducts(data, conditionAttributes);
  } catch (err) {
    note.textContent = "";
    showError(`No se pudo explorar reductos: ${err.message}`);
  }
}

function renderReducts(data, baselineAttributes) {
  const container = el("reducts-container");
  const note = el("reducts-note");
  note.textContent = data.full_enumeration
    ? `Enumeracion completa de subconjuntos (2^${baselineAttributes.length} - 1 = ${Math.pow(2, baselineAttributes.length) - 1} combinaciones).`
    : `Demasiados atributos para enumeracion completa: se muestran el conjunto completo y cada subconjunto "leave-one-out".`;

  const baselineKey = baselineAttributes.slice().sort().join("||");
  const bestQuality = data.results.length ? data.results[0].quality : 0;
  const maxQuality = Math.max(0.0001, ...data.results.map((r) => r.quality));

  container.innerHTML = data.results
    .map((r, idx) => {
      const key = r.attributes.slice().sort().join("||");
      const isBaseline = key === baselineKey;
      const isBest = r.quality === bestQuality;
      const widthPct = (r.quality / maxQuality) * 100;
      const chips = r.attributes.map((a) => `<span class="attr-chip">${a}</span>`).join("");
      return `<div class="reduct-row${isBaseline ? " is-baseline" : ""}${isBest ? " is-best" : ""}" data-idx="${idx}" title="Click para aplicar este subconjunto">
        <div class="reduct-attrs">${chips || "(vacio)"}</div>
        <div class="reduct-bar-track"><div class="reduct-bar" style="width:${widthPct}%"></div></div>
        <div class="reduct-quality">${r.quality.toFixed(3)}</div>
      </div>`;
    })
    .join("");

  container.querySelectorAll(".reduct-row").forEach((row) => {
    const idx = parseInt(row.dataset.idx, 10);
    row.addEventListener("click", () => applyReduct(data.results[idx].attributes));
  });
}

function applyReduct(attributes) {
  const attrSet = new Set(attributes);
  document.querySelectorAll("#condition-attrs input").forEach((cb) => {
    cb.checked = attrSet.has(cb.value);
  });
  analyze();
}

// ---------------------------------------------------------------------
// Step 8: granule treemap
// ---------------------------------------------------------------------

function renderGranuleTreemap(data) {
  const container = el("granule-treemap");
  el("granule-detail").classList.add("hidden");
  container.innerHTML = "";
  data.granules.forEach((granule, idx) => {
    const cell = document.createElement("div");
    cell.className = "treemap-cell";
    cell.style.flexGrow = String(granule.size);
    cell.dataset.idx = idx;

    const total = granule.size || 1;
    const bars = Object.entries(granule.composition)
      .map(([value, count]) => {
        const pct = (count / total) * 100;
        return `<span style="width:${pct}%; background:${classColor(data, value)}"></span>`;
      })
      .join("");
    cell.innerHTML = `${bars}<div class="treemap-label">${granule.size}</div>`;
    cell.title = `Granulo [${granule.signature.join(", ")}] -- ${granule.size} objeto(s)`;
    cell.addEventListener("click", () => showGranuleDetail(data, granule));
    container.appendChild(cell);
  });
  el("granule-treemap-section").classList.remove("hidden");
}

function showGranuleDetail(data, granule) {
  const panel = el("granule-detail");
  const rowsById = new Map(data.rows.map((r) => [r.id, r]));
  const objectRows = granule.objects.map((id) => rowsById.get(id)).filter(Boolean);
  const columns = objectRows.length ? Object.keys(objectRows[0].values) : [];
  const compositionText = Object.entries(granule.composition)
    .map(([v, c]) => `${v}: ${c}`)
    .join(", ");

  const tableRows = objectRows
    .map((row) => `<tr><td>#${row.id}</td>${columns.map((c) => `<td>${row.values[c]}</td>`).join("")}</tr>`)
    .join("");

  panel.innerHTML = `
    <h4>Granulo [${granule.signature.join(", ")}] &middot; ${granule.size} objeto(s)</h4>
    <p class="hint">Composicion por decision: ${compositionText}</p>
    <div class="table-scroll">
      <table>
        <thead><tr><th>id</th>${columns.map((c) => `<th>${c}</th>`).join("")}</tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>`;
  panel.classList.remove("hidden");
}

// ---------------------------------------------------------------------
// Step 9: granule graph (bipartite: granules <-> decision values)
// ---------------------------------------------------------------------

function renderGranuleGraph(data) {
  const container = el("granule-graph");
  container.innerHTML = "";

  const granules = data.granules.slice(0, 40);
  const classValues = data.classes.map((c) => c.value);
  const maxSize = Math.max(1, ...granules.map((g) => g.size));

  const width = 640;
  const rowHeight = 26;
  const topPad = 20;
  const leftX = 90;
  const rightX = width - 90;
  const height = topPad * 2 + Math.max(granules.length, classValues.length) * rowHeight;

  const granuleY = (i) => topPad + i * rowHeight + rowHeight / 2;
  const classSpacing = (granules.length * rowHeight) / Math.max(1, classValues.length);
  const classY = (i) => topPad + i * classSpacing + classSpacing / 2;

  let edges = "";
  let leftNodes = "";
  let rightNodes = "";

  granules.forEach((g, i) => {
    const y1 = granuleY(i);
    const r = 4 + 10 * Math.sqrt(g.size / maxSize);
    leftNodes += `<g class="granule-node"><circle cx="${leftX}" cy="${y1}" r="${r.toFixed(1)}" fill="#8a97b8"></circle><text x="${leftX - r - 6}" y="${y1 + 3}" text-anchor="end">${g.signature.join(",")}</text></g>`;

    Object.entries(g.composition).forEach(([value, count]) => {
      const ci = classValues.findIndex((v) => String(v) === String(value));
      if (ci < 0) return;
      const y2 = classY(ci);
      const strokeWidth = 1 + 5 * (count / g.size);
      const color = classColor(data, value);
      edges += `<path class="graph-edge" data-granule="${i}" data-class="${ci}" d="M${leftX},${y1} C${(leftX + rightX) / 2},${y1} ${(leftX + rightX) / 2},${y2} ${rightX},${y2}" stroke="${color}" stroke-width="${strokeWidth.toFixed(1)}"></path>`;
    });
  });

  classValues.forEach((v, i) => {
    const y = classY(i);
    rightNodes += `<g class="class-node"><circle cx="${rightX}" cy="${y}" r="9" fill="${classColor(data, v)}"></circle><text x="${rightX + 16}" y="${y + 4}">${v}</text></g>`;
  });

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" class="granule-graph-svg" role="img" aria-label="Grafo bipartito granulo-decision">
      ${edges}
      ${leftNodes}
      ${rightNodes}
    </svg>
    <p class="hint">${granules.length < data.granules.length ? `Mostrando los ${granules.length} granulos mas grandes de ${data.granules.length}.` : ""}</p>`;

  container.querySelectorAll(".graph-edge").forEach((edge) => {
    edge.addEventListener("mouseenter", () => edge.classList.add("hover"));
    edge.addEventListener("mouseleave", () => edge.classList.remove("hover"));
  });

  el("granule-graph-section").classList.remove("hidden");
}

// ---------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------

el("load-sample-btn").addEventListener("click", loadSample);
el("upload-btn").addEventListener("click", uploadFile);
el("analyze-btn").addEventListener("click", analyze);
el("explore-reducts-btn").addEventListener("click", exploreReducts);

initSampleDatasets().catch((err) => showError(`No se pudieron cargar los datasets de ejemplo: ${err.message}`));

