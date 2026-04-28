import axios, { AxiosResponse } from 'axios';

const GRAVITINO_API_BASE_URL = '/gravitino/api/metalakes';
const GRAVITINO_METALAKE = import.meta.env.VITE_GRAVITINO_METALAKE || 'test';

export interface NameIdentifier {
  namespace: string[];
  name: string;
}

export interface CatalogListResponse {
  code: number;
  identifiers: NameIdentifier[];
}

export interface SchemaListResponse {
  code: number;
  identifiers: NameIdentifier[];
}

export interface TableListResponse {
  code: number;
  identifiers: NameIdentifier[];
}

export interface ColumnInfo {
  name: string;
  type: string | { type: string; catalogString?: string };
  nullable: boolean;
  comment?: string;
}

export interface TableDetailResponse {
  code: number;
  table: {
    name: string;
    columns: ColumnInfo[];
  };
}

export const gravitinoAPI = {
  /**
   * List all catalogs in a metalake
   * GET /api/metalakes/{metalake_name}/catalogs
   */
  listCatalogs: async (metalake?: string): Promise<CatalogListResponse> => {
    const metalakeName = metalake || GRAVITINO_METALAKE;
    const response: AxiosResponse<CatalogListResponse> = await axios.get(
      `${GRAVITINO_API_BASE_URL}/${metalakeName}/catalogs`,
      {
        headers: {
          'Accept': 'application/vnd.gravitino.v1+json',
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data;
  },

  /**
   * List all schemas under a catalog
   * GET /api/metalakes/{metalake_name}/catalogs/{catalog_name}/schemas
   */
  listSchemas: async (catalog: string, metalake?: string): Promise<SchemaListResponse> => {
    const metalakeName = metalake || GRAVITINO_METALAKE;
    const response: AxiosResponse<SchemaListResponse> = await axios.get(
      `${GRAVITINO_API_BASE_URL}/${metalakeName}/catalogs/${catalog}/schemas`,
      {
        headers: {
          'Accept': 'application/vnd.gravitino.v1+json',
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data;
  },

  /**
   * List all tables under a schema
   * GET /api/metalakes/{metalake_name}/catalogs/{catalog_name}/schemas/{schema_name}/tables
   */
  listTables: async (
    catalog: string,
    schema: string,
    metalake?: string
  ): Promise<TableListResponse> => {
    const metalakeName = metalake || GRAVITINO_METALAKE;
    const response: AxiosResponse<TableListResponse> = await axios.get(
      `${GRAVITINO_API_BASE_URL}/${metalakeName}/catalogs/${catalog}/schemas/${schema}/tables`,
      {
        headers: {
          'Accept': 'application/vnd.gravitino.v1+json',
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data;
  },

  getTableDetail: async (
    catalog: string,
    schema: string,
    table: string,
    metalake?: string
  ): Promise<TableDetailResponse> => {
    const metalakeName = metalake || GRAVITINO_METALAKE;
    const response: AxiosResponse<TableDetailResponse> = await axios.get(
      `${GRAVITINO_API_BASE_URL}/${metalakeName}/catalogs/${catalog}/schemas/${schema}/tables/${table}`,
      {
        headers: {
          'Accept': 'application/vnd.gravitino.v1+json',
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data;
  },
};
