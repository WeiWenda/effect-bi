import axios, { AxiosResponse } from 'axios';

const TASK_API_BASE_URL = '/api/task';

export interface TaskInstance {
  partition_date: string;
  attempt: number;
  start_time: string;
  end_time: string;
  status: string;
  airflow_dag_id?: string;
  airflow_run_id?: string;
  airflow_task_id?: string;
  error_message?: string | null;
}

export interface GetTaskInstancesResponse {
  /** Neo4j 表节点 elementId，运维矩阵行键 */
  rowKeys: string[];
  /** 兼容旧字段，与 rowKeys 相同 */
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
