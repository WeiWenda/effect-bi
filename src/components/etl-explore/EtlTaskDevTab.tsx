import { useState, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import { CheckIcon, FlaskConicalIcon, History, Loader2Icon, PencilIcon, XIcon } from 'lucide-react';
import { isAxiosError } from 'axios';
import { etlAPI, type EtlTaskVersion, type EtlTaskOutput } from '../../services/etlApi';
import { lineageEntityRouteTableName } from '../../services/lineageNodeMeta';
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
  /** 任务逻辑名或产出表在「基本信息」中保存到 PG 后回调（用于更新标签标题等） */
  onTaskIdentitySaved?: (payload: { previousName: string; nextName: string }) => void;
}

function taskOutputQualifiedDot(taskOutput: EtlTaskOutput): string {
  return [taskOutput.catalogName, taskOutput.databaseName, taskOutput.tableName]
    .map(s => (typeof s === 'string' ? s.trim() : ''))
    .filter(Boolean)
    .join('.');
}

function lineageTableDetailPath(taskOutput: EtlTaskOutput): string | null {
  const catalog = typeof taskOutput.catalogName === 'string' ? taskOutput.catalogName.trim() : '';
  const database = typeof taskOutput.databaseName === 'string' ? taskOutput.databaseName.trim() : '';
  const table = typeof taskOutput.tableName === 'string' ? taskOutput.tableName.trim() : '';
  if (!table) return null;
  const key = lineageEntityRouteTableName({
    table_name: table,
    catalog_name: catalog,
    database_name: database,
  });
  if (!key) return null;
  return `/lineage/table/${encodeURIComponent(key)}?tab=fields`;
}

export function EtlTaskDevTab({
  body,
  onBodyChange,
  onTaskSaved,
  onTaskIdentitySaved,
}: EtlTaskDevTabProps): React.JSX.Element {
  const { toast } = useToast();
  const identityFromNameRef = useRef('');

  const [dryRunning, setDryRunning] = useState(false);
  const [basicInfoEditing, setBasicInfoEditing] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [draftTaskName, setDraftTaskName] = useState('');
  const [draftTaskOutput, setDraftTaskOutput] = useState<EtlTaskOutput>({
    catalogName: '',
    databaseName: '',
    tableName: '',
  });
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

  const beginEditBasicInfo = () => {
    identityFromNameRef.current = body.taskName.trim();
    setDraftTaskName(body.taskName);
    setDraftTaskOutput({
      catalogName: body.taskOutput.catalogName,
      databaseName: body.taskOutput.databaseName,
      tableName: body.taskOutput.tableName,
    });
    setBasicInfoEditing(true);
  };

  const cancelEditBasicInfo = () => {
    setBasicInfoEditing(false);
  };

  const handleSaveBasicInfo = async () => {
    const from = identityFromNameRef.current.trim();
    const nextName = draftTaskName.trim();
    if (!nextName) {
      toast('请输入任务名称', 'error');
      return;
    }
    if (!from) {
      toast('请先从左侧打开已有任务或使用「新增 ETL」创建任务后再保存基本信息', 'error');
      return;
    }
    setSavingProfile(true);
    try {
      const { name, taskOutput } = await etlAPI.patchTaskProfile({
        fromName: from,
        name: nextName,
        taskOutput: {
          catalogName: draftTaskOutput.catalogName.trim(),
          databaseName: draftTaskOutput.databaseName.trim(),
          tableName: draftTaskOutput.tableName.trim(),
        },
      });
      patch({
        taskName: name,
        taskOutput: {
          catalogName: taskOutput.catalogName,
          databaseName: taskOutput.databaseName,
          tableName: taskOutput.tableName,
        },
      });
      onTaskIdentitySaved?.({ previousName: from, nextName: name.trim() });
      toast('基本信息已保存', 'success');
      setBasicInfoEditing(false);
    } catch (e) {
      if (isAxiosError(e) && e.response?.status === 409) {
        toast('任务名称已存在', 'error');
        return;
      }
      const msg =
        isAxiosError(e) &&
        e.response?.data &&
        typeof (e.response.data as { error?: string }).error === 'string'
          ? (e.response.data as { error: string }).error
          : '保存失败';
      toast(msg, 'error');
    } finally {
      setSavingProfile(false);
    }
  };

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
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {basicInfoEditing ? (
              <input
                className="h-8 min-w-[8rem] max-w-[18rem] shrink rounded border border-gray-200 px-2 text-sm font-semibold text-gray-800 placeholder:text-gray-400"
                value={draftTaskName}
                onChange={e => setDraftTaskName(e.target.value)}
                placeholder="logical_dag_name"
              />
            ) : (
              <span
                className="max-w-[18rem] shrink-0 truncate text-sm font-bold text-gray-900"
                title={body.taskName.trim() || '（未命名）'}
              >
                {body.taskName.trim() || '（未命名）'}
              </span>
            )}
            <span className="inline-flex h-7 shrink-0 items-center rounded border border-gray-200 bg-gray-50 px-2 text-xs font-medium text-gray-800">
              HSQL
            </span>
            <span className="shrink-0 text-gray-500">产出表:</span>
            {basicInfoEditing ? (
              <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                <GravitinoTripleSelect
                  variant="inlineRow"
                  enabled
                  value={{
                    catalog: draftTaskOutput.catalogName,
                    database: draftTaskOutput.databaseName,
                    table: draftTaskOutput.tableName,
                  }}
                  onChange={t =>
                    setDraftTaskOutput({
                      catalogName: t.catalog,
                      databaseName: t.database,
                      tableName: t.table,
                    })
                  }
                />
              </div>
            ) : (
              <span className="min-w-0 font-mono text-gray-800 break-all">
                {(() => {
                  const q = taskOutputQualifiedDot(body.taskOutput);
                  const path = lineageTableDetailPath(body.taskOutput);
                  if (!q) {
                    return <span className="text-gray-400">未配置</span>;
                  }
                  if (path) {
                    return (
                      <Link
                        to={path}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 underline-offset-2 hover:underline"
                        title="在新标签页打开表元数据详情"
                      >
                        {q}
                      </Link>
                    );
                  }
                  return q;
                })()}
              </span>
            )}
            {!basicInfoEditing ? (
              <button
                type="button"
                onClick={beginEditBasicInfo}
                className="ml-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100"
                title="编辑"
                aria-label="编辑"
              >
                <PencilIcon className="size-4" />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void handleSaveBasicInfo()}
                  disabled={savingProfile}
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded border border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100 disabled:opacity-50"
                  title="保存"
                  aria-label="保存"
                >
                  {savingProfile ? <Loader2Icon className="size-3.5 animate-spin" /> : <CheckIcon className="size-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={cancelEditBasicInfo}
                  disabled={savingProfile}
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                  title="取消"
                  aria-label="取消"
                >
                  <XIcon className="size-3.5" />
                </button>
              </>
            )}
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
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
