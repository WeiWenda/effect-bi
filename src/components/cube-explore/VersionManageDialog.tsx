import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { SaveIcon, EyeIcon, UploadIcon, Loader2Icon, Trash2Icon } from 'lucide-react';
import { useToast } from '../ui/toast';
import { cubeAPI, CubeVersion } from '../../services/cubeApi';

interface VersionManageDialogProps {
  open: boolean;
  onClose: () => void;
  cubeName: string;
  canvasData: { nodes: any[]; edges: any[]; viewport?: { x: number; y: number; zoom: number } };
  fieldList: any[];
  modelJson: string;
  modelYml: string;
  modelView: string;
  onLoadVersion: (version: { canvas_data: any; field_list: any; model_json: any; model_yml: string; model_view: string; remark: string; id: number; is_published: boolean }) => void;
  onPreviewYaml: (tab: 'model' | 'view') => void;
}

export function VersionManageDialog({ open, onClose, cubeName, canvasData, fieldList, modelJson, modelYml, modelView, onLoadVersion, onPreviewYaml }: VersionManageDialogProps): React.JSX.Element {
  const [versions, setVersions] = useState<CubeVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishingId, setPublishingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [saveRemark, setSaveRemark] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);
  const { toast } = useToast();

  useEffect(() => { if (open) loadVersions(); }, [open]);

  const loadVersions = useCallback(async () => {
    setLoadingVersions(true);
    try {
      const response = await cubeAPI.listVersions(cubeName);
      setVersions(response.versions);
    } catch { toast('加载版本列表失败', 'error'); }
    finally { setLoadingVersions(false); }
  }, [cubeName, toast]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await cubeAPI.saveVersion({ name: cubeName, remark: saveRemark || undefined, canvasData: { nodes: canvasData.nodes, edges: canvasData.edges, viewport: canvasData.viewport }, fieldList, modelJson, modelYml, modelView });
      toast('版本保存成功', 'success');
      setSaveRemark(''); setShowSaveInput(false);
      await loadVersions();
    } catch { toast('版本保存失败', 'error'); }
    finally { setSaving(false); }
  };

  const handlePublish = async (id: number) => {
    setPublishingId(id);
    try {
      await cubeAPI.publishVersion(id);
      toast('版本发布成功', 'success');
      await loadVersions();
    } catch { toast('版本发布失败', 'error'); }
    finally { setPublishingId(null); }
  };

  const handlePreviewYaml = async (id: number) => {
    try {
      const response = await cubeAPI.getVersion(id);
      if (response.version.model_view) {
        onPreviewYaml('view');
      } else {
        onPreviewYaml('model');
      }
    } catch { toast('加载版本详情失败', 'error'); }
  };

  const handleRestoreVersion = (version: CubeVersion) => {
    onLoadVersion({ canvas_data: version.canvas_data, field_list: version.field_list, model_json: version.model_json, model_yml: version.model_yml, model_view: version.model_view, remark: version.remark, id: version.id, is_published: version.is_published });
    toast('已恢复至该版本', 'success');
  };

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      await cubeAPI.deleteVersion(id);
      toast('删除成功', 'success');
      await loadVersions();
    } catch { toast('删除失败', 'error'); }
    finally { setDeletingId(null); }
  };

  const formatTime = (isoStr: string) => {
    const d = new Date(isoStr);
    return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader><DialogTitle>版本管理</DialogTitle></DialogHeader>
        <div className="flex flex-col min-h-0" style={{ maxHeight: 'calc(80vh - 100px)' }}>
          <div className="mb-3 shrink-0">
            {!showSaveInput ? (
              <Button onClick={() => setShowSaveInput(true)} size="sm" className="w-full">
                <SaveIcon className="size-4 mr-2" />保存当前版本
              </Button>
            ) : (
              <div className="flex flex-col gap-2">
                <input type="text" value={saveRemark} onChange={e => setSaveRemark(e.target.value)}
                  placeholder={`备注 (默认: table_${canvasData.nodes.length}_column_${fieldList.length})`}
                  className="text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                <div className="flex gap-2">
                  <Button onClick={handleSave} size="sm" disabled={saving} className="flex-1">
                    {saving ? <Loader2Icon className="size-4 animate-spin mr-1" /> : <SaveIcon className="size-4 mr-1" />}确认保存
                  </Button>
                  <Button onClick={() => { setShowSaveInput(false); setSaveRemark(''); }} size="sm" variant="outline">取消</Button>
                </div>
              </div>
            )}
          </div>
          <div className="flex-1 overflow-auto">
            {loadingVersions ? (
              <div className="flex items-center justify-center py-8"><Loader2Icon className="size-5 animate-spin text-gray-400" /></div>
            ) : versions.length === 0 ? (
              <div className="text-sm text-gray-400 text-center py-8">暂无保存的版本</div>
            ) : (
              <div className="flex flex-col gap-2">
                {versions.map(v => (
                  <div key={v.id} className="rounded-lg border p-3 text-sm transition-colors border-gray-200 hover:border-gray-300 bg-white">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-gray-800 truncate flex-1 mr-2" title={v.remark}>{v.remark}</span>
                      {v.is_published && <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">已发布</span>}
                    </div>
                    <div className="text-xs text-gray-400 mb-2">{formatTime(v.created_at)}</div>
                    <div className="flex gap-1.5">
                      {!v.is_published && (
                        <button onClick={() => handlePublish(v.id)} disabled={publishingId === v.id}
                          className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-green-50 text-green-600 hover:bg-green-100 transition-colors disabled:opacity-50">
                          {publishingId === v.id ? <Loader2Icon className="size-3 animate-spin" /> : <UploadIcon className="size-3" />}发布
                        </button>
                      )}
                      <button onClick={() => handlePreviewYaml(v.id)}
                        className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors">
                        <EyeIcon className="size-3" />预览 YAML
                      </button>
                      <button onClick={() => handleRestoreVersion(v)}
                        className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-gray-50 text-gray-600 hover:bg-gray-100 transition-colors">
                        恢复至该版本
                      </button>
                      {!v.is_published && (
                        <button onClick={() => handleDelete(v.id)} disabled={deletingId === v.id}
                          className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50">
                          {deletingId === v.id ? <Loader2Icon className="size-3 animate-spin" /> : <Trash2Icon className="size-3" />}删除
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
