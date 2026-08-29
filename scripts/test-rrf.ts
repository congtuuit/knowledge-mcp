import { mergeRrf, type SearchResult } from "../src/search.js";

console.log("=== TEST: RRF Merge Logic (Pure Unit Test) ===");

const itemA: SearchResult = { chunkId: "chunk-A", filePath: "docA.md", headingPath: "Heading A", content: "Content A", score: 0.95 };
const itemB: SearchResult = { chunkId: "chunk-B", filePath: "docB.md", headingPath: "Heading B", content: "Content B", score: 0.85 };
const itemC: SearchResult = { chunkId: "chunk-C", filePath: "docC.md", headingPath: "Heading C", content: "Content C", score: 0.75 };
const itemD: SearchResult = { chunkId: "chunk-D", filePath: "docD.md", headingPath: "Heading D", content: "Content D", score: 0.65 };

// Case 1: itemA is #1 in keyword and #1 in vector -> must be #1 with sum of scores
const keyword1 = [itemA, itemB];
const vector1 = [itemA, itemC];

const rrfResults1 = mergeRrf(keyword1, vector1, 5, 60);
console.log("Test 1 - Overlapping item rank 1:", rrfResults1.map(r => `${r.chunkId} (score: ${r.score.toFixed(6)})`));

console.assert(rrfResults1[0].chunkId === "chunk-A", "FAIL: chunk-A should be top ranked");
const expectedScoreA = (1 / (60 + 0 + 1)) + (1 / (60 + 0 + 1));
console.assert(Math.abs(rrfResults1[0].score - expectedScoreA) < 1e-9, `FAIL: Expected score ${expectedScoreA}, got ${rrfResults1[0].score}`);
console.log("✅ Test 1 PASS");

// Case 2: itemB is #2 in keyword (score 1/62), itemC is #2 in vector (score 1/62) -> both have identical RRF score
console.assert(Math.abs(rrfResults1[1].score - (1 / 62)) < 1e-9, "FAIL: Rank 2 score mismatch");
console.assert(Math.abs(rrfResults1[2].score - (1 / 62)) < 1e-9, "FAIL: Rank 3 score mismatch");
console.log("✅ Test 2 PASS");

// Case 3: Empty inputs
const emptyRes = mergeRrf([], [], 5, 60);
console.assert(emptyRes.length === 0, "FAIL: Empty inputs should return empty array");
console.log("✅ Test 3 PASS (Empty inputs)");

// Case 4: Cutoff k works properly
const keyword4 = [itemA, itemB, itemC, itemD];
const vector4 = [itemD, itemC, itemB, itemA];
const top2 = mergeRrf(keyword4, vector4, 2, 60);
console.assert(top2.length === 2, `FAIL: Expected 2 items with k=2, got ${top2.length}`);
console.log("✅ Test 4 PASS (k-cutoff)");

console.log("\n=== ALL RRF UNIT TESTS PASSED ===");
