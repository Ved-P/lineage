export function serializeTree(tree) {
  const doc = {
    version: 1,
    persons: Object.values(tree.persons),
    families: Object.values(tree.families),
    generation_order: tree.generationOrder,
    last_name_colors: tree.lastNameColors,
    next_person_id: tree.nextPersonId,
    next_family_id: tree.nextFamilyId,
  };
  return JSON.stringify(doc, null, 2);
}

export function deserializeTree(text) {
  const doc = JSON.parse(text);
  const tree = {
    persons: {},
    families: {},
    generationOrder: doc.generation_order || {},
    lastNameColors: doc.last_name_colors || {},
    nextPersonId: doc.next_person_id || 1,
    nextFamilyId: doc.next_family_id || 1,
    dirty: false,
    filePath: null,
  };
  for (const p of doc.persons || []) tree.persons[p.id] = p;
  for (const f of doc.families || []) tree.families[f.id] = f;
  return tree;
}
