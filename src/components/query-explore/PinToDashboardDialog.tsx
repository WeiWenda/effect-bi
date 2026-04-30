import { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2Icon, LayoutDashboardIcon, PlusIcon, FolderIcon, ChevronRightIcon, ChevronDownIcon, SearchIcon, CheckIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { dashboardAPI, folderAPI } from '../../services/dashboardApi';
import { CreateDashboardDialog } from '../dashboard-explore/CreateDashboardDialog';
import type { DashboardFolder, DashboardInfo } from '../../types/chart';

interface PinToDashboardDialogProps {
  open: boolean;
  onClose: () => void;
  onPin: (dashboardId: number, chartName: string) => void;
  chartName: string;
}

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

  const sortNodes = (nodes: FolderNode[]): FolderNode[] => {
    return nodes.sort((a, b) => a.sort_order - b.sort_order).map(n => ({
      ...n,
      children: n.children ? sortNodes(n.children) : [],
    }));
  };

  return sortNodes(roots);
}

export function PinToDashboardDialog({ open, onClose, onPin, chartName: initialChartName }: PinToDashboardDialogProps): React.JSX.Element {
  const [localChartName, setLocalChartName] = useState(initialChartName);
  const [folders, setFolders] = useState<DashboardFolder[]>([]);
  const [dashboards, setDashboards] = useState<DashboardInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set());
  const [searchText, setSearchText] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedDashboardId, setSelectedDashboardId] = useState<number | null>(null);

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
    if (open) {
      setSearchText('');
      setExpandedFolders(new Set());
      setSelectedDashboardId(null);
      setLocalChartName(initialChartName);
      loadData();
    }
  }, [open, loadData]);

  const tree = useMemo(() => buildFolderTree(folders), [folders]);

  const toggleFolder = (id: number) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Build folder path for a dashboard: "一级/二级/..."
  const getFolderPath = (folderId: number | null): string | null => {
    if (!folderId) return null;
    const parts: string[] = [];
    let currentId: number | null = folderId;
    while (currentId) {
      const folder = folders.find(f => f.id === currentId);
      if (!folder) break;
      parts.unshift(folder.name);
      currentId = folder.parent_id;
    }
    return parts.length > 0 ? parts.join('/') : null;
  };

  // Expand all ancestor folders for a given folderId
  const expandAncestors = (folderId: number | null) => {
    if (!folderId) return;
    const idsToExpand: number[] = [];
    let currentId: number | null = folderId;
    while (currentId) {
      idsToExpand.push(currentId);
      const folder = folders.find(f => f.id === currentId);
      if (!folder) break;
      currentId = folder.parent_id;
    }
    setExpandedFolders(prev => {
      const next = new Set(prev);
      let changed = false;
      idsToExpand.forEach(id => {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  };

  const handleCreated = (_dash: DashboardInfo) => {
    setCreateDialogOpen(false);
    loadData();
  };

  // Filter by search
  const filteredDashboards = useMemo(() => {
    if (!searchText.trim()) return dashboards;
    const q = searchText.trim().toLowerCase();
    return dashboards.filter(d => d.name.toLowerCase().includes(q));
  }, [dashboards, searchText]);

  const filteredFolderIds = useMemo(() => {
    if (!searchText.trim()) return null; // no filter
    const matchedFolderIds = new Set<number>();
    // A folder matches if it has matching dashboards or any descendant folder matches
    const checkFolder = (node: FolderNode): boolean => {
      const hasMatchingDash = filteredDashboards.some(d => d.folder_id === node.id);
      const hasMatchingChild = (node.children || []).some(child => checkFolder(child));
      if (hasMatchingDash || hasMatchingChild) {
        matchedFolderIds.add(node.id);
        return true;
      }
      return false;
    };
    tree.forEach(node => checkFolder(node));
    return matchedFolderIds;
  }, [tree, filteredDashboards, searchText]);

  // Auto-expand matching folders when searching
  useEffect(() => {
    if (filteredFolderIds) {
      setExpandedFolders(prev => {
        const next = new Set(prev);
        let changed = false;
        filteredFolderIds.forEach(id => {
          if (!next.has(id)) {
            next.add(id);
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }
  }, [filteredFolderIds]);

  const renderFolder = (node: FolderNode, depth: number = 0): React.ReactNode => {
    if (filteredFolderIds && !filteredFolderIds.has(node.id)) return null;

    const isExpanded = expandedFolders.has(node.id);
    const folderDashboards = filteredDashboards.filter(d => d.folder_id === node.id);

    return (
      <div key={node.id}>
        <div
          className="flex items-center gap-1.5 px-2 py-1.5 hover:bg-gray-50 cursor-pointer"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => toggleFolder(node.id)}
        >
          {isExpanded ? <ChevronDownIcon className="size-3.5 text-gray-400 shrink-0" /> : <ChevronRightIcon className="size-3.5 text-gray-400 shrink-0" />}
          <FolderIcon className="size-4 text-yellow-500 shrink-0" />
          <span className="text-sm text-gray-600 flex-1 truncate">{node.name}</span>
        </div>
        {isExpanded && (
          <div>
            {folderDashboards.map(dash => renderDashboardItem(dash, depth + 1))}
            {node.children?.map(child => renderFolder(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const renderDashboardItem = (dash: DashboardInfo, depth: number = 0) => {
    const isSelected = selectedDashboardId === dash.id;
    return (
      <button
        key={dash.id}
        onClick={() => setSelectedDashboardId(dash.id)}
        className={`flex items-center gap-2 w-full px-2 py-1.5 transition-colors text-left rounded-md ${isSelected ? 'bg-blue-50 border-l-2 border-blue-500' : 'hover:bg-gray-50'}`}
        style={{ paddingLeft: `${depth * 16 + 22}px` }}
      >
        <LayoutDashboardIcon className={`size-4 shrink-0 ${isSelected ? 'text-blue-600' : 'text-gray-400'}`} />
        <span className={`text-sm flex-1 truncate ${isSelected ? 'text-blue-900 font-medium' : 'text-gray-700'}`}>{dash.name}</span>
        <span className="text-xs text-gray-400 shrink-0">{dash.chart_count || 0} 图表</span>
        {isSelected && <CheckIcon className="size-4 text-blue-600 shrink-0" />}
      </button>
    );
  };

  const rootDashboards = filteredDashboards.filter(d => !d.folder_id);

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pin 到看板</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            {/* Chart name */}
            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-500 mb-1">图表名称</label>
              <input
                type="text"
                value={localChartName}
                onChange={e => setLocalChartName(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="请输入图表名称"
              />
            </div>
            {/* Target dashboard selection */}
            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-500 mb-1">选择目标看板</label>
              {/* Search input with dropdown suggestions */}
              <div className="relative flex gap-2">
              <div className="relative flex-1">
                <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
                <input
                  type="text"
                  value={searchText}
                  onChange={e => setSearchText(e.target.value)}
                  onClick={() => setSearchFocused(true)}
                  onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                  placeholder="搜索看板..."
                  className="w-full text-sm border border-gray-200 rounded-md pl-8 pr-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <Button variant="outline" size="sm" onClick={() => setCreateDialogOpen(true)}>
                <PlusIcon className="size-4" />
              </Button>
              {/* Dropdown suggestions */}
              {searchFocused && filteredDashboards.length > 0 && (
                <div className="absolute z-50 left-0 top-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-auto" style={{ width: 'calc(100% - 2.25rem)' }}>
                  {filteredDashboards.map(dash => {
                    const folderPath = getFolderPath(dash.folder_id);
                    return (
                      <button
                        key={dash.id}
                        onMouseDown={() => { setSelectedDashboardId(dash.id); setSearchFocused(false); expandAncestors(dash.folder_id); }}
                        className={`flex items-center gap-2 w-full px-3 py-2 text-left transition-colors ${selectedDashboardId === dash.id ? 'bg-blue-50 border-l-2 border-blue-500' : 'hover:bg-gray-50'}`}
                      >
                        <LayoutDashboardIcon className={`size-4 shrink-0 ${selectedDashboardId === dash.id ? 'text-blue-600' : 'text-gray-400'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-gray-700 truncate">{dash.name}</div>
                          {folderPath && <div className="text-xs text-gray-400 truncate">{folderPath}</div>}
                        </div>
                        <span className="text-xs text-gray-400 shrink-0">{dash.chart_count || 0} 图表</span>
                      </button>
                    );
                  })}
                </div>
              )}
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2Icon className="size-5 animate-spin text-gray-400" />
              </div>
            ) : dashboards.length === 0 ? (
              <div className="text-sm text-gray-400 text-center py-4">
                暂无看板，点击下方按钮创建
              </div>
            ) : filteredDashboards.length === 0 && searchText.trim() ? (
              <div className="text-sm text-gray-400 text-center py-4">
                未找到匹配的看板
              </div>
            ) : (
              <div className="max-h-72 overflow-auto">
                {tree.map(node => renderFolder(node))}
                {rootDashboards.map(dash => renderDashboardItem(dash))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => selectedDashboardId && onPin(selectedDashboardId, localChartName)} disabled={!selectedDashboardId || !localChartName.trim()} className="w-full">
              确认 Pin
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreateDashboardDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onCreated={handleCreated}
      />
    </>
  );
}
