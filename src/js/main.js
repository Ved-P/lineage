import {
  newTree,
  createPerson,
  placeAsRoot,
  buildFamily,
  addChildrenToFamily,
  addParentToFamily,
  buildPedigreeView,
  roleAvailable,
  searchPersons,
  fullName,
  altFullName,
  ensureLastNameColor,
  PALETTE,
} from "./model.js";
import { renderTree } from "./render.js";
import { serializeTree, deserializeTree } from "./persistence.js";
import {
  isTauri,
  pickSavePath,
  pickOpenPath,
  writeTextFile,
  readTextFile,
  guardWindowClose,
  forceCloseWindow,
} from "./fileio.js";

// ===================== App state =====================
let tree = null;
let selectedPersonId = null;
let reorderMode = false;
let familyModalState = null; // built up while the Add-Family modal is open
let pickTarget = null; // which slot the pick-person sub-modal is filling
let colorModalMode = null; // 'family' | 'lastname'
let colorModalTarget = null; // familyId or lastName string
let closeIntent = null; // 'to-start' | 'window' — what to do after the save-before-close prompt
let pedigreeFocusId = null;
let zoomLevel = 1;
const ZOOM_MIN = 0.25, ZOOM_MAX = 2.5, ZOOM_STEP = 0.1;

// ===================== DOM refs =====================
const $ = (sel) => document.querySelector(sel);
const startScreen = $("#start-screen");
const appScreen = $("#app-screen");
const svg = $("#tree-svg");
const treeTitle = $("#tree-title");
const dirtyIndicator = $("#dirty-indicator");
const detailsPanel = $("#details-panel");

// ===================== Rendering =====================
function render() {
  const viewTree = pedigreeFocusId ? buildPedigreeView(tree, pedigreeFocusId) : tree;
  renderTree(viewTree, svg, {
    reorderMode,
    selectedId: selectedPersonId,
    onBoxClick: selectPerson,
    onLineClick: openColorModal,
    onReordered: render,
  });
  dirtyIndicator.classList.toggle("hidden", !tree.dirty);
  applyZoom();
}

function applyZoom() {
  const vb = svg.viewBox.baseVal;
  if (!vb || !vb.width) return;
  svg.setAttribute("width", vb.width * zoomLevel);
  svg.setAttribute("height", vb.height * zoomLevel);
  $("#zoom-level").textContent = Math.round(zoomLevel * 100) + "%";
}

function selectPerson(id) {
  selectedPersonId = id;
  const p = tree.persons[id];
  $("#details-name").textContent = fullName(p);
  const alt = altFullName(p);
  $("#details-alt-name").textContent = alt;
  $("#details-alt-name").classList.toggle("hidden", !alt);
  detailsPanel.classList.remove("hidden");
  render();
}

$("#details-close").addEventListener("click", () => {
  selectedPersonId = null;
  detailsPanel.classList.add("hidden");
  render();
});

svg.addEventListener("click", () => {
  selectedPersonId = null;
  detailsPanel.classList.add("hidden");
  render();
});

// ===================== Start screen =====================
$("#btn-new-family").addEventListener("click", () => openModal("#modal-first-person"));

$("#btn-load-savefile").addEventListener("click", async () => {
  const path = await pickOpenPath();
  if (!path) return;
  const text = await readTextFile(path);
  tree = deserializeTree(text);
  tree.filePath = path;
  enterApp(path.split(/[\\/]/).pop().replace(/\.lng$/, ""));
});

$("#form-first-person").addEventListener("submit", (e) => {
  e.preventDefault();
  const data = formToObject(e.target);
  tree = newTree();
  const root = createPerson(tree, data, 0);
  placeAsRoot(tree, root);
  tree.dirty = false;
  closeModal("#modal-first-person");
  e.target.reset();
  enterApp("Untitled Family");
});

function enterApp(title) {
  startScreen.classList.add("hidden");
  appScreen.classList.remove("hidden");
  treeTitle.textContent = title || "Untitled Family";
  selectedPersonId = null;
  detailsPanel.classList.add("hidden");
  render();
}

// ===================== Toolbar =====================
$("#btn-reorder-toggle").addEventListener("click", (e) => {
  reorderMode = !reorderMode;
  e.target.classList.toggle("active", reorderMode);
  render();
});

$("#btn-save").addEventListener("click", () => doSave());

$("#btn-close-tree").addEventListener("click", () => {
  if (tree.dirty) {
    closeIntent = "to-start";
    openModal("#modal-confirm-close");
  } else {
    goToStart();
  }
});

function goToStart() {
  appScreen.classList.add("hidden");
  startScreen.classList.remove("hidden");
  tree = null;
}

async function doSave() {
  let path = tree.filePath;
  if (!path) {
    path = await pickSavePath((treeTitle.textContent || "family") + ".lng");
    if (!path) return false;
  }
  await writeTextFile(path, serializeTree(tree));
  tree.filePath = path;
  tree.dirty = false;
  treeTitle.textContent = path.split(/[\\/]/).pop().replace(/\.lng$/, "");
  render();
  return true;
}

// ===================== Save-before-close modal =====================
$("#confirm-discard").addEventListener("click", () => {
  closeModal("#modal-confirm-close");
  finishClose();
});
$("#confirm-cancel").addEventListener("click", () => closeModal("#modal-confirm-close"));
$("#confirm-save").addEventListener("click", async () => {
  const ok = await doSave();
  closeModal("#modal-confirm-close");
  if (ok) finishClose();
});
function finishClose() {
  if (closeIntent === "window") forceCloseWindow();
  else goToStart();
  closeIntent = null;
}

guardWindowClose({
  isDirty: () => !!tree?.dirty,
  onCloseRequested: () => {
    closeIntent = "window";
    openModal("#modal-confirm-close");
  },
});

// ===================== Edit person =====================
$("#details-edit").addEventListener("click", () => {
  const p = tree.persons[selectedPersonId];
  const form = $("#form-edit-person");
  form.given_names.value = p.given_names;
  form.last_name.value = p.last_name;
  form.alt_given_names.value = p.alt_given_names;
  form.alt_last_name.value = p.alt_last_name;
  openModal("#modal-edit-person");
});

$("#form-edit-person").addEventListener("submit", (e) => {
  e.preventDefault();
  const data = formToObject(e.target);
  const p = tree.persons[selectedPersonId];
  Object.assign(p, data);
  ensureLastNameColor(tree, p.last_name);
  tree.dirty = true;
  closeModal("#modal-edit-person");
  selectPerson(selectedPersonId);
  render();
});

// ===================== Add Family modal =====================
$("#details-add-family-as-parent").addEventListener("click", () => openFamilyModal(selectedPersonId, "as-parent"));
$("#details-add-family-as-child").addEventListener("click", () => openFamilyModal(selectedPersonId, "as-child"));
$("#details-change-color").addEventListener("click", () => openLastNameColorModal(tree.persons[selectedPersonId].last_name));
$("#btn-add-family").addEventListener("click", () => openFamilyModal(null, null));

function openFamilyModal(presetAnchorId, presetMode) {
  familyModalState = {
    anchorId: presetAnchorId,
    anchorRole: null,
    parent1: null,
    parent2: null,
    children: [],
  };
  $("#family-step-slots").classList.add("hidden");
  $("#anchor-chosen").classList.add("hidden");
  $("#anchor-search").value = "";
  $("#anchor-search-results").innerHTML = "";
  for (const r of document.querySelectorAll('input[name="anchor-role"]')) r.checked = false;
  $("#btn-confirm-family").disabled = true;

  if (presetAnchorId) {
    chooseAnchor(presetAnchorId);
    if (presetMode === "as-parent") {
      const p = tree.persons[presetAnchorId];
      const role = roleAvailable(p, "parent1") ? "parent1" : roleAvailable(p, "parent2") ? "parent2" : null;
      if (role) selectAnchorRole(role);
    } else if (presetMode === "as-child") {
      selectAnchorRole("child");
    }
  }
  openModal("#modal-family");
}

$("#anchor-search").addEventListener("input", (e) => {
  const results = searchPersons(tree, e.target.value).slice(0, 30);
  const box = $("#anchor-search-results");
  box.innerHTML = "";
  for (const p of results) {
    const div = document.createElement("div");
    div.className = "search-result-item";
    div.textContent = fullName(p) + (altFullName(p) ? ` (${altFullName(p)})` : "");
    div.addEventListener("click", () => chooseAnchor(p.id));
    box.appendChild(div);
  }
});

function chooseAnchor(id) {
  familyModalState.anchorId = id;
  const p = tree.persons[id];
  $("#anchor-search").parentElement.classList.add("hidden");
  const chosen = $("#anchor-chosen");
  chosen.classList.remove("hidden");
  chosen.innerHTML = `<span>${fullName(p)}</span>`;
  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "btn btn-small btn-ghost";
  removeBtn.textContent = "change";
  removeBtn.addEventListener("click", () => {
    familyModalState.anchorId = null;
    familyModalState.anchorRole = null;
    $("#anchor-search").parentElement.classList.remove("hidden");
    chosen.classList.add("hidden");
    $("#family-step-slots").classList.add("hidden");
    $("#btn-confirm-family").disabled = true;
  });
  chosen.appendChild(removeBtn);

  for (const input of document.querySelectorAll('input[name="anchor-role"]')) {
    const available = roleAvailable(p, input.value);
    input.disabled = !available;
    input.checked = false;
  }
  $("#family-step-slots").classList.add("hidden");
  $("#btn-confirm-family").disabled = true;
}

for (const input of document.querySelectorAll('input[name="anchor-role"]')) {
  input.addEventListener("change", (e) => {
    if (e.target.checked) selectAnchorRole(e.target.value);
  });
}

function selectAnchorRole(role) {
  familyModalState.anchorRole = role;
  familyModalState.parent1 = null;
  familyModalState.parent2 = null;
  familyModalState.children = [];
  for (const input of document.querySelectorAll('input[name="anchor-role"]')) {
    input.checked = input.value === role;
  }
  $("#family-step-slots").classList.remove("hidden");
  renderFamilySlots();
}

function renderFamilySlots() {
  const anchor = tree.persons[familyModalState.anchorId];
  const role = familyModalState.anchorRole;

  const fillSlot = (containerSel, role2, filledLabel, allowAdd) => {
    const el = document.querySelector(containerSel);
    if (role === role2) {
      el.innerHTML = `<div class="slot-filled">${fullName(anchor)} <span>(anchor)</span></div>`;
      return;
    }
    const val = familyModalState[role2];
    if (val) {
      const name = val.existingId ? fullName(tree.persons[val.existingId]) : `${val.newData.given_names} ${val.newData.last_name} (new)`;
      el.innerHTML = "";
      const row = document.createElement("div");
      row.className = "slot-filled";
      row.innerHTML = `<span>${name}</span>`;
      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "btn btn-small btn-ghost";
      rm.textContent = "remove";
      rm.addEventListener("click", () => {
        familyModalState[role2] = null;
        renderFamilySlots();
        updateConfirmEnabled();
      });
      row.appendChild(rm);
      el.appendChild(row);
    } else if (allowAdd) {
      el.innerHTML = "";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-small slot-empty-btn";
      btn.textContent = filledLabel;
      btn.addEventListener("click", () => openPickPerson(role2, anchor.generation + (role === "child" ? -1 : 0)));
      el.appendChild(btn);
    } else {
      el.innerHTML = `<span class="hint">not applicable</span>`;
    }
  };

  const parentGen = role === "child" ? anchor.generation - 1 : anchor.generation;
  fillSlot("#slot-parent1 .slot-content", "parent1", "+ Add Parent 1", true);
  fillSlot("#slot-parent2 .slot-content", "parent2", "+ Add Parent 2", true);

  // children list
  const list = $("#children-list");
  list.innerHTML = "";
  if (role === "child") {
    const row = document.createElement("div");
    row.className = "slot-filled";
    row.innerHTML = `<span>${fullName(anchor)} <em>(anchor)</em></span>`;
    list.appendChild(row);
  }
  familyModalState.children.forEach((c, idx) => {
    const name = c.existingId ? fullName(tree.persons[c.existingId]) : `${c.newData.given_names} ${c.newData.last_name} (new)`;
    const row = document.createElement("div");
    row.className = "slot-filled";
    row.innerHTML = `<span>${name}</span>`;
    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "btn btn-small btn-ghost";
    rm.textContent = "remove";
    rm.addEventListener("click", () => {
      familyModalState.children.splice(idx, 1);
      renderFamilySlots();
      updateConfirmEnabled();
    });
    row.appendChild(rm);
    list.appendChild(row);
  });

  updateConfirmEnabled();
}

$("#btn-add-child-slot").addEventListener("click", () => {
  const anchor = tree.persons[familyModalState.anchorId];
  const childGen = familyModalState.anchorRole === "child" ? anchor.generation : anchor.generation + 1;
  openPickPerson("children", childGen);
});

function updateConfirmEnabled() {
  const s = familyModalState;
  const hasSomethingBeyondAnchor = s.parent1 || s.parent2 || s.children.length > 0;
  $("#btn-confirm-family").disabled = !(s.anchorId && s.anchorRole && hasSomethingBeyondAnchor);
}

$("#btn-confirm-family").addEventListener("click", () => {
  buildFamily(tree, familyModalState);
  closeModal("#modal-family");
  render();
});

// ---- pick-person sub-modal (used for parent1/parent2/children slots) ----
function openPickPerson(target, generation) {
  pickTarget = { slot: target, generation };
  $("#pick-search").value = "";
  $("#pick-search-results").innerHTML = "";
  $("#form-pick-new-person").reset();
  switchPickTab("existing");
  openModal("#modal-pick-person");
}

document.querySelectorAll(".pick-tab").forEach((tab) => {
  tab.addEventListener("click", () => switchPickTab(tab.dataset.tab));
});
function switchPickTab(tab) {
  document.querySelectorAll(".pick-tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));
  $("#pick-existing").classList.toggle("hidden", tab !== "existing");
  $("#pick-new").classList.toggle("hidden", tab !== "new");
}

let pickSelectedExistingId = null;
$("#pick-search").addEventListener("input", (e) => {
  const results = searchPersons(tree, e.target.value)
    .filter((p) => p.generation === pickTarget.generation)
    .slice(0, 30);
  const box = $("#pick-search-results");
  box.innerHTML = "";
  for (const p of results) {
    const div = document.createElement("div");
    div.className = "search-result-item";
    div.textContent = fullName(p) + (altFullName(p) ? ` (${altFullName(p)})` : "");
    div.addEventListener("click", () => {
      pickSelectedExistingId = p.id;
      box.querySelectorAll(".search-result-item").forEach((el) => el.classList.remove("selected"));
      div.classList.add("selected");
    });
    box.appendChild(div);
  }
});

$("#btn-confirm-pick").addEventListener("click", () => {
  const activeTab = document.querySelector(".pick-tab.active").dataset.tab;
  let value;
  if (activeTab === "existing") {
    if (!pickSelectedExistingId) return;
    value = { existingId: pickSelectedExistingId };
  } else {
    const form = $("#form-pick-new-person");
    if (!form.given_names.value || !form.last_name.value) return;
    value = { newData: formToObject(form) };
  }
  pickSelectedExistingId = null;

  if (pickTarget.slot.startsWith("manage-")) {
      const kind = pickTarget.slot.replace("manage-", "");
      if (kind === "children") {
        addChildrenToFamily(tree, colorModalTarget, [value]);
      } else {
        addParentToFamily(tree, colorModalTarget, kind, value);
      }
    closeModal("#modal-pick-person");
    renderManageFamily();
    render();
    return;
  }

  // Staging into the "new family" modal, committed on "Create Family".
  if (pickTarget.slot === "children") familyModalState.children.push(value);
  else familyModalState[pickTarget.slot] = value;
  closeModal("#modal-pick-person");
  renderFamilySlots();
});

// ===================== Manage Family / Last-Name Color modal =====================
function openColorModal(familyId) {
  colorModalMode = "family";
  colorModalTarget = familyId;
  $("#color-modal-title").textContent = "Manage Family";
  $("#manage-family-section").classList.remove("hidden");
  $("#color-section-title").textContent = "Bracket Line Color";
  $("#color-section-hint").textContent = "Overrides the automatic color for this family's connecting lines.";
  $("#btn-color-reset").classList.remove("hidden");
  renderManageFamily();
  renderColorPalette();
  openModal("#modal-color");
}

function openLastNameColorModal(lastName) {
  colorModalMode = "lastname";
  colorModalTarget = lastName;
  $("#color-modal-title").textContent = `Color for "${lastName}"`;
  $("#manage-family-section").classList.add("hidden");
  $("#color-section-title").textContent = "Box Color";
  $("#color-section-hint").textContent = "Sets the box color for everyone with this last name.";
  $("#btn-color-reset").classList.add("hidden");
  renderColorPalette();
  openModal("#modal-color");
}

function renderColorPalette() {
  const currentColor =
    colorModalMode === "family"
      ? tree.families[colorModalTarget].color_override
      : tree.lastNameColors[colorModalTarget];
  const palette = $("#color-palette");
  palette.innerHTML = "";
  for (const color of PALETTE) {
    const sw = document.createElement("div");
    sw.className = "color-swatch";
    sw.style.background = color;
    if (currentColor === color) sw.classList.add("selected");
    sw.addEventListener("click", () => {
      if (colorModalMode === "family") {
        tree.families[colorModalTarget].color_override = color;
      } else {
        tree.lastNameColors[colorModalTarget] = color;
      }
      tree.dirty = true;
      render();
      closeModal("#modal-color");
    });
    palette.appendChild(sw);
  }
}

function renderManageFamily() {
  const fam = tree.families[colorModalTarget];

  const renderParentSlot = (sel, role) => {
    const el = $(sel);
    const pid = fam[role + "_id"];
    if (pid) {
      el.innerHTML = `<div class="slot-filled"><span>${fullName(tree.persons[pid])}</span></div>`;
    } else {
      el.innerHTML = "";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-small slot-empty-btn";
      btn.textContent = `+ Add ${role === "parent1" ? "Parent 1" : "Parent 2"}`;
      btn.addEventListener("click", () => {
        const otherId = fam[(role === "parent1" ? "parent2" : "parent1") + "_id"];
        const gen = otherId
          ? tree.persons[otherId].generation
          : tree.persons[fam.children_ids[0]].generation - 1;
        openPickPerson("manage-" + role, gen);
      });
      el.appendChild(btn);
    }
  };
  renderParentSlot("#manage-parent1", "parent1");
  renderParentSlot("#manage-parent2", "parent2");

  const list = $("#manage-children-list");
  list.innerHTML = "";
  for (const cid of fam.children_ids) {
    const row = document.createElement("div");
    row.className = "slot-filled";
    row.innerHTML = `<span>${fullName(tree.persons[cid])}</span>`;
    list.appendChild(row);
  }
}

$("#btn-manage-add-child").addEventListener("click", () => {
  const fam = tree.families[colorModalTarget];
  const parentIds = [fam.parent1_id, fam.parent2_id].filter(Boolean);
  const childGen = parentIds.length
    ? tree.persons[parentIds[0]].generation + 1
    : tree.persons[fam.children_ids[0]].generation;
  openPickPerson("manage-children", childGen);
});

$("#btn-color-reset").addEventListener("click", () => {
  if (colorModalMode !== "family") return;
  tree.families[colorModalTarget].color_override = null;
  tree.dirty = true;
  render();
  closeModal("#modal-color");
});

// ===================== Generic modal helpers =====================
function openModal(sel) {
  $(sel).classList.remove("hidden");
}
function closeModal(sel) {
  $(sel).classList.add("hidden");
}
document.querySelectorAll("[data-close-modal]").forEach((btn) => {
  btn.addEventListener("click", () => btn.closest(".modal-overlay").classList.add("hidden"));
});

function formToObject(form) {
  const fd = new FormData(form);
  const obj = {};
  for (const [k, v] of fd.entries()) obj[k] = v;
  return obj;
}

// Warn (in non-Tauri/browser preview) if the tree isn't a real desktop app.
if (!isTauri()) {
  console.warn("Lineage: window.__TAURI__ not found — file save/load and the native close guard won't work outside the Tauri desktop shell.");
}

$("#details-toggle-pedigree").addEventListener("click", () => {
  pedigreeFocusId = selectedPersonId;
  reorderMode = false;
  $("#btn-reorder-toggle").classList.remove("active");
  $("#btn-reorder-toggle").disabled = true;
  $("#btn-exit-pedigree").classList.remove("hidden");
  render();
});

$("#btn-exit-pedigree").addEventListener("click", () => {
  pedigreeFocusId = null;
  $("#btn-reorder-toggle").disabled = false;
  $("#btn-exit-pedigree").classList.add("hidden");
  render();
});

$("#btn-zoom-in").addEventListener("click", () => {
  zoomLevel = Math.min(ZOOM_MAX, zoomLevel + ZOOM_STEP);
  applyZoom();
});
$("#btn-zoom-out").addEventListener("click", () => {
  zoomLevel = Math.max(ZOOM_MIN, zoomLevel - ZOOM_STEP);
  applyZoom();
});
$("#canvas-viewport").addEventListener(
  "wheel",
  (e) => {
    if (!e.ctrlKey) return; // plain scroll still pans; ctrl+scroll (or pinch) zooms
    e.preventDefault();
    zoomLevel = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoomLevel - e.deltaY * 0.001));
    applyZoom();
  },
  { passive: false }
);

$("#btn-print").addEventListener("click", () => window.print());

const PRINT_PAGE_WIDTH_PX = 960; // ~10in usable width at 96dpi, after margins
const PRINT_PAGE_HEIGHT_PX = 900; // ~9.4in usable height at 96dpi, after margins

let zoomBeforePrint = null;
window.addEventListener("beforeprint", () => {
  zoomBeforePrint = zoomLevel;
  const naturalWidth = svg.viewBox.baseVal.width;
  const naturalHeight = svg.viewBox.baseVal.height;
  if (naturalWidth > 0) {
    zoomLevel = Math.min(zoomLevel, PRINT_PAGE_WIDTH_PX / naturalWidth);
  }
  applyZoom();

  // Only vertically center if the whole tree fits on a single printed page
  // at this zoom — otherwise centering would clip a multi-page tree's top.
  const fitsOnOnePage = naturalHeight * zoomLevel <= PRINT_PAGE_HEIGHT_PX;
  $("#canvas-viewport").classList.toggle("print-center", fitsOnOnePage);
});
window.addEventListener("afterprint", () => {
  if (zoomBeforePrint !== null) {
    zoomLevel = zoomBeforePrint;
    zoomBeforePrint = null;
    applyZoom();
  }
  $("#canvas-viewport").classList.remove("print-center");
});
