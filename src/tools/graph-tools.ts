import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getEntityByName, searchEntitiesByName, getEntityCount, getEdgeCount } from "../db.js";
import { kHopNeighbors, detectConflicts, findOwner, getEntityLineage } from "../graph.js";
import type { EdgeType } from "../db.js";

export function registerGraphTools(server: McpServer): void {
  // Tool 9: impact_analysis
  server.tool(
    "impact_analysis",
    "Phan tich ban kinh anh huong (blast radius) khi thay doi mot entity. Duyet do thi K-hop bang SQLite Recursive CTE de tim tat ca cac services, APIs, tai lieu lien quan bi tac dong.",
    {
      entity_name: z.string().describe("Ten entity can phan tich (service, API, doc, schema...)"),
      k: z.number().int().min(1).max(4).optional().default(2).describe("So buoc lan truyen toi da (1-4, mac dinh 2)"),
      edge_types: z
        .array(z.enum(["DEPENDS_ON", "REFERENCES", "IMPLEMENTS", "SUPERSEDES", "OWNED_BY", "CONFLICTS_WITH"]))
        .optional()
        .default(["DEPENDS_ON", "REFERENCES", "IMPLEMENTS"])
        .describe("Loai quan he can duyet"),
    },
    async ({ entity_name, k, edge_types }) => {
      try {
        const entity = getEntityByName(entity_name);
        if (!entity) {
          const candidates = searchEntitiesByName(entity_name, 5);
          return {
            content: [{
              type: "text",
              text: JSON.stringify({ found: false, message: `Entity '${entity_name}' not found in graph.`, suggestions: candidates.map((c) => ({ name: c.name, type: c.type })) }, null, 2),
            }],
          };
        }

        const affected = kHopNeighbors({ startEntityId: entity.id, edgeTypes: edge_types as EdgeType[], maxK: k });

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              source: { id: entity.id, name: entity.name, type: entity.type },
              maxK: k, edgeTypes: edge_types, affectedCount: affected.length,
              affected: affected.map((e) => ({ name: e.name, type: e.type, filePath: e.file_path, influenceScore: Number(e.influence_score.toFixed(4)), depth: e.min_depth })),
            }, null, 2),
          }],
        };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: `impact_analysis error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );

  // Tool 11: detect_conflicts
  server.tool(
    "detect_conflicts",
    "Phat hien cac mau thuan (CONFLICTS_WITH edges) giua entity dau vao va cac tai lieu/chinh sach khac trong knowledge graph.",
    {
      entity_name: z.string().describe("Ten entity can kiem tra mau thuan"),
    },
    async ({ entity_name }) => {
      try {
        const entity = getEntityByName(entity_name);
        if (!entity) {
          return { content: [{ type: "text", text: JSON.stringify({ found: false, message: `Entity '${entity_name}' not found.` }) }] };
        }
        const conflicts = detectConflicts(entity.id);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              entity: { name: entity.name, type: entity.type },
              conflictCount: conflicts.length,
              conflicts: conflicts.map((c) => ({ withEntity: c.entityB.name, withType: c.entityB.type, withFile: c.entityB.filePath, confidence: c.confidence })),
            }, null, 2),
          }],
        };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: `detect_conflicts error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );

  // Tool 12: get_entity_lineage
  server.tool(
    "get_entity_lineage",
    "Truy vet chuoi phu thuoc day du cua mot entity: tu Business Requirement -> API Spec -> Service -> Database Schema.",
    {
      entity_name: z.string().describe("Ten entity can truy vet lineage"),
      max_depth: z.number().int().min(1).max(6).optional().default(4).describe("Do sau toi da cua cay phu thuoc (mac dinh 4)"),
    },
    async ({ entity_name, max_depth }) => {
      try {
        const entity = getEntityByName(entity_name);
        if (!entity) {
          const candidates = searchEntitiesByName(entity_name, 5);
          return {
            content: [{
              type: "text",
              text: JSON.stringify({ found: false, message: `Entity '${entity_name}' not found.`, suggestions: candidates.map((c) => ({ name: c.name, type: c.type })) }, null, 2),
            }],
          };
        }
        const lineage = getEntityLineage(entity.id, max_depth);
        return { content: [{ type: "text", text: JSON.stringify(lineage, null, 2) }] };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: `get_entity_lineage error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );

  // Tool 13: find_owner
  server.tool(
    "find_owner",
    "Xac dinh team hoac nguoi chiu trach nhiem (owner) cua mot entity trong knowledge graph thong qua OWNED_BY edges.",
    {
      entity_name: z.string().describe("Ten service, API, tai lieu can tim owner"),
    },
    async ({ entity_name }) => {
      try {
        const entity = getEntityByName(entity_name);
        if (!entity) {
          return { content: [{ type: "text", text: JSON.stringify({ found: false, message: `Entity '${entity_name}' not found.` }) }] };
        }
        const owner = findOwner(entity.id);
        const graphStats = { entityCount: getEntityCount(), edgeCount: getEdgeCount() };
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ entity: { name: entity.name, type: entity.type, filePath: entity.file_id }, owner: owner ?? null, hasOwner: owner !== null, graphStats }, null, 2),
          }],
        };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: `find_owner error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
}
