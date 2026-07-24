import { test } from "node:test";
import assert from "node:assert/strict";

import { newTree, createPerson } from "../src/js/model.js";
import { serializeTree, deserializeTree } from "../src/js/persistence.js";

test("life dates survive a serialize/deserialize round trip", () => {
  const tree = newTree();
  createPerson(
    tree,
    { given_names: "Ada", last_name: "Byron", birth_date: "1815", death_date: "1852" },
    0,
  );
  const restored = deserializeTree(serializeTree(tree));
  const person = Object.values(restored.persons)[0];
  assert.equal(person.birth_date, "1815");
  assert.equal(person.death_date, "1852");
});

test("loading a pre-life-dates save file backfills empty date fields", () => {
  const legacy = JSON.stringify({
    version: 1,
    persons: [
      { id: "p1", given_names: "Grace", last_name: "Hopper", generation: 0 },
    ],
    families: [],
    generation_order: { 0: ["p1"] },
    last_name_colors: {},
    next_person_id: 2,
    next_family_id: 1,
  });
  const tree = deserializeTree(legacy);
  assert.equal(tree.persons.p1.birth_date, "");
  assert.equal(tree.persons.p1.death_date, "");
});
