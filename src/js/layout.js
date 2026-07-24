import { allGenerations, getRow, ensureLastNameColor, lifeDates } from "./model.js";
import { NEUTRAL_LINE_COLOR } from "./model.js";

export const BOX_W = 160;
export const BOX_H_BASE = 68;
export const BOX_H_ALT = 68;
export const LIFE_DATES_LINE_H = 16;
export const COUPLE_GAP = 16;
export const SIBLING_GAP = 36;
export const ROW_BASE_GAP = 90;
export const OFFSET_SPACING = 16;
export const TOP_MARGIN = 60;
export const SIDE_MARGIN = 60;

function boxHeight(person) {
  // The base height already fits a name plus an optional alternate name; the
  // life-dates line, when present, needs a little extra room below them.
  let height = person.alt_given_names || person.alt_last_name ? BOX_H_ALT : BOX_H_BASE;
  if (lifeDates(person)) height += LIFE_DATES_LINE_H;
  return height;
}

export function computeLayout(tree) {
  const gens = allGenerations(tree);
  if (gens.length === 0) return { boxes: [], lines: [], width: 0, height: 0 };

  // ---- PASS 1: per-row x positions (row-local, not yet centered) ----
  const rowLayout = {}; // gen -> { widths: {id:w}, xs: {id:x}, rowWidth, rowHeight }
  for (const gen of gens) {
    const row = getRow(tree, gen);
    let x = 0;
    let rowHeight = BOX_H_BASE;
    const xs = {};
    for (let i = 0; i < row.length; i++) {
      const id = row[i];
      const person = tree.persons[id];
      const h = boxHeight(person);
      rowHeight = Math.max(rowHeight, h);
      xs[id] = x;
      x += BOX_W;
      // decide gap to next box
      if (i < row.length - 1) {
        const nextId = row[i + 1];
        const gap = arePartners(tree, id, nextId) ? COUPLE_GAP : SIBLING_GAP;
        x += gap;
      }
    }
    rowLayout[gen] = { xs, rowWidth: x, rowHeight, ids: row };
  }

  const maxWidth = Math.max(0, ...Object.values(rowLayout).map((r) => r.rowWidth - SIBLING_GAP));

  // ---- PASS 2: offset counts per gap band (keyed by child generation) ----
  const offsetCount = {};
  for (const fam of Object.values(tree.families)) {
    if (fam.children_ids.length === 0) continue;
    const childGen = tree.persons[fam.children_ids[0]].generation;
    offsetCount[childGen] = (offsetCount[childGen] || 0) + 1;
  }

  // ---- PASS 3: y positions per row ----
  const rowY = {};
  rowY[gens[0]] = TOP_MARGIN;
  for (let i = 1; i < gens.length; i++) {
    const g = gens[i];
    const prev = gens[i - 1];
    const bandCount = offsetCount[g] || 0;
    const gap = ROW_BASE_GAP + Math.max(0, bandCount - 1) * OFFSET_SPACING;
    rowY[g] = rowY[prev] + rowLayout[prev].rowHeight + gap;
  }

  // ---- PASS 4: finalize x with per-row centering ----
  const boxes = [];
  const boxIndex = {}; // id -> box
  for (const gen of gens) {
    const { xs, rowWidth, rowHeight, ids } = rowLayout[gen];
    const offsetX = SIDE_MARGIN + (maxWidth - (rowWidth - SIBLING_GAP)) / 2;
    for (const id of ids) {
      const person = tree.persons[id];
      const h = boxHeight(person);
      const box = {
        id,
        x: offsetX + xs[id],
        y: rowY[gen],
        w: BOX_W,
        h,
        rowHeight,
        person,
        color: ensureLastNameColor(tree, person.last_name),
      };
      boxes.push(box);
      boxIndex[id] = box;
    }
  }

  // ---- PASS 5: bracket lines per family ----
  const bandUsedSoFar = {}; // childGen -> count assigned so far (for offset index)
  // assign offset index in left-to-right order by family's child midpoint
  const familiesByBand = {};
  for (const fam of Object.values(tree.families)) {
    if (fam.children_ids.length === 0) continue;
    const childGen = tree.persons[fam.children_ids[0]].generation;
    (familiesByBand[childGen] = familiesByBand[childGen] || []).push(fam);
  }
  for (const childGen of Object.keys(familiesByBand)) {
    familiesByBand[childGen].sort((a, b) => {
      const ax = avgChildX(a, boxIndex);
      const bx = avgChildX(b, boxIndex);
      return ax - bx;
    });
  }

  const lines = [];
  for (const fam of Object.values(tree.families)) {
    const p1 = fam.parent1_id ? boxIndex[fam.parent1_id] : null;
    const p2 = fam.parent2_id ? boxIndex[fam.parent2_id] : null;
    const lineColor = lineColorFor(tree, fam);
    const segs = [];
    let dropX = null,
      dropYStart = null;

    if (p1 && p2) {
      const left = p1.x < p2.x ? p1 : p2;
      const right = p1.x < p2.x ? p2 : p1;
      const y = left.y + left.h / 2;
      const x1 = left.x + left.w;
      const x2 = right.x;
      segs.push({ x1, y1: y, x2, y2: y });
      dropX = (x1 + x2) / 2;
      dropYStart = y;
    } else if (p1 || p2) {
      const p = p1 || p2;
      dropX = p.x + p.w / 2;
      dropYStart = p.y + p.h;
    }

    if (fam.children_ids.length === 0) {
      if (segs.length) lines.push({ familyId: fam.id, color: lineColor, segments: segs });
      continue;
    }

    const childGen = tree.persons[fam.children_ids[0]].generation;
    const band = familiesByBand[childGen] || [fam];
    const bandIdx = band.indexOf(fam);
    const childRowTopY = Math.min(...fam.children_ids.map((c) => boxIndex[c].y));
    // Stack lines within the gap band: the first family in left-to-right
    // order sits closest to the children, each subsequent family's long
    // horizontal line sits OFFSET_SPACING further up (per spec's multiple
    // families sharing a generation gap).
    const lineY = childRowTopY - ROW_BASE_GAP * 0.4 - bandIdx * OFFSET_SPACING;

    if (dropX !== null) {
      segs.push({ x1: dropX, y1: dropYStart, x2: dropX, y2: lineY });
    }

    const childXs = fam.children_ids.map((c) => boxIndex[c].x + boxIndex[c].w / 2);
    let leftMost = Math.min(...childXs);
    let rightMost = Math.max(...childXs);
    if (dropX !== null) {
      leftMost = Math.min(leftMost, dropX);
      rightMost = Math.max(rightMost, dropX);
    }
    segs.push({ x1: leftMost, y1: lineY, x2: rightMost, y2: lineY });

    for (const c of fam.children_ids) {
      const cb = boxIndex[c];
      const cx = cb.x + cb.w / 2;
      segs.push({ x1: cx, y1: lineY, x2: cx, y2: cb.y });
    }

    lines.push({ familyId: fam.id, color: lineColor, segments: segs });
  }

  const totalHeight =
    rowY[gens[gens.length - 1]] + rowLayout[gens[gens.length - 1]].rowHeight + TOP_MARGIN;
  const totalWidth = maxWidth + SIDE_MARGIN * 2;

  return { boxes, lines, width: totalWidth, height: totalHeight };
}

function avgChildX(fam, boxIndex) {
  const xs = fam.children_ids.map((c) => boxIndex[c].x);
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function arePartners(tree, idA, idB) {
  const a = tree.persons[idA];
  if (!a.downward_family_id) return false;
  const fam = tree.families[a.downward_family_id];
  return (
    (fam.parent1_id === idA && fam.parent2_id === idB) ||
    (fam.parent2_id === idA && fam.parent1_id === idB)
  );
}

function lineColorFor(tree, fam) {
  const colorSourceId = fam.parent1_id || fam.parent2_id;
  const hex = fam.color_override
    ? fam.color_override
    : colorSourceId
    ? ensureLastNameColor(tree, tree.persons[colorSourceId].last_name)
    : null;
  if (!hex) return NEUTRAL_LINE_COLOR;

  const amount = 10; // how much darker, 0-255
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amount);
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amount);
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amount);
  return `rgb(${r}, ${g}, ${b})`;
}
