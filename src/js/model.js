// ===================== Palette =====================
// Fixed set of pastel colors. Last names get auto-assigned one; families can
// override their bracket-line color from this same set.
export const PALETTE = [
  "#F7C6D9", // blush
  "#FDE2C8", // peach
  "#FFF6C3", // butter
  "#D6F5D6", // mint
  "#C9E7F5", // sky
  "#D9D3F7", // lavender
  "#EAD1F0", // lilac
  "#F7D6E0", // rose
  "#CFEFE1", // seafoam
  "#F9E0B9", // apricot
  "#D3E4F5", // powder blue
  "#F0E6D6", // cream
  "#E3D6F0", // wisteria
  "#D6EFD9", // sage
  "#FDE7E7", // petal
  "#DDEFF7", // frost
];
export const NEUTRAL_LINE_COLOR = "#C9C4D6";

// ===================== Tree factory =====================
export function newTree() {
  return {
    persons: {},      // id -> Person
    families: {},     // id -> Family
    generationOrder: {}, // "gen" -> [personId, ...] left to right
    lastNameColors: {},  // lastName -> hex
    nextPersonId: 1,
    nextFamilyId: 1,
    dirty: false,
    filePath: null,
  };
}

function nextId(tree, kind) {
  if (kind === "person") return "p" + tree.nextPersonId++;
  return "f" + tree.nextFamilyId++;
}

export function ensureLastNameColor(tree, lastName) {
  if (!lastName) return NEUTRAL_LINE_COLOR;
  if (!tree.lastNameColors[lastName]) {
    const used = new Set(Object.values(tree.lastNameColors));
    let color = PALETTE.find((c) => !used.has(c));
    if (!color) {
      // palette exhausted: cycle
      const idx = Object.keys(tree.lastNameColors).length % PALETTE.length;
      color = PALETTE[idx];
    }
    tree.lastNameColors[lastName] = color;
  }
  return tree.lastNameColors[lastName];
}

export function createPerson(tree, data, generation) {
  const id = nextId(tree, "person");
  const person = {
    id,
    given_names: data.given_names?.trim() || "",
    last_name: data.last_name?.trim() || "",
    alt_given_names: data.alt_given_names?.trim() || "",
    alt_last_name: data.alt_last_name?.trim() || "",
    generation,
    upward_family_id: null,
    downward_family_id: null,
  };
  tree.persons[id] = person;
  ensureLastNameColor(tree, person.last_name);
  tree.dirty = true;
  return person;
}

// Used only for the very first person in a brand new tree, who has no
// family to anchor off of yet.
export function placeAsRoot(tree, person) {
  getRow(tree, person.generation).push(person.id);
  tree.dirty = true;
}

export function fullName(p) {
  return `${p.given_names} ${p.last_name}`.trim();
}
export function altFullName(p) {
  if (!p.alt_given_names && !p.alt_last_name) return "";
  return `${p.alt_given_names} ${p.alt_last_name}`.trim();
}

// ===================== Row helpers =====================
export function getRow(tree, gen) {
  const key = String(gen);
  if (!tree.generationOrder[key]) tree.generationOrder[key] = [];
  return tree.generationOrder[key];
}
export function rowExists(tree, gen) {
  return !!tree.generationOrder[String(gen)];
}
export function allGenerations(tree) {
  return Object.keys(tree.generationOrder)
    .map(Number)
    .sort((a, b) => a - b);
}

// If `id` is one half of a couple (both parents of the same family present
// and adjacent), return the [lowIndex, highIndex] span of that couple in the
// row. Otherwise returns [idx, idx].
function coupleBlockRange(tree, row, id) {
  const person = tree.persons[id];
  if (person.downward_family_id) {
    const fam = tree.families[person.downward_family_id];
    if (fam.parent1_id && fam.parent2_id) {
      const i1 = row.indexOf(fam.parent1_id);
      const i2 = row.indexOf(fam.parent2_id);
      if (i1 >= 0 && i2 >= 0) return [Math.min(i1, i2), Math.max(i1, i2)];
    }
  }
  const i = row.indexOf(id);
  return [i, i];
}

// ===================== Insertion primitives (see design doc §2) =====================

// Case: nobody at target generation yet OR appended at the far right of an
// existing row (both are handled by a plain push, per the algorithm's
// fallback branches).
function appendToRow(tree, gen, id) {
  getRow(tree, gen).push(id);
}

// Adding the second parent directly beside an already-placed parent.
function insertSecondParent(tree, gen, existingId, newId, role) {
  const row = getRow(tree, gen);
  const idx = row.indexOf(existingId);
  if (role === "parent2") row.splice(idx + 1, 0, newId);
  else row.splice(idx, 0, newId); // role === "parent1" -> goes to the left
}

// Adding a (new) child, given the existing parent(s) already placed in the
// tree. Implements both the "both parents" and "single parent" cases.
function insertChildRelativeToParents(tree, parentIds, parentGen, childGen, newChildId) {
  const parentRow = getRow(tree, parentGen);
  let anchor = parentIds[0];
  if (parentIds.length === 2) {
    anchor =
      parentRow.indexOf(parentIds[0]) > parentRow.indexOf(parentIds[1])
        ? parentIds[0]
        : parentIds[1];
  }
  const anchorIdx = parentRow.indexOf(anchor);
  let X = null;
  for (let i = anchorIdx + 1; i < parentRow.length; i++) {
    const cand = parentRow[i];
    if (tree.persons[cand].downward_family_id) {
      X = cand;
      break;
    }
  }
  const childRow = getRow(tree, childGen);
  if (X) {
    const xFam = tree.families[tree.persons[X].downward_family_id];
    let Y = null,
      yPos = Infinity;
    for (const cid of xFam.children_ids) {
      const p = childRow.indexOf(cid);
      if (p >= 0 && p < yPos) {
        yPos = p;
        Y = cid;
      }
    }
    if (Y) {
      const [lo] = coupleBlockRange(tree, childRow, Y);
      childRow.splice(lo, 0, newChildId);
      return;
    }
  }
  childRow.push(newChildId);
}

// Adding a new child to a family that already has at least one child placed
// (2nd, 3rd, ... child). Not explicitly spelled out in the spec beyond the
// "skip past couples" rule for the no-parents case, so we generalize that
// rule: place directly right of the current rightmost sibling in this
// family, skipping past a couple block if that sibling is paired.
function insertChildRelativeToSiblings(tree, childGen, existingSiblingId, newChildId) {
  const row = getRow(tree, childGen);
  const [, hi] = coupleBlockRange(tree, row, existingSiblingId);
  row.splice(hi + 1, 0, newChildId);
}

// Adding a (new) parent above an existing child C, when no parent exists yet.
function insertParentRelativeToChild(tree, childGen, parentGen, C, newParentId) {
  const childRow = getRow(tree, childGen);
  const cIdx = childRow.indexOf(C);
  let X = null;
  for (let i = cIdx + 1; i < childRow.length; i++) {
    const cand = childRow[i];
    const famId = tree.persons[cand].upward_family_id;
    if (famId) {
      const fam = tree.families[famId];
      if (fam.parent1_id || fam.parent2_id) {
        X = cand;
        break;
      }
    }
  }
  const parentRow = getRow(tree, parentGen);
  if (X) {
    const xFam = tree.families[tree.persons[X].upward_family_id];
    const Y = xFam.parent1_id || xFam.parent2_id;
    const idx = parentRow.indexOf(Y);
    parentRow.splice(idx, 0, newParentId);
  } else {
    parentRow.push(newParentId);
  }
}

// ===================== Family construction =====================
// spec = {
//   anchorId, anchorRole: 'parent1'|'parent2'|'child',
//   parent1: null | {existingId} | {newData},
//   parent2: null | {existingId} | {newData},
//   children: [ {existingId} | {newData}, ... ]
// }
export function buildFamily(tree, spec) {
  const anchor = tree.persons[spec.anchorId];
  const parentGen = spec.anchorRole === "child" ? anchor.generation - 1 : anchor.generation;
  const childGen = parentGen + 1;

  const family = {
    id: nextId(tree, "family"),
    parent1_id: null,
    parent2_id: null,
    children_ids: [],
    color_override: null,
  };
  tree.families[family.id] = family;

  // ---- place anchor first ----
  if (spec.anchorRole === "child") {
    family.children_ids.push(anchor.id);
    anchor.upward_family_id = family.id;
  } else {
    family[spec.anchorRole + "_id"] = anchor.id;
    anchor.downward_family_id = family.id;
  }

  // ---- parents ----
  for (const role of ["parent1", "parent2"]) {
    if (spec.anchorRole === role) continue; // already placed
    const slot = spec[role];
    if (!slot) continue;
    let pid;
    if (slot.existingId) {
      pid = slot.existingId;
      tree.persons[pid].downward_family_id = family.id;
    } else {
      const p = createPerson(tree, slot.newData, parentGen);
      pid = p.id;
      const otherRole = role === "parent1" ? "parent2" : "parent1";
      const otherExisting = family[otherRole + "_id"];
      if (otherExisting) {
        insertSecondParent(tree, parentGen, otherExisting, pid, role);
      } else if (spec.anchorRole === "child") {
        // neither parent existed before this call -> case E, relative to anchor child
        insertParentRelativeToChild(tree, childGen, parentGen, anchor.id, pid);
      } else {
        appendToRow(tree, parentGen, pid);
      }
      tree.persons[pid].downward_family_id = family.id;
    }
    family[role + "_id"] = pid;
  }

  // ---- children ----
  addChildrenToFamily(tree, family.id, spec.children || []);

  tree.dirty = true;
  return family;
}

// Adds one or more children to a family that already exists (used both by
// buildFamily for a brand-new family, and by the "manage family" flow for
// adding a child to a family created in an earlier session).
export function addChildrenToFamily(tree, familyId, childSlots) {
  const family = tree.families[familyId];
  const parentIds = [family.parent1_id, family.parent2_id].filter(Boolean);
  const parentGen = parentIds.length
    ? tree.persons[parentIds[0]].generation
    : family.children_ids.length
    ? tree.persons[family.children_ids[0]].generation - 1
    : null;
  if (parentGen === null) throw new Error("Cannot place a child in an empty family with no parents");
  const childGen = parentGen + 1;

  for (const slot of childSlots) {
    let cid;
    if (slot.existingId) {
      cid = slot.existingId;
      tree.persons[cid].upward_family_id = familyId;
      family.children_ids.push(cid);
      continue;
    }
    const c = createPerson(tree, slot.newData, childGen);
    cid = c.id;
    if (family.children_ids.length === 0) {
      if (parentIds.length > 0) {
        insertChildRelativeToParents(tree, parentIds, parentGen, childGen, cid);
      } else {
        // No parents at all and no siblings yet: nothing to anchor off of
        // within this call — append to the end of the row as a fallback.
        appendToRow(tree, childGen, cid);
      }
    } else {
      const row = getRow(tree, childGen);
      let rightmost = null,
        pos = -1;
      for (const existing of family.children_ids) {
        const p = row.indexOf(existing);
        if (p > pos) {
          pos = p;
          rightmost = existing;
        }
      }
      insertChildRelativeToSiblings(tree, childGen, rightmost, cid);
    }
    tree.persons[cid].upward_family_id = familyId;
    family.children_ids.push(cid);
  }
  tree.dirty = true;
}

function leftmostChildByRow(tree, family, childGen) {
  const row = getRow(tree, childGen);
  let best = null,
    bestPos = Infinity;
  for (const c of family.children_ids) {
    const p = row.indexOf(c);
    if (p >= 0 && p < bestPos) {
      bestPos = p;
      best = c;
    }
  }
  return best;
}

// Adds a parent (existing or new) to a family that's missing that slot —
// used by "manage family" to fill in a parent that wasn't known at first.
export function addParentToFamily(tree, familyId, role, slot) {
  const family = tree.families[familyId];
  if (family[role + "_id"]) throw new Error("That parent slot is already filled");
  const otherRole = role === "parent1" ? "parent2" : "parent1";
  const otherId = family[otherRole + "_id"];
  const parentGen = otherId
    ? tree.persons[otherId].generation
    : tree.persons[family.children_ids[0]].generation - 1;

  let pid;
  if (slot.existingId) {
    pid = slot.existingId;
  } else {
    const childGen = parentGen + 1;
    const p = createPerson(tree, slot.newData, parentGen);
    pid = p.id;
    if (otherId) {
      insertSecondParent(tree, parentGen, otherId, pid, role);
    } else {
      const repChild = leftmostChildByRow(tree, family, childGen);
      insertParentRelativeToChild(tree, childGen, parentGen, repChild, pid);
    }
  }
  tree.persons[pid].downward_family_id = familyId;
  family[role + "_id"] = pid;
  tree.dirty = true;
}

// ===================== Role validity =====================
export function roleAvailable(person, role) {
  if (role === "child") return !person.upward_family_id;
  return !person.downward_family_id;
}

// ===================== Search =====================
// Subsequence + substring matching over "given last" and alt name.
export function searchPersons(tree, query) {
  const q = query.trim().toLowerCase();
  if (!q) return Object.values(tree.persons);
  const isSubsequence = (needle, hay) => {
    let i = 0;
    for (let j = 0; j < hay.length && i < needle.length; j++) {
      if (hay[j] === needle[i]) i++;
    }
    return i === needle.length;
  };
  const results = [];
  for (const p of Object.values(tree.persons)) {
    const full = fullName(p).toLowerCase();
    const alt = altFullName(p).toLowerCase();
    const score = full.includes(q) || alt.includes(q) ? 0 : isSubsequence(q, full) || isSubsequence(q, alt) ? 1 : -1;
    if (score >= 0) results.push({ person: p, score });
  }
  results.sort((a, b) => a.score - b.score);
  return results.map((r) => r.person);
}

// ===================== Reorder (manual override) =====================
export function movePersonInRow(tree, personId, gen, newIndex) {
  const row = getRow(tree, gen);
  const idx = row.indexOf(personId);
  if (idx === -1) return;
  row.splice(idx, 1);
  row.splice(newIndex, 0, personId);
  tree.dirty = true;
}

// Returns [id] normally, or [parent1_id, parent2_id] if this person is
// half of a couple — used so dragging one partner always drags both.
export function getCoupleBlock(tree, personId) {
  const person = tree.persons[personId];
  if (person.downward_family_id) {
    const fam = tree.families[person.downward_family_id];
    if (fam.parent1_id && fam.parent2_id) {
      return [fam.parent1_id, fam.parent2_id];
    }
  }
  return [personId];
}

// Moves draggedId (and their partner, if any) to sit next to hoveredId,
// snapping to the outside of a couple block rather than splitting it.
export function moveBlockInRow(tree, draggedId, gen, hoveredId) {
  const row = getRow(tree, gen);
  const draggedBlock = getCoupleBlock(tree, draggedId);
  if (draggedBlock.includes(hoveredId)) return; // dropped on self/own partner

  const hoveredBlock = getCoupleBlock(tree, hoveredId);
  const filtered = row.filter((id) => !draggedBlock.includes(id));

  let insertIdx;
  if (hoveredBlock.length === 2) {
    const [leftId, rightId] = hoveredBlock; // parent1 is always left, parent2 right
    insertIdx = hoveredId === leftId ? filtered.indexOf(leftId) : filtered.indexOf(rightId) + 1;
  } else {
    insertIdx = filtered.indexOf(hoveredId);
  }

  filtered.splice(insertIdx, 0, ...draggedBlock);
  tree.generationOrder[String(gen)] = filtered;
  tree.dirty = true;
}

// Collects the person ids and family ids that belong in a pedigree view
// centered on `focusId`: the person, their spouse, all ancestors (both
// parents at each generation up), and all descendants (recursively, with
// their spouses).
export function computePedigreeVisibility(tree, focusId) {
  const visiblePersons = new Set([focusId]);
  const visibleFamilies = new Set();

  const walkUp = (personId) => {
    const p = tree.persons[personId];
    if (!p.upward_family_id) return;
    const fam = tree.families[p.upward_family_id];
    visibleFamilies.add(fam.id);
    if (fam.parent1_id) { visiblePersons.add(fam.parent1_id); walkUp(fam.parent1_id); }
    if (fam.parent2_id) { visiblePersons.add(fam.parent2_id); walkUp(fam.parent2_id); }
  };

  // Walks descendants WITHOUT pulling in their spouses — only the focus
  // person's own spouse should ever be visible.
  const walkDownDescendantsOnly = (personId) => {
    const p = tree.persons[personId];
    if (!p.downward_family_id) return;
    const fam = tree.families[p.downward_family_id];
    visibleFamilies.add(fam.id);
    for (const c of fam.children_ids) {
      visiblePersons.add(c);
      walkDownDescendantsOnly(c);
    }
  };

  walkUp(focusId);

  // Focus person's own downward family is the one exception: their spouse
  // IS shown, and we start the descendant walk from their children.
  const focusPerson = tree.persons[focusId];
  if (focusPerson.downward_family_id) {
    const fam = tree.families[focusPerson.downward_family_id];
    visibleFamilies.add(fam.id);
    if (fam.parent1_id) visiblePersons.add(fam.parent1_id);
    if (fam.parent2_id) visiblePersons.add(fam.parent2_id);
    for (const c of fam.children_ids) {
      visiblePersons.add(c);
      walkDownDescendantsOnly(c);
    }
  }

  return { visiblePersons, visibleFamilies };
}

// Builds a filtered, throwaway tree-shaped object containing only the
// pedigree-visible people/families, for renderTree/computeLayout to consume.
export function buildPedigreeView(tree, focusId) {
  const { visiblePersons, visibleFamilies } = computePedigreeVisibility(tree, focusId);

  const persons = {};
  for (const id of visiblePersons) persons[id] = tree.persons[id];

  const families = {};
  for (const id of visibleFamilies) {
    const fam = tree.families[id];
    families[id] = {
      ...fam,
      parent1_id: visiblePersons.has(fam.parent1_id) ? fam.parent1_id : null,
      parent2_id: visiblePersons.has(fam.parent2_id) ? fam.parent2_id : null,
      children_ids: fam.children_ids.filter((c) => visiblePersons.has(c)),
    };
  }

  const generationOrder = {};
  for (const gen of Object.keys(tree.generationOrder)) {
    const filtered = tree.generationOrder[gen].filter((id) => visiblePersons.has(id));
    if (filtered.length) generationOrder[gen] = filtered;
  }

  return { persons, families, generationOrder, lastNameColors: tree.lastNameColors };
}
