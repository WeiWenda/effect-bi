import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Select } from '../ui/select';
import { dashboardAPI, folderAPI } from '../../services/dashboardApi';
import type { DashboardInfo, DashboardFolder } from '../../types/chart';
import { makeDefaultTabGroupLayoutItem } from '../../utils/dashboardTabOnlyLayout';

interface CreateDashboardDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (dashboard: DashboardInfo) => void;
}

export function CreateDashboardDialog({ open, onClose, onCreated }: CreateDashboardDialogProps): React.JSX.Element {
  const [folders, setFolders] = useState<DashboardFolder[]>([]);
  const [name, setName] = useState('');
  const [folderId, setFolderId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setFolderId(null);
      folderAPI.list().then(setFolders).catch(() => {});
    }
  }, [open]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const dash = await dashboardAPI.create(name.trim(), folderId, {
        layout: [makeDefaultTabGroupLayoutItem(0)],
      });
      onCreated(dash);
    } catch {
      // error handling is up to caller
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>新建看板</DialogTitle>
        </DialogHeader>
        <div className="py-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">看板名称</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="请输入看板名称"
              className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
              onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">所属文件夹 (可选)</label>
            <Select
              value={folderId != null ? String(folderId) : ''}
              onChange={val => setFolderId(val ? parseInt(val) : null)}
              options={[
                { value: '', label: '无文件夹' },
                ...folders.map(f => ({ value: String(f.id), label: f.name })),
              ]}
              placeholder="无文件夹"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={creating}>取消</Button>
          <Button onClick={handleCreate} disabled={creating || !name.trim()}>
            {creating ? '创建中...' : '创建'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
