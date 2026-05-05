import { useEffect, useLayoutEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeftIcon, ChevronRightIcon, Loader2Icon } from 'lucide-react';
import { gravitinoAPI, type ColumnInfo } from '../../services/gravitinoApi';
import { etlAPI, type EtlTablePartitionDetailRow } from '../../services/etlApi';

function columnTypeString(col: ColumnInfo): string {
  return typeof col.type === 'string' ? col.type : (col.type as { type: string }).type;
}

const PARTITION_PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
const DEFAULT_PARTITION_PAGE_SIZE = 20;

const RUNNING_STATUS_LABEL: Record<string, string> = {
  idle: '空闲',
  running: '运行中',
  succeeded: '成功',
  quality_rejected: '质检未通过',
  failed: '失败',
};

function formatPartitionDate(value: unknown): string {
  if (value == null) return '-';
  if (typeof value === 'string') return value.slice(0, 10);
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? '-' : d.toISOString().slice(0, 10);
}

function formatTs(value: unknown): string {
  if (value == null) return '-';
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString();
}

interface TableMetaTabProps {
  gravitinoLocation: { catalog: string; database: string; table: string } | null;
}

export function TableMetaTab({ gravitinoLocation }: TableMetaTabProps): React.JSX.Element {
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [columnsLoading, setColumnsLoading] = useState(false);
  const [columnsError, setColumnsError] = useState<string | null>(null);

  const [partitionRows, setPartitionRows] = useState<EtlTablePartitionDetailRow[]>([]);
  const [partitionLoading, setPartitionLoading] = useState(false);
  const [partitionError, setPartitionError] = useState<string | null>(null);
  const [partitionPage, setPartitionPage] = useState(1);
  const [partitionPageSize, setPartitionPageSize] = useState(DEFAULT_PARTITION_PAGE_SIZE);
  const [partitionTotal, setPartitionTotal] = useState(0);

  const loadPartitionPage = useCallback(
    (
      loc: { catalog: string; database: string; table: string },
      page: number,
      pageSize: number
    ) => {
      setPartitionLoading(true);
      setPartitionError(null);
      void etlAPI
        .listTablePartitionDetails({
          catalog: loc.catalog,
          database: loc.database,
          table: loc.table,
          page,
          pageSize,
        })
        .then(({ partitionDetails, total }) => {
          setPartitionRows(partitionDetails);
          setPartitionTotal(total);
        })
        .catch(() => {
          setPartitionRows([]);
          setPartitionTotal(0);
          setPartitionError('加载产出信息失败');
        })
        .finally(() => {
          setPartitionLoading(false);
        });
    },
    []
  );

  const partitionTableKeyRef = useRef<string | null>(null);

  /** 切换表时同步把页码置 1，避免分页请求仍用上一表的页码 */
  useLayoutEffect(() => {
    if (!gravitinoLocation) {
      partitionTableKeyRef.current = null;
      return;
    }
    const key = `${gravitinoLocation.catalog}|${gravitinoLocation.database}|${gravitinoLocation.table}`;
    if (partitionTableKeyRef.current !== key) {
      partitionTableKeyRef.current = key;
      setPartitionPage(1);
    }
  }, [gravitinoLocation]);

  useEffect(() => {
    if (!gravitinoLocation) {
      setColumns([]);
      setColumnsError(null);
      setPartitionRows([]);
      setPartitionTotal(0);
      setPartitionError(null);
      return;
    }

    const { catalog, database, table } = gravitinoLocation;

    setColumnsLoading(true);
    setColumnsError(null);
    void gravitinoAPI
      .getTableDetail(catalog, database, table)
      .then(res => {
        setColumns(res.table.columns ?? []);
      })
      .catch(() => {
        setColumns([]);
        setColumnsError('无法从 Gravitino 加载字段，请检查 catalog / database / table 是否与元数据一致');
      })
      .finally(() => {
        setColumnsLoading(false);
      });
  }, [gravitinoLocation]);

  useEffect(() => {
    if (!gravitinoLocation) return;
    loadPartitionPage(gravitinoLocation, partitionPage, partitionPageSize);
  }, [gravitinoLocation, partitionPage, partitionPageSize, loadPartitionPage]);

  const partitionTotalPages = Math.max(1, Math.ceil(partitionTotal / partitionPageSize));

  if (!gravitinoLocation) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          实体缺少 catalog_name / database_name / table_name，无法加载 Gravitino 字段与产出分区明细。
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* 字段列表 */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-800">字段列表</h3>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            {columnsLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-gray-500">
                <Loader2Icon className="size-5 animate-spin" />
                <span className="text-sm">加载字段…</span>
              </div>
            ) : columnsError ? (
              <div className="px-4 py-8 text-center text-sm text-gray-500">{columnsError}</div>
            ) : columns.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">暂无字段</div>
            ) : (
              <table className="w-full">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">字段名</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">类型</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">可空</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">注释</th>
                  </tr>
                </thead>
                <tbody>
                  {columns.map(col => (
                    <tr key={col.name} className="border-b border-gray-100 transition-colors hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-800">{col.name}</td>
                      <td className="px-4 py-3 font-mono text-sm text-gray-600">{columnTypeString(col)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{col.nullable ? '是' : '否'}</td>
                      <td className="max-w-[200px] truncate px-4 py-3 text-sm text-gray-600" title={col.comment}>
                        {col.comment?.trim() ? col.comment : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* 产出信息 */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-800">产出信息</h3>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            {partitionLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-gray-500">
                <Loader2Icon className="size-5 animate-spin" />
                <span className="text-sm">加载产出分区…</span>
              </div>
            ) : partitionError ? (
              <div className="px-4 py-8 text-center text-sm text-gray-500">{partitionError}</div>
            ) : partitionRows.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">暂无分区产出记录</div>
            ) : (
              <div className="max-h-[min(70vh,520px)] overflow-auto">
                <table className="w-full min-w-[640px]">
                  <thead className="sticky top-0 z-[1] border-b border-gray-200 bg-gray-50">
                    <tr>
                      <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-semibold text-gray-700">
                        一级分区
                      </th>
                      <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-semibold text-gray-700">
                        二级分区
                      </th>
                      <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-semibold text-gray-700">
                        分区日期
                      </th>
                      <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-semibold text-gray-700">
                        校验
                      </th>
                      <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-semibold text-gray-700">
                        状态
                      </th>
                      <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-semibold text-gray-700">
                        版本 ID
                      </th>
                      <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-semibold text-gray-700">
                        最近成功
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {partitionRows.map(row => (
                      <tr key={row.id} className="border-b border-gray-100 transition-colors hover:bg-gray-50">
                        <td className="px-3 py-2.5 font-mono text-xs text-gray-800">{row.primaryPartitionKey}</td>
                        <td className="max-w-[180px] truncate px-3 py-2.5 font-mono text-xs text-gray-600" title={row.secondaryPartitionKey}>
                          {row.secondaryPartitionKey || '-'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-xs text-gray-700">
                          {formatPartitionDate(row.partitionDate)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-xs text-gray-700">
                          {row.isVerified ? '是' : '否'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-xs text-gray-700">
                          {RUNNING_STATUS_LABEL[row.runningStatus] ?? row.runningStatus}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs">
                          {row.etlTaskVersionId != null ? (
                            <Link
                              to={`/etl?versionId=${row.etlTaskVersionId}`}
                              className="text-blue-600 underline-offset-2 hover:underline"
                              title="在 ETL 开发中打开该版本快照"
                            >
                              {row.etlTaskVersionId}
                            </Link>
                          ) : (
                            <span className="text-gray-600">-</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-xs text-gray-600">
                          {formatTs(row.lastSuccessAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!partitionLoading && !partitionError && partitionTotal > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 bg-gray-50/80 px-3 py-2 text-xs text-gray-600">
                <span>
                  共 {partitionTotal} 条 · 按分区日期倒序
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1">
                    <span className="text-gray-500">每页</span>
                    <select
                      value={partitionPageSize}
                      onChange={e => {
                        setPartitionPageSize(Number(e.target.value));
                        setPartitionPage(1);
                      }}
                      className="rounded border border-gray-200 bg-white px-2 py-1 text-gray-800"
                    >
                      {PARTITION_PAGE_SIZE_OPTIONS.map(n => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={partitionPage <= 1 || partitionLoading}
                      onClick={() => setPartitionPage(p => Math.max(1, p - 1))}
                      className="inline-flex items-center rounded border border-gray-200 bg-white p-1 hover:bg-gray-100 disabled:opacity-40 disabled:pointer-events-none"
                      title="上一页"
                      aria-label="上一页"
                    >
                      <ChevronLeftIcon className="size-4" />
                    </button>
                    <span className="tabular-nums px-1">
                      {partitionPage} / {partitionTotalPages}
                    </span>
                    <button
                      type="button"
                      disabled={partitionPage >= partitionTotalPages || partitionLoading}
                      onClick={() => setPartitionPage(p => Math.min(partitionTotalPages, p + 1))}
                      className="inline-flex items-center rounded border border-gray-200 bg-white p-1 hover:bg-gray-100 disabled:opacity-40 disabled:pointer-events-none"
                      title="下一页"
                      aria-label="下一页"
                    >
                      <ChevronRightIcon className="size-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
