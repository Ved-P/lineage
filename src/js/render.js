import { computeLayout } from "./layout.js";
import { fullName, altFullName, lifeDates, moveBlockInRow } from "./model.js";

const SVG_NS = "http://www.w3.org/2000/svg";

export function renderTree(tree, svgEl, handlers) {
  const { boxes, lines, width, height } = computeLayout(tree);
  const w = Math.max(width, 400);
  const h = Math.max(height, 300);
  svgEl.setAttribute("width", w);
  svgEl.setAttribute("height", h);
  svgEl.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svgEl.innerHTML = "";

  // ---- lines first (under the boxes) ----
  for (const line of lines) {
    const g = document.createElementNS(SVG_NS, "g");
    g.dataset.familyId = line.familyId;
    for (const seg of line.segments) {
      const hit = document.createElementNS(SVG_NS, "line");
      hit.setAttribute("x1", seg.x1);
      hit.setAttribute("y1", seg.y1);
      hit.setAttribute("x2", seg.x2);
      hit.setAttribute("y2", seg.y2);
      hit.setAttribute("class", "bracket-hitbox");
      g.appendChild(hit);

      const visible = document.createElementNS(SVG_NS, "line");
      visible.setAttribute("x1", seg.x1);
      visible.setAttribute("y1", seg.y1);
      visible.setAttribute("x2", seg.x2);
      visible.setAttribute("y2", seg.y2);
      visible.setAttribute("stroke", line.color);
      visible.setAttribute("stroke-width", "3");
      visible.setAttribute("stroke-linecap", "round");
      visible.setAttribute("class", "bracket-line");
      g.appendChild(visible);
    }
    g.addEventListener("click", (e) => {
      e.stopPropagation();
      handlers.onLineClick?.(line.familyId);
    });
    svgEl.appendChild(g);
  }

  // ---- boxes (as foreignObject so we get normal HTML/CSS text layout) ----
  for (const box of boxes) {
    const fo = document.createElementNS(SVG_NS, "foreignObject");
    fo.setAttribute("x", box.x);
    fo.setAttribute("y", box.y);
    fo.setAttribute("width", box.w);
    fo.setAttribute("height", box.h);
    fo.dataset.personId = box.id;

    const div = document.createElement("div");
    div.className = "person-box";
    div.style.background = box.color;
    div.innerHTML = `
      <div class="full-name">${escapeHtml(fullName(box.person))}</div>
      ${altFullName(box.person) ? `<div class="alt-name">${escapeHtml(altFullName(box.person))}</div>` : ""}
      ${lifeDates(box.person) ? `<div class="life-dates">${escapeHtml(lifeDates(box.person))}</div>` : ""}
    `;
    div.addEventListener("click", (e) => {
      e.stopPropagation();
      handlers.onBoxClick?.(box.id);
    });
    div.dataset.personId = box.id;
    div.addEventListener("pointerdown", (e) => {
      if (!handlers.reorderMode) return;
      e.preventDefault();
      div.classList.add("dragging");
      let hovered = null;

      const onMove = (ev) => {
        const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest(".person-box");
        if (hovered && hovered !== target) hovered.classList.remove("drag-over");
        hovered = target && target !== div ? target : null;
        if (hovered) hovered.classList.add("drag-over");
      };

      const onUp = () => {
        div.classList.remove("dragging");
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        if (!hovered) return;
        hovered.classList.remove("drag-over");
        const gen = box.person.generation;
        moveBlockInRow(tree, box.id, gen, hovered.dataset.personId);
        handlers.onReordered?.();
      };

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    });

    if (handlers.selectedId === box.id) div.classList.add("selected");

    fo.appendChild(div);
    svgEl.appendChild(fo);
  }
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}
