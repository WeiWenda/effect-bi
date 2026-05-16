import { useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import { isAxiosError } from 'axios';
import { ExternalLinkIcon, Loader2Icon } from 'lucide-react';
import { etlAPI } from '../../services/etlApi';
import { fileAPI } from '../../services/fileApi';
import { lineageMaxComputeDataWorksUrl } from '../../services/lineageNodeMeta';

function formatTaskFileLoadError(err: unknown, filePath: string): string {
  if (isAxiosError(err)) {
    const data = err.response?.data as { error?: string; taskHome?: string; resolved?: string } | undefined;
    const msg = data?.error ?? err.message;
    if (err.response?.status === 404) {
      const resolved = data?.resolved ?? filePath;
      const home = data?.taskHome;
      return home
        ? `${msg}：${resolved}（TASK_HOME=${home}）`
        : `${msg}：${resolved}`;
    }
    return msg;
  }
  return err instanceof Error ? err.message : '读取任务文件失败';
}

const AIRFLOW_UI_BASE =
  (import.meta.env.VITE_AIRFLOW_UI_BASE_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://localhost:8080';

export interface DagTaskDevelopmentNodeData {
  label: string;
  catalogName?: string;
  databaseName?: string;
  tableName?: string;
  qualifiedTableName?: string;
  airflowDagId?: string;
  layer?: string;
  description?: string;
  entityId: string;
  /** Neo4j `file_path` 等，相对 TASK_HOME 的任务文件路径 */
  filePath?: string;
  /** Neo4j 表节点属性（catalog_type、ALIYUN_TABLE_ID 等） */
  entityProperties?: Record<string, unknown>;
}

function monacoLanguageForFilePath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  if (ext === 'py') return 'python';
  if (ext === 'yml' || ext === 'yaml') return 'yaml';
  if (ext === 'json') return 'json';
  return 'sql';
}

interface DagTaskDevelopmentPanelProps {
  focusedNodeId: string | null;
  nodeData: DagTaskDevelopmentNodeData | undefined;
}

/** 链路治理 · 任务开发：有 file_path 则只读展示任务文件，否则展示 Airflow / ETL 跳转 */
export function DagTaskDevelopmentPanel({
  focusedNodeId,
  nodeData,
}: DagTaskDevelopmentPanelProps): React.JSX.Element {
  const filePath = nodeData?.filePath?.trim() ?? '';

  const [fileContent, setFileContent] = useState('');
  const [fileLoadState, setFileLoadState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [fileError, setFileError] = useState<string | null>(null);

  const [etlTaskNameResolved, setEtlTaskNameResolved] = useState<string | null>(null);
  const [etlResolveState, setEtlResolveState] = useState<'idle' | 'loading' | 'ok' | 'notfound' | 'error'>(
    'idle'
  );

  useEffect(() => {
    if (!filePath) {
      setFileContent('');
      setFileLoadState('idle');
      setFileError(null);
      return;
    }

    const ac = new AbortController();
    setFileLoadState('loading');
    setFileError(null);
    setFileContent('');

    void (async () => {
      try {
        const { content } = await fileAPI.getTaskFile(filePath);
        if (ac.signal.aborted) return;
        setFileContent(content ?? '');
        setFileLoadState('ok');
      } catch (e) {
        if (ac.signal.aborted) return;
        console.error(e);
        setFileLoadState('error');
        setFileError(formatTaskFileLoadError(e, filePath));
      }
    })();

    return () => ac.abort();
  }, [focusedNodeId, filePath]);

  useEffect(() => {
    if (filePath) {
      setEtlTaskNameResolved(null);
      setEtlResolveState('idle');
      return;
    }

    const db = nodeData?.databaseName?.trim() ?? '';
    const tb = nodeData?.tableName?.trim() ?? '';
    const cat = nodeData?.catalogName?.trim() ?? '';

    if (!db || !tb) {
      setEtlTaskNameResolved(null);
      setEtlResolveState('idle');
      return;
    }

    const ac = new AbortController();
    setEtlResolveState('loading');
    setEtlTaskNameResolved(null);

    void (async () => {
      try {
        const res = await etlAPI.getTaskNameByOutputTable(cat, db, tb, { signal: ac.signal });
        const name = res?.name?.trim();
        if (!name) {
          setEtlTaskNameResolved(null);
          setEtlResolveState('notfound');
          return;
        }
        setEtlTaskNameResolved(name);
        setEtlResolveState('ok');
      } catch (e) {
        if (ac.signal.aborted) return;
        console.error(e);
        setEtlTaskNameResolved(null);
        setEtlResolveState('error');
      }
    })();

    return () => ac.abort();
  }, [
    filePath,
    focusedNodeId,
    nodeData?.catalogName,
    nodeData?.databaseName,
    nodeData?.tableName,
  ]);

  if (!focusedNodeId || !nodeData) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-gray-500">
        <p className="text-sm font-medium text-gray-700">任务开发</p>
        <p className="text-sm">
          请在上方 DAG 图中点击节点查看任务内容或 Airflow / ETL 链接。若在「任务运维」中已点击任务行与图中节点同步选中，可切换到本
          Tab 查看同一节点。
        </p>
      </div>
    );
  }

  const airflowDagHref =
    nodeData.airflowDagId != null && nodeData.airflowDagId !== ''
      ? `${AIRFLOW_UI_BASE}/dags/${encodeURIComponent(nodeData.airflowDagId)}`
      : null;

  const etlTaskDevHref =
    etlResolveState === 'ok' && etlTaskNameResolved
      ? `/etl?task=${encodeURIComponent(etlTaskNameResolved)}`
      : null;

  const dataWorksUrl = nodeData.entityProperties
    ? lineageMaxComputeDataWorksUrl(nodeData.entityProperties)
    : null;

  if (filePath) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-2">
        <div className="flex shrink-0 min-w-0 items-center gap-2">
          <p className="flex min-w-0 flex-1 items-baseline gap-2 text-sm text-gray-700">
            <span className="shrink-0 text-xs font-medium text-gray-500">当前文件</span>
            <span className="min-w-0 truncate font-mono text-xs text-gray-900" title={filePath}>
              {filePath}
            </span>
          </p>
          {dataWorksUrl ? (
            <a
              href={dataWorksUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-purple-200 bg-purple-50 px-2 py-1 text-xs font-medium text-purple-700 transition-colors hover:bg-purple-100"
              title="在 DataWorks 数据地图中打开"
            >
              <ExternalLinkIcon className="size-3.5 shrink-0" aria-hidden />
              DataWorks
            </a>
          ) : null}
        </div>

        {fileLoadState === 'loading' && (
          <div className="flex flex-1 items-center justify-center gap-2 py-16 text-sm text-gray-500">
            <Loader2Icon className="size-5 animate-spin text-gray-400" aria-hidden />
            正在加载任务文件…
          </div>
        )}

        {fileLoadState === 'error' && (
          <p className="text-sm text-red-800 bg-red-50 border border-red-100 rounded-md px-3 py-2">
            {fileError ?? '读取任务文件失败'}
          </p>
        )}

        {fileLoadState === 'ok' && (
          <div className="h-full min-h-0 flex-1 overflow-hidden rounded-lg border border-gray-200">
            <Editor
              height="100%"
              language={monacoLanguageForFilePath(filePath)}
              theme="vs-light"
              value={fileContent}
              options={{
                readOnly: true,
                minimap: { enabled: false },
                fontSize: 13,
                wordWrap: 'on',
                scrollBeyondLastLine: false,
                domReadOnly: true,
              }}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-xl">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">当前表</p>
        <p className="mt-1 text-sm font-semibold text-gray-900">
          {nodeData.qualifiedTableName ?? nodeData.label}
        </p>
      </div>
      {airflowDagHref ? (
        <div className="rounded-lg border border-blue-100 bg-blue-50/80 px-4 py-3">
          <p className="text-xs text-gray-600 mb-2">Airflow（新标签页打开）</p>
          <a
            href={airflowDagHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800 underline-offset-2 hover:underline"
          >
            <ExternalLinkIcon className="size-4 shrink-0" aria-hidden />
            {nodeData.airflowDagId}
          </a>
          <p className="mt-2 text-xs text-gray-500 break-all">{airflowDagHref}</p>
        </div>
      ) : (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-md px-3 py-2">
          该节点暂无 AIRFLOW_DAG_ID（通常表示尚未通过本系统发布 ETL，或未同步到 Neo4j）。
        </p>
      )}
      {etlResolveState === 'loading' && <p className="text-sm text-gray-500">正在解析 ETL 任务…</p>}
      {etlTaskDevHref ? (
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/80 px-4 py-3">
          <p className="text-xs text-gray-600 mb-2">ETL 任务开发（新标签页打开并定位任务）</p>
          <a
            href={etlTaskDevHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700 hover:text-emerald-900 underline-offset-2 hover:underline"
          >
            <ExternalLinkIcon className="size-4 shrink-0" aria-hidden />
            {etlTaskNameResolved}
          </a>
          <p className="mt-2 text-xs text-gray-500 break-all">{etlTaskDevHref}</p>
        </div>
      ) : etlResolveState === 'notfound' ? (
        <p className="text-sm text-gray-600 bg-gray-50 border border-gray-100 rounded-md px-3 py-2">
          当前产出表未在 ETL 任务库登记，无法打开任务开发。
        </p>
      ) : etlResolveState === 'error' ? (
        <p className="text-sm text-red-800 bg-red-50 border border-red-100 rounded-md px-3 py-2">
          解析 ETL 任务失败，请稍后重试。
        </p>
      ) : null}
    </div>
  );
}
