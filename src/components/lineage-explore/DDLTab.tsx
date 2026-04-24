import { parseDDL } from './ddlParser';

interface DDLTabProps {
  ddl: string;
}

export function DDLTab({ ddl }: DDLTabProps): React.JSX.Element {
  const fields = parseDDL(ddl);

  return (
    <div className="p-6">
      {fields.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p>暂无 DDL 信息</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">字段名</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">类型</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">注释</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field, index) => (
                <tr
                  key={index}
                  className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                >
                  <td className="px-6 py-4 text-sm text-gray-800 font-medium">{field.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 font-mono">{field.type}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{field.comment || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
