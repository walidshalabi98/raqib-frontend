import { describe, expect, it } from "vitest";
import {
  allowedLevelsUnder,
  buildResultTree,
  childLevelOf,
  descendantIds,
  flattenResultTree,
  hasChildResults,
  isValidParentLevel,
  parentCandidates,
  parentLevelOf,
  resultText,
  sortResultNodes,
} from "@/lib/resultsHierarchy";
import {
  newResultValues,
  resultCreatePayload,
  resultFormOptions,
  resultToValues,
  resultUpdatePayload,
  validateResultForm,
  withParent,
} from "@/lib/resultForm";
import { makeResultNode, sampleResultNodes } from "@/test/fixtures";

describe("hierarchy rule (same as the backend)", () => {
  it("allows only a parent exactly one level above, or none", () => {
    expect(isValidParentLevel("outcome", "impact")).toBe(true);
    expect(isValidParentLevel("output", "outcome")).toBe(true);
    expect(isValidParentLevel("activity", "output")).toBe(true);
    expect(isValidParentLevel("impact", null)).toBe(true);
    expect(isValidParentLevel("output", null)).toBe(true);
    expect(isValidParentLevel("impact", "outcome")).toBe(false);
    expect(isValidParentLevel("output", "impact")).toBe(false);
    expect(isValidParentLevel("outcome", "outcome")).toBe(false);
    expect(isValidParentLevel("activity", "outcome")).toBe(false);
  });

  it("names the level above and below", () => {
    expect(parentLevelOf("impact")).toBeNull();
    expect(parentLevelOf("output")).toBe("outcome");
    expect(childLevelOf("outcome")).toBe("output");
    expect(childLevelOf("activity")).toBeNull();
  });

  it("limits level choices under a parent", () => {
    expect(allowedLevelsUnder(null)).toEqual(["impact", "outcome", "output", "activity"]);
    expect(allowedLevelsUnder("impact")).toEqual(["outcome"]);
    expect(allowedLevelsUnder("outcome")).toEqual(["output"]);
    expect(allowedLevelsUnder("output")).toEqual(["activity"]);
    expect(allowedLevelsUnder("activity")).toEqual([]);
  });
});

describe("tree helpers", () => {
  it("orders by level, then sortOrder, then code (numeric)", () => {
    const nodes = [
      makeResultNode({ id: "a", code: "O10", level: "outcome" }),
      makeResultNode({ id: "b", code: "O2", level: "outcome" }),
      makeResultNode({ id: "c", code: "Goal", level: "impact" }),
      makeResultNode({ id: "d", code: "O1", level: "outcome", sortOrder: 5 }),
    ];
    expect(sortResultNodes(nodes).map((n) => n.code)).toEqual(["Goal", "O2", "O10", "O1"]);
  });

  it("builds an indented tree and flattens it depth-first", () => {
    const flat = flattenResultTree(buildResultTree(sampleResultNodes()));
    expect(flat.map(({ node, depth }) => `${depth}:${node.code}`)).toEqual(["0:Goal", "1:O1", "2:O1.1", "1:O2"]);
  });

  it("shows orphans and cycles at the top instead of hiding them", () => {
    const nodes = [
      makeResultNode({ id: "x", code: "X", level: "outcome", parentId: "missing" }),
      makeResultNode({ id: "p", code: "P", level: "output", parentId: "q" }),
      makeResultNode({ id: "q", code: "Q", level: "output", parentId: "p" }),
    ];
    const codes = flattenResultTree(buildResultTree(nodes)).map(({ node }) => node.code);
    expect(codes.sort()).toEqual(["P", "Q", "X"]);
  });

  it("finds descendants and children", () => {
    const nodes = sampleResultNodes();
    expect([...descendantIds("g", nodes)].sort()).toEqual(["o1", "o11", "o2"]);
    expect(hasChildResults(nodes[1], nodes)).toBe(true);
    expect(hasChildResults(nodes[3], nodes)).toBe(false);
  });

  it("offers parents that can hold children, never the node itself or its descendants", () => {
    const nodes = sampleResultNodes();
    expect(parentCandidates(nodes).map((n) => n.code)).toEqual(["Goal", "O1", "O2", "O1.1"]);
    expect(parentCandidates(nodes, { forLevel: "output" }).map((n) => n.code)).toEqual(["O1", "O2"]);
    expect(parentCandidates(nodes, { excludeId: "o1" }).map((n) => n.code)).toEqual(["Goal", "O2"]);
  });

  it("shows Arabic text when present, English otherwise", () => {
    expect(resultText({ text: "Goal", textAr: "الهدف" }, "ar")).toBe("الهدف");
    expect(resultText({ text: "Goal", textAr: null }, "ar")).toBe("Goal");
    expect(resultText({ text: "Goal", textAr: "الهدف" }, "en")).toBe("Goal");
  });
});

describe("result form", () => {
  const nodes = sampleResultNodes();

  it("starts a child one level below its parent", () => {
    expect(newResultValues(nodes[1])).toMatchObject({ level: "output", parentId: "o1" });
    expect(newResultValues(null, "outcome")).toMatchObject({ level: "outcome", parentId: "" });
  });

  it("follows the parent's level when a parent is chosen", () => {
    const values = withParent(newResultValues(null), "g", nodes);
    expect(values).toMatchObject({ parentId: "g", level: "outcome" });
    expect(withParent(values, "", nodes)).toMatchObject({ parentId: "", level: "outcome" });
    expect(resultFormOptions(values, nodes).levels).toEqual(["outcome"]);
  });

  it("locks the level of a result with children", () => {
    const options = resultFormOptions(resultToValues(nodes[1]), nodes, nodes[1]);
    expect(options.levelLocked).toBe(true);
    expect(options.levels).toEqual(["outcome"]);
    expect(options.parents.map((p) => p.code)).toEqual(["Goal"]);
  });

  it("validates code, text, order and level", () => {
    const errors = validateResultForm({ ...newResultValues(nodes[0]), code: "o1", text: "", sortOrder: "-1" }, nodes);
    expect(errors.code).toEqual({ key: "codeTaken", values: { code: "o1" } });
    expect(errors.text).toEqual({ key: "text" });
    expect(errors.sortOrder).toEqual({ key: "sortOrder" });
    expect(validateResultForm({ ...newResultValues(nodes[0]), level: "output", code: "O3", text: "t" }, nodes).level)
      .toEqual({ key: "level" });
    expect(validateResultForm({ ...resultToValues(nodes[1]) }, nodes, nodes[1])).toEqual({});
  });

  it("builds create and update bodies", () => {
    expect(resultCreatePayload({ level: "outcome", parentId: "g", code: " O3 ", text: " Text ", textAr: "", sortOrder: "" }))
      .toEqual({ level: "outcome", parentId: "g", code: "O3", text: "Text", textAr: null });
    expect(resultCreatePayload({ level: "impact", parentId: "", code: "G", text: "T", textAr: "ن", sortOrder: "2" }))
      .toEqual({ level: "impact", parentId: null, code: "G", text: "T", textAr: "ن", sortOrder: 2 });
    expect(resultUpdatePayload(nodes[3], { ...resultToValues(nodes[3]), textAr: "ممارسات تغذية أفضل" }))
      .toEqual({ textAr: "ممارسات تغذية أفضل" });
    expect(resultUpdatePayload(nodes[3], resultToValues(nodes[3]))).toEqual({});
  });

  it("accepts the sort order in Arabic-Indic digits", () => {
    const values = { ...newResultValues(nodes[0]), code: "O3", text: "t", sortOrder: "١٢" };
    expect(validateResultForm(values, nodes).sortOrder).toBeUndefined();
    expect(resultCreatePayload(values).sortOrder).toBe(12);
    expect(resultCreatePayload({ ...values, sortOrder: "0" }).sortOrder).toBe(0);
    expect(validateResultForm({ ...values, sortOrder: "1.5" }, nodes).sortOrder).toEqual({ key: "sortOrder" });
    expect(validateResultForm({ ...values, sortOrder: "1000001" }, nodes).sortOrder).toEqual({ key: "sortOrder" });
  });
});
