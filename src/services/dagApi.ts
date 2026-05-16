import axios, { AxiosResponse } from 'axios';

const DAG_API_BASE_URL = '/api/dag';

export interface DagView {
  id: number;
  name: string;
  description: string | null;
  nodeIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateDagRequest {
  name: string;
  nodeIds: string[];
  description?: string;
}

export interface CreateDagResponse {
  dagView: DagView;
}

export interface GetAllDagsResponse {
  dagViews: DagView[];
}

export interface GetDagByIdResponse {
  dagView: DagView;
}

export interface DeleteDagResponse {
  message: string;
  id: number;
}

export interface UpdateDagRequest {
  name?: string;
  description?: string | null;
}

export interface UpdateDagResponse {
  dagView: DagView;
}

export const dagAPI = {
  /**
   * Create a DAG view from selected node IDs
   * POST /api/dag
   */
  createDag: async (data: CreateDagRequest): Promise<CreateDagResponse> => {
    const response: AxiosResponse<CreateDagResponse> = await axios.post(
      DAG_API_BASE_URL,
      data
    );
    return response.data;
  },

  /**
   * Get all saved DAG views
   * GET /api/dag
   */
  getAllDags: async (): Promise<GetAllDagsResponse> => {
    const response: AxiosResponse<GetAllDagsResponse> = await axios.get(
      DAG_API_BASE_URL
    );
    return response.data;
  },

  /**
   * Get DAG view details by ID
   * GET /api/dag/:id
   */
  getDagById: async (id: number): Promise<GetDagByIdResponse> => {
    const response: AxiosResponse<GetDagByIdResponse> = await axios.get(
      `${DAG_API_BASE_URL}/${id}`
    );
    return response.data;
  },

  /**
   * Update DAG view name / description
   * PATCH /api/dag/:id
   */
  updateDag: async (id: number, data: UpdateDagRequest): Promise<UpdateDagResponse> => {
    const response: AxiosResponse<UpdateDagResponse> = await axios.patch(
      `${DAG_API_BASE_URL}/${id}`,
      data
    );
    return response.data;
  },

  /**
   * Delete a DAG view by ID
   * DELETE /api/dag/:id
   */
  deleteDag: async (id: number): Promise<DeleteDagResponse> => {
    const response: AxiosResponse<DeleteDagResponse> = await axios.delete(
      `${DAG_API_BASE_URL}/${id}`
    );
    return response.data;
  },
};
