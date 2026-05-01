import axios, { AxiosResponse } from 'axios';

const CUBE_API_BASE_URL = 'http://127.0.0.1:3001/api/cube';

export interface CubeInfo {
  name: string;
  version_count: string;
  updated_at: string;
  published_at: string | null;
}

export interface CubeVersion {
  id: number;
  name: string;
  remark: string;
  is_published: boolean;
  canvas_data: {
    nodes?: any[];
    edges?: any[];
    viewport?: any;
  };
  field_list: any[];
  model_json: any;
  model_yml: string;
  model_view: string;
  created_at: string;
  updated_at: string;
}

export interface SaveVersionRequest {
  name: string;
  remark?: string;
  canvasData: {
    nodes: any[];
    edges: any[];
    viewport?: any;
  };
  fieldList: any[];
  modelJson: string;
  modelYml: string;
  modelView: string;
}

export interface ListCubesResponse {
  cubes: CubeInfo[];
}

export interface CreateCubeResponse {
  cube: { name: string; version: CubeVersion };
}

export interface CopyCubeResponse {
  name: string;
  version_count: number;
}

export interface ListVersionsResponse {
  versions: CubeVersion[];
}

export interface GetVersionResponse {
  version: CubeVersion;
}

export interface SaveVersionResponse {
  version: CubeVersion;
}

export interface PublishVersionResponse {
  version: CubeVersion;
}

export const cubeAPI = {
  listCubes: async (): Promise<ListCubesResponse> => {
    const response: AxiosResponse<ListCubesResponse> = await axios.get(CUBE_API_BASE_URL);
    return response.data;
  },

  createCube: async (name: string): Promise<CreateCubeResponse> => {
    const response: AxiosResponse<CreateCubeResponse> = await axios.post(CUBE_API_BASE_URL, { name });
    return response.data;
  },

  copyCube: async (sourceName: string, targetName: string): Promise<CopyCubeResponse> => {
    const response: AxiosResponse<CopyCubeResponse> = await axios.post(
      `${CUBE_API_BASE_URL}/${encodeURIComponent(sourceName)}/copy`,
      { targetName }
    );
    return response.data;
  },

  deleteCube: async (name: string): Promise<{ success: boolean }> => {
    const response: AxiosResponse<{ success: boolean }> = await axios.delete(`${CUBE_API_BASE_URL}/${encodeURIComponent(name)}`);
    return response.data;
  },

  listVersions: async (name: string): Promise<ListVersionsResponse> => {
    const response: AxiosResponse<ListVersionsResponse> = await axios.get(
      `${CUBE_API_BASE_URL}/versions`,
      { params: { name } }
    );
    return response.data;
  },

  getVersion: async (id: number): Promise<GetVersionResponse> => {
    const response: AxiosResponse<GetVersionResponse> = await axios.get(
      `${CUBE_API_BASE_URL}/versions/${id}`
    );
    return response.data;
  },

  saveVersion: async (data: SaveVersionRequest): Promise<SaveVersionResponse> => {
    const response: AxiosResponse<SaveVersionResponse> = await axios.post(
      `${CUBE_API_BASE_URL}/versions`,
      data
    );
    return response.data;
  },

  publishVersion: async (id: number): Promise<PublishVersionResponse> => {
    const response: AxiosResponse<PublishVersionResponse> = await axios.put(
      `${CUBE_API_BASE_URL}/versions/${id}/publish`
    );
    return response.data;
  },

  deleteVersion: async (id: number): Promise<{ success: boolean }> => {
    const response: AxiosResponse<{ success: boolean }> = await axios.delete(
      `${CUBE_API_BASE_URL}/versions/${id}`
    );
    return response.data;
  },
};
