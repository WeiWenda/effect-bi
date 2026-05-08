import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeftIcon, Table as TableIcon } from 'lucide-react';
import { TableFieldsTab } from './TableFieldsTab';
import { TableOutputTab } from './TableOutputTab';
import { LineageGraphTab } from './LineageGraphTab';
import { lineageAPI } from '../../services/lineageApi';
import {
  lineageEntityRouteTableName,
  lineageEtlTaskInfoId,
  lineageTableDisplayName,
  lineageTableGravitinoLocation,
  lineageTableLayer,
} from '../../services/lineageNodeMeta';

type TabType = 'fields' | 'output' | 'lineage';

function parseDetailTab(sp: URLSearchParams): TabType {
  const t = sp.get('tab');
  if (t === 'output') return 'output';
  if (t === 'lineage') return 'lineage';
  if (t === 'fields' || t === 'meta' || t === 'columns') return 'fields';
  return 'lineage';
}

export function TableDetailPage(): React.JSX.Element {
  const { tableName } = useParams<{ tableName: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabType>(() => parseDetailTab(searchParams));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tableData, setTableData] = useState<{
    tableName: string;
    routeTableName: string;
    layer: string;
    gravitinoLocation: { catalog: string; database: string; table: string } | null;
    entityId: string;
    /** Neo4j `etl_task_id` ↔ PG etl_task_info.id */
    etlTaskInfoId: number | null;
  } | null>(null);

  useEffect(() => {
    setActiveTab(parseDetailTab(searchParams));
  }, [searchParams]);

  const handleTabChange = (tab: TabType): void => {
    setActiveTab(tab);
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        next.set('tab', tab);
        return next;
      },
      { replace: true }
    );
  };

  useEffect(() => {
    const fetchTableData = async () => {
      setLoading(true);
      setError(null);

      try {
        if (tableName) {
          // Fetch entity by table name
          const { entity } = await lineageAPI.getEntityByTableName(tableName);
          const p = entity.properties;
          setTableData({
            tableName: lineageTableDisplayName(p),
            routeTableName: lineageEntityRouteTableName(p),
            layer: lineageTableLayer(p),
            gravitinoLocation: lineageTableGravitinoLocation(p),
            entityId: entity.id,
            etlTaskInfoId: lineageEtlTaskInfoId(p),
          });
        } else {
          setError('Table name is required');
        }
      } catch (err) {
        console.error('Error fetching table data:', err);
        setError('Failed to load table data');
      } finally {
        setLoading(false);
      }
    };

    fetchTableData();
  }, [tableName]);

  const handleBack = () => {
    navigate('/lineage');
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-gray-50">
      {/* 顶栏与 Cube 详情一致：仅 Chevron + 图标 + 标题 + 标签 */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            title="返回列表"
          >
            <ChevronLeftIcon className="size-5" />
          </button>
          {loading && (
            <div className="h-5 w-40 animate-pulse rounded bg-gray-200" aria-hidden />
          )}
          {!loading && !error && tableData && (
            <>
              <TableIcon className="size-5 shrink-0 text-blue-600" aria-hidden />
              <h1 className="truncate text-lg font-semibold text-gray-800">{tableData.tableName}</h1>
              <span
                className="shrink-0 rounded px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-700"
                title="分层"
              >
                {tableData.layer}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex flex-1 items-center justify-center py-12">
          <div className="size-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500" />
        </div>
      )}

      {/* Error state（无 tableData 时完整提示） */}
      {error && !tableData && (
        <div className="mx-4 mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>
      )}

      {/* Tabs */}
      {!loading && !error && tableData && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* Tab headers */}
          <div className="flex flex-wrap border-b border-gray-200 bg-white">
            <button
              type="button"
              onClick={() => handleTabChange('fields')}
              className={`px-6 py-4 text-sm font-medium transition-colors ${
                activeTab === 'fields'
                  ? 'border-b-2 border-blue-600 bg-blue-50 text-blue-600'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
              }`}
            >
              字段信息
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('output')}
              className={`px-6 py-4 text-sm font-medium transition-colors ${
                activeTab === 'output'
                  ? 'border-b-2 border-blue-600 bg-blue-50 text-blue-600'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
              }`}
            >
              产出信息
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('lineage')}
              className={`px-6 py-4 text-sm font-medium transition-colors ${
                activeTab === 'lineage'
                  ? 'border-b-2 border-blue-600 bg-blue-50 text-blue-600'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
              }`}
            >
              数据血缘
            </button>
          </div>

          {/* Tab content */}
          <div className="flex-1 min-h-0 overflow-auto">
            {activeTab === 'fields' && <TableFieldsTab gravitinoLocation={tableData.gravitinoLocation} />}
            {activeTab === 'output' && (
              <TableOutputTab
                gravitinoLocation={tableData.gravitinoLocation}
                etlTaskInfoId={tableData.etlTaskInfoId}
              />
            )}
            {activeTab === 'lineage' && (
              <LineageGraphTab
                entityId={tableData.entityId}
                tableName={tableData.tableName}
                routeTableName={tableData.routeTableName}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
