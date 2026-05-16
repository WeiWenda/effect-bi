import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import localforage from 'localforage';
import {
  ChevronRightIcon,
  ChevronDownIcon,
  DatabaseIcon,
  TableIcon,
  FolderIcon,
  Loader2Icon,
  RefreshCwIcon,
} from 'lucide-react';
import { lineageAPI, type LineageTableTreeRow } from '../../services/lineageApi';
import { lineageEntityRouteTableName } from '../../services/lineageNodeMeta';

interface TreeNode {
  id: string;
  name: string;
  type: 'catalog' | 'database' | 'table';
  children?: TreeNode[];
  expanded?: boolean;
  loading?: boolean;
  /** database 节点携带，供刷新子表与 id 稳定（catalog 名中可含 `-`） */
  catalogName?: string;
  /** 与 `/lineage/table/:tableName` 及 getEntityByTableName 一致 */
  routeTableName?: string;
}

function buildIndexMap(rows: LineageTableTreeRow[]): Map<string, Map<string, string[]>> {
  const m = new Map<string, Map<string, string[]>>();
  for (const r of rows) {
    if (!m.has(r.catalog)) m.set(r.catalog, new Map());
    const dm = m.get(r.catalog)!;
    if (!dm.has(r.database)) dm.set(r.database, []);
    const tables = dm.get(r.database)!;
    if (!tables.includes(r.tableName)) tables.push(r.tableName);
  }
  for (const dm of m.values()) {
    for (const [db, tables] of dm.entries()) {
      tables.sort((a, b) => a.localeCompare(b));
      dm.set(db, tables);
    }
  }
  return m;
}

function catalogNodesFromMap(indexMap: Map<string, Map<string, string[]>>): TreeNode[] {
  return [...indexMap.keys()]
    .sort((a, b) => a.localeCompare(b))
    .map(catalog => ({
      id: `neo4j-catalog-${catalog}`,
      name: catalog,
      type: 'catalog' as const,
      children: [],
      expanded: false,
    }));
}

function databaseChildrenForCatalog(
  catalog: string,
  indexMap: Map<string, Map<string, string[]>>
): TreeNode[] {
  const dm = indexMap.get(catalog);
  if (!dm) return [];
  return [...dm.keys()]
    .sort((a, b) => a.localeCompare(b))
    .map(database => ({
      id: `neo4j-database-${encodeURIComponent(catalog)}__${encodeURIComponent(database)}`,
      name: database,
      type: 'database' as const,
      catalogName: catalog,
      children: [],
      expanded: false,
    }));
}

function tableChildrenForDatabase(
  catalog: string,
  database: string,
  indexMap: Map<string, Map<string, string[]>>
): TreeNode[] {
  const dm = indexMap.get(catalog);
  const tables = dm?.get(database) ?? [];
  return tables.map(tableName => {
    const routeTableName = lineageEntityRouteTableName({
      table_name: tableName,
      catalog_name: catalog,
      database_name: database,
    });
    return {
      id: `neo4j-table-${catalog}-${database}-${tableName}`,
      name: tableName,
      type: 'table' as const,
      children: [],
      routeTableName,
    };
  });
}

interface Neo4jTableTreePanelProps {
  /** 当前详情页 URL 用的 table key，与 `lineageEntityRouteTableName` 一致 */
  selectedRouteTableName: string | null;
}

const TREE_EXPANDED_STORE = localforage.createInstance({
  name: 'lineageNeo4jTableTree',
  storeName: 'expandedIds',
});
const EXPANDED_IDS_KEY = 'expandedNodeIds';

function collectExpandedNodeIds(nodes: TreeNode[]): string[] {
  const ids: string[] = [];
  const walk = (arr: TreeNode[]) => {
    for (const n of arr) {
      if (n.expanded) ids.push(n.id);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(nodes);
  return ids;
}

async function loadExpandedIds(): Promise<Set<string>> {
  try {
    const raw = await TREE_EXPANDED_STORE.getItem<string[]>(EXPANDED_IDS_KEY);
    return new Set(Array.isArray(raw) ? raw : []);
  } catch {
    return new Set();
  }
}

async function saveExpandedIds(ids: string[]): Promise<void> {
  try {
    await TREE_EXPANDED_STORE.setItem(EXPANDED_IDS_KEY, ids);
  } catch (err) {
    console.error('Neo4j table tree: failed to save expanded state', err);
  }
}

/** 按记忆的 id 恢复 catalog / database 展开与 children */
function applyExpandedState(
  catalogNodes: TreeNode[],
  indexMap: Map<string, Map<string, string[]>>,
  expandedIds: Set<string>
): TreeNode[] {
  return catalogNodes.map(cat => {
    if (!expandedIds.has(cat.id)) {
      return { ...cat, children: [], expanded: false };
    }
    const databases = databaseChildrenForCatalog(cat.name, indexMap);
    const children = databases.map(db => {
      if (!expandedIds.has(db.id)) {
        return { ...db, children: [], expanded: false };
      }
      return {
        ...db,
        expanded: true,
        children: tableChildrenForDatabase(cat.name, db.name, indexMap),
      };
    });
    return { ...cat, expanded: true, children };
  });
}

export function Neo4jTableTreePanel({ selectedRouteTableName }: Neo4jTableTreePanelProps): React.JSX.Element {
  const navigate = useNavigate();
  const [indexMap, setIndexMap] = useState<Map<string, Map<string, string[]>>>(new Map());
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadIndex = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { rows } = await lineageAPI.listTablesTreeIndex();
      const map = buildIndexMap(rows);
      setIndexMap(map);
      const catalogs = catalogNodesFromMap(map);
      const expandedIds = await loadExpandedIds();
      setTreeData(applyExpandedState(catalogs, map, expandedIds));
    } catch (err) {
      console.error('Neo4j table tree load failed:', err);
      setError('加载 Neo4j 表目录失败');
      setIndexMap(new Map());
      setTreeData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadIndex();
  }, [loadIndex]);

  const updateNodeInTree = useCallback((updater: (prev: TreeNode[]) => TreeNode[]) => {
    setTreeData(prev => {
      const next = updater(prev);
      void saveExpandedIds(collectExpandedNodeIds(next));
      return next;
    });
  }, []);

  const toggleNode = (node: TreeNode, catalogName?: string) => {
    if (node.type === 'table') return;

    if (!node.expanded) {
      if (node.type === 'catalog') {
        const children = databaseChildrenForCatalog(node.name, indexMap);
        updateNodeInTree(prev =>
          updateNodeById(prev, node.id, n => ({
            ...n,
            expanded: true,
            children,
          }))
        );
      } else if (node.type === 'database') {
        const cat = node.catalogName ?? catalogName;
        if (!cat) return;
        const children = tableChildrenForDatabase(cat, node.name, indexMap);
        updateNodeInTree(prev =>
          updateNodeById(prev, node.id, n => ({
            ...n,
            expanded: true,
            children,
          }))
        );
      }
    } else {
      updateNodeInTree(prev => updateNodeById(prev, node.id, n => ({ ...n, expanded: false })));
    }
  };

  const refreshNode = async (e: React.MouseEvent, node: TreeNode) => {
    e.stopPropagation();
    if (node.type === 'table') return;

    updateNodeInTree(prev => updateNodeById(prev, node.id, n => ({ ...n, loading: true })));
    try {
      const { rows } = await lineageAPI.listTablesTreeIndex();
      const map = buildIndexMap(rows);
      setIndexMap(map);

      if (node.type === 'catalog') {
        const newChildren = databaseChildrenForCatalog(node.name, map);
        updateNodeInTree(prev =>
          updateNodeById(prev, node.id, n => ({
            ...n,
            loading: false,
            expanded: true,
            children: newChildren,
          }))
        );
      } else if (node.type === 'database') {
        const cat = node.catalogName;
        if (!cat) {
          updateNodeInTree(prev => updateNodeById(prev, node.id, n => ({ ...n, loading: false })));
          return;
        }
        const newChildren = tableChildrenForDatabase(cat, node.name, map);
        updateNodeInTree(prev =>
          updateNodeById(prev, node.id, n => ({
            ...n,
            loading: false,
            expanded: true,
            children: newChildren,
          }))
        );
      }
    } catch (err) {
      console.error('Neo4j table tree refresh failed:', err);
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

  const renderNode = (
    node: TreeNode,
    catalogName?: string,
    databaseName?: string,
    level: number = 0
  ): React.JSX.Element => {
    const Icon = node.type === 'catalog' ? DatabaseIcon : node.type === 'database' ? FolderIcon : TableIcon;
    const isLeaf = node.type === 'table';
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = node.expanded;
    const isLoading = node.loading;
    const isSelected =
      isLeaf && selectedRouteTableName != null && node.routeTableName === selectedRouteTableName;

    return (
      <div key={node.id}>
        <div
          className={`flex items-center gap-2 py-1.5 px-2 rounded-md transition-colors group ${
            isLeaf
              ? isSelected
                ? 'bg-blue-50 cursor-pointer'
                : 'hover:bg-gray-100 cursor-pointer'
              : 'hover:bg-gray-100 cursor-pointer'
          }`}
          style={{ paddingLeft: `${level * 12 + 8}px` }}
          onClick={e => {
            if (isLeaf) {
              e.stopPropagation();
              if (node.routeTableName) {
                navigate(`/lineage/table/${encodeURIComponent(node.routeTableName)}`);
              }
            } else {
              toggleNode(node, catalogName);
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
          <Icon
            className={`size-4 shrink-0 ${
              node.type === 'catalog' ? 'text-blue-500' : node.type === 'database' ? 'text-yellow-500' : 'text-green-500'
            }`}
          />
          <span className="text-sm text-gray-700 truncate flex-1">{node.name}</span>
          {!isLeaf && (
            <button
              type="button"
              className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-gray-200 rounded"
              onClick={e => void refreshNode(e, node)}
              title="Refresh"
            >
              <RefreshCwIcon className={`size-3 text-gray-400 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
        {isExpanded && hasChildren && (
          <div>
            {node.children!.map(child =>
              renderNode(
                child,
                node.type === 'catalog' ? node.name : catalogName,
                node.type === 'database' ? node.name : databaseName,
                level + 1
              )
            )}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
        <Loader2Icon className="size-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
        <div className="text-center px-2">
          <p className="text-sm text-red-500">{error}</p>
          <button
            type="button"
            onClick={() => void loadIndex()}
            className="mt-2 text-sm text-blue-500 hover:text-blue-600"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="p-2">
        {treeData.length === 0 ? (
          <div className="text-xs text-gray-400 px-2 py-4 text-center">暂无带 catalog / database 的表节点</div>
        ) : (
          treeData.map(node => renderNode(node, undefined, undefined))
        )}
      </div>
    </div>
  );
}
