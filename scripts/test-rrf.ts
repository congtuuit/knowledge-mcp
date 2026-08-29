import { mergeRrf, type SearchResult } from "../src/search.js";

console.log("=================================================");
console.log("🧪 UNIT TEST SUITE: RRF (Reciprocal Rank Fusion)");
console.log("=================================================\n");

function mockItem(id: string, score: number = 1.0): SearchResult {
  return {
    chunkId: id,
    filePath: `docs/${id}.md`,
    headingPath: `Heading ${id}`,
    content: `Content for chunk ${id}`,
    score,
  };
}

let passed = 0;
let total = 0;

function it(name: string, fn: () => void) {
  total++;
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Test 1: Overlapping top item gets highest combined score
it("should sum reciprocal ranks when an item appears in both keyword and vector lists", () => {
  const kw = [mockItem("doc-A"), mockItem("doc-B")];
  const vec = [mockItem("doc-A"), mockItem("doc-C")];

  const results = mergeRrf(kw, vec, 5, 60);

  const expectedA = (1 / 61) + (1 / 61);
  if (results[0].chunkId !== "doc-A") throw new Error(`Expected doc-A at rank 1, got ${results[0].chunkId}`);
  if (Math.abs(results[0].score - expectedA) > 1e-9) {
    throw new Error(`Expected score ${expectedA}, got ${results[0].score}`);
  }
});

// Test 2: Disjoint sets
it("should merge completely disjoint keyword and vector candidate sets", () => {
  const kw = [mockItem("kw-1"), mockItem("kw-2")];
  const vec = [mockItem("vec-1"), mockItem("vec-2")];

  const results = mergeRrf(kw, vec, 10, 60);

  if (results.length !== 4) throw new Error(`Expected 4 merged items, got ${results.length}`);
  const topScores = [results[0].score, results[1].score];
  if (Math.abs(topScores[0] - (1 / 61)) > 1e-9 || Math.abs(topScores[1] - (1 / 61)) > 1e-9) {
    throw new Error(`Top 2 disjoint items should both have score 1/61, got ${topScores}`);
  }
});

// Test 3: Asymmetric sizes
it("should handle asymmetric input sizes gracefully", () => {
  const kw = [mockItem("kw-1"), mockItem("kw-2"), mockItem("kw-3"), mockItem("kw-4"), mockItem("kw-5")];
  const vec = [mockItem("vec-1")];

  const results = mergeRrf(kw, vec, 10, 60);
  if (results.length !== 6) throw new Error(`Expected 6 items, got ${results.length}`);
});

// Test 4: Cutoff k works
it("should respect k limit when total unique items > k", () => {
  const kw = Array.from({ length: 20 }, (_, i) => mockItem(`kw-${i}`));
  const vec = Array.from({ length: 20 }, (_, i) => mockItem(`vec-${i}`));

  const results = mergeRrf(kw, vec, 7, 60);
  if (results.length !== 7) throw new Error(`Expected exactly 7 items, got ${results.length}`);
});

// Test 5: k larger than candidate count
it("should return all items when k is larger than candidate count", () => {
  const kw = [mockItem("only-1")];
  const vec = [mockItem("only-2")];

  const results = mergeRrf(kw, vec, 50, 60);
  if (results.length !== 2) throw new Error(`Expected 2 items, got ${results.length}`);
});

// Test 6: Empty inputs
it("should return empty array when both inputs are empty", () => {
  const results = mergeRrf([], [], 10, 60);
  if (results.length !== 0) throw new Error(`Expected 0 items, got ${results.length}`);
});

// Test 7: Monotonic descending sort order
it("should guarantee strictly non-increasing (descending) RRF scores", () => {
  const kw = Array.from({ length: 15 }, (_, i) => mockItem(`item-${i % 5}`));
  const vec = Array.from({ length: 15 }, (_, i) => mockItem(`item-${(i + 2) % 7}`));

  const results = mergeRrf(kw, vec, 20, 60);
  for (let i = 0; i < results.length - 1; i++) {
    if (results[i].score < results[i + 1].score) {
      throw new Error(`Monotonicity violated at index ${i}: ${results[i].score} < ${results[i + 1].score}`);
    }
  }
});

console.log(`\n=================================================`);
console.log(`Results: ${passed}/${total} tests passed.`);
console.log(`=================================================`);

if (passed !== total) {
  process.exit(1);
}
