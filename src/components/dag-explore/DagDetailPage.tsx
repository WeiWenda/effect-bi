import { useState, useEffect, useCallback, useMemo } from 'react';
import { ArrowLeftIcon, ExternalLinkIcon, Network as NetworkIcon } from 'lucide-react';
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
  lineageTableDescription,
  lineageTableDisplayName,
  lineageTableLayer,
} from '../../services/lineageNodeMeta';
import { TaskOperationsTable } from './TaskOperationsTable';
import ELK from 'elkjs/lib/elk.bundled.js';

interface DagDetailPageProps {
  dagId: number;
  onBack: () => void;
}

interface NodeData {
  label: string;
  /** catalog.database.table，运维表等展示用 */
  qualifiedTableName?: string;
  /** Neo4j Table，已发布 ETL 同步的 DAG id，如 auto_generate_14 */
  airflowDagId?: string;
  layer?: string;
  description?: string;
  entityId: string;
  focused?: boolean;
  taskFile?: string;
}

const AIRFLOW_UI_BASE =
  (import.meta.env.VITE_AIRFLOW_UI_BASE_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://localhost:8080';

const CustomNode = ({ data, onClick }: { data: NodeData; onClick?: () => void }) => {
  const nodeClass = data.focused
    ? 'bg-green-50 border-green-400'
    : 'bg-white border-gray-200';

  return (
    <div
      className={`px-4 py-3 border-2 rounded-lg shadow-sm min-w-[180px] cursor-pointer ${nodeClass}`}
      onClick={onClick}
    >
      <Handle type="target" position={Position.Left} className="!w-2 !h-2" />
      <div className="text-sm font-medium text-gray-800 mb-1">{data.label}</div>
      {data.description && (
        <div className="text-xs text-gray-600 mb-1 line-clamp-2" title={data.description}>
          {data.description}
        </div>
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
      width: 220,
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
  const [dagView, setDagView] = useState<DagView | null>(null);
  const [loading, setLoading] = useState(true);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [activeTab, setActiveTab] = useState<'development' | 'operations'>('development');
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [windowHeight, setWindowHeight] = useState(window.innerHeight);

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
          const nodeName = lineageTableDisplayName(p);
          const catalogRaw = typeof p.catalog_name === 'string' ? p.catalog_name.trim() : '';
          const databaseRaw = typeof p.database_name === 'string' ? p.database_name.trim() : '';
          const tableRaw = typeof p.table_name === 'string' ? p.table_name.trim() : '';
          const catalog = catalogRaw || 'hive';
          const qualifiedTableName =
            databaseRaw && tableRaw ? `${catalog}.${databaseRaw}.${tableRaw}` : undefined;
          const layer = lineageTableLayer(p);
          const description = lineageTableDescription(p);
          const tf =
            typeof p.task_file === 'string' && p.task_file.trim()
              ? p.task_file.trim()
              : typeof p.AIRFLOW_DAG_ID === 'string' && p.AIRFLOW_DAG_ID.trim()
                ? p.AIRFLOW_DAG_ID.trim()
                : undefined;

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
                qualifiedTableName,
                airflowDagId: airflowDagIdRaw,
                layer,
                description,
                entityId: lineageNode.id,
                focused: false,
                taskFile: tf ?? (typeof p.taskFile === 'string' ? p.taskFile : undefined),
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
  const airflowDagHref =
    focusedNodeData?.airflowDagId != null && focusedNodeData.airflowDagId !== ''
      ? `${AIRFLOW_UI_BASE}/dags/${encodeURIComponent(focusedNodeData.airflowDagId)}`
      : null;

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header with back button */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4 shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors"
        >
          <ArrowLeftIcon className="size-5" />
          <span className="text-sm">返回列表</span>
        </button>
        {dagView && (
          <div className="flex items-center gap-2 text-sm">
            <NetworkIcon className="size-4 text-blue-600" />
            <span className="font-medium text-gray-800">{dagView.name}</span>
            <span className="text-gray-500">|</span>
            <span className="text-gray-600">{dagView.nodeIds.length} 个节点</span>
          </div>
        )}
      </div>

      {/* Scrollable area below header */}
      <div className="flex-1 overflow-y-auto">
        {/* Upper part: DAG graph */}
        <div className="border-b border-gray-200" style={{ height: `${windowHeight * 0.2}px` }}>
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
        <div className="flex flex-col bg-white">
          {/* Tab headers */}
          <div className="flex border-b border-gray-200 sticky top-0 bg-white z-10">
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
          <div>
            {activeTab === 'development' ? (
              <div className="mx-4 my-4 min-h-[420px] rounded-lg border border-gray-200 bg-white px-6 py-8 shadow-sm">
                {!focusedNodeId ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-20 text-center text-gray-500">
                    <p className="text-sm font-medium text-gray-700">任务开发</p>
                    <p className="text-sm">请在上方 DAG 图中点击节点，将显示对应 Airflow DAG 链接。</p>
                  </div>
                ) : (
                  <div className="space-y-4 max-w-xl">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">当前表</p>
                      <p className="mt-1 text-sm font-semibold text-gray-900">
                        {focusedNodeData?.qualifiedTableName ?? focusedNodeData?.label ?? focusedNodeId}
                      </p>
                    </div>
                    {airflowDagHref ? (
                      <div className="rounded-lg border border-blue-100 bg-blue-50/80 px-4 py-3">
                        <p className="text-xs text-gray-600 mb-2">Airflow（新标签页打开）</p>
                        <a
                          href={airflowDagHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800 underline-offset-2 hover:underline"
                        >
                          <ExternalLinkIcon className="size-4 shrink-0" aria-hidden />
                          {focusedNodeData?.airflowDagId}
                        </a>
                        <p className="mt-2 text-xs text-gray-500 break-all">{airflowDagHref}</p>
                      </div>
                    ) : (
                      <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-md px-3 py-2">
                        该节点暂无 AIRFLOW_DAG_ID（通常表示尚未通过本系统发布 ETL，或未同步到 Neo4j）。
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <TaskOperationsTable dagId={dagId} taskNames={taskNames} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
