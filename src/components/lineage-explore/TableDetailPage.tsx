import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Table as TableIcon, ChevronUp, ChevronDown } from 'lucide-react';
import { DDLTab } from './DDLTab';
import { LineageGraphTab } from './LineageGraphTab';
import { lineageAPI } from '../../services/lineageApi';

type TabType = 'ddl' | 'lineage';

export function TableDetailPage(): React.JSX.Element {
  const { tableName } = useParams<{ tableName: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('lineage');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInfoCollapsed, setIsInfoCollapsed] = useState(false);
  const [tableData, setTableData] = useState<{
    tableName: string;
    description: string;
    layer: string;
    ddl: string;
    entityId: string;
  } | null>(null);

  useEffect(() => {
    const fetchTableData = async () => {
      setLoading(true);
      setError(null);

      try {
        if (tableName) {
          // Fetch entity by table name
          const { entity } = await lineageAPI.getEntityByTableName(tableName);
          setTableData({
            tableName: entity.properties.table_name || entity.properties.name || 'Unknown',
            description: entity.properties.description || entity.properties.comment || '',
            layer: entity.properties.layer || entity.properties.tier || 'Unknown',
            ddl: entity.properties.ddl || '',
            entityId: entity.id,
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
    <div className="h-full flex flex-col bg-gray-50 p-6">
      {/* Top header with back button and simplified table info */}
      <div className="mb-4 flex items-center gap-4">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft className="size-5" />
          <span className="text-sm">返回列表</span>
        </button>
        {!loading && !error && tableData && isInfoCollapsed && (
          <div className="flex items-center gap-2 text-sm">
            <TableIcon className="size-4 text-blue-600" />
            <span className="font-medium text-gray-800">{tableData.tableName}</span>
            <span className="text-gray-500">|</span>
            <span className="text-gray-600">{tableData.layer}</span>
          </div>
        )}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="size-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500" />
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 mb-6">
          {error}
        </div>
      )}

      {/* Table basic info */}
      {!loading && !error && tableData && !isInfoCollapsed && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
          <div className="p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-blue-50 rounded-lg">
                <TableIcon className="size-6 text-blue-600" />
              </div>
              <div className="flex-1">
                <h1 className="text-2xl font-semibold text-gray-800 mb-2">
                  {tableData.tableName}
                </h1>
                <p className="text-gray-600 mb-3">{tableData.description}</p>
                <div className="flex items-center gap-4">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-purple-50 text-purple-700">
                    {tableData.layer}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      {!loading && !error && tableData && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex-1 flex flex-col overflow-hidden">
          {/* Tab headers */}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab('ddl')}
              className={`px-6 py-4 text-sm font-medium transition-colors ${
                activeTab === 'ddl'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              DDL 解析
            </button>
            <button
              onClick={() => setActiveTab('lineage')}
              className={`px-6 py-4 text-sm font-medium transition-colors ${
                activeTab === 'lineage'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              血缘可视化
            </button>
            <div className="ml-auto pr-4 flex items-center">
              <button
                onClick={() => setIsInfoCollapsed(!isInfoCollapsed)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title={isInfoCollapsed ? '展开' : '收起'}
              >
                {isInfoCollapsed ? (
                  <ChevronDown className="size-5 text-gray-600" />
                ) : (
                  <ChevronUp className="size-5 text-gray-600" />
                )}
              </button>
            </div>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-auto">
            {activeTab === 'ddl' && <DDLTab ddl={tableData.ddl} />}
            {activeTab === 'lineage' && (
              <LineageGraphTab entityId={tableData.entityId} tableName={tableData.tableName} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
