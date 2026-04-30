import axios, { AxiosResponse } from 'axios';

const TASK_API_BASE_URL = 'http://127.0.0.1:3001/api/task';

export interface TaskInstance {
  task_file: string;
  partition_date: string;
  attempt: number;
  start_time: string;
  end_time: string;
  status: string;
}

export interface GetTaskInstancesResponse {
  taskFiles: string[];
  startDate: string;
  endDate: string;
  instances: Record<string, Record<string, TaskInstance[]>>;
}

export const taskAPI = {
  /**
   * Get task instances for a DAG view
   * GET /api/task/dag/:dagId?days=7
   */
  getTaskInstances: async (dagId: number, days: number = 7): Promise<GetTaskInstancesResponse> => {
    const response: AxiosResponse<GetTaskInstancesResponse> = await axios.get(
      `${TASK_API_BASE_URL}/dag/${dagId}`,
      { params: { days } }
    );
    return response.data;
  },
};
