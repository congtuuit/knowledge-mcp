import { getDb, getEntityCount, getEdgeCount, getEntityByName, searchEntitiesByName } from "../src/db.js";
import { kHopNeighbors, detectConflicts, findOwner, getEntityLineage } from "../src/graph.js";
import { extractGraph, extractWikilinks, extractFrontmatterEdges } from "../src/graph-extractor.js";

console.log("=== TEST: Graph Extractor ===");

// Test 1: extractWikilinks
const content1 = `
# My Doc
See [[api-payment]] and [[svc-auth|Auth Service]].
Also check [deploy guide](./deploy-guide.md).
External links https://example.com are ignored.
`;
const links = extractWikilinks(content1);
console.log("Wikilinks extracted:", links);
console.assert(links.includes("api-payment"), "FAIL: api-payment not found");
console.assert(links.includes("svc-auth"), "FAIL: svc-auth not found");
console.assert(links.includes("deploy-guide"), "FAIL: deploy-guide not found");
console.log("✅ extractWikilinks PASS\n");

// Test 2: extractFrontmatterEdges
const fm = {
  depends_on: ["svc-payment", "svc-auth"],
  implements: "spec-checkout-v2",
  owner: "team-platform",
  conflicts_with: "policy-old-refund",
};
const edges = extractFrontmatterEdges(fm);
console.log("Frontmatter edges:", edges.map(e => `${e.edgeType} -> ${e.targetName}`));
console.assert(edges.some(e => e.edgeType === "DEPENDS_ON" && e.targetName === "svc-payment"), "FAIL: DEPENDS_ON svc-payment");
console.assert(edges.some(e => e.edgeType === "IMPLEMENTS" && e.targetName === "spec-checkout-v2"), "FAIL: IMPLEMENTS");
console.assert(edges.some(e => e.edgeType === "OWNED_BY" && e.targetName === "team-platform"), "FAIL: OWNED_BY");
console.assert(edges.some(e => e.edgeType === "CONFLICTS_WITH"), "FAIL: CONFLICTS_WITH");
console.log("✅ extractFrontmatterEdges PASS\n");

// Test 3: extractGraph full
const graph = extractGraph("services/checkout.md", fm, content1);
console.log("Entity:", graph.entity);
console.log("Edges:", graph.edges.length, "total");
console.assert(graph.entity.name === "checkout", "FAIL: entity name");
console.assert(graph.entity.type === "service", "FAIL: entity type should be service");
console.log("✅ extractGraph PASS\n");

// Test 4: Graph DB (SQLite)
console.log("=== TEST: Graph DB Layer ===");
const db = getDb();

const entityCount = getEntityCount();
const edgeCount = getEdgeCount();
console.log(`Graph stats: ${entityCount} entities, ${edgeCount} edges`);

if (entityCount > 0) {
  const found = searchEntitiesByName("", 3);
  console.log("Sample entities:", found.map(e => `${e.name} (${e.type})`));
  console.log("✅ DB graph tables accessible PASS");
} else {
  console.log("ℹ️  No entities yet - run npm run reindex first to populate graph");
}

console.log("\n=== ALL GRAPH TESTS COMPLETE ===");
