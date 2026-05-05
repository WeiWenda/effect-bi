import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { SaveIcon, UploadIcon, Loader2Icon, Trash2Icon } from 'lucide-react';
import { useToast } from '../ui/toast';
import { etlAPI, type EtlTaskVersion } from '../../services/etlApi';
import { parseRuntimeDepsObjectFromJsonText } from '../../utils/etlRuntimeDeps';
import { formatDateYMD } from '../../utils/filterTimeRelative';
export interface EtlTaskDraftSnapshot {
  sqlMain: string;
  runtimeDepsJsonText: string;
  qualityRulesJson: string;
  cronExpression: string;
  /** YYYY-MM-DD */
  scheduleStartDate: string;
  retries: number;
  retryDelayMinutes: number;
  alertRulesJson: string;
}

interface EtlTaskVersionManageDialogProps {
  open: boolean;
  onClose: () => void;
  taskName: string;
  /** 新建任务首次保存时传入，与标签页 body 一致 */
  pendingFolderPlacement: number | null | undefined;
  getDraft: () => EtlTaskDraftSnapshot;
  onRestore: (version: EtlTaskVersion) => void;
  onSavedNewVersion: (version: EtlTaskVersion) => void;
  onDeletedVersion: (deletedId: number) => void;
  onVersionsChanged?: () => void;
}

export function EtlTaskVersionManageDialog({
  open,
  onClose,
  taskName,
  pendingFolderPlacement,
  getDraft,
  onRestore,
  onSavedNewVersion,
  onDeletedVersion,
  onVersionsChanged,
}: EtlTaskVersionManageDialogProps): React.JSX.Element {
  const { toast } = useToast();
  const [versions, setVersions] = useState<EtlTaskVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishingId, setPublishingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [saveRemark, setSaveRemark] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);

  const loadVersions = useCallback(async () => {
    const name = taskName.trim();
    if (!name) {
      setVersions([]);
      return;
    }
    setLoadingVersions(true);
    try {
      const { versions: rows } = await etlAPI.listTaskVersions(name);
      setVersions(rows);
    } catch {
      toast('加载版本列表失败', 'error');
    } finally {
      setLoadingVersions(false);
    }
  }, [taskName, toast]);

  useEffect(() => {
    if (open) void loadVersions();
  }, [open, loadVersions]);

  const handleSave = async () => {
    const name = taskName.trim();
    if (!name) {
      toast('请先填写任务名称', 'error');
      return;
    }
    const d = getDraft();
    let qualityRulesJsonParsed: unknown = [];
    const runtimeDepsJson = parseRuntimeDepsObjectFromJsonText(d.runtimeDepsJsonText);
    try {
      qualityRulesJsonParsed = JSON.parse(d.qualityRulesJson || '{}');
    } catch {
      toast('质检规则 JSON 格式无效', 'error');
      return;
    }
    if (!d.cronExpression.trim()) {
      toast('请填写调度时间（crontab 表达式）', 'error');
      return;
    }
    let alertRules: unknown[] = [];
    try {
      const ar = JSON.parse(d.alertRulesJson || '{}') as { rules?: unknown[] };
      alertRules = Array.isArray(ar.rules) ? ar.rules : [];
    } catch {
      toast('任务报警配置 JSON 格式无效', 'error');
      return;
    }
    setSaving(true);
    try {
      const saveBody: Parameters<typeof etlAPI.saveTaskVersion>[0] = {
        name,
        remark: saveRemark.trim(),
        sqlMain: d.sqlMain,
        scheduleJson: {
          owner: 'etl',
          emailOnFailure: false,
          cronExpression: d.cronExpression.trim(),
          scheduleStartDate: /^\d{4}-\d{2}-\d{2}$/.test((d.scheduleStartDate || '').trim())
            ? d.scheduleStartDate.trim()
            : formatDateYMD(new Date()),
          retries: d.retries,
          retryDelayMinutes: d.retryDelayMinutes,
        },
        alertJson: { rules: alertRules },
        runtimeDepsJson,
        qualityRulesJson: qualityRulesJsonParsed,
      };
      if (pendingFolderPlacement !== undefined) {
        saveBody.folderId = pendingFolderPlacement;
      }
      const { version } = await etlAPI.saveTaskVersion(saveBody);
      toast('版本保存成功', 'success');
      setSaveRemark('');
      setShowSaveInput(false);
      onSavedNewVersion(version);
      onVersionsChanged?.();
      await loadVersions();
    } catch {
      toast('版本保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async (id: number) => {
    setPublishingId(id);
    try {
      const { airflowUnpause, airflowBackfill } = await etlAPI.publishTaskVersion(id);
      const parts: string[] = ['版本发布成功'];
      if ('ok' in airflowUnpause && airflowUnpause.ok) {
        parts.push('Airflow 已开启调度');
      }
      if ('ok' in airflowBackfill && airflowBackfill.ok) {
        parts.push('已发起未完成区间回填');
      }
      toast(parts.join('，'), 'success');
      if ('ok' in airflowBackfill && airflowBackfill.ok === false) {
        toast(`回填未成功：${airflowBackfill.error.slice(0, 160)}`, 'error');
      }
      onVersionsChanged?.();
      await loadVersions();
    } catch {
      toast('版本发布失败', 'error');
    } finally {
      setPublishingId(null);
    }
  };

  const handleRestoreVersion = (v: EtlTaskVersion) => {
    onRestore(v);
    toast('已恢复至该版本', 'success');
  };

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      await etlAPI.deleteTaskVersion(id);
      toast('删除成功', 'success');
      onDeletedVersion(id);
      onVersionsChanged?.();
      await loadVersions();
    } catch (e: unknown) {
      const msg =
        axios.isAxiosError(e) &&
        e.response?.data &&
        typeof (e.response.data as { error?: string }).error === 'string'
          ? (e.response.data as { error: string }).error
          : '删除失败';
      toast(msg, 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const formatTime = (isoStr: string) => {
    const d = new Date(isoStr);
    return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const versionLabel = (v: EtlTaskVersion) => {
    const r = (v.remark || '').trim();
    return r || `版本 #${v.id}`;
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>版本管理 · {taskName.trim() || '（未命名）'}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col min-h-0" style={{ maxHeight: 'calc(80vh - 100px)' }}>
          <div className="mb-3 shrink-0">
            {!showSaveInput ? (
              <Button onClick={() => setShowSaveInput(true)} size="sm" className="w-full" disabled={!taskName.trim()}>
                <SaveIcon className="size-4 mr-2" />
                保存当前版本
              </Button>
            ) : (
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  value={saveRemark}
                  onChange={e => setSaveRemark(e.target.value)}
                  placeholder="版本备注（可选）"
                  className="text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <div className="flex gap-2">
                  <Button onClick={() => void handleSave()} size="sm" disabled={saving} className="flex-1">
                    {saving ? <Loader2Icon className="size-4 animate-spin mr-1" /> : <SaveIcon className="size-4 mr-1" />}
                    确认保存
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      setShowSaveInput(false);
                      setSaveRemark('');
                    }}
                    size="sm"
                    variant="outline"
                  >
                    取消
                  </Button>
                </div>
              </div>
            )}
          </div>
          <div className="flex-1 overflow-auto min-h-0">
            {!taskName.trim() ? (
              <div className="text-sm text-gray-400 text-center py-8">请先填写任务名称后再管理版本</div>
            ) : loadingVersions ? (
              <div className="flex items-center justify-center py-8">
                <Loader2Icon className="size-5 animate-spin text-gray-400" />
              </div>
            ) : versions.length === 0 ? (
              <div className="text-sm text-gray-400 text-center py-8">暂无保存的版本</div>
            ) : (
              <div className="flex flex-col gap-2">
                {versions.map(v => (
                  <div
                    key={v.id}
                    className="rounded-lg border p-3 text-sm transition-colors border-gray-200 hover:border-gray-300 bg-white"
                  >
                    <div className="flex items-center justify-between mb-1 gap-2">
                      <span className="font-medium text-gray-800 truncate flex-1" title={versionLabel(v)}>
                        {versionLabel(v)}
                      </span>
                      {v.isPublished && (
                        <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                          已发布
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mb-2">#{v.id} · {formatTime(v.createdAt)}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {!v.isPublished && (
                        <button
                          type="button"
                          onClick={() => void handlePublish(v.id)}
                          disabled={publishingId === v.id}
                          className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-green-50 text-green-600 hover:bg-green-100 transition-colors disabled:opacity-50"
                        >
                          {publishingId === v.id ? (
                            <Loader2Icon className="size-3 animate-spin" />
                          ) : (
                            <UploadIcon className="size-3" />
                          )}
                          发布
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRestoreVersion(v)}
                        className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-gray-50 text-gray-600 hover:bg-gray-100 transition-colors"
                      >
                        恢复至该版本
                      </button>
                      {!v.isPublished && (
                        <button
                          type="button"
                          onClick={() => void handleDelete(v.id)}
                          disabled={deletingId === v.id}
                          className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50"
                        >
                          {deletingId === v.id ? <Loader2Icon className="size-3 animate-spin" /> : <Trash2Icon className="size-3" />}
                          删除
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
