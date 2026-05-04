import { useState, useEffect, useCallback } from 'react';
import { ChevronRightIcon, ChevronDownIcon, DatabaseIcon, TableIcon, FolderIcon, Loader2Icon, RefreshCwIcon } from 'lucide-react';
import localforage from 'localforage';
import { gravitinoAPI } from '../../services/gravitinoApi';

interface TreeNode {
  id: string;
  name: string;
  type: 'catalog' | 'database' | 'table';
  children?: TreeNode[];
  expanded?: boolean;
  loading?: boolean;
}

/** 兼容旧版 localforage 中 type 为 schema 的节点 */
function normalizeCachedTreeNode(n: TreeNode): TreeNode {
  const t = (n.type as string) === 'schema' ? ('database' as const) : n.type;
  return {
    ...n,
    type: t,
    children: n.children?.map(normalizeCachedTreeNode),
  };
}

const TREE_STORE = localforage.createInstance({ name: 'metadataTree', storeName: 'treeStructure' });
const CHILDREN_STORE = localforage.createInstance({ name: 'metadataTree', storeName: 'childrenCache' });

const TREE_KEY = 'expandedTree';

interface CachedChildren {
  children: TreeNode[];
  timestamp: number;
}

function stripChildrenForTree(nodes: TreeNode[]): TreeNode[] {
  return nodes.map(n => ({
    ...n,
    children: n.children && n.children.length > 0 ? stripChildrenForTree(n.children) : [],
    loading: undefined,
  }));
}

export function MetadataTreePanel(): React.JSX.Element {
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const saveTreeStructure = useCallback(async (nodes: TreeNode[]) => {
    try {
      const treeStructure = stripChildrenForTree(nodes);
      await TREE_STORE.setItem(TREE_KEY, treeStructure);
    } catch (err) {
      console.error('Error saving tree structure:', err);
    }
  }, []);

  const saveChildrenCache = useCallback(async (nodeId: string, children: TreeNode[]) => {
    try {
      const cached: CachedChildren = { children, timestamp: Date.now() };
      await CHILDREN_STORE.setItem(nodeId, cached);
    } catch (err) {
      console.error('Error saving children cache:', err);
    }
  }, []);

  const loadChildrenFromCache = useCallback(async (nodeId: string): Promise<TreeNode[] | null> => {
    try {
      const cached = await CHILDREN_STORE.getItem<CachedChildren>(nodeId);
      return cached?.children ?? null;
    } catch (err) {
      console.error('Error loading children cache:', err);
      return null;
    }
  }, []);

  const updateNodeInTree = useCallback((updater: (prev: TreeNode[]) => TreeNode[]) => {
    setTreeData(prev => {
      const next = updater(prev);
      saveTreeStructure(next);
      return next;
    });
  }, [saveTreeStructure]);

  useEffect(() => {
    initTree();
  }, []);

  const initTree = async () => {
    try {
      setLoading(true);
      setError(null);
      const cachedTree = await TREE_STORE.getItem<TreeNode[]>(TREE_KEY);
      if (cachedTree && cachedTree.length > 0) {
        const normalized = cachedTree.map(normalizeCachedTreeNode);
        const restored = await restoreTreeFromCache(normalized);
        setTreeData(restored);
        setLoading(false);
        return;
      }
      await fetchCatalogs();
    } catch (err) {
      console.error('Error initializing tree:', err);
      setError('Failed to load metadata tree');
    } finally {
      setLoading(false);
    }
  };

  const restoreTreeFromCache = async (treeStructure: TreeNode[]): Promise<TreeNode[]> => {
    const result: TreeNode[] = [];
    for (const structNode of treeStructure) {
      const cachedChildren = await loadChildrenFromCache(structNode.id);
      let children: TreeNode[];
      if (cachedChildren && cachedChildren.length > 0) {
        children = cachedChildren.map(cached => {
          const structChild = structNode.children?.find(s => s.id === cached.id);
          if (structChild) {
            return { ...cached, expanded: structChild.expanded, children: structChild.children };
          }
          return cached;
        });
      } else {
        children = structNode.children ?? [];
      }
      const restoredNode: TreeNode = { ...structNode, children };
      if (restoredNode.expanded && restoredNode.children.length > 0) {
        restoredNode.children = await restoreTreeFromCache(restoredNode.children);
      }
      result.push(restoredNode);
    }
    return result;
  };

  const fetchCatalogs = async () => {
    try {
      const response = await gravitinoAPI.listCatalogs();
      const catalogNodes: TreeNode[] = response.identifiers.map(catalog => ({
        id: `catalog-${catalog.name}`,
        name: catalog.name,
        type: 'catalog' as const,
        children: [],
        expanded: false,
      }));
      setTreeData(catalogNodes);
      await saveTreeStructure(catalogNodes);
    } catch (err) {
      console.error('Error loading catalogs:', err);
      setError('Failed to load catalogs');
    }
  };

  const fetchDatabases = async (catalogNode: TreeNode): Promise<TreeNode[]> => {
    const catalogName = catalogNode.name;
    const response = await gravitinoAPI.listSchemas(catalogName);
    const databaseNodes: TreeNode[] = response.identifiers.map(ns => ({
      id: `database-${catalogName}-${ns.name}`,
      name: ns.name,
      type: 'database' as const,
      children: [],
      expanded: false,
    }));
    await saveChildrenCache(catalogNode.id, databaseNodes);
    return databaseNodes;
  };

  const fetchTables = async (databaseNode: TreeNode, catalogName: string): Promise<TreeNode[]> => {
    const databaseName = databaseNode.name;
    const response = await gravitinoAPI.listTables(catalogName, databaseName);
    const tableNodes: TreeNode[] = response.identifiers.map(table => ({
      id: `table-${catalogName}-${databaseName}-${table.name}`,
      name: table.name,
      type: 'table' as const,
      children: [],
    }));
    await saveChildrenCache(databaseNode.id, tableNodes);
    return tableNodes;
  };

  const loadOrFetchChildren = async (node: TreeNode, catalogName?: string): Promise<TreeNode[] | null> => {
    const cached = await loadChildrenFromCache(node.id);
    if (cached && cached.length > 0) {
      return cached;
    }
    if (node.type === 'catalog') {
      return fetchDatabases(node);
    } else if (node.type === 'database') {
      return fetchTables(node, catalogName!);
    }
    return null;
  };

  const toggleNode = async (node: TreeNode, catalogName?: string) => {
    if (node.type === 'table') return;

    if (!node.expanded) {
      // Expanding
      updateNodeInTree(prev => updateNodeById(prev, node.id, n => ({ ...n, loading: true })));
      try {
        const children = await loadOrFetchChildren(node, catalogName);
        updateNodeInTree(prev => updateNodeById(prev, node.id, n => ({
          ...n,
          expanded: true,
          loading: false,
          children: children ?? n.children,
        })));
      } catch (err) {
        console.error('Error loading children:', err);
        updateNodeInTree(prev => updateNodeById(prev, node.id, n => ({ ...n, loading: false })));
      }
    } else {
      // Collapsing
      updateNodeInTree(prev => updateNodeById(prev, node.id, n => ({ ...n, expanded: false })));
    }
  };

  const refreshNode = async (e: React.MouseEvent, node: TreeNode, catalogName?: string) => {
    e.stopPropagation();
    if (node.type === 'table') return;

    updateNodeInTree(prev => updateNodeById(prev, node.id, n => ({ ...n, loading: true })));
    try {
      let newChildren: TreeNode[];
      if (node.type === 'catalog') {
        newChildren = await fetchDatabases(node);
      } else {
        newChildren = await fetchTables(node, catalogName!);
      }
      updateNodeInTree(prev => updateNodeById(prev, node.id, n => ({
        ...n,
        children: newChildren,
        loading: false,
        expanded: true,
      })));
    } catch (err) {
      console.error('Error refreshing node:', err);
      updateNodeInTree(prev => updateNodeById(prev, node.id, n => ({ ...n, loading: false })));
    }
  };

  const updateNodeById = (nodes: TreeNode[], id: string, updater: (n: TreeNode) => TreeNode): TreeNode[] => {
    return nodes.map(n => {
      if (n.id === id) return updater(n);
      if (n.children && n.children.length > 0) {
        return { ...n, children: updateNodeById(n.children, id, updater) };
      }
      return n;
    });
  };

  const renderNode = (node: TreeNode, catalogName?: string, databaseName?: string, level: number = 0): React.JSX.Element => {
    const Icon = node.type === 'catalog' ? DatabaseIcon : node.type === 'database' ? FolderIcon : TableIcon;
    const isLeaf = node.type === 'table';
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = node.expanded;
    const isLoading = node.loading;

    return (
      <div key={node.id}>
        <div
          className="flex items-center gap-2 py-1.5 px-2 hover:bg-gray-100 cursor-pointer rounded-md transition-colors group"
          style={{ paddingLeft: `${level * 12 + 8}px` }}
          onClick={() => !isLeaf && toggleNode(node, catalogName)}
          draggable={isLeaf}
          onDragStart={(e) => {
            if (isLeaf) {
              e.dataTransfer.setData('application/json', JSON.stringify({
                type: 'table',
                catalog: catalogName,
                database: databaseName,
                table: node.name,
              }));
            }
          }}
        >
          {!isLeaf && (
            <span className="shrink-0">
              {isLoading ? (
                <Loader2Icon className="size-3 text-gray-400 animate-spin" />
              ) : isExpanded ? (
                <ChevronDownIcon className="size-3 text-gray-400" />
              ) : (
                <ChevronRightIcon className="size-3 text-gray-400" />
              )}
            </span>
          )}
          <Icon className={`size-4 shrink-0 ${node.type === 'catalog' ? 'text-blue-500' : node.type === 'database' ? 'text-yellow-500' : 'text-green-500'}`} />
          <span className="text-sm text-gray-700 truncate flex-1">{node.name}</span>
          {!isLeaf && (
            <button
              className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-gray-200 rounded"
              onClick={(e) => refreshNode(e, node, node.type === 'catalog' ? node.name : catalogName)}
              title="Refresh"
            >
              <RefreshCwIcon className={`size-3 text-gray-400 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
        {isExpanded && hasChildren && (
          <div>
            {node.children!.map(child => renderNode(child, node.type === 'catalog' ? node.name : catalogName, node.type === 'database' ? node.name : databaseName, level + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2Icon className="size-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-red-500">{error}</p>
          <button
            onClick={fetchCatalogs}
            className="mt-2 text-sm text-blue-500 hover:text-blue-600"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-2">
        {treeData.map(node => renderNode(node, undefined, undefined))}
      </div>
    </div>
  );
}
