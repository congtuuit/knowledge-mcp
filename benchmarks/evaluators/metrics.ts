/**
 * Các công thức và thuật toán đánh giá chuẩn quốc tế (BEIR / RAGAS / Information Retrieval)
 *
 * BUG #3 FIX (2026-08-30):
 *  - Tách riêng calculateHitRateAtK() (binary: 1.0 nếu top-K chứa ít nhất 1 GT item)
 *    khỏi calculateRecallAtK() (phần trăm GT items được tìm thấy trong top-K).
 *  - Trước đây calculateRecallAtK(k=1) trả về hits/len(GT) thay vì 0 hoặc 1,
 *    khiến HitRate@1 bị giảm nhân tạo với queries có nhiều expected entities.
 */

export interface EvaluationResult {
  hitRateAt1: number;
  recallAt3: number;
  recallAt5: number;
  recallAt10: number;
  mrr: number;
  ndcgAt5: number;
}

export interface SetMetricResult {
  precision: number;
  recall: number;
  f1: number;
}

/**
 * HitRate@K (chuẩn BEIR):
 * Trả về 1.0 nếu top-K results chứa ít nhất 1 ground truth item.
 * Trả về 0.0 nếu không tìm thấy item nào.
 * Đây là số nhị phân (binary), không phụ thuộc vào tổng số GT items.
 */
export function calculateHitRateAtK(
  retrievedIds: string[],
  groundTruthIds: string[],
  k: number
): number {
  if (!groundTruthIds || groundTruthIds.length === 0) return 1.0;
  const topK = retrievedIds.slice(0, k).map((id) => id.toLowerCase().trim());
  const gtSet = new Set(groundTruthIds.map((id) => id.toLowerCase().trim()));
  return topK.some((id) => gtSet.has(id)) ? 1.0 : 0.0;
}

/**
 * Recall@K (chuẩn BEIR):
 * Tỷ lệ bao nhiêu phần trăm ground truth items được tìm thấy trong top-K.
 * = |{GT items found in top-K}| / |{total GT items}|
 * Giá trị trong khoảng [0.0, 1.0].
 */
export function calculateRecallAtK(
  retrievedIds: string[],
  groundTruthIds: string[],
  k: number
): number {
  if (!groundTruthIds || groundTruthIds.length === 0) return 1.0;
  const topK = retrievedIds.slice(0, k).map((id) => id.toLowerCase().trim());
  const gtSet = new Set(groundTruthIds.map((id) => id.toLowerCase().trim()));

  let hits = 0;
  for (const item of topK) {
    if (gtSet.has(item)) {
      hits++;
    }
  }

  return Math.min(1.0, hits / groundTruthIds.length);
}

/**
 * Tính Mean Reciprocal Rank (MRR)
 */
export function calculateMRR(retrievedIds: string[], groundTruthIds: string[]): number {
  if (!groundTruthIds || groundTruthIds.length === 0) return 1.0;
  const gtSet = new Set(groundTruthIds.map((id) => id.toLowerCase().trim()));

  for (let i = 0; i < retrievedIds.length; i++) {
    const item = retrievedIds[i].toLowerCase().trim();
    if (gtSet.has(item)) {
      return 1 / (i + 1);
    }
  }

  return 0.0;
}

/**
 * Tính Normalized Discounted Cumulative Gain (NDCG@K)
 */
export function calculateNDCG(
  retrievedIds: string[],
  groundTruthIds: string[],
  k: number = 5
): number {
  if (!groundTruthIds || groundTruthIds.length === 0) return 1.0;
  const gtSet = new Set(groundTruthIds.map((id) => id.toLowerCase().trim()));
  const topK = retrievedIds.slice(0, k);

  let dcg = 0.0;
  for (let i = 0; i < topK.length; i++) {
    const item = topK[i].toLowerCase().trim();
    const rel = gtSet.has(item) ? 1.0 : 0.0;
    if (rel > 0) {
      dcg += rel / Math.log2(i + 2); // i=0 => log2(2) = 1
    }
  }

  // Ideal DCG (tối đa số items có thể hit)
  const idealCount = Math.min(groundTruthIds.length, k);
  let idcg = 0.0;
  for (let i = 0; i < idealCount; i++) {
    idcg += 1.0 / Math.log2(i + 2);
  }

  if (idcg === 0.0) return 0.0;
  return dcg / idcg;
}

/**
 * Tính Precision, Recall, F1 cho các tập hợp (Blast Radius, Conflict Sets)
 */
export function calculateSetF1(
  retrieved: string[],
  groundTruth: string[]
): SetMetricResult {
  const retSet = new Set(retrieved.map((s) => s.toLowerCase().trim()));
  const gtSet = new Set(groundTruth.map((s) => s.toLowerCase().trim()));

  if (gtSet.size === 0) {
    return {
      precision: retSet.size === 0 ? 1.0 : 0.0,
      recall: 1.0,
      f1: retSet.size === 0 ? 1.0 : 0.0,
    };
  }

  let truePositives = 0;
  for (const item of retSet) {
    if (gtSet.has(item)) {
      truePositives++;
    }
  }

  const precision = retSet.size > 0 ? truePositives / retSet.size : 0.0;
  const recall = gtSet.size > 0 ? truePositives / gtSet.size : 0.0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0.0;

  return { precision, recall, f1 };
}

/**
 * Đánh giá độ chính xác của đường dẫn truy vết chuỗi phụ thuộc (Lineage Path)
 */
export function calculatePathAccuracy(
  retrievedPath: string[],
  groundTruthPath: string[]
): { exactMatch: boolean; overlapRatio: number } {
  if (!groundTruthPath || groundTruthPath.length === 0) {
    return { exactMatch: true, overlapRatio: 1.0 };
  }

  const retNorm = retrievedPath.map((s) => s.toLowerCase().trim());
  const gtNorm = groundTruthPath.map((s) => s.toLowerCase().trim());

  let hits = 0;
  for (const exp of gtNorm) {
    if (retNorm.includes(exp)) hits++;
  }

  const overlapRatio = gtNorm.length > 0 ? hits / gtNorm.length : 0;
  const exactMatch = overlapRatio >= 1.0;

  return { exactMatch, overlapRatio };
}
