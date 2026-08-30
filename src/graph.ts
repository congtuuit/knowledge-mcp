import { getDb, type EntityRow, type EntityWithScore, type EdgeType } from "./db.js";
import { hybridSearch, type SearchResult } from "./search.js";

// ==========================================
// Types
// ==========================================

export interface GraphSearchResult extends SearchResult {
  relatedEntities: Array<{
    id: string;
    name: string;
    type: string;
    filePath: string | null;
    edgeType: string;
    influence: number;
  }>;
}

export interface ConflictResult {
  entityA: { id: string; name: string; type: string; filePath: string | null };
  entityB: { id: string; name: string; type: string; filePath: string | null };
  confidence: number;
}

export interface OwnerResult {
  teamName: string;
  filePath: string | null;
  confidence: number;
}

export interface LineageNode {
  id: string;
  name: string;
  type: string;
  edgeType: string | null;
  depth: number;
  filePath: string | null;
  children: LineageNode[];
}

// ==========================================
// k-hop Recursive CTE (SQLite-native)
// ==========================================

/**
 * Duyệt đồ thị k-hop từ một entity, tính decay score qua mỗi bước.
 * Toàn bộ tính toán xảy ra trong SQLite engine (pushdown computation).
 * Chỉ trả về node co score >= threshold (thường vài chục node).
 */
export function kHopNeighbors(params: {
  startEntityId: string;
  edgeTypes?: EdgeType[];
  direction?: "outgoing" | "incoming" | "both";
  maxK?: number;
  gamma?: number;
  threshold?: number;
  limit?: number;
}): EntityWithScore[] {
  const {
    startEntityId,
    edgeTypes = ["DEPENDS_ON", "REFERENCES", "IMPLEMENTS"],
    direction = "both",
    maxK = 2,
    gamma = 0.6,
    threshold = 0.05,
    limit = 30,
  } = params;

  const db = getDb();
  const edgePlaceholders = edgeTypes.map(() => "?").join(", ");

  let sql = "";
  let bindings: any[] = [];

  if (direction === "outgoing") {
    sql = `
      WITH RECURSIVE traversal(node_id, depth, prop_score, path) AS (
        SELECT
          e.target_id                              AS node_id,
          1                                        AS depth,
          (e.weight * e.confidence * ?)            AS prop_score,
          json_array(?, e.target_id)               AS path
        FROM edges e
        WHERE e.source_id = ?
          AND e.edge_type IN (${edgePlaceholders})

        UNION ALL

        SELECT
          e.target_id                                                      AS node_id,
          t.depth + 1                                                      AS depth,
          CAST(t.prop_score * e.weight * e.confidence * ? AS REAL)         AS prop_score,
          json_insert(t.path, '$[#]', e.target_id)                         AS path
        FROM traversal t
        JOIN edges e ON e.source_id = t.node_id
          AND e.edge_type IN (${edgePlaceholders})
        WHERE t.depth < ?
          AND NOT EXISTS (
            SELECT 1 FROM json_each(t.path) WHERE value = e.target_id
          )
      )
      SELECT
        en.id, en.name, en.type, en.file_id, en.source, en.metadata, en.created_at,
        f.path AS file_path,
        MAX(t.prop_score) AS influence_score,
        MIN(t.depth) AS min_depth
      FROM traversal t
      JOIN entities en ON en.id = t.node_id
      LEFT JOIN files f ON f.id = en.file_id
      GROUP BY en.id
      HAVING MAX(t.prop_score) >= ?
      ORDER BY influence_score DESC
      LIMIT ?
    `;
    bindings = [
      gamma, startEntityId, startEntityId, ...edgeTypes,
      gamma, ...edgeTypes, maxK,
      threshold, limit,
    ];
  } else {
    // direction === "both" or "incoming"
    sql = `
      WITH RECURSIVE traversal(node_id, depth, prop_score, path) AS (
        SELECT
          (CASE WHEN e.source_id = ? THEN e.target_id ELSE e.source_id END) AS node_id,
          1                                        AS depth,
          (e.weight * e.confidence * ?)            AS prop_score,
          json_array(?, (CASE WHEN e.source_id = ? THEN e.target_id ELSE e.source_id END)) AS path
        FROM edges e
        WHERE (e.source_id = ? OR e.target_id = ?)
          AND e.edge_type IN (${edgePlaceholders})

        UNION ALL

        SELECT
          (CASE WHEN e.source_id = t.node_id THEN e.target_id ELSE e.source_id END) AS node_id,
          t.depth + 1                                                      AS depth,
          CAST(t.prop_score * e.weight * e.confidence * ? AS REAL)         AS prop_score,
          json_insert(t.path, '$[#]', (CASE WHEN e.source_id = t.node_id THEN e.target_id ELSE e.source_id END)) AS path
        FROM traversal t
        JOIN edges e ON (e.source_id = t.node_id OR e.target_id = t.node_id)
          AND e.edge_type IN (${edgePlaceholders})
        WHERE t.depth < ?
          AND NOT EXISTS (
            SELECT 1 FROM json_each(t.path) WHERE value = (CASE WHEN e.source_id = t.node_id THEN e.target_id ELSE e.source_id END)
          )
      )
      SELECT
        en.id, en.name, en.type, en.file_id, en.source, en.metadata, en.created_at,
        f.path AS file_path,
        MAX(t.prop_score) AS influence_score,
        MIN(t.depth) AS min_depth
      FROM traversal t
      JOIN entities en ON en.id = t.node_id
      LEFT JOIN files f ON f.id = en.file_id
      WHERE en.id != ?
      GROUP BY en.id
      HAVING MAX(t.prop_score) >= ?
      ORDER BY influence_score DESC
      LIMIT ?
    `;
    bindings = [
      startEntityId, gamma, startEntityId, startEntityId, startEntityId, startEntityId, ...edgeTypes,
      gamma, ...edgeTypes, maxK,
      startEntityId, threshold, limit,
    ];
  }

  return db.prepare(sql).all(...bindings) as unknown as EntityWithScore[];
}

// ==========================================
// Conflict Detection
// ==========================================

/**
 * Tim tat ca cac entity co quan he CONFLICTS_WITH voi entity dau vao.
 */
export function detectConflicts(entityId: string): ConflictResult[] {
  const db = getDb();
  const sql = `
    SELECT
      ea.id AS a_id, ea.name AS a_name, ea.type AS a_type,
      fa.path AS a_path,
      eb.id AS b_id, eb.name AS b_name, eb.type AS b_type,
      fb.path AS b_path,
      e.confidence
    FROM edges e
    JOIN entities ea ON ea.id = e.source_id
    JOIN entities eb ON eb.id = e.target_id
    LEFT JOIN files fa ON fa.id = ea.file_id
    LEFT JOIN files fb ON fb.id = eb.file_id
    WHERE e.edge_type IN ('CONFLICTS_WITH', 'SUPERSEDES')
      AND (e.source_id = ? OR e.target_id = ?)
    ORDER BY e.confidence DESC
  `;

  const rows = db.prepare(sql).all(entityId, entityId) as Array<{
    a_id: string; a_name: string; a_type: string; a_path: string | null;
    b_id: string; b_name: string; b_type: string; b_path: string | null;
    confidence: number;
  }>;

  return rows.map((r) => ({
    entityA: { id: r.a_id, name: r.a_name, type: r.a_type, filePath: r.a_path },
    entityB: { id: r.b_id, name: r.b_name, type: r.b_type, filePath: r.b_path },
    confidence: r.confidence,
  }));
}

// ==========================================
// Find Owner
// ==========================================

/**
 * Tim owner (OWNED_BY edge) cua mot entity.
 * Di nguoc chieu OWNED_BY (target = team entity).
 */
export function findOwner(entityId: string): OwnerResult | null {
  const db = getDb();
  const sql = `
    SELECT
      en.name AS team_name,
      f.path  AS file_path,
      e.confidence
    FROM edges e
    JOIN entities en ON en.id = e.target_id
    LEFT JOIN files f ON f.id = en.file_id
    WHERE e.source_id = ?
      AND e.edge_type = 'OWNED_BY'
    ORDER BY e.confidence DESC
    LIMIT 1
  `;

  const row = db.prepare(sql).get(entityId) as {
    team_name: string; file_path: string | null; confidence: number;
  } | undefined;

  if (!row) return null;
  return { teamName: row.team_name, filePath: row.file_path, confidence: row.confidence };
}

// ==========================================
// Entity Lineage (Upstream Tracing)
// ==========================================

/**
 * Xay dung cay phu thuoc tu entity, di theo chieu nguoc (target -> source).
 * VD: Code Module -> API Spec -> BRD -> Business Rule
 */
export function getEntityLineage(
  entityId: string,
  maxDepth = 4
): LineageNode {
  const db = getDb();

  // Get root entity
  const root = db
    .prepare("SELECT en.*, f.path AS file_path FROM entities en LEFT JOIN files f ON f.id = en.file_id WHERE en.id = ?")
    .get(entityId) as (EntityRow & { file_path: string | null }) | undefined;

  if (!root) {
    return { id: entityId, name: "unknown", type: "document", edgeType: null, depth: 0, filePath: null, children: [] };
  }

  function buildNode(nodeId: string, depth: number, visitedSet: Set<string>): LineageNode {
    const entity = db
      .prepare("SELECT en.*, f.path AS file_path FROM entities en LEFT JOIN files f ON f.id = en.file_id WHERE en.id = ?")
      .get(nodeId) as (EntityRow & { file_path: string | null }) | undefined;

    const node: LineageNode = {
      id: nodeId,
      name: entity?.name ?? nodeId,
      type: entity?.type ?? "document",
      edgeType: null,
      depth,
      filePath: entity?.file_path ?? null,
      children: [],
    };

    if (depth >= maxDepth) return node;

    // Get outgoing edges (forward lineage)
    const childEdges = db
      .prepare(`
        SELECT e.target_id, e.edge_type, en.name, en.type, f.path AS file_path
        FROM edges e
        JOIN entities en ON en.id = e.target_id
        LEFT JOIN files f ON f.id = en.file_id
        WHERE e.source_id = ?
          AND e.edge_type IN ('DEPENDS_ON', 'IMPLEMENTS', 'REFERENCES')
        ORDER BY e.weight DESC
        LIMIT 10
      `)
      .all(nodeId) as Array<{
        target_id: string; edge_type: string; name: string; type: string; file_path: string | null;
      }>;

    for (const edge of childEdges) {
      if (visitedSet.has(edge.target_id)) continue; // cycle guard
      visitedSet.add(edge.target_id);
      const child = buildNode(edge.target_id, depth + 1, visitedSet);
      child.edgeType = edge.edge_type;
      node.children.push(child);
    }

    return node;
  }

  return buildNode(entityId, 0, new Set([entityId]));
}

// ==========================================
// Graph-Aware Hybrid Search
// ==========================================

/**
 * Chay hybridSearch (BM25 + Vector + RRF) truoc.
 * Sau do mo rong 1-hop de lay cac entity lien quan den top chunks.
 * Tra ve ket qua giau hon: text chunks + related entities.
 */
export async function graphHybridSearch(
  query: string,
  k = 8
): Promise<GraphSearchResult[]> {
  const db = getDb();
  const chunks = await hybridSearch(query, k);

  const results: GraphSearchResult[] = [];

  for (const chunk of chunks) {
    // Tim cac entities lien ket voi chunk nay
    const linkedEntities = db.prepare(`
      SELECT
        en.id, en.name, en.type, en.metadata,
        f.path AS file_path,
        e.edge_type, e.weight
      FROM entity_chunk_map ecm
      JOIN entities en ON en.id = ecm.entity_id
      LEFT JOIN files f ON f.id = en.file_id
      LEFT JOIN edges e ON e.source_id = en.id
      WHERE ecm.chunk_id = ?
      LIMIT 5
    `).all(chunk.chunkId) as Array<{
      id: string; name: string; type: string; metadata: string | null;
      file_path: string | null; edge_type: string | null; weight: number;
    }>;

    // 1-hop neighbors cho entity chinh cua chunk nay (neu co)
    const relatedEntities = linkedEntities.map((le) => ({
      id: le.id,
      name: le.name,
      type: le.type,
      filePath: le.file_path,
      edgeType: le.edge_type ?? "REFERENCES",
      influence: le.weight,
    }));

    results.push({
      ...chunk,
      relatedEntities,
    });
  }

  return results;
}
