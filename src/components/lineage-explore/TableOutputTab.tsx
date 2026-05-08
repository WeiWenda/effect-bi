import { useEffect, useLayoutEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeftIcon, ChevronRightIcon, ExternalLinkIcon, Loader2Icon } from 'lucide-react';
import { etlAPI, type EtlTablePartitionDetailRow } from '../../services/etlApi';

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

interface TableOutputTabProps {
  gravitinoLocation: { catalog: string; database: string; table: string } | null;
  /** Neo4j 表节点 `etl_task_id`，与 PG `etl_task_info.id` 一致 */
  etlTaskInfoId: number | null;
}

/** 表详情 — 产出信息（分区明细） */
export function TableOutputTab({
  gravitinoLocation,
  etlTaskInfoId,
}: TableOutputTabProps): React.JSX.Element {
  const [partitionRows, setPartitionRows] = useState<EtlTablePartitionDetailRow[]>([]);
  const [partitionLoading, setPartitionLoading] = useState(false);
  const [partitionError, setPartitionError] = useState<string | null>(null);
  const [partitionPage, setPartitionPage] = useState(1);
  const [partitionPageSize, setPartitionPageSize] = useState(DEFAULT_PARTITION_PAGE_SIZE);
  const [partitionTotal, setPartitionTotal] = useState(0);
  const [resolvedEtlTaskName, setResolvedEtlTaskName] = useState<string | null>(null);
  const [resolvingEtlTaskName, setResolvingEtlTaskName] = useState(false);

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
      setPartitionRows([]);
      setPartitionTotal(0);
      setPartitionError(null);
      return;
    }
    loadPartitionPage(gravitinoLocation, partitionPage, partitionPageSize);
  }, [gravitinoLocation, partitionPage, partitionPageSize, loadPartitionPage]);

  /** 分区为空且 Neo4j 带 etl_task_id 时，解析 ETL 逻辑任务名用于跳转 */
  useEffect(() => {
    let cancelled = false;

    if (partitionLoading || partitionError) {
      return () => {
        cancelled = true;
      };
    }
    if (partitionRows.length > 0 || partitionTotal > 0) {
      setResolvedEtlTaskName(null);
      setResolvingEtlTaskName(false);
      return () => {
        cancelled = true;
      };
    }
    if (etlTaskInfoId == null) {
      setResolvedEtlTaskName(null);
      setResolvingEtlTaskName(false);
      return () => {
        cancelled = true;
      };
    }

    setResolvingEtlTaskName(true);
    setResolvedEtlTaskName(null);

    void (async () => {
      try {
        let name: string | null = null;
        if (gravitinoLocation) {
          const byTable = await etlAPI.getTaskNameByOutputTable(
            gravitinoLocation.catalog,
            gravitinoLocation.database,
            gravitinoLocation.table
          );
          name = byTable?.name ?? null;
        }
        if (!name) {
          const byId = await etlAPI.getTaskNameByInfoId(etlTaskInfoId);
          name = byId?.name ?? null;
        }
        if (!cancelled) setResolvedEtlTaskName(name);
      } catch {
        if (!cancelled) setResolvedEtlTaskName(null);
      } finally {
        if (!cancelled) setResolvingEtlTaskName(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    partitionLoading,
    partitionError,
    partitionRows.length,
    partitionTotal,
    gravitinoLocation,
    etlTaskInfoId,
  ]);

  const partitionTotalPages = Math.max(1, Math.ceil(partitionTotal / partitionPageSize));
  const showEtlEmptyHint =
    !partitionLoading &&
    !partitionError &&
    partitionRows.length === 0 &&
    partitionTotal === 0 &&
    etlTaskInfoId != null;

  if (!gravitinoLocation) {
    return (
      <div className="px-1 py-3">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          实体缺少 catalog_name / database_name / table_name，无法加载产出分区明细。
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col bg-white">
      {partitionLoading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-gray-500">
          <Loader2Icon className="size-5 animate-spin" />
          <span className="text-sm">加载产出分区…</span>
        </div>
      ) : partitionError ? (
        <div className="px-3 py-8 text-center text-sm text-gray-500">{partitionError}</div>
      ) : partitionRows.length === 0 ? (
        showEtlEmptyHint && resolvingEtlTaskName ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
            <Loader2Icon className="size-5 animate-spin text-gray-400" />
            解析 ETL 任务信息…
          </div>
        ) : showEtlEmptyHint && resolvedEtlTaskName ? (
          <div className="space-y-3 px-4 py-4">
            <p className="text-sm text-gray-800">暂无分区信息，已关联的ETL任务如下：</p>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm shadow-sm">
              <a
                href={`/etl?task=${encodeURIComponent(resolvedEtlTaskName)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 font-medium text-emerald-700 hover:text-emerald-800 hover:underline"
              >
                <ExternalLinkIcon className="size-4 shrink-0" aria-hidden />
                {resolvedEtlTaskName}
              </a>
              <p className="mt-2 font-mono text-xs text-gray-500">
                /etl?task={encodeURIComponent(resolvedEtlTaskName)}
              </p>
            </div>
          </div>
        ) : (
          <div className="px-3 py-8 text-center text-sm text-gray-400">暂无分区产出记录</div>
        )
      ) : (
        <>
          <div className="max-h-[min(70vh,520px)] min-h-0 overflow-auto">
            <table className="w-full min-w-[640px] border-collapse">
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
              <tbody className="divide-y divide-gray-100">
                {partitionRows.map(row => (
                  <tr key={row.id} className="transition-colors hover:bg-gray-50/80">
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-800">{row.primaryPartitionKey}</td>
                    <td
                      className="max-w-[180px] truncate px-3 py-2.5 font-mono text-xs text-gray-600"
                      title={row.secondaryPartitionKey}
                    >
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
          {!partitionLoading && !partitionError && partitionTotal > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 bg-gray-50/90 px-3 py-2 text-xs text-gray-600">
            <span>共 {partitionTotal} 条 · 按分区日期倒序</span>
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
                  className="inline-flex items-center rounded border border-gray-200 bg-white p-1 hover:bg-gray-100 disabled:pointer-events-none disabled:opacity-40"
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
                  className="inline-flex items-center rounded border border-gray-200 bg-white p-1 hover:bg-gray-100 disabled:pointer-events-none disabled:opacity-40"
                  title="下一页"
                  aria-label="下一页"
                >
                  <ChevronRightIcon className="size-4" />
                </button>
              </div>
            </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
