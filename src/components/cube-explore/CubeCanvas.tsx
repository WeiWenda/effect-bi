import { useState, useCallback, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Node,
  Edge,
  Background,
  Controls,
  useReactFlow,
  ReactFlowProvider,
  addEdge,
  Connection,
  EdgeChange,
  NodeChange,
  applyNodeChanges,
  applyEdgeChanges,
  Handle,
  Position,
  BaseEdge,
  getBezierPath,
  EdgeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { PlusIcon, CodeIcon, Trash2Icon } from 'lucide-react';
import { Button } from '../ui/button';
import { JoinConditionDialog } from './JoinConditionDialog';
import { gravitinoAPI } from '../../services/gravitinoApi';

export type ModelType = 'fact' | 'dim';
export type JoinType = 'inner' | 'full';

export interface TableNodeData extends Record<string, unknown> {
  label: string;
  catalog?: string;
  schema?: string;
  table?: string;
  type: 'table' | 'sql';
  sql?: string;
  modelType?: ModelType;
}

export interface JoinEdgeData extends Record<string, unknown> {
  leftField?: string;
  rightField?: string;
  joinType?: JoinType;
}

function JoinEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, style, markerEnd }: EdgeProps): React.JSX.Element {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const hasCondition = data?.leftField && data?.rightField;
  const joinType = (data as JoinEdgeData)?.joinType;
  const joinLabel = joinType ? `[${joinType === 'inner' ? 'INNER' : 'FULL'}] ` : '';
  const label = hasCondition ? `${joinLabel}${data.leftField} = ${data.rightField}` : '';

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={{ ...style, stroke: hasCondition ? '#6366f1' : '#ef4444', strokeWidth: 2 }} markerEnd={markerEnd} />
      {label && (
        <g transform={`translate(${labelX}, ${labelY})`}>
          <rect x={-label.length * 3.5 - 8} y={-10} width={label.length * 7 + 16} height={20} rx={4} fill="white" stroke={hasCondition ? '#6366f1' : '#ef4444'} strokeWidth={1} />
          <text textAnchor="middle" dominantBaseline="middle" fontSize={11} fill={hasCondition ? '#4f46e5' : '#dc2626'}>{label}</text>
        </g>
      )}
      {!hasCondition && (
        <g transform={`translate(${labelX}, ${labelY})`}>
          <circle r={6} fill="#ef4444" stroke="white" strokeWidth={2} style={{ cursor: 'pointer' }} />
        </g>
      )}
    </>
  );
}

interface CubeCanvasContentProps {
  nodes: Node<TableNodeData>[];
  setNodes: React.Dispatch<React.SetStateAction<Node<TableNodeData>[]>>;
  edges: Edge[];
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  onViewportChange?: (viewport: { x: number; y: number; zoom: number }) => void;
  initialViewport?: { x: number; y: number; zoom: number };
}

function CubeCanvasContent({ nodes, setNodes, edges, setEdges, onViewportChange, initialViewport }: CubeCanvasContentProps): React.JSX.Element {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { screenToFlowPosition, getViewport, setViewport } = useReactFlow();
  const viewportAppliedRef = useRef<string>('');

  // Set initial viewport when provided (only once per unique value)
  useEffect(() => {
    if (initialViewport) {
      const key = `${initialViewport.x}-${initialViewport.y}-${initialViewport.zoom}`;
      if (viewportAppliedRef.current !== key) {
        viewportAppliedRef.current = key;
        setViewport(initialViewport);
      }
    }
  }, [initialViewport, setViewport]);

  // Report viewport changes to parent on move/zoom
  const onMove = useCallback(() => {
    const viewport = getViewport();
    onViewportChange?.(viewport);
  }, [getViewport, onViewportChange]);

  const onZoom = useCallback(() => {
    const viewport = getViewport();
    onViewportChange?.(viewport);
  }, [getViewport, onViewportChange]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds) as Node<TableNodeData>[]),
    []
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, type: 'joinEdge' }, eds)),
    []
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const data = event.dataTransfer.getData('application/json');
      if (!data) return;

      const parsedData = JSON.parse(data);
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: Node<TableNodeData> = {
        id: `table-${Date.now()}`,
        type: 'tableNode',
        position,
        data: {
          label: parsedData.table,
          catalog: parsedData.catalog,
          schema: parsedData.schema,
          table: parsedData.table,
          type: 'table',
        },
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [screenToFlowPosition]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const addSqlNode = useCallback(() => {
    const position = screenToFlowPosition({ x: 400, y: 300 });
    const newNode: Node<TableNodeData> = {
      id: `sql-${Date.now()}`,
      type: 'sqlNode',
      position,
      data: {
        label: 'SQL Node',
        type: 'sql',
        sql: 'SELECT * FROM table',
      },
    };

    setNodes((nds) => [...nds, newNode]);
  }, [screenToFlowPosition]);

  const deleteNode = useCallback(() => {
    setNodes((nds) => nds.filter((node) => !node.selected));
    setEdges((eds) => eds.filter((edge) => !edge.selected));
  }, []);

  const [joinDialogOpen, setJoinDialogOpen] = useState(false);
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null);
  const [leftFields, setLeftFields] = useState<string[]>([]);
  const [rightFields, setRightFields] = useState<string[]>([]);
  const [leftTableName, setLeftTableName] = useState('');
  const [rightTableName, setRightTableName] = useState('');
  const [currentLeftField, setCurrentLeftField] = useState('');
  const [currentRightField, setCurrentRightField] = useState('');
  const [currentJoinType, setCurrentJoinType] = useState<JoinType>('inner');

  const loadFieldsForNode = async (nodeId: string): Promise<{ fields: string[]; tableName: string }> => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node || !node.data.catalog || !node.data.schema || !node.data.table) {
      return { fields: [], tableName: node?.data.label || '' };
    }
    try {
      const response = await gravitinoAPI.getTableDetail(node.data.catalog, node.data.schema, node.data.table);
      return {
        fields: response.table.columns.map(col => col.name),
        tableName: node.data.table,
      };
    } catch {
      return { fields: [], tableName: node.data.table };
    }
  };

  const onEdgeClick = useCallback(async (_event: React.MouseEvent, edge: Edge) => {
    setEditingEdgeId(edge.id);

    const leftResult = await loadFieldsForNode(edge.source);
    const rightResult = await loadFieldsForNode(edge.target);
    setLeftFields(leftResult.fields);
    setRightFields(rightResult.fields);
    setLeftTableName(leftResult.tableName);
    setRightTableName(rightResult.tableName);
    setCurrentLeftField((edge.data as JoinEdgeData)?.leftField || '');
    setCurrentRightField((edge.data as JoinEdgeData)?.rightField || '');
    setCurrentJoinType((edge.data as JoinEdgeData)?.joinType || 'inner');
    setJoinDialogOpen(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes]);

  const handleJoinConfirm = useCallback((leftField: string, rightField: string, joinType: JoinType) => {
    if (!editingEdgeId) return;
    setEdges(eds => eds.map(e => e.id === editingEdgeId ? { ...e, data: { ...e.data, leftField, rightField, joinType } } : e));
    setEditingEdgeId(null);
  }, [editingEdgeId]);

  const edgeTypes = {
    joinEdge: JoinEdge,
  };

  const nodeTypes = {
    tableNode: ({ data, id }: { data: TableNodeData; id: string }) => {
      const currentModelType = data.modelType || 'dim';
      const hasExistingFact = nodes.some(n => n.id !== id && n.data.type === 'table' && n.data.modelType === 'fact');
      const handleModelTypeChange = (newType: ModelType) => {
        if (newType === 'fact' && hasExistingFact) return;
        setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, modelType: newType } } : n));
      };
      const borderColor = currentModelType === 'fact' ? 'border-amber-400' : 'border-blue-300';
      const bgColor = currentModelType === 'fact' ? 'bg-amber-50' : 'bg-white';
      return (
        <div className={`px-4 py-3 ${bgColor} border-2 ${borderColor} rounded-lg shadow-sm min-w-[200px]`}>
          <Handle type="target" position={Position.Left} className="!bg-blue-400 !w-2 !h-2" />
          <div className="flex items-center gap-2 mb-2">
            <CodeIcon className={`size-4 ${currentModelType === 'fact' ? 'text-amber-500' : 'text-blue-500'}`} />
            <div className="text-sm font-medium text-gray-800">{data.label}</div>
          </div>
          {data.catalog && data.schema && (
            <div className="text-xs text-gray-500 mb-2">
              {data.catalog}.{data.schema}
            </div>
          )}
          <div className="inline-flex rounded-md shadow-sm">
            <button
              type="button"
              onClick={() => handleModelTypeChange('fact')}
              className={`rounded-l-md px-2 py-0.5 text-xs font-medium transition-colors ${currentModelType === 'fact' ? 'bg-amber-500 text-white' : hasExistingFact ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              disabled={currentModelType !== 'fact' && hasExistingFact}
            >
              Fact
            </button>
            <button
              type="button"
              onClick={() => handleModelTypeChange('dim')}
              className={`-ml-px rounded-r-md px-2 py-0.5 text-xs font-medium transition-colors ${currentModelType === 'dim' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              Dim
            </button>
          </div>
          <Handle type="source" position={Position.Right} className="!bg-blue-400 !w-2 !h-2" />
        </div>
      );
    },
    sqlNode: ({ data }: { data: TableNodeData }) => (
      <div className="px-4 py-3 bg-white border-2 border-purple-300 rounded-lg shadow-sm min-w-[200px]">
        <Handle type="target" position={Position.Left} className="!bg-purple-400 !w-2 !h-2" />
        <div className="flex items-center gap-2 mb-2">
          <CodeIcon className="size-4 text-purple-500" />
          <div className="text-sm font-medium text-gray-800">{data.label}</div>
        </div>
        {data.sql && (
          <div className="text-xs text-gray-500 font-mono truncate" title={data.sql}>
            {data.sql}
          </div>
        )}
        <Handle type="source" position={Position.Right} className="!bg-purple-400 !w-2 !h-2" />
      </div>
    ),
  };

  return (
    <div className="h-full w-full relative" onDrop={onDrop} onDragOver={onDragOver}>
      {/* Toolbar */}
      <div className="absolute top-4 left-4 z-10 flex gap-2">
        <Button
          onClick={addSqlNode}
          size="sm"
          className="flex items-center gap-2"
        >
          <PlusIcon className="size-4" />
          SQL 节点
        </Button>
        <Button
          onClick={deleteNode}
          size="sm"
          variant="destructive"
          className="flex items-center gap-2"
        >
          <Trash2Icon className="size-4" />
          删除选中
        </Button>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgeClick={onEdgeClick}
        onMove={onMove}
        onZoom={onZoom}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={{ type: 'joinEdge' }}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>

      <JoinConditionDialog
        open={joinDialogOpen}
        onClose={() => { setJoinDialogOpen(false); setEditingEdgeId(null); }}
        onConfirm={handleJoinConfirm}
        leftTableName={leftTableName}
        rightTableName={rightTableName}
        leftFields={leftFields}
        rightFields={rightFields}
        initialLeftField={currentLeftField}
        initialRightField={currentRightField}
        initialJoinType={currentJoinType}
      />
    </div>
  );
}

interface CubeCanvasProps {
  nodes: Node<TableNodeData>[];
  setNodes: React.Dispatch<React.SetStateAction<Node<TableNodeData>[]>>;
  edges: Edge[];
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  onViewportChange?: (viewport: { x: number; y: number; zoom: number }) => void;
  initialViewport?: { x: number; y: number; zoom: number };
}

export function CubeCanvas({ nodes, setNodes, edges, setEdges, onViewportChange, initialViewport }: CubeCanvasProps): React.JSX.Element {
  return (
    <ReactFlowProvider>
      <CubeCanvasContent nodes={nodes} setNodes={setNodes} edges={edges} setEdges={setEdges} onViewportChange={onViewportChange} initialViewport={initialViewport} />
    </ReactFlowProvider>
  );
}
