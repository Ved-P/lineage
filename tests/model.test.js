import { test } from "node:test";
import assert from "node:assert/strict";

import {
  newTree,
  createPerson,
  lifeDates,
  lifespanYears,
} from "../src/js/model.js";

test("createPerson stores trimmed birth and death dates", () => {
  const tree = newTree();
  const person = createPerson(
    tree,
    { given_names: "Ada", last_name: "Byron", birth_date: " 1815 ", death_date: " 1852 " },
    0,
  );
  assert.equal(person.birth_date, "1815");
  assert.equal(person.death_date, "1852");
});

test("createPerson defaults missing life dates to empty strings", () => {
  const tree = newTree();
  const person = createPerson(tree, { given_names: "Grace", last_name: "Hopper" }, 0);
  assert.equal(person.birth_date, "");
  assert.equal(person.death_date, "");
});

test("lifeDates formats every combination of birth and death", () => {
  assert.equal(lifeDates({ birth_date: "1920", death_date: "1990" }), "1920 \u2013 1990");
  assert.equal(lifeDates({ birth_date: "1920", death_date: "" }), "b. 1920");
  assert.equal(lifeDates({ birth_date: "", death_date: "1990" }), "d. 1990");
  assert.equal(lifeDates({ birth_date: "", death_date: "" }), "");
  assert.equal(lifeDates({}), "");
});

test("lifespanYears computes years between birth and death", () => {
  assert.equal(lifespanYears({ birth_date: "1815", death_date: "1852" }), 37);
  assert.equal(lifespanYears({ birth_date: "c. 1900", death_date: "died 1975" }), 75);
});

test("lifespanYears uses the current year when death is unknown", () => {
  const born = new Date().getFullYear() - 30;
  assert.equal(lifespanYears({ birth_date: String(born), death_date: "" }), 30);
});

test("lifespanYears returns null for undeterminable or implausible spans", () => {
  assert.equal(lifespanYears({ birth_date: "", death_date: "1990" }), null);
  assert.equal(lifespanYears({ birth_date: "unknown", death_date: "unknown" }), null);
  assert.equal(lifespanYears({ birth_date: "1990", death_date: "1815" }), null);
  assert.equal(lifespanYears({ birth_date: "1000", death_date: "1900" }), null);
});
