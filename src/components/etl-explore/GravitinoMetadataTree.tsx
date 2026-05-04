import { useState, useEffect, useCallback } from 'react';
import {
  ChevronRightIcon,
  ChevronDownIcon,
  DatabaseIcon,
  TableIcon,
  FolderIcon,
  Loader2Icon,
  RefreshCwIcon,
  HashIcon,
} from 'lucide-react';
import { gravitinoAPI, type ColumnInfo } from '../../services/gravitinoApi';

export type GravitinoTreeNodeType = 'catalog' | 'database' | 'table' | 'column';

export interface GravitinoTreeNode {
  id: string;
  name: string;
  type: GravitinoTreeNodeType;
  /** For column: Gravitino type string */
  dataType?: string;
  children?: GravitinoTreeNode[];
  expanded?: boolean;
  loading?: boolean;
}

function formatColumnType(col: ColumnInfo): string {
  const t = col.type;
  if (typeof t === 'string') return t;
  if (t && typeof t === 'object' && 'catalogString' in t && typeof (t as { catalogString?: string }).catalogString === 'string') {
    return (t as { catalogString: string }).catalogString;
  }
  if (t && typeof t === 'object' && 'type' in t) {
    return String((t as { type: string }).type);
  }
  return JSON.stringify(t);
}

interface GravitinoMetadataTreeProps {
  /** When true, tables expand to show columns (via getTableDetail). */
  includeColumns: boolean;
  /** Called when user double-clicks a table row (qualified name for SQL). */
  onInsertQualifiedTable?: (qualified: string) => void;
  /** Called when user double-clicks a column (bare column name). */
  onInsertColumnName?: (name: string) => void;
}

function updateNodeById(nodes: GravitinoTreeNode[], id: string, updater: (n: GravitinoTreeNode) => GravitinoTreeNode): GravitinoTreeNode[] {
  return nodes.map(n => {
    if (n.id === id) return updater(n);
    if (n.children && n.children.length > 0) {
      return { ...n, children: updateNodeById(n.children, id, updater) };
    }
    return n;
  });
}

export function GravitinoMetadataTree({
  includeColumns,
  onInsertQualifiedTable,
  onInsertColumnName,
}: GravitinoMetadataTreeProps): React.JSX.Element {
  const [treeData, setTreeData] = useState<GravitinoTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setTree = useCallback((updater: (prev: GravitinoTreeNode[]) => GravitinoTreeNode[]) => {
    setTreeData(prev => updater(prev));
  }, []);

  const fetchCatalogs = useCallback(async () => {
    const response = await gravitinoAPI.listCatalogs();
    const catalogNodes: GravitinoTreeNode[] = response.identifiers.map(catalog => ({
      id: `catalog-${catalog.name}`,
      name: catalog.name,
      type: 'catalog' as const,
      children: [],
      expanded: false,
    }));
    setTreeData(catalogNodes);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        await fetchCatalogs();
      } catch (err) {
        console.error(err);
        if (!cancelled) setError('无法加载目录');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchCatalogs]);

  const fetchDatabases = async (catalogNode: GravitinoTreeNode): Promise<GravitinoTreeNode[]> => {
    const catalogName = catalogNode.name;
    const response = await gravitinoAPI.listSchemas(catalogName);
    return response.identifiers.map(ns => ({
      id: `database-${catalogName}-${ns.name}`,
      name: ns.name,
      type: 'database' as const,
      children: [],
      expanded: false,
    }));
  };

  const fetchTables = async (databaseNode: GravitinoTreeNode, catalogName: string): Promise<GravitinoTreeNode[]> => {
    const databaseName = databaseNode.name;
    const response = await gravitinoAPI.listTables(catalogName, databaseName);
    return response.identifiers.map(table => ({
      id: `table-${catalogName}-${databaseName}-${table.name}`,
      name: table.name,
      type: 'table' as const,
      children: includeColumns ? [] : undefined,
      expanded: false,
    }));
  };

  const fetchColumns = async (
    catalogName: string,
    databaseName: string,
    tableName: string
  ): Promise<GravitinoTreeNode[]> => {
    const response = await gravitinoAPI.getTableDetail(catalogName, databaseName, tableName);
    const cols = response.table?.columns ?? [];
    return cols.map(col => ({
      id: `column-${catalogName}-${databaseName}-${tableName}-${col.name}`,
      name: col.name,
      type: 'column' as const,
      dataType: formatColumnType(col),
    }));
  };

  const toggleNode = async (node: GravitinoTreeNode, catalogName?: string, databaseName?: string) => {
    const isLeafTable = node.type === 'table' && !includeColumns;
    const isColumn = node.type === 'column';
    if (isLeafTable || isColumn) return;

    if (!node.expanded) {
      setTree(prev => updateNodeById(prev, node.id, n => ({ ...n, loading: true })));
      try {
        let children: GravitinoTreeNode[] = [];
        if (node.type === 'catalog') {
          children = await fetchDatabases(node);
        } else if (node.type === 'database') {
          children = await fetchTables(node, catalogName!);
        } else if (node.type === 'table' && includeColumns && catalogName && databaseName) {
          children = await fetchColumns(catalogName, databaseName, node.name);
        }
        setTree(prev =>
          updateNodeById(prev, node.id, n => ({
            ...n,
            expanded: true,
            loading: false,
            children,
          }))
        );
      } catch (err) {
        console.error(err);
        setTree(prev => updateNodeById(prev, node.id, n => ({ ...n, loading: false })));
      }
    } else {
      setTree(prev => updateNodeById(prev, node.id, n => ({ ...n, expanded: false })));
    }
  };

  const refreshNode = async (e: React.MouseEvent, node: GravitinoTreeNode, catalogName?: string, databaseName?: string) => {
    e.stopPropagation();
    if (node.type === 'column') return;
    if (node.type === 'table' && !includeColumns) return;

    setTree(prev => updateNodeById(prev, node.id, n => ({ ...n, loading: true })));
    try {
      let newChildren: GravitinoTreeNode[];
      if (node.type === 'catalog') {
        newChildren = await fetchDatabases(node);
      } else if (node.type === 'database') {
        newChildren = await fetchTables(node, catalogName!);
      } else if (node.type === 'table' && includeColumns && catalogName && databaseName) {
        newChildren = await fetchColumns(catalogName, databaseName, node.name);
      } else {
        newChildren = [];
      }
      setTree(prev =>
        updateNodeById(prev, node.id, n => ({
          ...n,
          children: newChildren,
          loading: false,
          expanded: true,
        }))
      );
    } catch (err) {
      console.error(err);
      setTree(prev => updateNodeById(prev, node.id, n => ({ ...n, loading: false })));
    }
  };

  const renderNode = (
    node: GravitinoTreeNode,
    catalogName?: string,
    databaseName?: string,
    level = 0
  ): React.JSX.Element => {
    const Icon =
      node.type === 'catalog'
        ? DatabaseIcon
        : node.type === 'database'
          ? FolderIcon
          : node.type === 'table'
            ? TableIcon
            : HashIcon;
    const isColumn = node.type === 'column';
    const isLeafTable = node.type === 'table' && !includeColumns;
    const showChevron = !isColumn && !isLeafTable;
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = node.expanded;
    const isLoading = node.loading;

    const nextCatalog = node.type === 'catalog' ? node.name : catalogName;
    const nextDatabase = node.type === 'database' ? node.name : databaseName;

    const qualifiedTable =
      node.type === 'table' && catalogName && databaseName ? `${catalogName}.${databaseName}.${node.name}` : null;

    return (
      <div key={node.id}>
        <div
          className="flex items-center gap-2 py-1 px-2 hover:bg-gray-100 cursor-pointer rounded-md transition-colors group text-left w-full"
          style={{ paddingLeft: `${level * 10 + 6}px` }}
          onClick={() => void toggleNode(node, catalogName, databaseName)}
          onDoubleClick={e => {
            e.preventDefault();
            if (node.type === 'table' && qualifiedTable) {
              onInsertQualifiedTable?.(qualifiedTable);
            }
            if (node.type === 'column') {
              onInsertColumnName?.(node.name);
            }
          }}
        >
          {showChevron && (
            <span className="shrink-0 w-4 flex justify-center">
              {isLoading ? (
                <Loader2Icon className="size-3.5 text-gray-400 animate-spin" />
              ) : isExpanded ? (
                <ChevronDownIcon className="size-3.5 text-gray-400" />
              ) : (
                <ChevronRightIcon className="size-3.5 text-gray-400" />
              )}
            </span>
          )}
          {!showChevron && <span className="w-4 shrink-0" />}
          <Icon
            className={`size-3.5 shrink-0 ${
              node.type === 'catalog' ? 'text-blue-500' : node.type === 'database' ? 'text-amber-600' : 'text-emerald-600'
            } ${isColumn ? 'text-violet-500' : ''}`}
          />
          <span className="text-xs text-gray-800 truncate flex-1" title={isColumn ? node.dataType : undefined}>
            {node.name}
            {isColumn && node.dataType ? (
              <span className="text-gray-400 font-normal ml-1">({node.dataType})</span>
            ) : null}
          </span>
          {showChevron && (
            <button
              type="button"
              className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-gray-200 rounded"
              onClick={e => void refreshNode(e, node, nextCatalog, nextDatabase)}
              title="刷新"
            >
              <RefreshCwIcon className={`size-3 text-gray-400 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
        {isExpanded && hasChildren && (
          <div>
            {node.children!.map(child =>
              renderNode(child, nextCatalog, node.type === 'database' ? node.name : databaseName, level + 1)
            )}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-8">
        <Loader2Icon className="size-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-6 px-2 text-center">
        <p className="text-xs text-red-600">{error}</p>
        <button type="button" className="mt-2 text-xs text-blue-600 hover:underline" onClick={() => void fetchCatalogs()}>
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto min-h-0">
      <div className="p-1.5">{treeData.map(node => renderNode(node))}</div>
    </div>
  );
}
