import axios, { AxiosResponse } from 'axios';

const FILE_API_BASE_URL = '/api/file';

export interface GetTaskFileResponse {
  content: string;
}

export const fileAPI = {
  /**
   * Get task file content
   * GET /api/file/task?file=xxx
   */
  getTaskFile: async (file: string): Promise<GetTaskFileResponse> => {
    const response: AxiosResponse<GetTaskFileResponse> = await axios.get(
      `${FILE_API_BASE_URL}/task`,
      { params: { file } }
    );
    return response.data;
  },
};
