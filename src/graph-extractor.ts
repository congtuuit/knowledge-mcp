import path from "node:path";
import type { EntityType, EdgeType, EdgeSourceType } from "./db.js";

// ==========================================
// Extracted Graph Data Structures
// ==========================================

export interface ExtractedEntity {
  name: string;
  type: EntityType;
  source: "auto_link" | "frontmatter";
  metadata: Record<string, unknown>;
}

export interface ExtractedEdge {
  targetName: string;
  edgeType: EdgeType;
  weight: number;
  confidence: number;
  sourceType: EdgeSourceType;
}

export interface ExtractedGraph {
  entity: ExtractedEntity;
  edges: ExtractedEdge[];
}

// ==========================================
// Frontmatter Field => Edge Type Mapping
// ==========================================

const FRONTMATTER_EDGE_MAP: Record<string, { edgeType: EdgeType; weight: number }> = {
  depends_on:     { edgeType: "DEPENDS_ON",    weight: 1.0 },
  implements:     { edgeType: "IMPLEMENTS",     weight: 0.9 },
  supersedes:     { edgeType: "SUPERSEDES",     weight: 1.0 },
  conflicts_with: { edgeType: "CONFLICTS_WITH", weight: 0.8 },
  references:     { edgeType: "REFERENCES",     weight: 0.6 },
};

// ==========================================
// Wikilink & Cross-link Extraction
// ==========================================

export function extractWikilinks(content: string): string[] {
  const targets = new Set<string>();

  // Pattern 1: [[wikilink]] or [[wikilink|alias]]
  const wikiRe = /\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = wikiRe.exec(content)) !== null) {
    const name = normalizeEntityName(m[1]);
    if (name) targets.add(name);
  }

  // Pattern 2: [text](./relative.md) - internal links only
  const mdLinkRe = /\[([^\]]+)\]\((?!https?:\/\/)([^)]+\.(?:md|txt))\)/gi;
  while ((m = mdLinkRe.exec(content)) !== null) {
    const name = normalizeEntityName(path.basename(m[2], path.extname(m[2])));
    if (name) targets.add(name);
  }

  return Array.from(targets);
}

// ==========================================
// Frontmatter Extraction
// ==========================================

export function extractFrontmatterEdges(
  frontmatter: Record<string, unknown>
): ExtractedEdge[] {
  const edges: ExtractedEdge[] = [];

  for (const [field, mapping] of Object.entries(FRONTMATTER_EDGE_MAP)) {
    const value = frontmatter[field];
    if (!value) continue;

    const targets: string[] = Array.isArray(value)
      ? value.map(String).filter(Boolean)
      : [String(value)];

    for (const rawTarget of targets) {
      const targetName = normalizeEntityName(rawTarget);
      if (!targetName) continue;
      edges.push({
        targetName,
        edgeType: mapping.edgeType,
        weight: mapping.weight,
        confidence: 1.0,
        sourceType: "frontmatter" as EdgeSourceType,
      });
    }
  }

  // OWNED_BY from `owner` field
  if (frontmatter.owner) {
    const owner = normalizeEntityName(String(frontmatter.owner));
    if (owner) {
      edges.push({
        targetName: owner,
        edgeType: "OWNED_BY",
        weight: 1.0,
        confidence: 1.0,
        sourceType: "frontmatter",
      });
    }
  }

  return edges;
}

// ==========================================
// Entity Metadata from Frontmatter
// ==========================================

export function extractEntityMetadata(
  frontmatter: Record<string, unknown>
): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  const knownFields = ["title", "status", "version", "tags", "owner", "description", "team"];
  for (const field of knownFields) {
    if (frontmatter[field] !== undefined) {
      meta[field] = frontmatter[field];
    }
  }
  return meta;
}

// ==========================================
// Infer Entity Type
// ==========================================

export function inferEntityType(
  frontmatter: Record<string, unknown>,
  filePath: string
): EntityType {
  const typeField = String(frontmatter.type ?? "").toLowerCase();
  const validTypes: EntityType[] = ["document", "service", "api", "schema", "team", "concept"];
  if (validTypes.includes(typeField as EntityType)) {
    return typeField as EntityType;
  }
  const lower = filePath.toLowerCase();
  if (lower.includes("/api/") || lower.includes("openapi") || lower.includes("swagger")) return "api";
  if (lower.includes("/service/") || lower.includes("/svc/")) return "service";
  if (lower.includes("/schema/") || lower.includes("/db/") || lower.includes("/database/")) return "schema";
  if (lower.includes("/team/") || lower.includes("/owner/")) return "team";
  return "document";
}

// ==========================================
// Main Extractor
// ==========================================

export function extractGraph(
  filePath: string,
  frontmatter: Record<string, unknown>,
  content: string
): ExtractedGraph {
  const rawName =
    (frontmatter.title as string | undefined) ??
    path.basename(filePath, path.extname(filePath));

  const entity: ExtractedEntity = {
    name: normalizeEntityName(rawName) || rawName,
    type: inferEntityType(frontmatter, filePath),
    source: "frontmatter",
    metadata: extractEntityMetadata(frontmatter),
  };

  const frontmatterEdges = extractFrontmatterEdges(frontmatter);

  const wikilinkTargets = extractWikilinks(content);
  const wikilinkEdges: ExtractedEdge[] = wikilinkTargets
    .filter(
      (target) =>
        target.toLowerCase() !== entity.name.toLowerCase() &&
        !frontmatterEdges.some((e) => e.targetName.toLowerCase() === target.toLowerCase())
    )
    .map((target) => ({
      targetName: target,
      edgeType: "REFERENCES" as EdgeType,
      weight: 0.7,
      confidence: 0.9,
      sourceType: "wikilink" as EdgeSourceType,
    }));

  return {
    entity,
    edges: [...frontmatterEdges, ...wikilinkEdges],
  };
}

// ==========================================
// Utility
// ==========================================

export function normalizeEntityName(raw: string): string {
  return raw
    .replace(/\.(?:md|txt|yaml|yml|json)$/i, "")
    .replace(/[_/\\]+/g, "-")
    .trim()
    .toLowerCase();
}
