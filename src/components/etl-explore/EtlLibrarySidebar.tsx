import { useState, useEffect, useCallback, useMemo, type DragEvent } from 'react';
import {
  FolderIcon,
  FolderPlusIcon,
  FilePlus2Icon,
  ChevronRightIcon,
  ChevronDownIcon,
  ListTreeIcon,
  Trash2Icon,
  FileCode2Icon,
  GripVerticalIcon,
  MoreVerticalIcon,
} from 'lucide-react';
import { etlAPI, etlFolderAPI, type EtlFolder, type EtlTaskListRow } from '../../services/etlApi';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Select } from '../ui/select';
import { useToast } from '../ui/toast';

const EXPANDED_KEY = 'etlLibraryExpandedFolders';

interface FolderNode extends EtlFolder {
  children?: FolderNode[];
}

function buildFolderTree(folders: EtlFolder[]): FolderNode[] {
  const map = new Map<number, FolderNode>();
  const roots: FolderNode[] = [];

  for (const f of folders) {
    map.set(f.id, { ...f, children: [] });
  }

  for (const f of folders) {
    const node = map.get(f.id)!;
    if (f.parent_id && map.has(f.parent_id)) {
      map.get(f.parent_id)!.children!.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortNodes = (nodes: FolderNode[]): FolderNode[] =>
    nodes.sort((a, b) => a.sort_order - b.sort_order).map(n => ({
      ...n,
      children: n.children ? sortNodes(n.children) : [],
    }));

  return sortNodes(roots);
}

function placementHint(folders: EtlFolder[], folderId: number | null): string {
  if (folderId == null) return '将保存到：未归类（可在左侧目录拖拽调整）';
  const f = folders.find(x => x.id === folderId);
  return f ? `将保存到：「${f.name}」（可在左侧目录拖拽调整）` : '将保存到当前目录（可在左侧目录拖拽调整）';
}

interface EtlLibrarySidebarProps {
  refreshToken: number;
  onOpenTask: (taskName: string, folderId: number | null) => void;
  onOpenNewEtlDialog: (folderId: number | null, hint: string) => void;
  onTaskDeleted?: (taskName: string) => void;
  focusTaskRequest?: { taskName: string; token: number } | null;
  onFocusTaskHandled?: () => void;
}

export function EtlLibrarySidebar({
  refreshToken,
  onOpenTask,
  onOpenNewEtlDialog,
  onTaskDeleted,
  focusTaskRequest,
  onFocusTaskHandled,
}: EtlLibrarySidebarProps): JSX.Element {
  const { toast } = useToast();
  const [folders, setFolders] = useState<EtlFolder[]>([]);
  const [tasks, setTasks] = useState<EtlTaskListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(() => {
    try {
      const raw = localStorage.getItem(EXPANDED_KEY);
      if (raw) return new Set(JSON.parse(raw) as number[]);
    } catch {
      /* ignore */
    }
    return new Set();
  });

  const persistExpanded = useCallback((next: Set<number>) => {
    try {
      localStorage.setItem(EXPANDED_KEY, JSON.stringify([...next]));
    } catch {
      /* ignore */
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [f, t] = await Promise.all([etlFolderAPI.list(), etlAPI.listTasks()]);
      setFolders(f);
      setTasks(t.tasks);
    } catch (e) {
      console.error(e);
      toast('加载 ETL 目录失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadData();
  }, [loadData, refreshToken]);

  const tree = useMemo(() => buildFolderTree(folders), [folders]);

  useEffect(() => {
    if (!focusTaskRequest) return;
    const { taskName } = focusTaskRequest;
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 40;
    let findRowTimer: ReturnType<typeof setTimeout> | null = null;
    let scrollDomTimer: ReturnType<typeof setTimeout> | null = null;

    const run = () => {
      if (cancelled) return;
      const row = tasks.find(t => t.name === taskName);
      if (!row) {
        attempts += 1;
        if (attempts < maxAttempts) {
          findRowTimer = window.setTimeout(run, 50);
        } else {
          onFocusTaskHandled?.();
        }
        return;
      }

      const ancestorIds = new Set<number>();
      let fid: number | null = row.folder_id;
      while (fid != null) {
        ancestorIds.add(fid);
        const f = folders.find(x => x.id === fid);
        fid = f?.parent_id ?? null;
      }
      setExpandedFolders(prev => {
        const next = new Set(prev);
        ancestorIds.forEach(id => next.add(id));
        persistExpanded(next);
        return next;
      });

      const findRowEl = (): HTMLElement | null => {
        const nodes = document.querySelectorAll('[data-etl-task-row]');
        let el: Element | null = null;
        nodes.forEach(n => {
          if (n.getAttribute('data-etl-task-row') === taskName) el = n;
        });
        return el instanceof HTMLElement ? el : null;
      };

      const scrollToRow = (isRetry: boolean) => {
        if (cancelled) return;
        const el = findRowEl();
        if (el) {
          el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          el.classList.add('ring-2', 'ring-blue-400', 'bg-blue-50/80', 'rounded-md');
          window.setTimeout(() => {
            el.classList.remove('ring-2', 'ring-blue-400', 'bg-blue-50/80', 'rounded-md');
          }, 2200);
          onFocusTaskHandled?.();
          return;
        }
        if (!isRetry) {
          scrollDomTimer = window.setTimeout(() => scrollToRow(true), 120);
          return;
        }
        onFocusTaskHandled?.();
      };

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => scrollToRow(false));
      });
    };

    run();
    return () => {
      cancelled = true;
      if (findRowTimer != null) window.clearTimeout(findRowTimer);
      if (scrollDomTimer != null) window.clearTimeout(scrollDomTimer);
    };
  }, [focusTaskRequest, tasks, folders, persistExpanded, onFocusTaskHandled]);

  /** Fixed-position folder row overflow menu (创建 ETL / 子文件夹 / 删除). */
  const [folderMoreMenu, setFolderMoreMenu] = useState<{ folderId: number; top: number; left: number } | null>(null);

  useEffect(() => {
    if (!folderMoreMenu) return;
    const close = (e: globalThis.MouseEvent) => {
      const el = e.target;
      if (el instanceof Element && el.closest('[data-etl-folder-more-menu]')) return;
      if (el instanceof Element && el.closest('[data-etl-folder-more-trigger]')) return;
      setFolderMoreMenu(null);
    };
    const t = window.setTimeout(() => document.addEventListener('mousedown', close, true), 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('mousedown', close, true);
    };
  }, [folderMoreMenu]);

  const toggleFolder = (id: number) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      persistExpanded(next);
      return next;
    });
  };

  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParentId, setNewFolderParentId] = useState<number | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      toast('请输入文件夹名称', 'error');
      return;
    }
    setCreatingFolder(true);
    try {
      await etlFolderAPI.create(newFolderName.trim(), newFolderParentId);
      toast('文件夹创建成功', 'success');
      setFolderDialogOpen(false);
      setNewFolderName('');
      setNewFolderParentId(null);
      await loadData();
    } catch {
      toast('创建失败', 'error');
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleDeleteFolder = async (id: number) => {
    setFolderMoreMenu(m => (m?.folderId === id ? null : m));
    try {
      await etlFolderAPI.delete(id);
      toast('删除成功', 'success');
      await loadData();
    } catch {
      toast('删除失败', 'error');
    }
  };

  const handleMoveTask = async (taskName: string, folderId: number | null) => {
    try {
      await etlAPI.patchTaskPlacement({ name: taskName, folderId });
      await loadData();
    } catch {
      toast('移动失败', 'error');
    }
  };

  const handleDeleteTask = async (taskName: string) => {
    if (
      !window.confirm(`确定删除任务「${taskName}」？将移除其所有历史版本与目录记录，且不可恢复。`)
    ) {
      return;
    }
    try {
      await etlAPI.deleteTask(taskName);
      toast('任务已删除', 'success');
      onTaskDeleted?.(taskName);
      await loadData();
    } catch {
      toast('删除失败', 'error');
    }
  };

  const [dragTaskName, setDragTaskName] = useState<string | null>(null);
  const [dropFolderId, setDropFolderId] = useState<number | null>(null);
  const [dragFolderId, setDragFolderId] = useState<number | null>(null);
  const [dropTargetFolderId, setDropTargetFolderId] = useState<number | null>(null);
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | null>(null);

  const clearDragUi = () => {
    setDragTaskName(null);
    setDropFolderId(null);
    setDragFolderId(null);
    setDropTargetFolderId(null);
    setDropPosition(null);
  };

  const handleTaskDragStart = (e: DragEvent, name: string) => {
    setDragFolderId(null);
    setDropTargetFolderId(null);
    setDropPosition(null);
    setDragTaskName(name);
    e.dataTransfer.setData('application/etl-task-name', name);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleTaskDragEnd = () => {
    clearDragUi();
  };

  const handleFolderDragOverForTask = (e: DragEvent, folderId: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropFolderId(folderId);
  };

  const handleFolderDragLeaveForTask = (e: DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDropFolderId(null);
    }
  };

  const handleFolderReorderDragStart = (e: DragEvent, folderId: number) => {
    e.stopPropagation();
    setDragTaskName(null);
    setDropFolderId(null);
    setDragFolderId(folderId);
    e.dataTransfer.setData('application/etl-folder-id', String(folderId));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleFolderReorderDragOver = (e: DragEvent, folderId: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    setDropTargetFolderId(folderId);
    setDropPosition(e.clientY < midY ? 'before' : 'after');
  };

  const handleFolderReorderDragLeave = (e: DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDropTargetFolderId(null);
      setDropPosition(null);
    }
  };

  const handleReorderFolder = async (folderId: number, sortOrder: number) => {
    try {
      await etlFolderAPI.update(folderId, { sortOrder });
      await loadData();
    } catch {
      toast('排序失败', 'error');
    }
  };

  const handleFolderReorderDrop = (e: DragEvent, targetFolderId: number, position: 'before' | 'after') => {
    e.preventDefault();
    e.stopPropagation();
    const srcFolderId = parseInt(e.dataTransfer.getData('application/etl-folder-id'), 10);
    if (!srcFolderId || Number.isNaN(srcFolderId) || srcFolderId === targetFolderId) {
      clearDragUi();
      return;
    }
    const targetFolder = folders.find(f => f.id === targetFolderId);
    const sourceFolder = folders.find(f => f.id === srcFolderId);
    if (!targetFolder || !sourceFolder) {
      clearDragUi();
      return;
    }

    const parentId = targetFolder.parent_id;
    const siblings = folders.filter(f => f.parent_id === parentId).sort((a, b) => a.sort_order - b.sort_order);
    const targetIndex = siblings.findIndex(s => s.id === targetFolderId);

    let newSortOrder: number;
    if (position === 'before') {
      newSortOrder =
        targetIndex > 0
          ? (siblings[targetIndex - 1].sort_order + targetFolder.sort_order) / 2
          : targetFolder.sort_order - 1;
    } else {
      newSortOrder =
        targetIndex < siblings.length - 1
          ? (targetFolder.sort_order + siblings[targetIndex + 1].sort_order) / 2
          : targetFolder.sort_order + 1;
    }

    if (sourceFolder.parent_id !== parentId) {
      void etlFolderAPI
        .update(srcFolderId, { parentId: parentId ?? null, sortOrder: newSortOrder })
        .then(() => loadData())
        .catch(() => toast('移动目录失败', 'error'));
    } else {
      void handleReorderFolder(srcFolderId, newSortOrder);
    }

    clearDragUi();
  };

  const handleFolderRowDragOver = (e: DragEvent, folderId: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragFolderId != null) {
      handleFolderReorderDragOver(e, folderId);
    } else if (dragTaskName != null) {
      handleFolderDragOverForTask(e, folderId);
    }
  };

  const handleFolderRowDragLeave = (e: DragEvent) => {
    handleFolderReorderDragLeave(e);
    handleFolderDragLeaveForTask(e);
  };

  const handleFolderRowDrop = (e: DragEvent, folderId: number) => {
    const folderReorderSrc = e.dataTransfer.getData('application/etl-folder-id');
    if (folderReorderSrc) {
      e.preventDefault();
      if (dropPosition) {
        handleFolderReorderDrop(e, folderId, dropPosition);
      } else {
        clearDragUi();
      }
      return;
    }
    e.preventDefault();
    const name = e.dataTransfer.getData('application/etl-task-name');
    if (name) void handleMoveTask(name, folderId);
    clearDragUi();
  };

  const handleRootDrop = (e: DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.getData('application/etl-folder-id')) {
      clearDragUi();
      return;
    }
    const name = e.dataTransfer.getData('application/etl-task-name');
    if (name) void handleMoveTask(name, null);
    clearDragUi();
  };

  const rootTasks = tasks.filter(t => t.folder_id == null);

  const countTasksInFolder = (node: FolderNode): number => {
    const direct = tasks.filter(t => t.folder_id === node.id).length;
    return direct + (node.children || []).reduce((s, c) => s + countTasksInFolder(c), 0);
  };

  const findNodeInTree = (nodes: FolderNode[], id: number): FolderNode | undefined => {
    for (const n of nodes) {
      if (n.id === id) return n;
      const found = findNodeInTree(n.children || [], id);
      if (found) return found;
    }
    return undefined;
  };

  const isAllExpanded = (node: FolderNode): boolean => {
    if (!expandedFolders.has(node.id)) return false;
    return (node.children || []).every(c => isAllExpanded(c));
  };

  const toggleExpandAll = (folderId: number, expand: boolean) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      const collectIds = (node: FolderNode | undefined): number[] => {
        if (!node) return [];
        const ids = [node.id];
        (node.children || []).forEach(c => ids.push(...collectIds(c)));
        return ids;
      };
      const node = tree.find(n => n.id === folderId) || findNodeInTree(tree, folderId);
      const ids = collectIds(node);
      if (expand) ids.forEach(i => next.add(i));
      else ids.forEach(i => next.delete(i));
      persistExpanded(next);
      return next;
    });
  };

  const renderTaskRow = (row: EtlTaskListRow, depth: number) => (
    <div
      key={row.name}
      data-etl-task-row={row.name}
      className={`flex items-center gap-2 px-3 py-2 hover:bg-blue-50 cursor-pointer group ${dragTaskName === row.name ? 'opacity-40' : ''}`}
      style={{ paddingLeft: `${depth * 16 + 28}px` }}
      onClick={() => onOpenTask(row.name, row.folder_id)}
      draggable
      onDragStart={e => handleTaskDragStart(e, row.name)}
      onDragEnd={handleTaskDragEnd}
    >
      <FileCode2Icon className="size-4 text-emerald-600 shrink-0" />
      <span className="text-sm text-gray-700 flex-1 truncate">{row.name}</span>
      <button
        type="button"
        onClick={e => {
          e.stopPropagation();
          void handleDeleteTask(row.name);
        }}
        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-500 transition-all shrink-0"
        title="删除任务"
        aria-label={`删除任务 ${row.name}`}
      >
        <Trash2Icon className="size-3.5" />
      </button>
    </div>
  );

  const renderFolder = (node: FolderNode, depth: number = 0) => {
    const isExpanded = expandedFolders.has(node.id);
    const total = countTasksInFolder(node);
    const isDropTaskTarget = dragTaskName != null && dropFolderId === node.id;
    const isReorderTarget = dragFolderId != null && dropTargetFolderId === node.id;
    const isDragFolderSource = dragFolderId === node.id;

    return (
      <div key={node.id}>
        <div
          data-etl-folder-id={node.id}
          className={`flex items-center gap-1 px-2 py-2 hover:bg-gray-50 cursor-pointer group ${
            isReorderTarget ? (dropPosition === 'before' ? 'border-t-2 border-blue-400' : 'border-b-2 border-blue-400') : ''
          } ${isDragFolderSource ? 'opacity-40' : ''} ${isDropTaskTarget ? 'bg-blue-50 ring-1 ring-blue-300' : ''}`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => toggleFolder(node.id)}
          onDragOver={e => handleFolderRowDragOver(e, node.id)}
          onDragLeave={handleFolderRowDragLeave}
          onDrop={e => handleFolderRowDrop(e, node.id)}
        >
          <div
            className="shrink-0 cursor-grab"
            onClick={e => e.stopPropagation()}
            onDragStart={e => handleFolderReorderDragStart(e, node.id)}
            draggable
            role="presentation"
          >
            <GripVerticalIcon className="size-3.5 text-gray-300 group-hover:text-gray-400" />
          </div>
          {isExpanded ? <ChevronDownIcon className="size-4 text-gray-400 shrink-0" /> : <ChevronRightIcon className="size-4 text-gray-400 shrink-0" />}
          <FolderIcon className="size-4 text-yellow-500 shrink-0" />
          <span className="text-sm text-gray-700 flex-1 truncate">{node.name}</span>
          <span className="text-xs text-gray-400 shrink-0">{total}</span>
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
            data-etl-folder-more-trigger
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
            {tasks.filter(t => t.folder_id === node.id).map(t => renderTaskRow(t, depth + 1))}
            {node.children?.map(c => renderFolder(c, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="w-72 border-r border-gray-200 bg-white flex flex-col shrink-0">
        <div className="flex-1 flex items-center justify-center py-12">
          <div className="size-7 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500" />
        </div>
      </div>
    );
  }

  return (
    <>
      {folderMoreMenu ? (
        <div
          data-etl-folder-more-menu
          className="fixed z-[300] min-w-[168px] rounded-md border border-gray-200 bg-white py-1 shadow-lg text-sm"
          style={{ top: folderMoreMenu.top, left: folderMoreMenu.left }}
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            className="w-full text-left px-3 py-2 hover:bg-gray-50 text-gray-800"
            onClick={() => {
              const fid = folderMoreMenu.folderId;
              onOpenNewEtlDialog(fid, placementHint(folders, fid));
              setFolderMoreMenu(null);
            }}
          >
            创建 ETL
          </button>
          <button
            type="button"
            role="menuitem"
            className="w-full text-left px-3 py-2 hover:bg-gray-50 text-gray-800"
            onClick={() => {
              setNewFolderParentId(folderMoreMenu.folderId);
              setNewFolderName('');
              setFolderDialogOpen(true);
              setFolderMoreMenu(null);
            }}
          >
            创建子文件夹
          </button>
          <div className="my-1 border-t border-gray-100" />
          <button
            type="button"
            role="menuitem"
            className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600"
            onClick={() => void handleDeleteFolder(folderMoreMenu.folderId)}
          >
            删除当前目录
          </button>
        </div>
      ) : null}
      <div className="w-72 border-r border-gray-200 bg-white flex flex-col shrink-0 min-h-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
          <h2 className="text-sm font-semibold text-gray-700">ETL 目录</h2>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => onOpenNewEtlDialog(null, placementHint(folders, null))}
              className="p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-700 transition-colors"
              title="新增 ETL"
            >
              <FilePlus2Icon className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setNewFolderParentId(null);
                setNewFolderName('');
                setFolderDialogOpen(true);
              }}
              className="p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-700 transition-colors"
              title="新建文件夹"
            >
              <FolderPlusIcon className="size-4" />
            </button>
          </div>
        </div>
        <div
          className="flex-1 overflow-auto py-1 min-h-0"
          onDragOver={e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
          }}
          onDrop={handleRootDrop}
        >
          {tree.map(n => renderFolder(n))}
          {rootTasks.map(t => renderTaskRow(t, 0))}
        </div>
      </div>

      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建文件夹</DialogTitle>
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
                  if (e.key === 'Enter') void handleCreateFolder();
                }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">父文件夹 (可选)</label>
              <Select
                value={newFolderParentId != null ? String(newFolderParentId) : ''}
                onChange={val => setNewFolderParentId(val ? parseInt(val, 10) : null)}
                options={[
                  { value: '', label: '无 (根目录)' },
                  ...folders.map(f => ({ value: String(f.id), label: f.name })),
                ]}
                placeholder="无 (根目录)"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFolderDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void handleCreateFolder()} disabled={creatingFolder || !newFolderName.trim()}>
              {creatingFolder ? '创建中...' : '创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
