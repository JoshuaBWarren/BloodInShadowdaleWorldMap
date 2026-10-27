
const MAP_DATA = "assets/shadowdale-map.png";

const ICONS = {};
for (let n = 1; n <= 60; n++) {
  ICONS[n] = `assets/markers/${String(n).padStart(2, "0")}.png`;
}

const $ = id => document.getElementById(id);
const stage = $("stage");
const canvas = $("canvas");
const pins = $("pins");

$("land").src = MAP_DATA;

const W = 1447;
const H = 1087;
const IS_EDITOR = window.__SHADOWDALE_EDITOR__ === true;

let locations = [];
let dm = IS_EDITOR;
let placing = false;
let scale = 1;
let x = 0;
let y = 0;
let drag = null;
let dragged = false;
let placingSpot = { u: 0.5, v: 0.5 };

function escapeHTML(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

// LOAD AND SAVE LOCATIONS

async function loadLocations() {
  try {
    const response = await fetch("locations.json", {
      cache: "no-store"
    });

    if (!response.ok) {
      throw Error("Cannot load locations.json");
    }

    const content = await response.json();
    const data = Array.isArray(content)
      ? content
      : content.locations;

    if (!Array.isArray(data)) {
      throw Error("Invalid locations.json format");
    }

    locations = data;
    render();

  } catch (err) {
    console.error(err);
    $("panelTip").textContent =
      "Unable to load locations.json: " + err.message;
  }
}

async function save() {
  if (!IS_EDITOR) {
    throw Error("Read-only player site");
  }

  const response = await fetch("/api/locations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ locations })
  });

  if (!response.ok) {
    const msg = await response.text();
    throw Error(msg || "Save failed");
  }

  return await response.json();
}

async function commitChange(before) {
  try {
    await save();
    render();
    closeModal();
    setSaveStatus("Saved directly to locations.json ✓");

  } catch (err) {
    locations = before;
    render();
    alert("Changes were not saved: " + err.message);
  }
}

function setSaveStatus(message) {
  $("saveStatus").textContent = message;
}

// MAP NAVIGATION

function transform() {
  canvas.style.transform =
    `translate(${x}px, ${y}px) scale(${scale})`;
}

function fit() {
  const rect = stage.getBoundingClientRect();

  scale = Math.min(
    rect.width / W,
    rect.height / H
  ) * 0.97;

  x = (rect.width - W * scale) / 2;
  y = (rect.height - H * scale) / 2;

  transform();
}

function zoom(
  mult,
  cx = stage.clientWidth / 2,
  cy = stage.clientHeight / 2
) {
  const s = Math.max(
    0.16,
    Math.min(10, scale * mult)
  );

  x = cx - (cx - x) * s / scale;
  y = cy - (cy - y) * s / scale;
  scale = s;

  transform();
}

// MODAL MANAGEMENT

function modal(content) {
  $("modal").innerHTML = content;
  $("shade").classList.add("show");
}

function closeModal() {
  $("shade").classList.remove("show");
  $("modal").innerHTML = "";
}

// Make the function available to HTML buttons.
window.closeModal = closeModal;

// Close when clicking outside the modal.
$("shade").addEventListener("click", e => {
  if (e.target === $("shade")) {
    closeModal();
  }
});

// Close with Escape.
document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    closeModal();
  }
});

// VIEW LOCATION

function openLoc(id) {
  const p = locations.find(a => a.id === id);
  if (!p) return;

  modal(`
    <div class="headrow">
      <div>
        <div class="tag">LOCATION #${p.number}</div>
        <h2>${escapeHTML(p.title)}</h2>
      </div>
      <button class="x" onclick="closeModal()">×</button>
    </div>

    ${p.photo ? `
      <img
        class="feature"
        src="${escapeHTML(p.photo)}"
        alt="Location illustration"
      >
    ` : ""}

    <p>
      ${escapeHTML(p.description) ||
        '<span class="empty">No description yet.</span>'}
    </p>

    <div class="modal-foot">
      ${dm ? `
        <button
          class="btn gold"
          onclick="editLoc('${p.id}')"
        >
          Edit location
        </button>
      ` : ""}

      <button
        class="btn"
        onclick="closeModal()"
      >
        Close
      </button>
    </div>
  `);
}

// RENDER MAP MARKERS AND LOCATION LIST

function render() {
  pins.replaceChildren();

  const query = $("filter").value.toLowerCase();
  const list = $("list");

  list.replaceChildren();

  const sorted = [...locations].sort(
    (a, b) => a.number - b.number
  );

  for (const p of sorted) {
    const b = document.createElement("button");

    b.className = "pin";
    b.style.left = (p.u * 100) + "%";
    b.style.top = (p.v * 100) + "%";
    b.title = `#${p.number} ${p.title}`;
    b.setAttribute("aria-label", b.title);

    const im = document.createElement("img");

    im.src = ICONS[p.number] || ICONS[1];
    im.alt = String(p.number);

    b.append(im);

    b.onclick = e => {
      e.stopPropagation();
      openLoc(p.id);
    };

    pins.appendChild(b);

    const searchText =
      `${p.number} ${p.title} ${p.description}`.toLowerCase();

    if (!searchText.includes(query)) {
      continue;
    }

    const row = document.createElement("button");

    row.className = "place";
    row.textContent = `#${p.number} · ${p.title}`;

    row.onclick = () => {
      x = stage.clientWidth / 2 - p.u * W * scale;
      y = stage.clientHeight / 2 - p.v * H * scale;

      transform();
      openLoc(p.id);
    };

    list.append(row);
  }

  $("count").textContent = `(${locations.length})`;

  if (!list.children.length) {
    const d = document.createElement("p");

    d.className = "empty";
    d.textContent = locations.length
      ? "No locations match your search."
      : "No locations placed yet.";

    list.append(d);
  }
}

// ADD AND EDIT LOCATIONS

function nextNumber() {
  for (let n = 1; n <= 60; n++) {
    if (!locations.some(p => p.number === n)) {
      return n;
    }
  }

  return 0;
}

function editLoc(id) {
  let p = locations.find(a => a.id === id);
  const newP = !p;

  if (!p) {
    p = {
      id: "loc" + Date.now() +
        Math.random().toString(36).slice(2),
      u: placingSpot.u,
      v: placingSpot.v,
      number: nextNumber(),
      title: "",
      description: "",
      photo: ""
    };
  }

  modal(`
    <div class="headrow">
      <h2>${newP ? "Add" : "Edit"} location</h2>

      <button
        class="x"
        onclick="closeModal()"
      >
        ×
      </button>
    </div>

    <label>Marker number (1–60)</label>
    <input
      type="number"
      id="pNum"
      min="1"
      max="60"
      value="${p.number}"
    >

    <label>Location name</label>
    <input
      id="pTitle"
      maxlength="120"
      value="${escapeHTML(p.title)}"
      placeholder="e.g. The Old Skull Inn"
    >

    <label>Player-facing description</label>
    <textarea
      id="pDesc"
      placeholder="What will your players see when they click this marker?"
    >${escapeHTML(p.description)}</textarea>

    <label>Image URL (optional)</label>
    <input
      id="pPhoto"
      value="${escapeHTML(p.photo)}"
      placeholder="https://..."
    >

    <p class="note">
      For illustrations, paste a public image URL.
      The map itself is already built into this website.
    </p>

    <div class="modal-foot">
      ${newP ? "" : `
        <button
          class="btn danger"
          id="deleteP"
        >
          Delete
        </button>
      `}

      <button
        class="btn"
        onclick="closeModal()"
      >
        Cancel
      </button>

      <button
        class="btn gold"
        id="saveP"
      >
        Save location
      </button>
    </div>
  `);

  $("saveP").onclick = async () => {
    const n = Number($("pNum").value);
    const title = $("pTitle").value.trim();

    if (!Number.isInteger(n) || n < 1 || n > 60) {
      alert("Choose a number between 1 and 60.");
      return;
    }

    if (locations.some(
      t => t.id !== p.id && t.number === n
    )) {
      alert("That marker number is already used.");
      return;
    }

    if (!title) {
      $("pTitle").focus();
      return;
    }

    const before = locations.map(a => ({ ...a }));

    p.number = n;
    p.title = title;
    p.description = $("pDesc").value;
    p.photo = $("pPhoto").value.trim();

    if (newP) {
      locations.push(p);
    }

    await commitChange(before);
  };

  if (!newP) {
    $("deleteP").onclick = async () => {
      if (confirm("Delete this location?")) {
        const before = locations.map(a => ({ ...a }));

        locations = locations.filter(
          t => t.id !== p.id
        );

        await commitChange(before);
      }
    };
  }
}

// EXPOSE EDIT HANDLER FOR MODAL BUTTONS

window.editLoc = editLoc;

// DM MODE

function setDM() {
  dm = IS_EDITOR;

  for (const id of [
    "addBtn",
    "exportBtn",
    "importBtn"
  ]) {
    $(id).classList.toggle("hide", !dm);
  }

  $("hint").textContent = dm
    ? "Local DM editor · Click Add location, then click the map to place a marker."
    : "Drag to pan · Scroll to zoom · Click a numbered circle to open its story";

  $("panelTip").textContent = dm
    ? "Local editor: saving writes directly to locations.json. Commit and push the changed file to publish."
    : "The whole map is yours to explore.";

  $("saveStatus").classList.toggle("hide", !dm);
}

setDM();

// ADD LOCATION BUTTON

$("addBtn").onclick = () => {
  if (nextNumber() === 0) {
    alert("All 60 numbers are in use.");
    return;
  }

  placing = !placing;

  $("addBtn").textContent = placing
    ? "Cancel placement"
    : "+ Add location";

  $("hint").textContent = placing
    ? "Click the map to position your numbered marker."
    : "DM mode: Add location, then click the map to place its marker.";
};

// MAP POINTER CONTROLS

stage.addEventListener("pointerdown", e => {
  if (e.target.closest(
    "button,input,.panel,.controls,.bottom"
  )) {
    return;
  }

  drag = {
    x: e.clientX,
    y: e.clientY,
    origX: x,
    origY: y,
    id: e.pointerId
  };

  dragged = false;
  stage.setPointerCapture(e.pointerId);
});

stage.addEventListener("pointermove", e => {
  if (!drag) return;

  const dx = e.clientX - drag.x;
  const dy = e.clientY - drag.y;

  if (Math.abs(dx) + Math.abs(dy) > 5) {
    dragged = true;
  }

  if (dragged) {
    stage.classList.add("drag");

    x = drag.origX + dx;
    y = drag.origY + dy;

    transform();
  }
});

stage.addEventListener("pointerup", e => {
  if (!drag) return;

  if (!dragged && placing) {
    const r = stage.getBoundingClientRect();

    const u =
      (e.clientX - r.left - x) / scale / W;

    const v =
      (e.clientY - r.top - y) / scale / H;

    if (
      u >= 0 && u <= 1 &&
      v >= 0 && v <= 1
    ) {
      placingSpot = { u, v };
      placing = false;

      $("addBtn").textContent = "+ Add location";

      $("hint").textContent =
        "DM mode: Add location, then click the map to place its marker.";

      editLoc(null);
    }
  }

  drag = null;
  stage.classList.remove("drag");
});

stage.addEventListener("pointercancel", () => {
  drag = null;
  stage.classList.remove("drag");
});

// MOUSE WHEEL ZOOM

stage.addEventListener("wheel", e => {
  if (e.target.closest(".panel")) {
    return;
  }

  e.preventDefault();

  const r = stage.getBoundingClientRect();

  zoom(
    Math.exp(-e.deltaY * 0.001),
    e.clientX - r.left,
    e.clientY - r.top
  );

}, { passive: false });

// MAP BUTTONS

$("plus").onclick = () => zoom(1.3);
$("minus").onclick = () => zoom(1 / 1.3);
$("fitBtn").onclick = fit;

$("filter").addEventListener("input", render);

// EXPORT LOCATIONS

$("exportBtn").onclick = () => {
  const blob = new Blob(
    [
      JSON.stringify({
        format: "shadowdale-locations-v2",
        locations
      }, null, 2)
    ],
    { type: "application/json" }
  );

  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);

  a.href = url;
  a.download = "blood-in-shadowdale-locations.json";
  a.click();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// IMPORT LOCATIONS

$("importBtn").onclick = () => {
  $("importFile").click();
};

$("importFile").onchange = async e => {
  const f = e.target.files[0];

  if (!f) return;

  try {
    const data = JSON.parse(await f.text());

    const arr = Array.isArray(data)
      ? data
      : data.locations;

    if (
      !Array.isArray(arr) ||
      !arr.every(p =>
        Number.isInteger(p.number) &&
        p.number >= 1 &&
        p.number <= 60 &&
        typeof p.title === "string" &&
        typeof p.u === "number" &&
        typeof p.v === "number" &&
        p.u >= 0 &&
        p.u <= 1 &&
        p.v >= 0 &&
        p.v <= 1 &&
        typeof p.id === "string"
      )
    ) {
      throw Error("Invalid locations file");
    }

    if (!confirm(
      "Replace all current locations with the imported file?"
    )) {
      return;
    }

    const before = locations.map(a => ({ ...a }));

    locations = arr.map(p => ({
      id: p.id,
      number: p.number,
      title: p.title,
      description: String(p.description || ""),
      photo: String(p.photo || ""),
      u: p.u,
      v: p.v
    }));

    await commitChange(before);

  } catch (err) {
    alert("Import failed: " + err.message);
  }

  e.target.value = "";
};

// INITIALIZE APPLICATION

window.addEventListener("resize", fit);

render();
requestAnimationFrame(fit);
loadLocations();
