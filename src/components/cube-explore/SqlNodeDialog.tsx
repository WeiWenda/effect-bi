import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { ModelType } from './CubeCanvas';

interface SqlNodeDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (data: { tableName: string; sql: string; sqlFields: string[]; primaryKeys: string[]; modelType: ModelType }) => void;
  initialTableName?: string;
  initialSql?: string;
  initialSqlFields?: string[];
  initialPrimaryKeys?: string[];
  initialModelType?: ModelType;
  hasExistingFact: boolean;
  currentModelType: ModelType;
}

export function SqlNodeDialog({
  open,
  onClose,
  onConfirm,
  initialTableName = '',
  initialSql = '',
  initialSqlFields = [],
  initialPrimaryKeys = [],
  initialModelType = 'dim',
  hasExistingFact,
  currentModelType,
}: SqlNodeDialogProps): React.JSX.Element {
  const [tableName, setTableName] = useState(initialTableName);
  const [sql, setSql] = useState(initialSql);
  const [sqlFields, setSqlFields] = useState<string[]>(initialSqlFields);
  const [primaryKeys, setPrimaryKeys] = useState<string[]>(initialPrimaryKeys);
  const [newField, setNewField] = useState('');
  const [modelType, setModelType] = useState<ModelType>(initialModelType);

  useEffect(() => {
    if (open) {
      setTableName(initialTableName);
      setSql(initialSql);
      setSqlFields(initialSqlFields.length > 0 ? [...initialSqlFields] : []);
      setPrimaryKeys(initialPrimaryKeys.length > 0 ? [...initialPrimaryKeys] : []);
      setNewField('');
      setModelType(initialModelType);
    }
  }, [open, initialTableName, initialSql, initialSqlFields, initialPrimaryKeys, initialModelType]);

  const addField = () => {
    const trimmed = newField.trim();
    if (trimmed && !sqlFields.includes(trimmed)) {
      setSqlFields(prev => [...prev, trimmed]);
      setNewField('');
    }
  };

  const removeField = (field: string) => {
    setSqlFields(prev => prev.filter(f => f !== field));
    setPrimaryKeys(prev => prev.filter(f => f !== field));
  };

  const handleConfirm = () => {
    if (tableName.trim() && sql.trim()) {
      onConfirm({ tableName: tableName.trim(), sql: sql.trim(), sqlFields, primaryKeys, modelType });
      onClose();
    }
  };

  const canConfirm = tableName.trim() !== '' && sql.trim() !== '';

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>SQL 节点配置</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Table Name */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">表名称</label>
            <input
              type="text"
              value={tableName}
              onChange={e => setTableName(e.target.value)}
              placeholder="输入表名称..."
              className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            />
          </div>

          {/* Model Type */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">节点类型</label>
            <div className="inline-flex rounded-md shadow-sm">
              <button
                type="button"
                onClick={() => {
                  if (modelType !== 'fact' || !hasExistingFact) setModelType('fact');
                }}
                className={`rounded-l-md px-3 py-1.5 text-xs font-medium transition-colors ${modelType === 'fact' ? 'bg-amber-500 text-white' : hasExistingFact && currentModelType !== 'fact' ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                disabled={modelType !== 'fact' && hasExistingFact}
              >
                Fact
              </button>
              <button
                type="button"
                onClick={() => setModelType('dim')}
                className={`-ml-px rounded-r-md px-3 py-1.5 text-xs font-medium transition-colors ${modelType === 'dim' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                Dim
              </button>
            </div>
          </div>

          {/* SQL Content */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">SQL 内容</label>
            <textarea
              value={sql}
              onChange={e => setSql(e.target.value)}
              placeholder="SELECT * FROM table..."
              rows={6}
              className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white font-mono resize-y"
            />
          </div>

          {/* Result Fields */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">结果字段列表</label>
            <div className="flex items-center gap-2 mb-2">
              <input
                type="text"
                value={newField}
                onChange={e => setNewField(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addField(); } }}
                placeholder="输入字段名后添加..."
                className="flex-1 text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
              <Button size="sm" onClick={addField} disabled={!newField.trim()}>
                <PlusIcon className="size-3.5" />
                添加
              </Button>
            </div>
            {sqlFields.length > 0 && (
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-auto border border-gray-200 rounded-md p-2 bg-gray-50">
                {sqlFields.map(field => (
                  <span key={field} className={`inline-flex items-center gap-1 px-2 py-0.5 border rounded text-xs ${primaryKeys.includes(field) ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-white border-gray-300 text-gray-700'}`}>
                    <input
                      type="checkbox"
                      checked={primaryKeys.includes(field)}
                      onChange={e => {
                        if (e.target.checked) {
                          setPrimaryKeys(prev => [...prev, field]);
                        } else {
                          setPrimaryKeys(prev => prev.filter(f => f !== field));
                        }
                      }}
                      className="rounded border-gray-300 text-amber-500 focus:ring-amber-500"
                      title="Primary Key"
                    />
                    {field}
                    <button
                      type="button"
                      onClick={() => removeField(field)}
                      className="text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2Icon className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={handleConfirm} disabled={!canConfirm}>确认</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
