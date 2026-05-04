import { useState, useEffect, useCallback } from 'react';
import { SearchIcon, Loader2Icon, Trash2Icon, KeyIcon } from 'lucide-react';
import { gravitinoAPI, ColumnInfo } from '../../services/gravitinoApi';

interface TableNodeInfo {
  id: string;
  catalog: string;
  database: string;
  table: string;
  type: 'table' | 'sql';
  sql?: string;
  sqlFields?: string[];
  primaryKeys?: string[];
}

export type FieldRole = 'measure' | 'dimension';

const ROLE_LABELS: Record<FieldRole, string> = {
  measure: '指标',
  dimension: '维度',
};

export interface FieldItem {
  id: string;
  tableId: string;
  tableName: string;
  fieldName: string;
  datatype: string;
  role: FieldRole;
  isOutput: boolean;
  expression: string;
  fieldDescription: string;
  isManual: boolean;
  isPrimaryKey: boolean;
}

interface FieldListPanelProps {
  tableNodes: TableNodeInfo[];
  fields: FieldItem[];
  setFields: React.Dispatch<React.SetStateAction<FieldItem[]>>;
}

export function FieldListPanel({ tableNodes, fields, setFields }: FieldListPanelProps): React.JSX.Element {
  const [loading, setLoading] = useState(false);
  const [filterTable, setFilterTable] = useState<string>('');
  const [filterField, setFilterField] = useState<string>('');

  const loadFields = useCallback(async () => {
    if (tableNodes.length === 0) {
      setFields([]);
      return;
    }
    setLoading(true);
    try {
      const allFields: FieldItem[] = [];
      for (const node of tableNodes) {
        try {
          // SQL node: use sqlFields from node data
          if (node.type === 'sql') {
            const sqlFields = node.sqlFields || [];
            const primaryKeys = new Set(node.primaryKeys || []);
            const columns: FieldItem[] = sqlFields.map((fieldName: string) => ({
              id: `${node.id}-${fieldName}`,
              tableId: node.id,
              tableName: node.table,
              fieldName,
              datatype: 'string',
              role: 'dimension' as FieldRole,
              isOutput: true,
              expression: '',
              fieldDescription: '',
              isManual: false,
              isPrimaryKey: primaryKeys.has(fieldName),
            }));
            allFields.push(...columns);
            continue;
          }
          // Table node: load from API
          const response = await gravitinoAPI.getTableDetail(node.catalog, node.database, node.table);
          // Extract primary key field names from indexes
          const primaryKeyFields = new Set<string>();
          if (response.table.indexes) {
            for (const idx of response.table.indexes) {
              if (idx.indexType === 'PRIMARY_KEY') {
                for (const fn of idx.fieldNames) {
                  for (const f of fn) primaryKeyFields.add(f);
                }
              }
            }
          }
          const columns: FieldItem[] = response.table.columns.map((col: ColumnInfo) => ({
            id: `${node.id}-${col.name}`,
            tableId: node.id,
            tableName: node.table,
            fieldName: col.name,
            datatype: typeof col.type === 'string' ? col.type : (col.type as { type: string }).type,
            role: 'dimension' as FieldRole,
            isOutput: true,
            expression: '',
            fieldDescription: col.comment || '',
            isManual: false,
            isPrimaryKey: primaryKeyFields.has(col.name),
          }));
          allFields.push(...columns);
        } catch (err) {
          console.error(`Error loading columns for ${node.table}:`, err);
        }
      }
      setFields(prev => {
        const existingMap = new Map(prev.map(f => [f.id, f]));
        const updatedFields = allFields.map(f => {
          const existing = existingMap.get(f.id);
          if (existing) {
            return {
              ...f,
              role: existing.role,
              isOutput: existing.isOutput,
              expression: existing.expression,
              fieldDescription: existing.fieldDescription || f.fieldDescription,
              datatype: existing.datatype,
              isManual: false,
              isPrimaryKey: f.isPrimaryKey,
            };
          }
          return f;
        });
        // Preserve manual fields that are not in allFields
        const manualFields = prev.filter(f => f.isManual && !allFields.some(af => af.id === f.id));
        return [...updatedFields, ...manualFields];
      });
    } catch (err) {
      console.error('Error loading fields:', err);
    } finally {
      setLoading(false);
    }
  }, [tableNodes]);

  useEffect(() => {
    loadFields();
  }, [loadFields]);

  const updateField = (fieldId: string, updates: Partial<FieldItem>) => {
    setFields(prev => prev.map(f => f.id === fieldId ? { ...f, ...updates } : f));
  };

  const addManualField = () => {
    const newField: FieldItem = {
      id: `manual-${Date.now()}`,
      tableId: '',
      tableName: '',
      fieldName: '',
      datatype: '',
      role: 'measure',
      isOutput: true,
      expression: '',
      fieldDescription: '',
      isManual: true,
      isPrimaryKey: false,
    };
    setFields(prev => [...prev, newField]);
  };

  const deleteField = (fieldId: string) => {
    setFields(prev => prev.filter(f => f.id !== fieldId));
  };

  const filteredFields = fields.filter(f => {
    if (filterTable && f.tableName !== filterTable) return false;
    if (filterField && !f.fieldName.toLowerCase().includes(filterField.toLowerCase())) return false;
    return true;
  });

  const tableNames = [...new Set(tableNodes.map(n => n.table))];

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Search Bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-200 bg-gray-50 shrink-0">
        <SearchIcon className="size-4 text-gray-400 shrink-0" />
        <select
          value={filterTable}
          onChange={e => setFilterTable(e.target.value)}
          className="text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-[140px]"
        >
          <option value="">全部表</option>
          {tableNames.map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="搜索字段名..."
          value={filterField}
          onChange={e => setFilterField(e.target.value)}
          className="text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 w-[160px]"
        />
        <button
          onClick={addManualField}
          className="text-sm text-blue-500 hover:text-blue-600 shrink-0"
        >
          + 新增字段
        </button>
        <button
          onClick={loadFields}
          className="text-sm text-blue-500 hover:text-blue-600 shrink-0"
          disabled={loading}
        >
          {loading ? <Loader2Icon className="size-4 animate-spin" /> : '刷新字段'}
        </button>
      </div>

      {/* Field Table */}
      <div className="flex-1 overflow-auto">
        {filteredFields.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-gray-400">
            {tableNodes.length === 0 ? '请将表拖入画布' : '暂无字段数据'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 z-10">
              <tr className="border-b border-gray-200">
                <th className="text-center px-3 py-2 font-medium text-gray-600 whitespace-nowrap">输出</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 whitespace-nowrap">表名</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 whitespace-nowrap">字段名</th>
                <th className="text-center px-3 py-2 font-medium text-gray-600 whitespace-nowrap">字段类别</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 whitespace-nowrap">描述</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 whitespace-nowrap">表达式</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 whitespace-nowrap">数据类型</th>
                <th className="text-center px-3 py-2 font-medium text-gray-600 whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredFields.map(field => (
                <tr key={field.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={field.isOutput}
                      onChange={e => updateField(field.id, { isOutput: e.target.checked })}
                      className="rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-3 py-1.5 text-gray-700 whitespace-nowrap">{field.isManual ? '' : field.tableName}</td>
                  <td className="px-3 py-1.5">
                    {field.isManual ? (
                      <input
                        type="text"
                        value={field.fieldName}
                        onChange={e => updateField(field.id, { fieldName: e.target.value })}
                        placeholder="字段名"
                        className="w-full text-sm border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-transparent"
                      />
                    ) : (
                      <span className="text-gray-700 whitespace-nowrap inline-flex items-center gap-1">
                        {field.fieldName}
                        {field.isPrimaryKey && <KeyIcon className="size-3 text-amber-500" title="Primary Key" />}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-center whitespace-nowrap">
                    <div className="inline-flex rounded-md shadow-sm">
                      <button
                        type="button"
                        onClick={() => updateField(field.id, { role: 'measure' })}
                        className={`relative inline-flex items-center rounded-l-md px-2 py-0.5 text-xs font-medium ${field.role === 'measure' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                      >
                        {ROLE_LABELS.measure}
                      </button>
                      <button
                        type="button"
                        onClick={() => updateField(field.id, { role: 'dimension' })}
                        className={`relative -ml-px inline-flex items-center rounded-r-md px-2 py-0.5 text-xs font-medium ${field.role === 'dimension' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                      >
                        {ROLE_LABELS.dimension}
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="text"
                      value={field.fieldDescription}
                      onChange={e => updateField(field.id, { fieldDescription: e.target.value })}
                      placeholder="描述"
                      className="w-full text-sm border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-transparent"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="text"
                      value={field.expression}
                      onChange={e => updateField(field.id, { expression: e.target.value })}
                      placeholder="表达式*"
                      className={`w-full text-sm border rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 ${!field.expression && field.isManual ? 'border-red-300 focus:ring-red-500' : 'border-gray-200 focus:ring-blue-500'} bg-transparent`}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="text"
                      value={field.datatype}
                      onChange={e => updateField(field.id, { datatype: e.target.value })}
                      placeholder="类型*"
                      className={`w-full text-sm border rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 ${!field.datatype && field.isManual ? 'border-red-300 focus:ring-red-500' : 'border-gray-200 focus:ring-blue-500'} bg-transparent`}
                    />
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    {field.isManual && (
                      <button
                        onClick={() => deleteField(field.id)}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                        title="删除字段"
                      >
                        <Trash2Icon className="size-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
