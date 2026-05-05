import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboardIcon,
  FolderIcon,
  Trash2Icon,
  FolderPlusIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  ListTreeIcon,
  GripVerticalIcon,
  MoreVerticalIcon,
} from 'lucide-react';
import { folderAPI, dashboardAPI } from '../../services/dashboardApi';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Select } from '../ui/select';
import { useToast } from '../ui/toast';
import { CreateDashboardDialog } from './CreateDashboardDialog';
import type { DashboardFolder, DashboardInfo } from '../../types/chart';

interface FolderNode extends DashboardFolder {
  children?: FolderNode[];
  dashboards?: DashboardInfo[];
}

function buildFolderTree(folders: DashboardFolder[]): FolderNode[] {
  const map = new Map<number, FolderNode>();
  const roots: FolderNode[] = [];

  for (const f of folders) {
    map.set(f.id, { ...f, children: [], dashboards: [] });
  }

  for (const f of folders) {
    const node = map.get(f.id)!;
    if (f.parent_id && map.has(f.parent_id)) {
      map.get(f.parent_id)!.children!.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort children by sort_order
  const sortNodes = (nodes: FolderNode[]): FolderNode[] => {
    return nodes.sort((a, b) => a.sort_order - b.sort_order).map(n => ({
      ...n,
      children: n.children ? sortNodes(n.children) : [],
    }));
  };

  return sortNodes(roots);
}

export function DashboardListPage(): React.JSX.Element {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [folders, setFolders] = useState<DashboardFolder[]>([]);
  const [dashboards, setDashboards] = useState<DashboardInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const FOLDER_EXPANDED_KEY = 'dashboardExpandedFolders';
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(() => {
    try {
      const raw = localStorage.getItem(FOLDER_EXPANDED_KEY);
      if (raw) return new Set(JSON.parse(raw));
    } catch { /* ignore */ }
    return new Set();
  });

  const setExpandedFoldersPersisted = (fn: (prev: Set<number>) => Set<number>) => {
    setExpandedFolders(prev => {
      const next = fn(prev);
      try { localStorage.setItem(FOLDER_EXPANDED_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createDashboardFolderPreset, setCreateDashboardFolderPreset] = useState<number | null>(null);

  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderDialogMode, setFolderDialogMode] = useState<'create' | 'rename'>('create');
  const [renameTargetId, setRenameTargetId] = useState<number | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParentId, setNewFolderParentId] = useState<number | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);

  /** 固定定位的文件夹行「更多」菜单 */
  const [folderMoreMenu, setFolderMoreMenu] = useState<{ folderId: number; top: number; left: number } | null>(null);

  useEffect(() => {
    if (!folderMoreMenu) return;
    const close = (e: globalThis.MouseEvent) => {
      const el = e.target;
      if (el instanceof Element && el.closest('[data-dashboard-folder-more-menu]')) return;
      if (el instanceof Element && el.closest('[data-dashboard-folder-more-trigger]')) return;
      setFolderMoreMenu(null);
    };
    const t = window.setTimeout(() => document.addEventListener('mousedown', close, true), 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('mousedown', close, true);
    };
  }, [folderMoreMenu]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [f, d] = await Promise.all([folderAPI.list(), dashboardAPI.list()]);
      setFolders(f);
      setDashboards(d);
    } catch (err) {
      console.error('Error loading dashboards:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleFolder = (id: number) => {
    setExpandedFoldersPersisted(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreateDashboard = async (dash: DashboardInfo) => {
    toast('创建成功', 'success');
    setCreateDialogOpen(false);
    navigate(`/dashboard/${dash.id}`);
  };

  const resetFolderDialog = () => {
    setFolderDialogMode('create');
    setRenameTargetId(null);
    setNewFolderName('');
    setNewFolderParentId(null);
  };

  const openCreateFolderDialog = (parentId: number | null) => {
    setFolderDialogMode('create');
    setRenameTargetId(null);
    setNewFolderParentId(parentId);
    setNewFolderName('');
    setFolderDialogOpen(true);
  };

  const handleFolderDialogSubmit = async () => {
    if (!newFolderName.trim()) {
      toast('请输入文件夹名称', 'error');
      return;
    }
    setCreatingFolder(true);
    try {
      if (folderDialogMode === 'rename' && renameTargetId != null) {
        await folderAPI.update(renameTargetId, { name: newFolderName.trim() });
        toast('重命名成功', 'success');
      } else {
        await folderAPI.create(newFolderName.trim(), newFolderParentId || undefined);
        toast('文件夹创建成功', 'success');
      }
      setFolderDialogOpen(false);
      resetFolderDialog();
      await loadData();
    } catch {
      toast(folderDialogMode === 'rename' ? '重命名失败' : '创建失败', 'error');
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleDeleteDashboard = async (id: number) => {
    try {
      await dashboardAPI.delete(id);
      toast('删除成功', 'success');
      setDashboards(prev => prev.filter(d => d.id !== id));
    } catch {
      toast('删除失败', 'error');
    }
  };

  const handleDeleteFolder = async (id: number) => {
    try {
      await folderAPI.delete(id);
      toast('删除成功', 'success');
      await loadData();
    } catch {
      toast('删除失败', 'error');
    }
  };

  const handleMoveDashboard = async (dashboardId: number, folderId: number | null) => {
    try {
      await dashboardAPI.update(dashboardId, { folderId });
      toast('移动成功', 'success');
      await loadData();
    } catch {
      toast('移动失败', 'error');
    }
  };

  const handleReorderFolder = async (folderId: number, sortOrder: number) => {
    try {
      await folderAPI.update(folderId, { sortOrder });
      await loadData();
    } catch {
      toast('排序失败', 'error');
    }
  };

  const toggleExpandAll = (folderId: number, expand: boolean) => {
    setExpandedFoldersPersisted(prev => {
      const next = new Set(prev);
      const collectIds = (node: FolderNode | undefined): number[] => {
        if (!node) return [];
        const ids = [node.id];
        (node.children || []).forEach(child => ids.push(...collectIds(child)));
        return ids;
      };
      const node = tree.find(n => n.id === folderId) || findNodeInTree(tree, folderId);
      const ids = collectIds(node);
      if (expand) {
        ids.forEach(id => next.add(id));
      } else {
        ids.forEach(id => next.delete(id));
      }
      return next;
    });
  };

  const findNodeInTree = (nodes: FolderNode[], id: number): FolderNode | undefined => {
    for (const n of nodes) {
      if (n.id === id) return n;
      const found = findNodeInTree(n.children || [], id);
      if (found) return found;
    }
    return undefined;
  };

  // Count all dashboards recursively under a folder
  const countAllDashboards = (node: FolderNode): number => {
    const direct = dashboards.filter(d => d.folder_id === node.id).length;
    const childCount = (node.children || []).reduce((sum, child) => sum + countAllDashboards(child), 0);
    return direct + childCount;
  };

  /** 同一文件夹下的稳定顺序（与 updated_at 无关） */
  const dashboardsInFolder = useCallback(
    (fid: number | null) =>
      dashboards
        .filter(d => (fid === null ? d.folder_id == null : d.folder_id === fid))
        .sort(
          (a, b) =>
            (a.sort_order - b.sort_order) ||
            a.name.localeCompare(b.name) ||
            a.id - b.id
        ),
    [dashboards]
  );

  const tree = buildFolderTree(folders);

  const [dragDashboardId, setDragDashboardId] = useState<number | null>(null);
  const [dropFolderId, setDropFolderId] = useState<number | null>(null);
  const [dragFolderId, setDragFolderId] = useState<number | null>(null);
  const [dropTargetFolderId, setDropTargetFolderId] = useState<number | null>(null);
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | null>(null);

  const [dragDashboardReorderId, setDragDashboardReorderId] = useState<number | null>(null);
  const [dropDashboardReorderTargetId, setDropDashboardReorderTargetId] = useState<number | null>(null);
  const [dropDashboardReorderPosition, setDropDashboardReorderPosition] = useState<'before' | 'after' | null>(null);

  const clearDashboardDragUi = () => {
    setDragDashboardId(null);
    setDropFolderId(null);
    setDragFolderId(null);
    setDropTargetFolderId(null);
    setDropPosition(null);
    setDragDashboardReorderId(null);
    setDropDashboardReorderTargetId(null);
    setDropDashboardReorderPosition(null);
  };

  const handleDashboardDragStart = (e: React.DragEvent, dashId: number) => {
    setDragDashboardReorderId(null);
    setDragDashboardId(dashId);
    e.dataTransfer.setData('application/dashboard-id', String(dashId));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDashboardDragEnd = () => {
    clearDashboardDragUi();
  };

  const handleDashboardReorderDragStart = (e: React.DragEvent, dashId: number) => {
    e.stopPropagation();
    setDragDashboardId(null);
    setDragDashboardReorderId(dashId);
    e.dataTransfer.setData('application/dashboard-reorder-id', String(dashId));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDashboardReorderDragOver = (e: React.DragEvent, dashId: number) => {
    if (dragDashboardReorderId == null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    setDropDashboardReorderTargetId(dashId);
    setDropDashboardReorderPosition(e.clientY < midY ? 'before' : 'after');
  };

  const handleDashboardReorderDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDropDashboardReorderTargetId(null);
      setDropDashboardReorderPosition(null);
    }
  };

  const handleDashboardReorderDrop = async (
    targetDashId: number,
    folderContextId: number | null,
    position: 'before' | 'after'
  ) => {
    const srcId = dragDashboardReorderId;
    if (!srcId || srcId === targetDashId) {
      clearDashboardDragUi();
      return;
    }
    const src = dashboards.find(d => d.id === srcId);
    const tgt = dashboards.find(d => d.id === targetDashId);
    if (!src || !tgt || (src.folder_id ?? null) !== (tgt.folder_id ?? null)) {
      toast('请在同一文件夹内调整顺序', 'error');
      clearDashboardDragUi();
      return;
    }
    const siblings = dashboardsInFolder(folderContextId);
    const targetIndex = siblings.findIndex(s => s.id === targetDashId);
    const tgtOrder = tgt.sort_order;
    let newSortOrder: number;
    if (position === 'before') {
      newSortOrder =
        targetIndex > 0
          ? (siblings[targetIndex - 1].sort_order + tgtOrder) / 2
          : tgtOrder - 1;
    } else {
      newSortOrder =
        targetIndex < siblings.length - 1
          ? (tgtOrder + siblings[targetIndex + 1].sort_order) / 2
          : tgtOrder + 1;
    }
    try {
      await dashboardAPI.update(srcId, { sortOrder: newSortOrder });
      toast('顺序已更新', 'success');
      await loadData();
    } catch {
      toast('排序失败', 'error');
    } finally {
      clearDashboardDragUi();
    }
  };

  const handleFolderDragOver = (e: React.DragEvent, folderId: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropFolderId(folderId);
  };

  const handleFolderDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDropFolderId(null);
    }
  };

  // Folder reorder drag handlers
  const handleFolderReorderDragStart = (e: React.DragEvent, folderId: number) => {
    setDragFolderId(folderId);
    e.dataTransfer.setData('application/folder-id', String(folderId));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleFolderReorderDragOver = (e: React.DragEvent, folderId: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    setDropTargetFolderId(folderId);
    setDropPosition(e.clientY < midY ? 'before' : 'after');
  };

  const handleFolderReorderDrop = (e: React.DragEvent, targetFolderId: number, position: 'before' | 'after') => {
    e.preventDefault();
    const srcFolderId = parseInt(e.dataTransfer.getData('application/folder-id'));
    if (!srcFolderId || srcFolderId === targetFolderId) {
      setDragFolderId(null);
      setDropTargetFolderId(null);
      setDropPosition(null);
      return;
    }
    // Find target folder's sort_order and parent, then reorder
    const targetFolder = folders.find(f => f.id === targetFolderId);
    const sourceFolder = folders.find(f => f.id === srcFolderId);
    if (!targetFolder || !sourceFolder) return;

    // Get siblings of target (same parent)
    const parentId = targetFolder.parent_id;
    const siblings = folders.filter(f => f.parent_id === parentId).sort((a, b) => a.sort_order - b.sort_order);
    const targetIndex = siblings.findIndex(s => s.id === targetFolderId);

    // Calculate new sort_order for source
    let newSortOrder: number;
    if (position === 'before') {
      newSortOrder = targetIndex > 0 ? (siblings[targetIndex - 1].sort_order + targetFolder.sort_order) / 2 : targetFolder.sort_order - 1;
    } else {
      newSortOrder = targetIndex < siblings.length - 1 ? (targetFolder.sort_order + siblings[targetIndex + 1].sort_order) / 2 : targetFolder.sort_order + 1;
    }

    handleReorderFolder(srcFolderId, newSortOrder);
    // Also update parent if different
    if (sourceFolder.parent_id !== parentId) {
      folderAPI.update(srcFolderId, { parentId: parentId ?? null, sortOrder: newSortOrder }).then(() => loadData());
    }

    setDragFolderId(null);
    setDropTargetFolderId(null);
    setDropPosition(null);
  };

  const handleFolderDrop = (e: React.DragEvent, folderId: number) => {
    e.preventDefault();
    if (e.dataTransfer.getData('application/dashboard-reorder-id')) {
      clearDashboardDragUi();
      return;
    }
    const dashId = parseInt(e.dataTransfer.getData('application/dashboard-id'), 10);
    if (dashId) {
      handleMoveDashboard(dashId, folderId);
    }
    setDragDashboardId(null);
    setDropFolderId(null);
  };

  const handleRootDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.getData('application/dashboard-reorder-id')) {
      clearDashboardDragUi();
      return;
    }
    const dashId = parseInt(e.dataTransfer.getData('application/dashboard-id'), 10);
    if (dashId) {
      handleMoveDashboard(dashId, null);
    }
    setDragDashboardId(null);
    setDropFolderId(null);
  };

  const renderFolder = (node: FolderNode, depth: number = 0): React.ReactNode => {
    const isExpanded = expandedFolders.has(node.id);
    const totalCount = countAllDashboards(node);
    const isDropTarget = dropTargetFolderId === node.id;
    const isDragSource = dragFolderId === node.id;

    return (
      <div key={node.id}>
        <div
          className={`flex items-center gap-1 px-2 py-2 hover:bg-gray-50 cursor-pointer group ${isDropTarget ? (dropPosition === 'before' ? 'border-t-2 border-blue-400' : 'border-b-2 border-blue-400') : ''} ${isDragSource ? 'opacity-40' : ''} ${dropFolderId === node.id ? 'bg-blue-50 ring-1 ring-blue-300' : ''}`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => toggleFolder(node.id)}
          onDragOver={e => {
            handleFolderDragOver(e, node.id);
            handleFolderReorderDragOver(e, node.id);
          }}
          onDragLeave={(e) => {
            handleFolderDragLeave(e);
            setDropTargetFolderId(null);
            setDropPosition(null);
          }}
          onDrop={e => {
            if (e.dataTransfer.getData('application/dashboard-reorder-id')) {
              e.preventDefault();
              clearDashboardDragUi();
              return;
            }
            const folderId = e.dataTransfer.getData('application/folder-id');
            if (folderId && dropPosition) {
              handleFolderReorderDrop(e, node.id, dropPosition);
            } else {
              handleFolderDrop(e, node.id);
            }
          }}
        >
          <div
            className="shrink-0 cursor-grab"
            onClick={e => e.stopPropagation()}
            onDragStart={e => {
              e.stopPropagation();
              handleFolderReorderDragStart(e, node.id);
            }}
            draggable
            role="presentation"
          >
            <GripVerticalIcon className="size-3.5 text-gray-300 group-hover:text-gray-400" />
          </div>
          {isExpanded ? <ChevronDownIcon className="size-4 text-gray-400 shrink-0" /> : <ChevronRightIcon className="size-4 text-gray-400 shrink-0" />}
          <FolderIcon className="size-4 text-yellow-500 shrink-0" />
          <span className="text-sm text-gray-700 flex-1 truncate">{node.name}</span>
          <span className="text-xs text-gray-400 shrink-0">{totalCount}</span>
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              toggleExpandAll(node.id, !isExpanded || !isAllExpanded(node));
            }}
            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600 transition-all shrink-0"
            title={isAllExpanded(node) ? '全部折叠' : '全部展开'}
          >
            <ListTreeIcon className="size-3" />
          </button>
          <button
            type="button"
            data-dashboard-folder-more-trigger
            onClick={e => {
              e.stopPropagation();
              const btn = e.currentTarget;
              if (folderMoreMenu?.folderId === node.id) {
                setFolderMoreMenu(null);
                return;
              }
              const rect = btn.getBoundingClientRect();
              const left = Math.min(rect.left, typeof window !== 'undefined' ? window.innerWidth - 176 : rect.left);
              setFolderMoreMenu({ folderId: node.id, top: rect.bottom + 4, left });
            }}
            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600 transition-all shrink-0"
            title="更多"
            aria-label={`${node.name} 更多操作`}
          >
            <MoreVerticalIcon className="size-3.5" />
          </button>
        </div>
        {isExpanded && (
          <div>
            {dashboardsInFolder(node.id).map(dash =>
              renderDashboardItem(dash, depth + 1, node.id)
            )}
            {node.children?.map(child => renderFolder(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const isAllExpanded = (node: FolderNode): boolean => {
    if (!expandedFolders.has(node.id)) return false;
    return (node.children || []).every(child => isAllExpanded(child));
  };

  const renderDashboardItem = (dash: DashboardInfo, depth: number, folderContextId: number | null) => {
    const isReorderTarget =
      dragDashboardReorderId != null &&
      dropDashboardReorderTargetId === dash.id &&
      dropDashboardReorderPosition;
    const borderCls =
      isReorderTarget && dropDashboardReorderPosition === 'before'
        ? 'border-t-2 border-blue-400'
        : isReorderTarget && dropDashboardReorderPosition === 'after'
          ? 'border-b-2 border-blue-400'
          : '';

    return (
      <div
        key={dash.id}
        className={`flex items-center gap-1 px-2 py-2 hover:bg-blue-50 group ${borderCls} ${
          dragDashboardId === dash.id || dragDashboardReorderId === dash.id ? 'opacity-40' : ''
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onDragOver={e => handleDashboardReorderDragOver(e, dash.id)}
        onDragLeave={handleDashboardReorderDragLeave}
        onDrop={e => {
          e.preventDefault();
          e.stopPropagation();
          if (dragDashboardReorderId != null && dropDashboardReorderPosition) {
            void handleDashboardReorderDrop(dash.id, folderContextId, dropDashboardReorderPosition);
          }
        }}
      >
        <div
          className="shrink-0 cursor-grab p-0.5"
          draggable
          role="presentation"
          onClick={e => e.stopPropagation()}
          onDragStart={e => handleDashboardReorderDragStart(e, dash.id)}
          onDragEnd={handleDashboardDragEnd}
        >
          <GripVerticalIcon className="size-3.5 text-gray-300 group-hover:text-gray-400" />
        </div>
        <div
          className="flex flex-1 min-w-0 items-center gap-2 cursor-pointer"
          draggable
          onDragStart={e => handleDashboardDragStart(e, dash.id)}
          onDragEnd={handleDashboardDragEnd}
          onClick={() => navigate(`/dashboard/${dash.id}`)}
        >
          <LayoutDashboardIcon className="size-4 text-blue-500 shrink-0" />
          <span className="text-sm text-gray-700 flex-1 truncate">{dash.name}</span>
          <span className="text-xs text-gray-400 shrink-0">{dash.chart_count || 0} 图表</span>
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              void handleDeleteDashboard(dash.id);
            }}
            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-500 transition-all shrink-0"
          >
            <Trash2Icon className="size-3" />
          </button>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500" />
      </div>
    );
  }

  return (
    <div className="h-full flex bg-gray-50">
      {folderMoreMenu ? (
        <div
          data-dashboard-folder-more-menu
          className="fixed z-[300] min-w-[168px] rounded-md border border-gray-200 bg-white py-1 shadow-lg text-sm"
          style={{ top: folderMoreMenu.top, left: folderMoreMenu.left }}
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            className="w-full text-left px-3 py-2 hover:bg-gray-50 text-gray-800"
            onClick={() => {
              setCreateDashboardFolderPreset(folderMoreMenu.folderId);
              setCreateDialogOpen(true);
              setFolderMoreMenu(null);
            }}
          >
            创建看板
          </button>
          <button
            type="button"
            role="menuitem"
            className="w-full text-left px-3 py-2 hover:bg-gray-50 text-gray-800"
            onClick={() => {
              openCreateFolderDialog(folderMoreMenu.folderId);
              setFolderMoreMenu(null);
            }}
          >
            创建子文件夹
          </button>
          <button
            type="button"
            role="menuitem"
            className="w-full text-left px-3 py-2 hover:bg-gray-50 text-gray-800"
            onClick={() => {
              const fid = folderMoreMenu.folderId;
              const row = folders.find(f => f.id === fid);
              setFolderDialogMode('rename');
              setRenameTargetId(fid);
              setNewFolderName(row?.name ?? '');
              setNewFolderParentId(null);
              setFolderDialogOpen(true);
              setFolderMoreMenu(null);
            }}
          >
            重命名
          </button>
          <div className="my-1 border-t border-gray-100" />
          <button
            type="button"
            role="menuitem"
            className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600"
            onClick={() => {
              const id = folderMoreMenu.folderId;
              setFolderMoreMenu(null);
              void handleDeleteFolder(id);
            }}
          >
            删除当前文件夹
          </button>
        </div>
      ) : null}
      {/* Left sidebar - folder tree */}
      <div className="w-72 border-r border-gray-200 bg-white flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
          <h2 className="text-sm font-semibold text-gray-700">看板文件夹</h2>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => {
                setCreateDashboardFolderPreset(null);
                setCreateDialogOpen(true);
              }}
              className="p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-700 transition-colors"
              title="新建看板"
            >
              <LayoutDashboardIcon className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => openCreateFolderDialog(null)}
              className="p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-700 transition-colors"
              title="新建文件夹"
            >
              <FolderPlusIcon className="size-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto py-1"
          onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
          onDrop={handleRootDrop}
        >
          {tree.map(node => renderFolder(node))}
          {dashboardsInFolder(null).map(dash => renderDashboardItem(dash, 0, null))}
        </div>
      </div>

      {/* Right content - dashboard cards */}
      <div className="flex-1 overflow-auto p-6">
        <div className="flex items-center gap-2 mb-6">
          <LayoutDashboardIcon className="size-6 text-blue-600" />
          <h1 className="text-2xl font-semibold text-gray-800">看板</h1>
        </div>

        {dashboards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <LayoutDashboardIcon className="size-12 mb-4" />
            <p className="text-lg">暂无看板</p>
            <p className="text-sm mt-2">在左侧「看板文件夹」标题栏点击看板图标新建，或在文件夹「更多」里创建</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[...dashboards]
              .sort(
                (a, b) =>
                  (a.sort_order - b.sort_order) ||
                  a.name.localeCompare(b.name) ||
                  a.id - b.id
              )
              .map(dash => (
              <div
                key={dash.id}
                onClick={() => navigate(`/dashboard/${dash.id}`)}
                draggable
                onDragStart={e => handleDashboardDragStart(e, dash.id)}
                onDragEnd={handleDashboardDragEnd}
                className={`bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer ${dragDashboardId === dash.id ? 'opacity-40' : ''}`}
              >
                <div className="flex items-center gap-2 mb-3">
                  <LayoutDashboardIcon className="size-5 text-blue-500" />
                  <h3 className="text-sm font-semibold text-gray-800 truncate">{dash.name}</h3>
                </div>
                <div className="text-xs text-gray-400 space-y-1">
                  <div>{dash.chart_count || 0} 个图表</div>
                  <div>{new Date(dash.updated_at).toLocaleString('zh-CN')}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <CreateDashboardDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onCreated={handleCreateDashboard}
        initialFolderId={createDashboardFolderPreset}
      />

      <Dialog
        open={folderDialogOpen}
        onOpenChange={open => {
          setFolderDialogOpen(open);
          if (!open) resetFolderDialog();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{folderDialogMode === 'rename' ? '重命名文件夹' : '新建文件夹'}</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">文件夹名称</label>
              <input
                type="text"
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                placeholder="请输入文件夹名称"
                className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                onKeyDown={e => {
                  if (e.key === 'Enter') void handleFolderDialogSubmit();
                }}
              />
            </div>
            {folderDialogMode === 'create' ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">父文件夹 (可选)</label>
                <Select
                  value={newFolderParentId != null ? String(newFolderParentId) : ''}
                  onChange={val => setNewFolderParentId(val ? parseInt(val) : null)}
                  options={[
                    { value: '', label: '无 (根目录)' },
                    ...folders.map(f => ({ value: String(f.id), label: f.name })),
                  ]}
                  placeholder="无 (根目录)"
                />
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setFolderDialogOpen(false);
                resetFolderDialog();
              }}
            >
              取消
            </Button>
            <Button onClick={() => void handleFolderDialogSubmit()} disabled={creatingFolder || !newFolderName.trim()}>
              {creatingFolder
                ? folderDialogMode === 'rename'
                  ? '保存中...'
                  : '创建中...'
                : folderDialogMode === 'rename'
                  ? '保存'
                  : '创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
