import { useState, useEffect, useCallback, useMemo } from 'react';
import { ArrowLeftIcon, Network as NetworkIcon } from 'lucide-react';
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
import Editor from '@monaco-editor/react';
import { dagAPI, DagView } from '../../services/dagApi';
import { lineageAPI } from '../../services/lineageApi';
import {
  lineageTableDescription,
  lineageTableDisplayName,
  lineageTableLayer,
} from '../../services/lineageNodeMeta';
import { fileAPI } from '../../services/fileApi';
import { TaskOperationsTable } from './TaskOperationsTable';
import ELK from 'elkjs/lib/elk.bundled.js';

interface DagDetailPageProps {
  dagId: number;
  onBack: () => void;
}

interface NodeData {
  label: string;
  layer?: string;
  description?: string;
  entityId: string;
  focused?: boolean;
  taskFile?: string;
}

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
  const [taskCode, setTaskCode] = useState('');
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

  // Load task code when focused node changes
  useEffect(() => {
    if (focusedNodeId) {
      const focusedNode = nodes.find(n => n.id === focusedNodeId);
      if (focusedNode?.data.taskFile) {
        fileAPI.getTaskFile(focusedNode.data.taskFile)
          .then(response => {
            setTaskCode(response.content);
          })
          .catch(error => {
            console.error('Error loading task file:', error);
            setTaskCode('-- Failed to load task file');
          });
      } else {
        setTaskCode('-- No task file associated with this node');
      }
    }
  }, [focusedNodeId, nodes]);

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
          const layer = lineageTableLayer(p);
          const description = lineageTableDescription(p);
          const tf =
            typeof p.task_file === 'string' && p.task_file.trim()
              ? p.task_file.trim()
              : typeof p.AIRFLOW_DAG_ID === 'string' && p.AIRFLOW_DAG_ID.trim()
                ? p.AIRFLOW_DAG_ID.trim()
                : undefined;

          if (!nodeMap.has(lineageNode.id)) {
            const newNode: Node = {
              id: lineageNode.id,
              type: 'custom',
              position: { x: 0, y: 0 },
              data: {
                label: nodeName,
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
    if (tab === 'development' && !taskCode) {
      // Load task code (placeholder for now)
      setTaskCode(`-- Task Development Code for ${dagView?.name || 'DAG'}\n-- This is a placeholder for the actual task code\n\nSELECT * FROM example_table\nWHERE date = CURRENT_DATE;`);
    }
  };

  const nodeTypes = createNodeTypes(handleNodeClick);

  // Create mapping from node IDs to table names
  const taskNames = useMemo(() => {
    const mapping: Record<string, string> = {};
    nodes.forEach(node => {
      mapping[node.id] = node.data.label;
    });
    return mapping;
  }, [nodes]);

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
              <div style={{ height: '600px' }}>
                <Editor
                  height="100%"
                  defaultLanguage="shell"
                  value={taskCode}
                  onChange={(value) => setTaskCode(value || '')}
                  theme="vs-light"
                  options={{
                    minimap: { enabled: true },
                    fontSize: 14,
                    lineNumbers: 'on',
                    roundedSelection: false,
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                  }}
                />
              </div>
            ) : (
              <TaskOperationsTable dagId={dagId} taskFiles={dagView?.nodeIds || []} taskNames={taskNames} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
