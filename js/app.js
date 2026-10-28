
// Blood in Shadowdale — Interactive Map
// Supports Map Locations, Murder Locations, and Session Records.
// Existing locations without a type are treated as Map Locations.

const MAP_IMAGE = "assets/shadowdale-map.png";

const MARKER_IMAGE = {
  murder: "assets/markers/murder.png",
  session: "assets/markers/session.png"
};

const MAP_WIDTH = 1447;
const MAP_HEIGHT = 1087;
const IS_EDITOR = window.__SHADOWDALE_EDITOR__ === true;

const $ = (id) => document.getElementById(id);

const stage = $("stage");
const canvas = $("canvas");
const pins = $("pins");

$("land").src = MAP_IMAGE;

let locations = [];
let placing = false;
let placingSpot = { u: 0.5, v: 0.5 };
let scale = 1;
let x = 0;
let y = 0;
let drag = null;
let dragged = false;

// LOCATION TYPES

function locationType(location) {
  return ["map", "murder", "session"].includes(location.type)
    ? location.type
    : "map";
}

function markerImage(location) {
  const type = locationType(location);

  if (type !== "map") {
    return MARKER_IMAGE[type];
  }

  return `assets/markers/${String(location.number).padStart(2, "0")}.png`;
}

function typeName(type) {
  return {
    map: "Map Location",
    murder: "Murder Location",
    session: "Session Record"
  }[type];
}

function locationLabel(location) {
  const type = locationType(location);

  if (type === "map") {
    return `#${location.number} · ${location.title}`;
  }

  return `${type === "murder" ? "✕ Murder" : "▤ Session"} · ${location.title}`;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

// VALIDATE IMPORTED LOCATIONS

function normalizedImport(item) {
  if (!item || typeof item !== "object") {
    throw Error("Invalid location entry.");
  }

  const type = locationType(item);

  const result = {
    id: item.id,
    type,
    title: item.title,
    description: String(item.description ?? ""),
    photo: String(item.photo ?? ""),
    u: item.u,
    v: item.v
  };

  if (type === "map") {
    result.number = item.number;
  }

  if (
    typeof result.id !== "string" ||
    !result.id ||
    typeof result.title !== "string" ||
    !result.title.trim() ||
    !Number.isFinite(result.u) ||
    result.u < 0 ||
    result.u > 1 ||
    !Number.isFinite(result.v) ||
    result.v < 0 ||
    result.v > 1 ||
    (
      type === "map" &&
      (
        !Number.isInteger(result.number) ||
        result.number < 1 ||
        result.number > 60
      )
    )
  ) {
    throw Error("Invalid location fields.");
  }

  if (
    item.type !== undefined &&
    !["map", "murder", "session"].includes(item.type)
  ) {
    throw Error("Unknown location type.");
  }

  return result;
}

// LOAD LOCATIONS

async function loadLocations() {
  try {
    const response = await fetch("locations.json", {
      cache: "no-store"
    });

    if (!response.ok) {
      throw Error("Cannot load locations.json");
    }

    const data = await response.json();

    const entries = Array.isArray(data)
      ? data
      : data.locations;

    if (!Array.isArray(entries)) {
      throw Error("Invalid locations.json format");
    }

    locations = entries.map(normalizedImport);

    render();

  } catch (error) {
    console.error(error);

    $("panelTip").textContent =
      `Unable to load locations.json: ${error.message}`;
  }
}

// SAVE LOCATIONS

async function saveLocations() {
  if (!IS_EDITOR) {
    throw Error("This is the read-only player website.");
  }

  const response = await fetch("/api/locations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ locations })
  });

  if (!response.ok) {
    throw Error(await response.text() || "Save failed");
  }
}

async function commitChange(previous) {
  try {
    await saveLocations();

    render();
    closeModal();

    $("saveStatus").textContent =
      "Saved to locations.json ✓";

  } catch (error) {
    locations = previous;
    render();

    alert(`Changes were not saved: ${error.message}`);
  }
}

// MAP NAVIGATION

function transform() {
  canvas.style.transform =
    `translate(${x}px, ${y}px) scale(${scale})`;
}

function fitMap() {
  const rect = stage.getBoundingClientRect();

  scale = Math.min(
    rect.width / MAP_WIDTH,
    rect.height / MAP_HEIGHT
  ) * 0.97;

  x = (rect.width - MAP_WIDTH * scale) / 2;
  y = (rect.height - MAP_HEIGHT * scale) / 2;

  transform();
}

function zoom(
  multiplier,
  centerX = stage.clientWidth / 2,
  centerY = stage.clientHeight / 2
) {
  const next = Math.max(
    0.16,
    Math.min(10, scale * multiplier)
  );

  x = centerX - (centerX - x) * (next / scale);
  y = centerY - (centerY - y) * (next / scale);

  scale = next;

  transform();
}

// MODAL CONTROLS

function showModal(html) {
  $("modal").innerHTML = html;
  $("shade").classList.add("show");
}

function closeModal() {
  $("shade").classList.remove("show");
  $("modal").innerHTML = "";
}

// Clicking outside closes modal.
$("shade").addEventListener("click", (event) => {
  if (event.target === $("shade")) {
    closeModal();
  }
});

// X, Cancel, and Close buttons.
$("modal").addEventListener("click", (event) => {
  if (event.target.closest("[data-close]")) {
    closeModal();
  }
});

// Escape key.
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeModal();
  }
});

// VIEW LOCATION

function openLocation(id) {
  const location = locations.find(
    (item) => item.id === id
  );

  if (!location) return;

  const type = locationType(location);

  const tag = type === "map"
    ? `MAP LOCATION #${location.number}`
    : typeName(type).toUpperCase();

  showModal(`
    <div class="headrow">
      <div>
        <div class="tag">${tag}</div>
        <h2>${escapeHTML(location.title)}</h2>
      </div>

      <button
        class="x"
        type="button"
        data-close
        aria-label="Close"
      >×</button>
    </div>

    ${
      location.photo
        ? `<img
             class="feature"
             src="${escapeHTML(location.photo)}"
             alt="Location illustration"
           >`
        : ""
    }

    <p>
      ${
        escapeHTML(location.description) ||
        '<span class="empty">No description yet.</span>'
      }
    </p>

    <div class="modal-foot">
      ${
        IS_EDITOR
          ? `<button
               class="btn gold"
               type="button"
               id="editView"
             >Edit location</button>`
          : ""
      }

      <button
        class="btn"
        type="button"
        data-close
      >Close</button>
    </div>
  `);

  if (IS_EDITOR) {
    $("editView").addEventListener(
      "click",
      () => editLocation(location.id)
    );
  }
}

// RENDER MARKERS AND LOCATION LIST

function render() {
  pins.replaceChildren();

  const list = $("list");
  list.replaceChildren();

  const query = $("filter").value.toLowerCase().trim();

  const order = {
    map: 0,
    murder: 1,
    session: 2
  };

  const sorted = [...locations].sort((a, b) => {
    const difference =
      order[locationType(a)] - order[locationType(b)];

    if (difference) return difference;

    if (locationType(a) === "map") {
      return a.number - b.number;
    }

    return a.title.localeCompare(b.title);
  });

  for (const location of sorted) {
    const marker = document.createElement("button");

    marker.type = "button";
    marker.className = "pin";

    marker.style.left = `${location.u * 100}%`;
    marker.style.top = `${location.v * 100}%`;

    marker.title = locationLabel(location);

    marker.setAttribute(
      "aria-label",
      marker.title
    );

    const image = document.createElement("img");

    image.src = markerImage(location);
    image.alt = "";

    marker.append(image);

    marker.addEventListener("click", (event) => {
      event.stopPropagation();
      openLocation(location.id);
    });

    pins.append(marker);

    const searchText =
      `${locationLabel(location)} ${location.description}`
        .toLowerCase();

    if (!searchText.includes(query)) {
      continue;
    }

    const row = document.createElement("button");

    row.type = "button";
    row.className = "place";
    row.textContent = locationLabel(location);

    row.addEventListener("click", () => {
      x =
        stage.clientWidth / 2 -
        location.u * MAP_WIDTH * scale;

      y =
        stage.clientHeight / 2 -
        location.v * MAP_HEIGHT * scale;

      transform();
      openLocation(location.id);
    });

    list.append(row);
  }

  $("count").textContent = `(${locations.length})`;

  if (!list.children.length) {
    const empty = document.createElement("p");

    empty.className = "empty";

    empty.textContent = locations.length
      ? "No locations match your search."
      : "No locations placed yet.";

    list.append(empty);
  }
}

// FIND AVAILABLE MAP NUMBER

function nextNumber(excludingId = null) {
  for (let number = 1; number <= 60; number++) {
    if (
      !locations.some(
        (item) =>
          item.id !== excludingId &&
          locationType(item) === "map" &&
          item.number === number
      )
    ) {
      return number;
    }
  }

  return 0;
}

// ADD OR EDIT A LOCATION

function editLocation(id) {
  if (!IS_EDITOR) return;

  const existing = locations.find(
    (item) => item.id === id
  );

  const isNew = !existing;

  const location = existing || {
    id:
      `loc${Date.now()}` +
      Math.random().toString(36).slice(2),

    type: "map",
    number: nextNumber(),
    title: "",
    description: "",
    photo: "",

    ...placingSpot
  };

  const currentType = locationType(location);

  showModal(`
    <div class="headrow">
      <h2>${isNew ? "Add" : "Edit"} location</h2>

      <button
        class="x"
        type="button"
        data-close
        aria-label="Close"
      >×</button>
    </div>

    <label for="pType">Location type</label>

    <select
      id="pType"
      style="
        width:100%;
        padding:10px;
        color:white;
        background:#0e1c16;
        border:1px solid #6b806f;
        border-radius:6px;
      "
    >
      <option
        value="map"
        ${currentType === "map" ? "selected" : ""}
      >Map Location</option>

      <option
        value="murder"
        ${currentType === "murder" ? "selected" : ""}
      >Murder Location</option>

      <option
        value="session"
        ${currentType === "session" ? "selected" : ""}
      >Session Record</option>
    </select>

    <div id="numberRow">
      <label for="pNum">
        Marker number (1–60)
      </label>

      <input
        id="pNum"
        type="number"
        min="1"
        max="60"
        value="${location.number ?? nextNumber(location.id)}"
      >
    </div>

    <label for="pTitle" id="titleLabel">
      Location name
    </label>

    <input
      id="pTitle"
      maxlength="120"
      value="${escapeHTML(location.title)}"
      placeholder="e.g. The Old Skull Inn"
    >

    <label for="pDesc">
      Player-facing description
    </label>

    <textarea
      id="pDesc"
      placeholder="What should players read when they click here?"
    >${escapeHTML(location.description)}</textarea>

    <label for="pPhoto">
      Image URL (optional)
    </label>

    <input
      id="pPhoto"
      value="${escapeHTML(location.photo)}"
      placeholder="https://..."
    >

    <p class="note">
      The description appears in the player's popup.
      Changes are published when you push to GitHub.
    </p>

    <div class="modal-foot">
      ${
        isNew
          ? ""
          : `<button
               class="btn danger"
               type="button"
               id="deleteP"
             >Delete</button>`
      }

      <button
        class="btn"
        type="button"
        data-close
      >Cancel</button>

      <button
        class="btn gold"
        type="button"
        id="saveP"
      >Save location</button>
    </div>
  `);

  // Show fields appropriate to the selected type.
  function updateTypeFields() {
    const type = $("pType").value;

    $("numberRow").style.display =
      type === "map" ? "" : "none";

    $("titleLabel").textContent =
      type === "session"
        ? "Session date (title)"
        : type === "murder"
          ? "Murder site title"
          : "Location name";

    $("pTitle").placeholder =
      type === "session"
        ? "e.g. October 27, 2026"
        : type === "murder"
          ? "e.g. Murder of Elira"
          : "e.g. The Old Skull Inn";

    if (
      type === "map" &&
      !(Number($("pNum").value) >= 1)
    ) {
      $("pNum").value =
        nextNumber(location.id) || "";
    }
  }

  $("pType").addEventListener(
    "change",
    updateTypeFields
  );

  updateTypeFields();

  // Save location.
  $("saveP").addEventListener("click", async () => {
    const type = $("pType").value;
    const title = $("pTitle").value.trim();
    const number = Number($("pNum").value);

    if (!title) {
      alert(
        type === "session"
          ? "Enter a session date."
          : "Enter a location title."
      );

      $("pTitle").focus();
      return;
    }

    if (type === "map") {
      if (
        !Number.isInteger(number) ||
        number < 1 ||
        number > 60
      ) {
        alert(
          "Choose a marker number between 1 and 60."
        );
        return;
      }

      if (
        locations.some(
          (item) =>
            item.id !== location.id &&
            locationType(item) === "map" &&
            item.number === number
        )
      ) {
        alert(
          "That numbered map marker is already used."
        );
        return;
      }
    }

    const previous = locations.map(
      (item) => ({ ...item })
    );

    location.type = type;
    location.title = title;
    location.description = $("pDesc").value;
    location.photo = $("pPhoto").value.trim();

    if (type === "map") {
      location.number = number;
    } else {
      delete location.number;
    }

    if (isNew) {
      locations.push(location);
    }

    await commitChange(previous);
  });

  // Delete existing location.
  if (!isNew) {
    $("deleteP").addEventListener(
      "click",
      async () => {
        if (!confirm("Delete this location?")) {
          return;
        }

        const previous = locations.map(
          (item) => ({ ...item })
        );

        locations = locations.filter(
          (item) => item.id !== location.id
        );

        await commitChange(previous);
      }
    );
  }
}

// DM EDITOR MODE

function setEditorMode() {
  for (const id of [
    "addBtn",
    "exportBtn",
    "importBtn"
  ]) {
    $(id).classList.toggle(
      "hide",
      !IS_EDITOR
    );
  }

  $("saveStatus").classList.toggle(
    "hide",
    !IS_EDITOR
  );

  $("hint").textContent = IS_EDITOR
    ? "Local DM editor · Add a location, then click the map to position its marker."
    : "Drag to pan · Scroll to zoom · Click a marker for information";

  $("panelTip").textContent = IS_EDITOR
    ? "Saving updates locations.json. Commit and push to publish changes."
    : "Explore Shadowdale's locations, murder scenes, and session records.";
}

setEditorMode();

// ADD LOCATION BUTTON

$("addBtn").addEventListener("click", () => {
  if (!IS_EDITOR) return;

  placing = !placing;

  $("addBtn").textContent = placing
    ? "Cancel placement"
    : "+ Add location";

  $("hint").textContent = placing
    ? "Click anywhere on the map to place the marker. Choose its type in the next window."
    : "Local DM editor · Add a location, then click the map to position its marker.";
});

// MAP POINTER EVENTS

stage.addEventListener("pointerdown", (event) => {
  if (
    event.target.closest(
      "button,input,.panel,.controls,.bottom"
    )
  ) {
    return;
  }

  drag = {
    x: event.clientX,
    y: event.clientY,
    origX: x,
    origY: y
  };

  dragged = false;

  stage.setPointerCapture(event.pointerId);
});

stage.addEventListener("pointermove", (event) => {
  if (!drag) return;

  const dx = event.clientX - drag.x;
  const dy = event.clientY - drag.y;

  if (Math.abs(dx) + Math.abs(dy) > 5) {
    dragged = true;
  }

  if (!dragged) return;

  stage.classList.add("drag");

  x = drag.origX + dx;
  y = drag.origY + dy;

  transform();
});

stage.addEventListener("pointerup", (event) => {
  if (!drag) return;

  if (!dragged && placing && IS_EDITOR) {
    const rect = stage.getBoundingClientRect();

    const u =
      (event.clientX - rect.left - x) /
      scale / MAP_WIDTH;

    const v =
      (event.clientY - rect.top - y) /
      scale / MAP_HEIGHT;

    if (
      u >= 0 &&
      u <= 1 &&
      v >= 0 &&
      v <= 1
    ) {
      placingSpot = { u, v };

      placing = false;

      $("addBtn").textContent =
        "+ Add location";

      $("hint").textContent =
        "Local DM editor · Add a location, then click the map to position its marker.";

      editLocation(null);
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

stage.addEventListener("wheel", (event) => {
  if (event.target.closest(".panel")) return;

  event.preventDefault();

  const rect = stage.getBoundingClientRect();

  zoom(
    Math.exp(-event.deltaY * 0.001),
    event.clientX - rect.left,
    event.clientY - rect.top
  );

}, { passive: false });

// MAP CONTROLS

$("plus").addEventListener(
  "click",
  () => zoom(1.3)
);

$("minus").addEventListener(
  "click",
  () => zoom(1 / 1.3)
);

$("fitBtn").addEventListener(
  "click",
  fitMap
);

$("filter").addEventListener(
  "input",
  render
);

// EXPORT LOCATIONS

$("exportBtn").addEventListener("click", () => {
  if (!IS_EDITOR) return;

  const blob = new Blob(
    [
      JSON.stringify(
        {
          format: "shadowdale-locations-v3",
          locations
        },
        null,
        2
      )
    ],
    {
      type: "application/json"
    }
  );

  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");

  link.href = url;
  link.download =
    "blood-in-shadowdale-locations.json";

  link.click();

  setTimeout(
    () => URL.revokeObjectURL(url),
    1000
  );
});

// IMPORT LOCATIONS

$("importBtn").addEventListener("click", () => {
  if (IS_EDITOR) {
    $("importFile").click();
  }
});

$("importFile").addEventListener(
  "change",
  async (event) => {
    if (!IS_EDITOR) return;

    const file = event.target.files[0];

    if (!file) return;

    try {
      const data = JSON.parse(
        await file.text()
      );

      const values = Array.isArray(data)
        ? data
        : data.locations;

      if (!Array.isArray(values)) {
        throw Error("Invalid locations file.");
      }

      const imported = values.map(
        normalizedImport
      );

      const used = new Set();

      for (const item of imported) {
        if (locationType(item) !== "map") {
          continue;
        }

        if (used.has(item.number)) {
          throw Error(
            "Duplicate numbered map marker."
          );
        }

        used.add(item.number);
      }

      if (
        !confirm(
          "Replace all current locations with the imported file?"
        )
      ) {
        return;
      }

      const previous = locations.map(
        (item) => ({ ...item })
      );

      locations = imported;

      await commitChange(previous);

    } catch (error) {
      alert(
        `Import failed: ${error.message}`
      );

    } finally {
      event.target.value = "";
    }
  }
);

// INITIALIZE

window.addEventListener(
  "resize",
  fitMap
);

render();

requestAnimationFrame(fitMap);

loadLocations();
