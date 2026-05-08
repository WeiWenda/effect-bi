import { useEffect, useState } from 'react';
import { Loader2Icon } from 'lucide-react';
import { gravitinoAPI, type ColumnInfo } from '../../services/gravitinoApi';

function columnTypeString(col: ColumnInfo): string {
  return typeof col.type === 'string' ? col.type : (col.type as { type: string }).type;
}

interface TableFieldsTabProps {
  gravitinoLocation: { catalog: string; database: string; table: string } | null;
}

/** 表详情 — 字段信息（Gravitino） */
export function TableFieldsTab({ gravitinoLocation }: TableFieldsTabProps): React.JSX.Element {
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [columnsLoading, setColumnsLoading] = useState(false);
  const [columnsError, setColumnsError] = useState<string | null>(null);

  useEffect(() => {
    if (!gravitinoLocation) {
      setColumns([]);
      setColumnsError(null);
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

  if (!gravitinoLocation) {
    return (
      <div className="px-1 py-3">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          实体缺少 catalog_name / database_name / table_name，无法加载 Gravitino 字段。
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-0 bg-white">
      {columnsLoading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-gray-500">
          <Loader2Icon className="size-5 animate-spin" />
          <span className="text-sm">加载字段…</span>
        </div>
      ) : columnsError ? (
        <div className="px-3 py-8 text-center text-sm text-gray-500">{columnsError}</div>
      ) : columns.length === 0 ? (
        <div className="px-3 py-8 text-center text-sm text-gray-400">暂无字段</div>
      ) : (
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-[1] border-b border-gray-200 bg-gray-50">
            <tr>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700">字段名</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700">类型</th>
              <th className="w-16 px-2 py-3 text-left text-xs font-semibold text-gray-700">可空</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700">注释</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {columns.map(col => (
              <tr key={col.name} className="transition-colors hover:bg-gray-50/80">
                <td className="px-3 py-2.5 text-sm font-medium text-gray-800">{col.name}</td>
                <td className="px-3 py-2.5 font-mono text-sm text-gray-600">{columnTypeString(col)}</td>
                <td className="px-2 py-2.5 text-sm text-gray-600">{col.nullable ? '是' : '否'}</td>
                <td className="max-w-[min(320px,40vw)] truncate px-3 py-2.5 text-sm text-gray-600" title={col.comment}>
                  {col.comment?.trim() ? col.comment : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
