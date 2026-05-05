import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { FlaskConicalIcon, Loader2Icon, History } from 'lucide-react';
import { etlAPI, type EtlTaskVersion } from '../../services/etlApi';
import type { EtlTaskDevTabPersistedBody } from '../../utils/etlWorkspaceStorage';
import { useToast } from '../ui/toast';
import { Button } from '../ui/button';
import { EtlTaskVersionManageDialog } from './EtlTaskVersionManageDialog';
import { EtlRuntimeDepsModal } from './EtlRuntimeDepsModal';
import {
  formatRuntimeDepSummaryLine,
  nonEmptyRuntimeDepRows,
  parseRuntimeDepsFromJsonText,
} from '../../utils/etlRuntimeDeps';
import {
  formatQualityRulesSummary,
  parseQualityRulesFromJsonText,
  qualityRulesIsLegacyJsonArray,
} from '../../utils/etlQualityRules';
import { EtlQualityRulesModal } from './EtlQualityRulesModal';
import { EtlAlertRulesModal } from './EtlAlertRulesModal';
import { formatAlertRulesSummaryLines, parseAlertRulesFromJsonText } from '../../utils/etlAlertRules';
import { GravitinoTripleSelect } from './GravitinoTripleSelect';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { formatDateYMD, parseYmdToLocalDate } from '../../utils/filterTimeRelative';

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
  const taskNameRef = useRef(body.taskName);
  const pendingTaskOutputRef = useRef<{ catalogName: string; databaseName: string; tableName: string } | null>(null);
  const saveOutputTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  taskNameRef.current = body.taskName;

  const [dryRunning, setDryRunning] = useState(false);
  const [savingTaskOutput, setSavingTaskOutput] = useState(false);
  const [versionDialogOpen, setVersionDialogOpen] = useState(false);
  const [runtimeDepsModalOpen, setRuntimeDepsModalOpen] = useState(false);
  const [qualityRulesModalOpen, setQualityRulesModalOpen] = useState(false);
  const [alertRulesModalOpen, setAlertRulesModalOpen] = useState(false);

  const runtimeDepRows = useMemo(
    () => nonEmptyRuntimeDepRows(parseRuntimeDepsFromJsonText(body.runtimeDepsJsonText)),
    [body.runtimeDepsJsonText]
  );

  const qualityRulesBundle = useMemo(
    () => parseQualityRulesFromJsonText(body.qualityRulesJson),
    [body.qualityRulesJson]
  );
  const qualityRulesSummaryLines = useMemo(
    () => formatQualityRulesSummary(qualityRulesBundle),
    [qualityRulesBundle]
  );
  const qualityRulesLegacy = useMemo(
    () => qualityRulesIsLegacyJsonArray(body.qualityRulesJson),
    [body.qualityRulesJson]
  );

  const alertRulesBundle = useMemo(
    () => parseAlertRulesFromJsonText(body.alertRulesJson),
    [body.alertRulesJson]
  );
  const alertRulesSummaryLines = useMemo(
    () => formatAlertRulesSummaryLines(alertRulesBundle),
    [alertRulesBundle]
  );

  const patch = (partial: Partial<EtlTaskDevTabPersistedBody>) => {
    onBodyChange({ ...body, ...partial, kind: 'task-dev' });
  };

  const schedulePersistTaskOutput = useCallback(
    (out: { catalogName: string; databaseName: string; tableName: string }) => {
      pendingTaskOutputRef.current = out;
      if (saveOutputTimerRef.current) clearTimeout(saveOutputTimerRef.current);
      saveOutputTimerRef.current = setTimeout(() => {
        saveOutputTimerRef.current = null;
        const name = taskNameRef.current.trim();
        const payload = pendingTaskOutputRef.current;
        if (!name || !payload) return;
        setSavingTaskOutput(true);
        void etlAPI
          .patchTaskOutput(name, payload)
          .catch(() => toast('产出表保存失败', 'error'))
          .finally(() => setSavingTaskOutput(false));
      }, 400);
    },
    [toast]
  );

  useEffect(() => {
    return () => {
      if (saveOutputTimerRef.current) clearTimeout(saveOutputTimerRef.current);
    };
  }, []);

  const getDraft = useCallback(
    () => ({
      sqlMain: body.sqlMain,
      runtimeDepsJsonText: body.runtimeDepsJsonText,
      qualityRulesJson: body.qualityRulesJson,
      cronExpression: body.cronExpression,
      scheduleStartDate: body.scheduleStartDate,
      retries: body.retries,
      retryDelayMinutes: body.retryDelayMinutes,
      alertRulesJson: body.alertRulesJson,
    }),
    [
      body.sqlMain,
      body.runtimeDepsJsonText,
      body.qualityRulesJson,
      body.cronExpression,
      body.scheduleStartDate,
      body.retries,
      body.retryDelayMinutes,
      body.alertRulesJson,
    ]
  );

  const handleRestore = useCallback(
    (v: EtlTaskVersion) => {
      const sched = (v.scheduleJson || {}) as Record<string, unknown>;
      const alertSrc =
        v.alertJson && typeof v.alertJson === 'object' ? JSON.stringify(v.alertJson) : '{"rules":[]}';
      const alertBundle = parseAlertRulesFromJsonText(alertSrc);
      patch({
        taskName: v.name,
        remark: v.remark ?? '',
        sqlMain: v.sqlMain,
        runtimeDepsJsonText: JSON.stringify(v.runtimeDepsJson ?? { runtimeDependencies: [] }, null, 2),
        qualityRulesJson:
          typeof v.qualityRulesJson === 'string'
            ? v.qualityRulesJson
            : JSON.stringify(v.qualityRulesJson ?? { sqlQueries: [], rules: [] }, null, 2),
        cronExpression: typeof sched.cronExpression === 'string' ? sched.cronExpression : '',
        scheduleStartDate:
          typeof sched.scheduleStartDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sched.scheduleStartDate.trim())
            ? sched.scheduleStartDate.trim()
            : formatDateYMD(new Date()),
        retries: typeof sched.retries === 'number' ? sched.retries : 1,
        retryDelayMinutes: typeof sched.retryDelayMinutes === 'number' ? sched.retryDelayMinutes : 1,
        alertRulesJson: JSON.stringify(alertBundle, null, 2),
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
      <EtlRuntimeDepsModal
        open={runtimeDepsModalOpen}
        onOpenChange={setRuntimeDepsModalOpen}
        runtimeDepsJsonText={body.runtimeDepsJsonText}
        onSave={text => patch({ runtimeDepsJsonText: text })}
      />
      <EtlAlertRulesModal
        open={alertRulesModalOpen}
        onOpenChange={setAlertRulesModalOpen}
        alertRulesJson={body.alertRulesJson}
        onSave={text => patch({ alertRulesJson: text })}
      />
      <EtlQualityRulesModal
        open={qualityRulesModalOpen}
        onOpenChange={setQualityRulesModalOpen}
        qualityRulesJson={body.qualityRulesJson}
        onSave={text => patch({ qualityRulesJson: text })}
      />

      <div className="shrink-0 border-b border-gray-200 bg-white px-3 py-2">
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
          <div className="flex flex-col gap-1">
            <span className="flex h-[14px] items-end text-[10px] font-medium leading-none text-gray-500">任务类型</span>
            <span className="inline-flex h-8 min-h-8 items-center rounded-md border border-gray-200 bg-gray-50 px-2 text-xs font-medium text-gray-800 box-border">
              HSQL
            </span>
          </div>
          <label className="flex flex-col gap-1 shrink-0">
            <span className="flex h-[14px] items-end text-[10px] font-medium leading-none text-gray-500">任务名称</span>
            <input
              className="h-8 min-h-8 box-border w-44 rounded-md border border-gray-200 px-2 text-xs leading-none text-gray-800 placeholder:text-gray-400"
              value={body.taskName}
              onChange={e => patch({ taskName: e.target.value })}
              placeholder="logical_dag_name"
            />
          </label>
          <div className="flex min-w-0 flex-1 basis-[min(100%,36rem)] flex-col gap-1">
            <div className="flex h-[14px] items-center gap-2">
              <span className="text-[10px] font-medium leading-none text-gray-500">产出表</span>
              {savingTaskOutput ? <Loader2Icon className="size-3 shrink-0 animate-spin text-gray-400" aria-hidden /> : null}
            </div>
            <GravitinoTripleSelect
              variant="inlineRow"
              enabled
              value={{
                catalog: body.taskOutput.catalogName,
                database: body.taskOutput.databaseName,
                table: body.taskOutput.tableName,
              }}
              onChange={t => {
                const next = {
                  catalogName: t.catalog,
                  databaseName: t.database,
                  tableName: t.table,
                };
                patch({ taskOutput: next });
                schedulePersistTaskOutput(next);
              }}
            />
          </div>
          <div className="ml-auto flex shrink-0 flex-col gap-1">
            <span className="h-[14px] shrink-0" aria-hidden />
            <div className="flex h-8 min-h-8 items-center gap-2">
              <button
                type="button"
                onClick={() => void handleDryRun()}
                disabled={dryRunning}
                className="inline-flex h-8 min-h-8 items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 box-border"
              >
                {dryRunning ? <Loader2Icon className="size-3.5 animate-spin" /> : <FlaskConicalIcon className="size-3.5" />}
                试运行
              </button>
              <Button type="button" size="sm" variant="outline" className="h-8 min-h-8 shrink-0 px-3 text-xs" onClick={() => setVersionDialogOpen(true)}>
                <History className="size-3.5 mr-1.5" />
                版本管理
              </Button>
            </div>
          </div>
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
            <div className="font-semibold text-gray-700 mb-1">调度信息</div>
            <label className="block mb-1">
              <span className="text-gray-500">
                调度时间（crontab）<span className="text-red-500">*</span>
              </span>
              <input
                className="mt-0.5 w-full border border-gray-200 rounded px-1.5 py-1 font-mono text-[11px]"
                value={body.cronExpression}
                onChange={e => patch({ cronExpression: e.target.value })}
                placeholder="0 0 * * *"
              />
            </label>
            <label className="block mb-1">
              <span className="text-gray-500">调度开始时间</span>
              <DatePicker
                selected={parseYmdToLocalDate(
                  /^\d{4}-\d{2}-\d{2}$/.test(body.scheduleStartDate.trim())
                    ? body.scheduleStartDate.trim()
                    : formatDateYMD(new Date())
                )}
                onChange={(d: Date | null) =>
                  patch({ scheduleStartDate: d ? formatDateYMD(d) : formatDateYMD(new Date()) })
                }
                dateFormat="yyyy-MM-dd"
                className="mt-0.5 w-full border border-gray-200 rounded px-1.5 py-1 text-[11px] box-border"
                wrapperClassName="block w-full"
                portalId="root"
                popperClassName="z-[1100]"
              />
            </label>
            <label className="block mb-1">
              <span className="text-gray-500">重试次数</span>
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
          </div>
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="font-semibold text-gray-700">运行依赖</div>
              <button
                type="button"
                onClick={() => setRuntimeDepsModalOpen(true)}
                className="shrink-0 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800 hover:bg-emerald-100"
              >
                新增
              </button>
            </div>
            <div className="rounded border border-gray-100 bg-gray-50/90 p-2 min-h-[3rem] space-y-1.5">
              {runtimeDepRows.length === 0 ? (
                <p className="text-[10px] text-gray-400 leading-snug">
                  暂无运行依赖。点击「新增」在弹窗中编辑 catalog、database、table、分区与二级分区。
                </p>
              ) : (
                runtimeDepRows.map((r, i) => {
                  const line = formatRuntimeDepSummaryLine(r);
                  return (
                    <div
                      key={i}
                      className="text-[10px] text-gray-700 leading-snug border-l-2 border-emerald-300 pl-2 font-mono break-words"
                      title={line}
                    >
                      {line}
                    </div>
                  );
                })
              )}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="font-semibold text-gray-700">任务报警</div>
              <button
                type="button"
                onClick={() => setAlertRulesModalOpen(true)}
                className="shrink-0 rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900 hover:bg-amber-100"
              >
                配置
              </button>
            </div>
            <div className="rounded border border-gray-100 bg-gray-50/90 p-2 min-h-[3rem] space-y-1">
              {alertRulesSummaryLines.length === 0 ? (
                <p className="text-[10px] text-gray-400 leading-snug">
                  未配置报警。点击「配置」填写接收人、策略、手段与时段。
                </p>
              ) : (
                alertRulesSummaryLines.map((line, i) => (
                  <div
                    key={i}
                    className="text-[10px] text-gray-700 leading-snug border-l-2 border-amber-300 pl-2 font-mono break-words"
                    title={line}
                  >
                    {line}
                  </div>
                ))
              )}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="font-semibold text-gray-700">质检规则</div>
              <button
                type="button"
                onClick={() => setQualityRulesModalOpen(true)}
                className="shrink-0 rounded border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-900 hover:bg-violet-100"
              >
                配置
              </button>
            </div>
            <div className="rounded border border-gray-100 bg-gray-50/90 p-2 min-h-[3rem] space-y-1">
              {qualityRulesLegacy ? (
                <p className="text-[10px] text-amber-700 leading-snug">
                  当前为旧版 JSON 数组，请点击「配置」迁移为新格式。
                </p>
              ) : null}
              {qualityRulesSummaryLines.length === 0 && !qualityRulesLegacy ? (
                <p className="text-[10px] text-gray-400 leading-snug">
                  未配置质检。点击「配置」填写多条 SQL 与三段式规则（表达式 / 操作符 / 阈值）。
                </p>
              ) : null}
              {qualityRulesSummaryLines.map((line, i) => (
                <div
                  key={i}
                  className="text-[10px] text-gray-700 leading-snug border-l-2 border-violet-300 pl-2 font-mono break-words"
                  title={line}
                >
                  {line}
                </div>
              ))}
            </div>
          </div>
          {body.lastVersionId != null && (
            <p className="text-[10px] text-gray-400">编辑区对应最近一次加载或保存的版本 #{body.lastVersionId}；发布与历史版本请在「版本管理」中操作。</p>
          )}
          <p className="text-[10px] text-gray-400 leading-snug">
            目录归属请在左侧 ETL 目录树中拖拽任务调整。试运行：配置 <code className="bg-gray-100 px-0.5">TRINO_URL</code> 时使用 Trino；否则 Mock。发布时由 Node 后端生成 DAG 源码；写入 <code className="bg-gray-100 px-0.5">AIRFLOW_HOME/dags</code>（或 <code className="bg-gray-100 px-0.5">ETL_AIRFLOW_DAGS_DIR</code>）需在环境中配置。
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
