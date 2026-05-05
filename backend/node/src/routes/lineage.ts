import { Router, Request, Response } from 'express';
import { getSession } from '../config/neo4j.js';
import { pool } from '../config/postgres.js';
import neo4j from 'neo4j-driver';

const router: Router = Router();

interface Node {
  id: string;
  labels: string[];
  properties: Record<string, any>;
}

interface Relationship {
  id: string;
  type: string;
  properties: Record<string, any>;
  startNodeId: string;
  endNodeId: string;
}

interface Path {
  nodes: Node[];
  relationships: Relationship[];
}

interface Neo4jPath {
  start: any;
  end: any;
  segments: any[];
  length: number;
}

/**
 * Convert Neo4j Path object to standardized Path format
 */
function convertNeo4jPathToPath(path: Neo4jPath | null): Path {
  if (!path) {
    return {
      nodes: [],
      relationships: []
    };
  }

  // Extract nodes and relationships from segments
  const nodes: Node[] = [];
  const relationships: Relationship[] = [];
  const nodeIds = new Set<string>();

  // Add start node
  if (path.start) {
    const startNodeId = path.start.elementId;
    if (!nodeIds.has(startNodeId)) {
      nodes.push({
        id: startNodeId,
        labels: path.start.labels,
        properties: path.start.properties
      });
      nodeIds.add(startNodeId);
    }
  }

  // Add end node
  if (path.end) {
    const endNodeId = path.end.elementId;
    if (!nodeIds.has(endNodeId)) {
      nodes.push({
        id: endNodeId,
        labels: path.end.labels,
        properties: path.end.properties
      });
      nodeIds.add(endNodeId);
    }
  }

  // Process segments to get intermediate nodes and relationships
  if (path.segments && Array.isArray(path.segments)) {
    path.segments.forEach((segment: any) => {
      // Add relationship（Neo4j driver 版本差异时 fallback 到 segment 两端）
      if (segment.relationship) {
        const r = segment.relationship;
        const startNodeId =
          r.startNodeElementId ?? segment.start?.elementId ?? segment.start?.identity?.toString?.();
        const endNodeId =
          r.endNodeElementId ?? segment.end?.elementId ?? segment.end?.identity?.toString?.();
        if (startNodeId && endNodeId) {
          relationships.push({
            id: r.elementId ?? `${startNodeId}-${endNodeId}`,
            type: r.type,
            properties: r.properties ?? {},
            startNodeId,
            endNodeId,
          });
        }
      }

      // Add start node from segment
      if (segment.start && segment.start.elementId) {
        const nodeId = segment.start.elementId;
        if (!nodeIds.has(nodeId)) {
          nodes.push({
            id: nodeId,
            labels: segment.start.labels,
            properties: segment.start.properties
          });
          nodeIds.add(nodeId);
        }
      }

      // Add end node from segment
      if (segment.end && segment.end.elementId) {
        const nodeId = segment.end.elementId;
        if (!nodeIds.has(nodeId)) {
          nodes.push({
            id: nodeId,
            labels: segment.end.labels,
            properties: segment.end.properties
          });
          nodeIds.add(nodeId);
        }
      }
    });
  }

  return { nodes, relationships };
}

/**
 * Get top tables by degree (most connected tables)
 * Query: GET /api/lineage/top?limit=3
 */
router.get('/top', async (req: Request, res: Response): Promise<void> => {
  try {
    const { limit = '3' } = req.query;

    const session = getSession();
    const limitValue = neo4j.int(Math.floor(parseInt(limit as string)));
    const query = `
      MATCH (n:Table)
      OPTIONAL MATCH (n)-[r:MAKEUP]-()
      WITH n, count(r) AS degree
      ORDER BY degree DESC
      LIMIT $limit
      RETURN n, degree
    `;
    
    const result = await session.run(query, { limit: limitValue });
    const entities = result.records.map((record: any) => {
      const node = record.get('n');
      return {
        id: node.elementId,
        labels: node.labels,
        properties: node.properties,
        degree: record.get('degree').toNumber()
      };
    });
    
    await session.close();
    
    res.json({ entities });
  } catch (error) {
    console.error('Error getting top tables by degree:', error);
    res.status(500).json({ error: 'Failed to get top tables' });
  }
});

/**
 * Get entity by table name
 * Query: GET /api/lineage/entity?tableName=xxx
 */
router.get('/entity', async (req: Request, res: Response): Promise<void> => {
  try {
    const { tableName } = req.query;
    
    if (!tableName || typeof tableName !== 'string') {
      res.status(400).json({ error: 'Table name is required' });
      return;
    }

    const session = getSession();
    const query = `
      MATCH (n:Table)
      WHERE n.table_name = $tableName
      RETURN n
      LIMIT 1
    `;
    
    const result = await session.run(query, { tableName });
    
    if (result.records.length === 0) {
      await session.close();
      res.status(404).json({ error: 'Table not found' });
      return;
    }
    
    const node = result.records[0].get('n');
    const entity = {
      id: node.elementId,
      labels: node.labels,
      properties: node.properties
    };
    
    await session.close();
    
    res.json({ entity });
  } catch (error) {
    console.error('Error getting entity by table name:', error);
    res.status(500).json({ error: 'Failed to get entity' });
  }
});

/**
 * Search entities in Neo4j
 * Query: GET /api/lineage/search?q=keyword&limit=10
 */
router.get('/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const { q, limit = '10' } = req.query;
    
    if (!q || typeof q !== 'string') {
      res.status(400).json({ error: 'Query parameter "q" is required' });
      return;
    }

    const session = getSession();
    const limitValue = neo4j.int(Math.floor(parseInt(limit as string)));
    const cypher = `
      MATCH (n:Table)
      WHERE any(prop IN keys(n) WHERE toString(n[prop]) CONTAINS $searchQuery)
      RETURN n
      LIMIT $limit
    `;
    
    const result = await session.run(cypher, { searchQuery: q, limit: limitValue });
    const entities = result.records.map((record: any) => {
      const node = record.get('n');
      return {
        id: node.elementId,
        labels: node.labels,
        properties: node.properties
      };
    });
    
    await session.close();
    
    res.json({ entities });
  } catch (error) {
    console.error('Error searching entities:', error);
    res.status(500).json({ error: 'Failed to search entities' });
  }
});

/**
 * Get upstream lineage for an entity
 * Query: GET /api/lineage/upstream?entityId=xxx&depth=3
 */
router.get('/upstream', async (req: Request, res: Response): Promise<void> => {
  try {
    const { entityId, depth = '3', limit = '100' } = req.query;

    if (!entityId || typeof entityId !== 'string') {
      res.status(400).json({ error: 'Entity ID is required' });
      return;
    }

    const session = getSession();
    const depthInt = Math.min(Math.floor(parseInt(depth as string)), 5); // Max depth 5
    const limitInt = Math.min(Math.floor(parseInt(limit as string)), 500); // Max limit 500
    // ETL 血缘：(依赖)-[:MAKEUP]->(产出)；上游 = 沿 MAKEUP 逆向指向当前表
    const query = `
      MATCH path = (n)-[:MAKEUP*1..${depthInt}]->(start)
      WHERE elementId(start) = $entityId
      RETURN path
      LIMIT ${limitInt}
    `;

    const result = await session.run(query, { entityId });
    const paths: Path[] = result.records.map((record: any) => {
      const path: Neo4jPath = record.get('path');
      return convertNeo4jPathToPath(path);
    });

    await session.close();

    res.json({ paths });
  } catch (error) {
    console.error('Error getting upstream lineage:', error);
    res.status(500).json({ error: 'Failed to get upstream lineage' });
  }
});

/**
 * Get downstream lineage for an entity
 * Query: GET /api/lineage/downstream?entityId=xxx&depth=3
 */
router.get('/downstream', async (req: Request, res: Response): Promise<void> => {
  try {
    const { entityId, depth = '3', limit = '100' } = req.query;

    if (!entityId || typeof entityId !== 'string') {
      res.status(400).json({ error: 'Entity ID is required' });
      return;
    }

    const session = getSession();
    const depthInt = Math.min(Math.floor(parseInt(depth as string)), 5); // Max depth 5
    const limitInt = Math.min(Math.floor(parseInt(limit as string)), 500); // Max limit 500
    // 沿 (start)-[:MAKEUP]-> 的下游：产出表再被谁依赖
    const query = `
      MATCH path = (start)-[:MAKEUP*1..${depthInt}]->(n)
      WHERE elementId(start) = $entityId
      RETURN path
      LIMIT ${limitInt}
    `;

    const result = await session.run(query, { entityId });
    const paths: Path[] = result.records.map((record: any) => {
      const path: Neo4jPath = record.get('path');
      return convertNeo4jPathToPath(path);
    });

    await session.close();

    res.json({ paths });
  } catch (error) {
    console.error('Error getting downstream lineage:', error);
    res.status(500).json({ error: 'Failed to get downstream lineage' });
  }
});

/**
 * Get lineage for a DAG view by ID
 * Query: GET /api/lineage/dag/:dagId
 */
router.get('/dag/:dagId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { dagId } = req.params;
    const dagIdStr = Array.isArray(dagId) ? dagId[0] : dagId;

    if (!dagIdStr || isNaN(parseInt(dagIdStr))) {
      res.status(400).json({ error: 'Valid DAG ID is required' });
      return;
    }

    // Fetch DAG view from PostgreSQL
    const pgClient = await pool.connect();
    let nodeIds: string[];
    try {
      const pgQuery = `
        SELECT node_ids
        FROM dag_views
        WHERE id = $1
      `;
      const pgResult = await pgClient.query(pgQuery, [dagIdStr]);

      if (pgResult.rows.length === 0) {
        res.status(404).json({ error: 'DAG view not found' });
        return;
      }

      nodeIds = pgResult.rows[0].node_ids;
    } finally {
      pgClient.release();
    }

    // Query Neo4j for relationships between the nodes
    const session = getSession();
    const nodeIdsString = nodeIds.map((id: string) => `'${id}'`).join(', ');
    const query = `
      MATCH (a:Table)-[r:MAKEUP]->(b:Table)
      WHERE elementId(a) IN [${nodeIdsString}] AND elementId(b) IN [${nodeIdsString}]
      RETURN a, r, b
    `;

    const result = await session.run(query);

    const nodesMap = new Map<string, Node>();
    const relationships: Relationship[] = [];

    result.records.forEach((record: any) => {
      const startNode = record.get('a');
      const relationship = record.get('r');
      const endNode = record.get('b');

      // Add start node
      const startNodeId = startNode.elementId;
      if (!nodesMap.has(startNodeId)) {
        nodesMap.set(startNodeId, {
          id: startNodeId,
          labels: startNode.labels,
          properties: startNode.properties
        });
      }

      // Add end node
      const endNodeId = endNode.elementId;
      if (!nodesMap.has(endNodeId)) {
        nodesMap.set(endNodeId, {
          id: endNodeId,
          labels: endNode.labels,
          properties: endNode.properties
        });
      }

      const rs = relationship.startNodeElementId ?? startNode.elementId;
      const re = relationship.endNodeElementId ?? endNode.elementId;
      relationships.push({
        id: relationship.elementId,
        type: relationship.type,
        properties: relationship.properties ?? {},
        startNodeId: rs,
        endNodeId: re,
      });
    });

    await session.close();

    // Return as a single path containing all nodes and relationships
    res.json({
      paths: [{
        nodes: Array.from(nodesMap.values()),
        relationships
      }]
    });
  } catch (error) {
    console.error('Error getting DAG lineage:', error);
    res.status(500).json({ error: 'Failed to get DAG lineage' });
  }
});

export default router;
