import type { IndicatorLevel, ResultNode } from "@/types/api";

/**
 * Results-chain hierarchy (knowledge/me-foundations.md §1), mirroring the
 * backend rule in src/services/indicators/hierarchy.ts:
 * impact > outcome > output > activity. A result's parent is optional; when
 * present it is exactly one level above (an outcome sits under the impact, an
 * output under an outcome, an activity under an output). An impact never has
 * a parent. Pure functions only.
 */

export const LEVEL_RANK: Record<IndicatorLevel, number> = {
  impact: 0,
  outcome: 1,
  output: 2,
  activity: 3,
};

/** Levels from the top of the results chain to the bottom. */
export const LEVELS_TOP_DOWN: IndicatorLevel[] = (Object.keys(LEVEL_RANK) as IndicatorLevel[])
  .sort((a, b) => LEVEL_RANK[a] - LEVEL_RANK[b]);

/** The level a parent of `child` must have, or null when the level never has a parent (impact). */
export function parentLevelOf(child: IndicatorLevel): IndicatorLevel | null {
  return LEVELS_TOP_DOWN[LEVEL_RANK[child] - 1] ?? null;
}

/** The level of results that sit under `parent`, or null when nothing can (activity). */
export function childLevelOf(parent: IndicatorLevel): IndicatorLevel | null {
  return LEVELS_TOP_DOWN[LEVEL_RANK[parent] + 1] ?? null;
}

/** True when a result at level `child` may sit under a parent at level `parent` (null = no parent). */
export function isValidParentLevel(child: IndicatorLevel, parent: IndicatorLevel | null): boolean {
  if (parent === null) return true;
  return LEVEL_RANK[parent] === LEVEL_RANK[child] - 1;
}

/** Levels a new or edited result may have under a parent of `parentLevel` (null = no parent: any level). */
export function allowedLevelsUnder(parentLevel: IndicatorLevel | null): IndicatorLevel[] {
  if (parentLevel === null) return [...LEVELS_TOP_DOWN];
  const child = childLevelOf(parentLevel);
  return child ? [child] : [];
}

type Sortable = Pick<ResultNode, "level" | "sortOrder" | "code">;

/** Order: level (impact first), then sortOrder, then code (O2 before O10). */
export function compareResultNodes(a: Sortable, b: Sortable): number {
  return (
    LEVEL_RANK[a.level] - LEVEL_RANK[b.level]
    || a.sortOrder - b.sortOrder
    || a.code.localeCompare(b.code, "en", { numeric: true, sensitivity: "base" })
  );
}

export function sortResultNodes<T extends Sortable>(nodes: readonly T[]): T[] {
  return [...nodes].sort(compareResultNodes);
}

export interface ResultTreeItem {
  node: ResultNode;
  depth: number;
  children: ResultTreeItem[];
}

/**
 * Builds the tree from a flat list. Nodes whose parent is missing from the
 * list become roots, so nothing is hidden; cycles cannot hang the build.
 */
export function buildResultTree(nodes: readonly ResultNode[]): ResultTreeItem[] {
  const ids = new Set(nodes.map((n) => n.id));
  const childrenOf = new Map<string | null, ResultNode[]>();
  for (const node of sortResultNodes(nodes)) {
    const parentKey = node.parentId && ids.has(node.parentId) && node.parentId !== node.id ? node.parentId : null;
    const list = childrenOf.get(parentKey) ?? [];
    list.push(node);
    childrenOf.set(parentKey, list);
  }

  const placed = new Set<string>();
  const build = (parentKey: string | null, depth: number): ResultTreeItem[] =>
    (childrenOf.get(parentKey) ?? [])
      .filter((node) => !placed.has(node.id))
      .map((node) => {
        placed.add(node.id);
        return { node, depth, children: build(node.id, depth + 1) };
      });

  const roots = build(null, 0);
  // Nodes caught in a parent cycle are never reached from a root: show them at the top level.
  for (const node of sortResultNodes(nodes)) {
    if (!placed.has(node.id)) {
      placed.add(node.id);
      roots.push({ node, depth: 0, children: build(node.id, 1) });
    }
  }
  return roots;
}

/** Depth-first list of the tree, for select options. */
export function flattenResultTree(tree: readonly ResultTreeItem[]): Array<{ node: ResultNode; depth: number }> {
  return tree.flatMap((item) => [{ node: item.node, depth: item.depth }, ...flattenResultTree(item.children)]);
}

/** Ids of every result below `nodeId`. */
export function descendantIds(nodeId: string, nodes: readonly ResultNode[]): Set<string> {
  const out = new Set<string>();
  const queue = [nodeId];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const node of nodes) {
      if (node.parentId === current && !out.has(node.id) && node.id !== nodeId) {
        out.add(node.id);
        queue.push(node.id);
      }
    }
  }
  return out;
}

/** True when the result has child results (from the list or the API's _count). */
export function hasChildResults(node: ResultNode, nodes: readonly ResultNode[]): boolean {
  return (node._count?.children ?? 0) > 0 || nodes.some((n) => n.parentId === node.id);
}

/**
 * Results that may be the parent of `forLevel` (or of any level when omitted):
 * never an activity, never the edited result itself or one of its descendants.
 */
export function parentCandidates(
  nodes: readonly ResultNode[],
  options: { forLevel?: IndicatorLevel; excludeId?: string } = {},
): ResultNode[] {
  const excluded = options.excludeId ? descendantIds(options.excludeId, nodes) : new Set<string>();
  if (options.excludeId) excluded.add(options.excludeId);
  const wanted = options.forLevel ? parentLevelOf(options.forLevel) : undefined;
  return sortResultNodes(nodes).filter((node) => {
    if (excluded.has(node.id)) return false;
    if (childLevelOf(node.level) === null) return false;
    return wanted === undefined || node.level === wanted;
  });
}

/** The result statement in the given language (Arabic falls back to English when missing). */
export function resultText(node: Pick<ResultNode, "text" | "textAr">, lang: "en" | "ar"): string {
  return lang === "ar" && node.textAr ? node.textAr : node.text;
}
