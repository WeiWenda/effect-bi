import { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronLeftIcon, CheckIcon, Loader2Icon, Network as NetworkIcon, PencilIcon, XIcon } from 'lucide-react';
import {
  ReactFlow,
  Node,
  Edge,
  Background,
  Controls,
  Handle,
  Position,
  NodeTypes,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { dagAPI, DagView } from '../../services/dagApi';
import { lineageAPI } from '../../services/lineageApi';
import {
  lineageNodeFilePath,
  lineageTableDescription,
  lineageTableLayer,
  lineageTableNodeLabel,
} from '../../services/lineageNodeMeta';
import { DagTaskDevelopmentPanel, type DagTaskDevelopmentNodeData } from './DagTaskDevelopmentPanel';
import { TaskOperationsTable } from './TaskOperationsTable';
import ELK from 'elkjs/lib/elk.bundled.js';
import { LineageNodeTableLabel } from '../lineage-explore/LineageNodeTableLabel';
import { LINEAGE_GRAPH_NODE_BOX_CLASS, LINEAGE_GRAPH_NODE_WIDTH } from '../lineage-explore/lineageGraphNodeLayout';
import { useToast } from '../ui/toast';

interface DagDetailPageProps {
  dagId: number;
  onBack: () => void;
}

interface NodeData extends DagTaskDevelopmentNodeData {
  focused?: boolean;
}

const CustomNode = ({ data, onClick }: { data: NodeData; onClick?: () => void }) => {
  const nodeClass = data.focused
    ? 'bg-green-50 border-green-400'
    : 'bg-white border-gray-200';

  return (
    <div
      className={`${LINEAGE_GRAPH_NODE_BOX_CLASS} cursor-pointer ${nodeClass}`}
      onClick={onClick}
    >
      <Handle type="target" position={Position.Left} className="!w-2 !h-2" />
      <LineageNodeTableLabel name={data.label} />
      {data.description && (
        <div className="mb-1 w-full min-w-0 truncate text-xs text-gray-600">{data.description}</div>
      )}
      {data.layer && (
        <div className="text-xs text-gray-500">{data.layer}</div>
      )}
      <Handle type="source" position={Position.Right} className="!w-2 !h-2" />
    </div>
  );
};

export function DagDetailPage({ dagId, onBack }: DagDetailPageProps): React.JSX.Element {
  return (
    <ReactFlowProvider>
      <DagDetailContent dagId={dagId} onBack={onBack} />
    </ReactFlowProvider>
  );
}

const createNodeTypes = (onNodeClick?: (nodeId: string) => void): NodeTypes => ({
  custom: (props) => <CustomNode {...props} onClick={() => onNodeClick?.(props.data.entityId)} />,
});

const elk = new ELK();

const elkOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.layered.spacing.nodeNodeBetweenLayers': '130',
  'elk.spacing.nodeNode': '80',
};

const getLayoutedElements = (nodes: Node[], edges: Edge[], options = {}): Promise<{ nodes: Node[]; edges: Edge[] }> => {
  const graph = {
    id: 'root',
    layoutOptions: options,
    children: nodes.map((n) => ({
      ...n,
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
      width: LINEAGE_GRAPH_NODE_WIDTH,
      height: 50,
    })),
    edges: edges.map((e) => ({
      ...e,
      sources: [e.source],
      targets: [e.target],
    })),
  };

  return elk
    .layout(graph)
    .then((layoutedGraph) => ({
      nodes: (layoutedGraph.children || []).map((n: any) => ({
        id: n.id,
        position: { x: n.x || 0, y: n.y || 0 },
        data: n.data,
        type: n.type,
      })),
      edges: (layoutedGraph.edges || []).map((e: any) => ({
        id: e.id,
        source: e.sources[0],
        target: e.targets[0],
        type: 'smoothstep',
        animated: true,
      })),
    }))
    .catch((error) => {
      console.error(error);
      return { nodes: [], edges: [] };
    });
};

const DagDetailContent = ({ dagId, onBack }: DagDetailPageProps) => {
  const { fitView } = useReactFlow();
  const { toast } = useToast();
  const [dagView, setDagView] = useState<DagView | null>(null);
  const [loading, setLoading] = useState(true);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [activeTab, setActiveTab] = useState<'development' | 'operations'>('development');
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [windowHeight, setWindowHeight] = useState(window.innerHeight);
  const [editingMeta, setEditingMeta] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setWindowHeight(window.innerHeight);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleNodeClick = useCallback((nodeId: string) => {
    setFocusedNodeId(prev => prev === nodeId ? null : nodeId);
  }, []);

  // Update nodes when focusedNodeId changes
  useEffect(() => {
    setNodes(prevNodes =>
      prevNodes.map(node => ({
        ...node,
        data: {
          ...node.data,
          focused: node.id === focusedNodeId,
        },
      }))
    );
  }, [focusedNodeId]);

  useEffect(() => {
    const fetchDagView = async () => {
      try {
        const response = await dagAPI.getDagById(dagId);
        setDagView(response.dagView);
        await loadDagGraph(response.dagView);
      } catch (error) {
        console.error('Error fetching DAG view:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchDagView();
  }, [dagId]);

  const loadDagGraph = async (dag: DagView) => {
    if (dag.nodeIds.length === 0) return;

    setLoading(true);
    try {
      const response = await lineageAPI.getDagLineage(dag.id);

      const nodeMap = new Map<string, Node>();
      const newNodes: Node[] = [];
      const newEdges: Edge[] = [];
      const edgeSet = new Set<string>();

      // Process the single path containing all nodes and relationships
      response.paths.forEach((path) => {
        // Add nodes
        path.nodes.forEach((lineageNode) => {
          const p = lineageNode.properties as Record<string, unknown>;
          const nodeName = lineageTableNodeLabel(p);
          const catalogRaw = typeof p.catalog_name === 'string' ? p.catalog_name.trim() : '';
          const databaseRaw = typeof p.database_name === 'string' ? p.database_name.trim() : '';
          const tableRaw = typeof p.table_name === 'string' ? p.table_name.trim() : '';
          const catalog = catalogRaw || 'hive';
          const qualifiedTableName =
            databaseRaw && tableRaw ? `${catalog}.${databaseRaw}.${tableRaw}` : undefined;
          const layer = lineageTableLayer(p);
          const description = lineageTableDescription(p);
          const filePath = lineageNodeFilePath(p);

          const airflowDagIdRaw =
            typeof p.AIRFLOW_DAG_ID === 'string' && p.AIRFLOW_DAG_ID.trim()
              ? p.AIRFLOW_DAG_ID.trim()
              : typeof p.airflow_dag_id === 'string' && p.airflow_dag_id.trim()
                ? p.airflow_dag_id.trim()
                : undefined;

          if (!nodeMap.has(lineageNode.id)) {
            const newNode: Node = {
              id: lineageNode.id,
              type: 'custom',
              position: { x: 0, y: 0 },
              data: {
                label: nodeName,
                catalogName: catalogRaw || undefined,
                databaseName: databaseRaw || undefined,
                tableName: tableRaw || undefined,
                qualifiedTableName,
                airflowDagId: airflowDagIdRaw,
                layer,
                description,
                entityId: lineageNode.id,
                focused: false,
                filePath,
                entityProperties: p,
              },
            };
            nodeMap.set(lineageNode.id, newNode);
            newNodes.push(newNode);
          }
        });

        // Add relationships
        path.relationships.forEach((rel) => {
          const edgeId = `${rel.startNodeId}-${rel.endNodeId}`;
          if (!edgeSet.has(edgeId)) {
            edgeSet.add(edgeId);
            newEdges.push({
              id: edgeId,
              source: rel.startNodeId,
              target: rel.endNodeId,
              type: 'smoothstep',
              animated: true,
            });
          }
        });
      });

      // Apply layout
      getLayoutedElements(newNodes, newEdges, elkOptions).then(
        ({ nodes: layoutedNodes, edges: layoutedEdges }) => {
          setNodes(layoutedNodes);
          setEdges(layoutedEdges);
          setTimeout(() => fitView(), 100);
        },
      );
    } catch (error) {
      console.error('Error loading DAG graph:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (tab: 'development' | 'operations') => {
    setActiveTab(tab);
  };

  const beginEditMeta = useCallback(() => {
    if (!dagView) return;
    setDraftName(dagView.name);
    setDraftDescription(dagView.description ?? '');
    setEditingMeta(true);
  }, [dagView]);

  const cancelEditMeta = useCallback(() => {
    setEditingMeta(false);
  }, []);

  const handleSaveMeta = useCallback(async () => {
    if (!dagView) return;
    const name = draftName.trim();
    if (!name) {
      toast('名称不能为空', 'error');
      return;
    }
    const description = draftDescription.trim() || null;
    const unchanged = name === dagView.name && description === (dagView.description ?? null);
    if (unchanged) {
      setEditingMeta(false);
      return;
    }

    setSavingMeta(true);
    try {
      const { dagView: updated } = await dagAPI.updateDag(dagId, { name, description });
      setDagView(updated);
      setEditingMeta(false);
      toast('已保存', 'success');
    } catch (error) {
      console.error('Error updating DAG view:', error);
      toast('保存失败，请稍后重试', 'error');
    } finally {
      setSavingMeta(false);
    }
  }, [dagId, dagView, draftDescription, draftName, toast]);

  /** 任务运维表行 → 仅与上方图中节点同步选中（不移动视口、不切 Tab） */
  const handleSelectNodeFromOperations = useCallback((nodeId: string) => {
    setFocusedNodeId(nodeId);
  }, []);

  const nodeTypes = createNodeTypes(handleNodeClick);

  // 运维表：优先 catalog.database.table；否则退回血缘展示名
  const taskNames = useMemo(() => {
    const mapping: Record<string, string> = {};
    nodes.forEach(node => {
      const d = node.data as NodeData;
      mapping[node.id] = d.qualifiedTableName ?? d.label;
    });
    return mapping;
  }, [nodes]);

  const focusedNode = useMemo(
    () => (focusedNodeId ? nodes.find(n => n.id === focusedNodeId) : undefined),
    [nodes, focusedNodeId]
  );
  const focusedNodeData = focusedNode?.data as NodeData | undefined;

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* 顶栏：返回 + 可编辑名称 / 描述 */}
      <div className="flex shrink-0 border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            title="返回列表"
          >
            <ChevronLeftIcon className="size-5" />
          </button>
          {dagView && (
            <>
              <NetworkIcon className="size-5 shrink-0 text-blue-600" aria-hidden />
              <div className="min-w-0 flex-1">
                {editingMeta ? (
                  <div className="flex min-w-0 items-center gap-2">
                    <input
                      type="text"
                      value={draftName}
                      onChange={e => setDraftName(e.target.value)}
                      disabled={savingMeta}
                      className="min-w-0 flex-1 max-w-xs rounded-md border border-gray-300 px-2.5 py-1 text-lg font-semibold text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
                      placeholder="名称"
                      autoFocus
                    />
                    <span className="shrink-0 text-gray-300" aria-hidden>
                      |
                    </span>
                    <input
                      type="text"
                      value={draftDescription}
                      onChange={e => setDraftDescription(e.target.value)}
                      disabled={savingMeta}
                      className="min-w-0 flex-[2] rounded-md border border-gray-300 px-2.5 py-1 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
                      placeholder="描述（可选）"
                    />
                  </div>
                ) : (
                  <div className="flex min-w-0 items-baseline gap-2 truncate">
                    <h1 className="shrink-0 text-lg font-semibold text-gray-800">{dagView.name}</h1>
                    <span className="shrink-0 text-gray-300" aria-hidden>
                      |
                    </span>
                    <span
                      className={`min-w-0 truncate text-sm ${
                        dagView.description ? 'text-gray-600' : 'text-gray-400'
                      }`}
                      title={dagView.description ?? undefined}
                    >
                      {dagView.description || '暂无描述'}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {editingMeta ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void handleSaveMeta()}
                      disabled={savingMeta}
                      className="inline-flex size-8 items-center justify-center rounded-md border border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100 disabled:opacity-50"
                      title="保存"
                      aria-label="保存"
                    >
                      {savingMeta ? (
                        <Loader2Icon className="size-4 animate-spin" />
                      ) : (
                        <CheckIcon className="size-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEditMeta}
                      disabled={savingMeta}
                      className="inline-flex size-8 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                      title="取消"
                      aria-label="取消"
                    >
                      <XIcon className="size-4" />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={beginEditMeta}
                    className="inline-flex size-8 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100"
                    title="编辑名称与描述"
                    aria-label="编辑名称与描述"
                  >
                    <PencilIcon className="size-4" />
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 下方区域固定占满剩余高度，避免整页滚动 */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Upper part: DAG graph */}
        <div className="shrink-0 border-b border-gray-200" style={{ height: `${windowHeight * 0.2}px` }}>
          <div className="h-full w-full relative">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.2 }}
            >
              <Background />
              <Controls />
            </ReactFlow>
          </div>
        </div>

        {/* Lower part: Tabs */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
          {/* Tab headers */}
          <div className="flex shrink-0 border-b border-gray-200 bg-white">
            <button
              onClick={() => handleTabChange('development')}
              className={`px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === 'development'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              任务开发
            </button>
            <button
              onClick={() => handleTabChange('operations')}
              className={`px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === 'operations'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              任务运维
            </button>
          </div>

          {/* Tab content */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {activeTab === 'development' ? (
              <div className="mx-4 my-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
                <DagTaskDevelopmentPanel focusedNodeId={focusedNodeId} nodeData={focusedNodeData} />
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-auto">
                <TaskOperationsTable
                  dagId={dagId}
                  taskNames={taskNames}
                  onTaskRowClick={handleSelectNodeFromOperations}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
