import axios, { AxiosResponse } from 'axios';

const LINEAGE_API_BASE_URL = '/api/lineage';

export interface LineageEntity {
  id: string;
  labels: string[];
  properties: Record<string, any>;
}

export interface LineageNode {
  id: string;
  labels: string[];
  properties: Record<string, any>;
}

export interface LineageRelationship {
  id: string;
  type: string;
  properties: Record<string, any>;
  startNodeId: string;
  endNodeId: string;
}

export interface LineagePath {
  nodes: LineageNode[];
  relationships: LineageRelationship[];
}

export interface SearchResponse {
  entities: LineageEntity[];
}

export interface LineageResponse {
  paths: LineagePath[];
}

export const lineageAPI = {
  getTopTablesByDegree: async (limit: number = 3): Promise<{ entities: LineageEntity[] }> => {
    const response: AxiosResponse<{ entities: LineageEntity[] }> = await axios.get(
      `${LINEAGE_API_BASE_URL}/top`,
      { params: { limit } }
    );
    return response.data;
  },

  getEntityByTableName: async (tableName: string): Promise<{ entity: LineageEntity }> => {
    const response: AxiosResponse<{ entity: LineageEntity }> = await axios.get(
      `${LINEAGE_API_BASE_URL}/entity`,
      { params: { tableName } }
    );
    return response.data;
  },

  searchEntities: async (query: string, limit: number = 10): Promise<SearchResponse> => {
    const response: AxiosResponse<SearchResponse> = await axios.get(
      `${LINEAGE_API_BASE_URL}/search`,
      { params: { q: query, limit } }
    );
    return response.data;
  },

  getUpstreamLineage: async (entityId: string, depth: number = 3, limit: number = 100): Promise<LineageResponse> => {
    const response: AxiosResponse<LineageResponse> = await axios.get(
      `${LINEAGE_API_BASE_URL}/upstream`,
      { params: { entityId, depth, limit } }
    );
    return response.data;
  },

  getDownstreamLineage: async (entityId: string, depth: number = 3, limit: number = 100): Promise<LineageResponse> => {
    const response: AxiosResponse<LineageResponse> = await axios.get(
      `${LINEAGE_API_BASE_URL}/downstream`,
      { params: { entityId, depth, limit } }
    );
    return response.data;
  },

  getDagLineage: async (dagId: number): Promise<LineageResponse> => {
    const response: AxiosResponse<LineageResponse> = await axios.get(
      `${LINEAGE_API_BASE_URL}/dag/${dagId}`
    );
    return response.data;
  },
};
