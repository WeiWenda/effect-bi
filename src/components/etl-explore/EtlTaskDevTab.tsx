import { useState, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { FlaskConicalIcon, Loader2Icon, History } from 'lucide-react';
import { etlAPI, type EtlTaskVersion } from '../../services/etlApi';
import type { EtlTaskDevTabPersistedBody } from '../../utils/etlWorkspaceStorage';
import { useToast } from '../ui/toast';
import { Button } from '../ui/button';
import { EtlTaskVersionManageDialog } from './EtlTaskVersionManageDialog';

const TASK_TYPE_LABEL: Record<string, string> = {
  hsql: 'HSQL',
  data_import: '数据导入',
  data_export: '数据导出',
};

interface EtlTaskDevTabProps {
  body: EtlTaskDevTabPersistedBody;
  onBodyChange: (next: EtlTaskDevTabPersistedBody) => void;
  onTaskSaved?: () => void;
}

export function EtlTaskDevTab({ body, onBodyChange, onTaskSaved }: EtlTaskDevTabProps): React.JSX.Element {
  const { toast } = useToast();
  const [dryRunning, setDryRunning] = useState(false);
  const [versionDialogOpen, setVersionDialogOpen] = useState(false);

  const patch = (partial: Partial<EtlTaskDevTabPersistedBody>) => {
    onBodyChange({ ...body, ...partial, kind: 'task-dev' });
  };

  const getDraft = useCallback(
    () => ({
      sqlMain: body.sqlMain,
      graphJsonText: body.graphJsonText,
      qualityRulesJson: body.qualityRulesJson,
      owner: body.owner,
      retries: body.retries,
      retryDelayMinutes: body.retryDelayMinutes,
      emailOnFailure: body.emailOnFailure,
    }),
    [
      body.sqlMain,
      body.graphJsonText,
      body.qualityRulesJson,
      body.owner,
      body.retries,
      body.retryDelayMinutes,
      body.emailOnFailure,
    ]
  );

  const handleRestore = useCallback(
    (v: EtlTaskVersion) => {
      const ao = (v.airflowOptionsJson || {}) as Record<string, unknown>;
      patch({
        taskName: v.name,
        remark: v.remark ?? '',
        sqlMain: v.sqlMain,
        graphJsonText: typeof v.graphJson === 'string' ? v.graphJson : JSON.stringify(v.graphJson ?? {}, null, 2),
        qualityRulesJson:
          typeof v.qualityRulesJson === 'string'
            ? v.qualityRulesJson
            : JSON.stringify(v.qualityRulesJson ?? [], null, 2),
        owner: typeof ao.owner === 'string' ? ao.owner : 'etl',
        retries: typeof ao.retries === 'number' ? ao.retries : 1,
        retryDelayMinutes: typeof ao.retryDelayMinutes === 'number' ? ao.retryDelayMinutes : 5,
        emailOnFailure: Boolean(ao.emailOnFailure),
        lastVersionId: v.id,
        dryResult: null,
      });
    },
    [patch]
  );

  const handleSavedNewVersion = useCallback(
    (v: EtlTaskVersion) => {
      patch({
        lastVersionId: v.id,
        pendingFolderPlacement: undefined,
        remark: v.remark ?? '',
      });
      onTaskSaved?.();
    },
    [patch, onTaskSaved]
  );

  const handleDeletedVersion = useCallback(
    (deletedId: number) => {
      if (body.lastVersionId !== deletedId) return;
      const name = body.taskName.trim();
      if (!name) {
        patch({ lastVersionId: null });
        return;
      }
      void etlAPI.listTaskVersions(name).then(({ versions }) => {
        patch({ lastVersionId: versions[0]?.id ?? null });
      });
    },
    [body.lastVersionId, body.taskName, patch]
  );

  const handleDryRun = async () => {
    if (body.etlTaskType !== 'hsql') return;
    patch({ dryResult: null });
    setDryRunning(true);
    try {
      const r = await etlAPI.dryRunTaskSql(body.sqlMain);
      patch({ dryResult: { columns: r.columns, rows: r.rows } });
      toast(`试运行完成 · ${r.durationMs}ms · ${r.rowCount} 行`);
    } catch (e) {
      console.error(e);
      toast('试运行失败', 'error');
    } finally {
      setDryRunning(false);
    }
  };

  if (body.etlTaskType !== 'hsql') {
    const label = TASK_TYPE_LABEL[body.etlTaskType] ?? body.etlTaskType;
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gray-50/50 p-8 text-center min-h-0">
        <p className="text-sm font-medium text-gray-700">任务类型：{label}</p>
        <p className="text-xs text-gray-500 mt-2 max-w-sm">该任务类型即将上线。请使用「HSQL」新建任务，或关闭本标签页。</p>
        <p className="text-[11px] text-gray-400 mt-4 truncate max-w-md">逻辑名：{body.taskName || '（未命名）'}</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden bg-gray-50/50">
      <EtlTaskVersionManageDialog
        open={versionDialogOpen}
        onClose={() => setVersionDialogOpen(false)}
        taskName={body.taskName}
        pendingFolderPlacement={body.pendingFolderPlacement}
        getDraft={getDraft}
        onRestore={handleRestore}
        onSavedNewVersion={handleSavedNewVersion}
        onDeletedVersion={handleDeletedVersion}
        onVersionsChanged={onTaskSaved}
      />

      <div className="shrink-0 border-b border-gray-200 bg-white px-3 py-2 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-medium text-gray-500">任务类型</span>
          <span className="text-xs font-medium text-gray-800 px-2 py-1 rounded border border-gray-200 bg-gray-50">HSQL</span>
        </div>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] font-medium text-gray-500">任务名称</span>
          <input
            className="border border-gray-200 rounded-md px-2 py-1 text-xs w-44"
            value={body.taskName}
            onChange={e => patch({ taskName: e.target.value })}
            placeholder="logical_dag_name"
          />
        </label>
        <div className="flex gap-2 ml-auto">
          <button
            type="button"
            onClick={() => void handleDryRun()}
            disabled={dryRunning}
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {dryRunning ? <Loader2Icon className="size-3.5 animate-spin" /> : <FlaskConicalIcon className="size-3.5" />}
            试运行
          </button>
          <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setVersionDialogOpen(true)}>
            <History className="size-3.5 mr-1.5" />
            版本管理
          </Button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        <div className="flex-[2] min-w-0 flex flex-col border-r border-gray-200 bg-white">
          <div className="text-[10px] font-medium text-gray-500 px-2 py-1 border-b border-gray-100">SQL</div>
          <div className="flex-1 min-h-0">
            <Editor
              height="100%"
              defaultLanguage="sql"
              theme="vs-light"
              value={body.sqlMain}
              onChange={v => patch({ sqlMain: v ?? '' })}
              options={{ minimap: { enabled: false }, fontSize: 13, wordWrap: 'on' }}
            />
          </div>
        </div>
        <div className="w-72 shrink-0 overflow-y-auto bg-white p-2 space-y-3 text-xs">
          <div>
            <div className="font-semibold text-gray-700 mb-1">运行监控（Airflow default_args）</div>
            <label className="block mb-1">
              <span className="text-gray-500">owner</span>
              <input
                className="mt-0.5 w-full border border-gray-200 rounded px-1.5 py-1"
                value={body.owner}
                onChange={e => patch({ owner: e.target.value })}
              />
            </label>
            <label className="block mb-1">
              <span className="text-gray-500">retries</span>
              <input
                type="number"
                min={0}
                className="mt-0.5 w-full border border-gray-200 rounded px-1.5 py-1"
                value={body.retries}
                onChange={e => patch({ retries: parseInt(e.target.value, 10) || 0 })}
              />
            </label>
            <label className="block mb-1">
              <span className="text-gray-500">retry_delay（分钟）</span>
              <input
                type="number"
                min={1}
                className="mt-0.5 w-full border border-gray-200 rounded px-1.5 py-1"
                value={body.retryDelayMinutes}
                onChange={e => patch({ retryDelayMinutes: parseInt(e.target.value, 10) || 1 })}
              />
            </label>
            <label className="flex items-center gap-2 mt-1">
              <input type="checkbox" checked={body.emailOnFailure} onChange={e => patch({ emailOnFailure: e.target.checked })} />
              <span className="text-gray-600">email_on_failure</span>
            </label>
          </div>
          <div>
            <div className="font-semibold text-gray-700 mb-1">依赖图（JSON）</div>
            <textarea
              className="w-full h-20 font-mono text-[11px] border border-gray-200 rounded p-1"
              value={body.graphJsonText}
              onChange={e => patch({ graphJsonText: e.target.value })}
            />
          </div>
          <div>
            <div className="font-semibold text-gray-700 mb-1">质检规则（JSON 数组）</div>
            <textarea
              className="w-full h-24 font-mono text-[11px] border border-gray-200 rounded p-1"
              value={body.qualityRulesJson}
              onChange={e => patch({ qualityRulesJson: e.target.value })}
              placeholder='[{"kind":"min_row_count","value":1}]'
            />
          </div>
          {body.lastVersionId != null && (
            <p className="text-[10px] text-gray-400">编辑区对应最近一次加载或保存的版本 #{body.lastVersionId}；发布与历史版本请在「版本管理」中操作。</p>
          )}
          <p className="text-[10px] text-gray-400 leading-snug">
            目录归属请在左侧 ETL 目录树中拖拽任务调整。试运行：配置 <code className="bg-gray-100 px-0.5">TRINO_URL</code> 时使用 Trino；否则 Mock。发布 DAG 依赖{' '}
            <code className="bg-gray-100 px-0.5">ETL_DAG_PY_SERVICE_URL</code> / <code className="bg-gray-100 px-0.5">AIRFLOW_HOME</code> 等环境变量。
          </p>
        </div>
      </div>

      {body.dryResult && (
        <div className="shrink-0 max-h-40 border-t border-gray-200 bg-white overflow-auto">
          <div className="text-[10px] font-medium text-gray-500 px-2 py-1">试运行结果</div>
          <table className="min-w-full text-[11px]">
            <thead>
              <tr className="bg-gray-50">
                {body.dryResult.columns.map(c => (
                  <th key={c.name} className="text-left px-2 py-1 font-medium text-gray-600">
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.dryResult.rows.map((r, i) => (
                <tr key={i} className="border-t border-gray-100">
                  {body.dryResult!.columns.map(c => (
                    <td key={c.name} className="px-2 py-1 truncate max-w-[200px]">
                      {String(r[c.name] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
