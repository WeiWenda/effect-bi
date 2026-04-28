import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { Node, Edge } from '@xyflow/react';
import { DatabaseIcon, EyeIcon, HistoryIcon, ChevronLeftIcon } from 'lucide-react';
import { MetadataTreePanel } from './cube-explore/MetadataTreePanel';
import { CubeCanvas, TableNodeData, JoinEdgeData } from './cube-explore/CubeCanvas';
import { FieldListPanel, FieldItem } from './cube-explore/FieldListPanel';
import { YamlPreviewDialog } from './cube-explore/YamlPreviewDialog';
import { VersionManageDialog } from './cube-explore/VersionManageDialog';
import { cubeAPI } from '../services/cubeApi';

const DEFAULT_BOTTOM_HEIGHT = 400;
const MIN_BOTTOM_HEIGHT = 100;
const MIN_TOP_HEIGHT = 150;

const generateDefaultCubeJson = (): string => JSON.stringify([{
  name: 'example_cube',
  title: 'Example Cube',
  description: 'Dynamic cube model example',
  sql_table: 'public.orders',
  measures: {
    count: { sql: 'id', type: 'count', description: 'Total count' },
    total_amount: { sql: 'amount', type: 'sum', description: 'Total amount' },
  },
  dimensions: {
    id: { sql: 'id', type: 'number', description: 'Order ID', primary_key: true },
    status: { sql: 'status', type: 'string', description: 'Order status' },
    created_at: { sql: 'created_at', type: 'time', description: 'Created time' },
  },
  joins: {
    customers: { sql: '{CUBE}.customer_id = {customers.id}', relationship: 'many_to_one' },
  },
}], null, 2);

interface CubeDetailPageProps {
  cubeName: string;
  onBack: () => void;
}

export function CubeDetailPage({ cubeName, onBack }: CubeDetailPageProps): React.JSX.Element {
  const [showYamlPreview, setShowYamlPreview] = useState(false);
  const [showVersionManage, setShowVersionManage] = useState(false);
  const [nodes, setNodes] = useState<Node<TableNodeData>[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [fields, setFields] = useState<FieldItem[]>([]);
  const [yamlContent, setYamlContent] = useState(generateDefaultCubeJson);
  const [previewYaml, setPreviewYaml] = useState('');
  const [currentVersion, setCurrentVersion] = useState<{ id: number; remark: string; is_published: boolean } | null>(null);
  const [loadedViewport, setLoadedViewport] = useState<{ x: number; y: number; zoom: number } | null>(null);
  const viewportRef = useRef<{ x: number; y: number; zoom: number }>({ x: 0, y: 0, zoom: 1 });
  const [bottomHeight, setBottomHeight] = useState(DEFAULT_BOTTOM_HEIGHT);
  const containerRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const tableNodes = useMemo(() => nodes
    .filter(n => n.data.type === 'table' && n.data.catalog && n.data.schema && n.data.table)
    .map(n => ({
      id: n.id,
      catalog: n.data.catalog!,
      schema: n.data.schema!,
      table: n.data.table!,
    })), [nodes]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!draggingRef.current || !rightPanelRef.current) return;
      const panelRect = rightPanelRef.current.getBoundingClientRect();
      const mouseY = moveEvent.clientY - panelRect.top;
      const totalHeight = panelRect.height;
      const newBottomHeight = Math.max(
        MIN_BOTTOM_HEIGHT,
        Math.min(totalHeight - MIN_TOP_HEIGHT, totalHeight - mouseY)
      );
      setBottomHeight(newBottomHeight);
    };

    const handleMouseUp = () => {
      draggingRef.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const handleLoadVersion = useCallback((version: { canvas_data: any; field_list: any; yaml_content: string; remark: string; id: number; is_published: boolean }) => {
    if (version.canvas_data?.nodes) {
      setNodes(version.canvas_data.nodes);
    }
    if (version.canvas_data?.edges) {
      setEdges(version.canvas_data.edges);
    }
    if (version.canvas_data?.viewport) {
      setLoadedViewport(version.canvas_data.viewport);
      viewportRef.current = version.canvas_data.viewport;
    }
    if (version.field_list) {
      setFields(version.field_list);
    }
    if (version.yaml_content) {
      setYamlContent(version.yaml_content);
    }
    setCurrentVersion({ id: version.id, remark: version.remark, is_published: version.is_published });
  }, []);

  const handlePreviewYaml = useCallback((yaml: string) => {
    setPreviewYaml(yaml);
    setShowYamlPreview(true);
  }, []);

  // Generate Cube.js Dynamic Data Model JSON (pure frontend, for asyncModule)
  // Each table with output fields becomes its own cube; joins connect cubes
  const handleGenerateYaml = useCallback(() => {
    if (nodes.length === 0 || fields.filter(f => f.isOutput).length === 0) {
      setYamlContent(JSON.stringify({ error: 'No tables or output fields configured yet' }, null, 2));
      setPreviewYaml(''); setShowYamlPreview(true); return;
    }
    const tableNodes = nodes.filter(n => n.data.type === 'table' && n.data.catalog && n.data.schema && n.data.table);
    if (tableNodes.length === 0) {
      setYamlContent(JSON.stringify({ error: 'No valid table nodes found' }, null, 2));
      setPreviewYaml(''); setShowYamlPreview(true); return;
    }

    const outputFields = fields.filter(f => f.isOutput);
    const fieldsByTable = new Map<string, FieldItem[]>();
    for (const f of outputFields) {
      const list = fieldsByTable.get(f.tableId) || [];
      list.push(f); fieldsByTable.set(f.tableId, list);
    }

    // Fact table uses cubeName as cube name; dim tables use table name
    const factNodeId = tableNodes.find(n => n.data.modelType === 'fact')?.id;

    const cubeModels: any[] = [];
    for (const tn of tableNodes) {
      const tFields = fieldsByTable.get(tn.id);
      if (!tFields || tFields.length === 0) continue;
      const isFact = tn.data.modelType === 'fact';
      const cName = isFact ? cubeName.toLowerCase().replace(/[^a-z0-9_]/g, '_') : tn.data.table!.toLowerCase().replace(/[^a-z0-9_]/g, '_');
      const measures: Record<string, any> = {};
      const dimensions: Record<string, any> = {};
      for (const f of tFields) {
        const fk = f.fieldName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        if (f.role === 'measure') {
          measures[fk] = { sql: f.expression || f.fieldName, type: inferMeasureType(f.datatype, f.expression), ...(f.fieldDescription && { description: f.fieldDescription }) };
        } else {
          dimensions[fk] = { sql: f.fieldName, type: mapDataTypeToCube(f.datatype), ...(f.fieldDescription && { description: f.fieldDescription }) };
        }
      }
      // Joins: edges where this table is source
      const joins: Record<string, any> = {};
      const seen = new Set<string>();
      for (const edge of edges) {
        const ed = edge.data as JoinEdgeData | undefined;
        if (!ed?.leftField || !ed?.rightField) continue;
        const src = nodes.find(n => n.id === edge.source);
        const tgt = nodes.find(n => n.id === edge.target);
        if (!src || !tgt || src.id !== tn.id) continue;
        const tgtIsFact = tgt.id === factNodeId;
        const jName = tgtIsFact ? cubeName.toLowerCase().replace(/[^a-z0-9_]/g, '_') : tgt.data.table!.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        if (seen.has(jName)) continue; seen.add(jName);
        // Relationship: fact→dim = many_to_one, dim→fact = one_to_many
        const relationship = isFact && !tgtIsFact ? 'many_to_one' : !isFact && tgtIsFact ? 'one_to_many' : 'many_to_one';
        joins[jName] = { sql: `{CUBE}.${ed.leftField} = {${jName}.${ed.rightField}`, relationship };
      }
      cubeModels.push({
        name: cName, title: isFact ? cubeName : tn.data.table,
        description: `Cube for ${tn.data.schema}.${tn.data.table}`,
        sql_table: `${tn.data.schema}.${tn.data.table}`,
        measures, dimensions,
        ...(Object.keys(joins).length > 0 && { joins }),
      });
    }
    setYamlContent(JSON.stringify(cubeModels, null, 2));
    setPreviewYaml(''); setShowYamlPreview(true);
  }, [nodes, edges, fields, cubeName]);

  // Map database column type -> Cube.js dimension type
  function mapDataTypeToCube(dataType: string): string {
    const lower = dataType.toLowerCase();
    if (lower.includes('int') || lower.includes('decimal') || lower.includes('float') || lower.includes('double') || lower.includes('numeric') || lower.includes('real')) {
      return 'number';
    }
    if (lower.includes('bool')) {
      return 'boolean';
    }
    if (lower.includes('time') || lower.includes('date') || lower.includes('timestamp')) {
      return 'time';
    }
    return 'string';
  }

  // Infer Cube.js measure type from column type and expression
  // Cube.js measure types: count, sum, avg, min, max, count_distinct, count_distinct_approx, number, string, time, boolean
  function inferMeasureType(dataType: string, expression?: string): string {
    if (expression) {
      // Custom expression -> use 'number' (requires aggregate function in sql)
      return 'number';
    }
    const lower = dataType.toLowerCase();
    if (lower.includes('int') || lower.includes('decimal') || lower.includes('float') || lower.includes('double') || lower.includes('numeric') || lower.includes('real')) {
      return 'sum';
    }
    // Non-numeric columns as measure default to count
    return 'count';
  }

  // Load latest version on mount
  useEffect(() => {
    const loadLatestVersion = async () => {
      try {
        const response = await cubeAPI.listVersions(cubeName);
        if (response.versions.length > 0) {
          const latestVersion = response.versions[0];
          handleLoadVersion({
            canvas_data: latestVersion.canvas_data,
            field_list: latestVersion.field_list,
            yaml_content: latestVersion.yaml_content,
            remark: latestVersion.remark,
            id: latestVersion.id,
            is_published: latestVersion.is_published,
          });
        }
      } catch (error) {
        console.error('Error loading latest version:', error);
      }
    };
    loadLatestVersion();
  }, [cubeName]);

  const displayedYaml = previewYaml || yamlContent;

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
            title="返回列表"
          >
            <ChevronLeftIcon className="size-5" />
          </button>
          <DatabaseIcon className="size-5 text-blue-600" />
          <h1 className="text-lg font-semibold text-gray-800">{cubeName}</h1>
          {currentVersion && (
            <span className={`text-xs px-2 py-0.5 rounded ${currentVersion.is_published ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`} title={currentVersion.is_published ? '已发布版本' : `当前内容基于版本: ${currentVersion.remark}`}>
              {currentVersion.is_published ? '已发布版本' : `基于: ${currentVersion.remark}`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowVersionManage(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md text-sm font-medium hover:bg-gray-700 transition-colors"
          >
            <HistoryIcon className="size-4" />
            版本管理
          </button>
          <button
            onClick={handleGenerateYaml}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-md text-sm font-medium hover:bg-blue-600 transition-colors"
          >
            <EyeIcon className="size-4" />
            Cube 模型预览
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden" ref={containerRef}>
        {/* Left Panel - Metadata Tree */}
        <div className="w-80 border-r border-gray-200 bg-white flex flex-col">
          <MetadataTreePanel />
        </div>

        {/* Right Panel - Split vertically */}
        <div className="flex-1 flex flex-col overflow-hidden" ref={rightPanelRef}>
          {/* Top - Canvas */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <CubeCanvas nodes={nodes} setNodes={setNodes} edges={edges} setEdges={setEdges} onViewportChange={(vp) => { viewportRef.current = vp; }} initialViewport={loadedViewport} />
          </div>

          {/* Resizable Divider */}
          <div
            className="h-2 bg-gray-100 border-t border-b border-gray-200 cursor-row-resize flex items-center justify-center hover:bg-blue-100 transition-colors shrink-0"
            onMouseDown={handleMouseDown}
          >
            <div className="w-8 h-1 rounded-full bg-gray-300" />
          </div>

          {/* Bottom - Field List */}
          <div className="shrink-0 overflow-hidden" style={{ height: bottomHeight }}>
            <FieldListPanel tableNodes={tableNodes} fields={fields} setFields={setFields} />
          </div>
        </div>
      </div>

      {/* Version Management Dialog */}
      {showVersionManage && (
        <VersionManageDialog
          open={showVersionManage}
          onClose={() => setShowVersionManage(false)}
          cubeName={cubeName}
          canvasData={{ nodes, edges, viewport: viewportRef.current }}
          fieldList={fields}
          yamlContent={yamlContent}
          onLoadVersion={handleLoadVersion}
          onPreviewYaml={handlePreviewYaml}
        />
      )}

      {/* YAML Preview Dialog */}
      {showYamlPreview && (
        <YamlPreviewDialog
          open={showYamlPreview}
          onClose={() => { setShowYamlPreview(false); setPreviewYaml(''); }}
          yamlContent={displayedYaml}
        />
      )}
    </div>
  );
}
