import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import {
  QUALITY_RULE_OPERATOR_LABELS,
  QUALITY_RULE_OPERATORS,
  defaultQualityRulesBundle,
  parseQualityRulesFromJsonText,
  qualityRulesBundleToJsonText,
  qualityRulesIsLegacyJsonArray,
  type EtlQualityRuleTriple,
  type EtlQualityRulesBundle,
  type QualityRuleOperator,
} from '../../utils/etlQualityRules';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { useToast } from '../ui/toast';

interface EtlQualityRulesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  qualityRulesJson: string;
  onSave: (nextQualityRulesJson: string) => void;
}

function emptyRule(): EtlQualityRuleTriple {
  return { expression: '', operator: 'gte', value: 0 };
}

export function EtlQualityRulesModal({
  open,
  onOpenChange,
  qualityRulesJson,
  onSave,
}: EtlQualityRulesModalProps): React.JSX.Element {
  const { toast } = useToast();
  const [bundle, setBundle] = useState<EtlQualityRulesBundle>(defaultQualityRulesBundle());
  const [legacy, setLegacy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLegacy(qualityRulesIsLegacyJsonArray(qualityRulesJson));
    const parsed = parseQualityRulesFromJsonText(qualityRulesJson);
    const sql =
      parsed.sqlQueries.length > 0 ? parsed.sqlQueries : [''];
    setBundle({ sqlQueries: sql, rules: parsed.rules.length > 0 ? parsed.rules : [] });
  }, [open, qualityRulesJson]);

  const setSql = (index: number, sql: string) => {
    setBundle(prev => ({
      ...prev,
      sqlQueries: prev.sqlQueries.map((s, i) => (i === index ? sql : s)),
    }));
  };

  const addSql = () => {
    setBundle(prev => ({ ...prev, sqlQueries: [...prev.sqlQueries, ''] }));
  };

  const removeSql = (index: number) => {
    setBundle(prev => ({
      ...prev,
      sqlQueries:
        prev.sqlQueries.length <= 1 ? [''] : prev.sqlQueries.filter((_, i) => i !== index),
    }));
  };

  const setRule = (index: number, partial: Partial<EtlQualityRuleTriple>) => {
    setBundle(prev => ({
      ...prev,
      rules: prev.rules.map((r, i) => (i === index ? { ...r, ...partial } : r)),
    }));
  };

  const addRule = () => {
    setBundle(prev => ({ ...prev, rules: [...prev.rules, emptyRule()] }));
  };

  const removeRule = (index: number) => {
    setBundle(prev => ({ ...prev, rules: prev.rules.filter((_, i) => i !== index) }));
  };

  const handleSave = () => {
    for (const r of bundle.rules) {
      if (!r.expression.trim()) continue;
      if (!Number.isFinite(r.value)) {
        toast('已填写表达式的规则须配置合法阈值（整数或小数）', 'error');
        return;
      }
    }
    const text = qualityRulesBundleToJsonText(bundle);
    onSave(text);
    setLegacy(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-5xl max-h-[90vh] overflow-y-auto gap-3"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle>配置质检规则</DialogTitle>
          <p className="text-xs text-muted-foreground">
            先填写多条质检 SQL（execution 后得到 result1、result2…），再在下方用三段式配置：左侧表达式（JS 语法）、比较符、阈值（整数或小数）。
          </p>
        </DialogHeader>

        {legacy && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
            当前为旧版 JSON 数组格式，保存本弹窗后将转为新格式（sqlQueries + rules）。
          </div>
        )}

        <div className="space-y-2">
          <div className="text-xs font-semibold text-gray-700">质检 SQL</div>
          <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
            {bundle.sqlQueries.map((sql, index) => (
              <div key={index} className="flex gap-2 items-start">
                <span className="shrink-0 text-[10px] text-gray-500 pt-2 w-14">SQL {index + 1}</span>
                <textarea
                  className="flex-1 min-h-[72px] rounded border border-gray-200 px-2 py-1.5 font-mono text-[11px]"
                  value={sql}
                  onChange={e => setSql(index, e.target.value)}
                  placeholder="SELECT …"
                />
                <button
                  type="button"
                  className="shrink-0 rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600 mt-1"
                  title="删除本条 SQL"
                  onClick={() => removeSql(index)}
                >
                  <Trash2Icon className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="justify-self-start">
            <button
              type="button"
              onClick={addSql}
              className="inline-flex w-fit max-w-full items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
            >
              <PlusIcon className="size-3.5 shrink-0" />
              添加 SQL
            </button>
          </div>
        </div>

        <div className="space-y-2 border-t border-gray-100 pt-3">
          <div className="text-xs font-semibold text-gray-700">质检规则（三段式）</div>
          <div className="overflow-x-auto rounded-md border border-gray-200">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-600">
                  <th className="px-2 py-1.5 font-medium min-w-[200px]">表达式（JS）</th>
                  <th className="px-2 py-1.5 font-medium w-28">操作符</th>
                  <th className="px-2 py-1.5 font-medium w-28">阈值</th>
                  <th className="px-2 py-1.5 font-medium w-12 text-center">操作</th>
                </tr>
              </thead>
              <tbody>
                {bundle.rules.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-center text-[11px] text-gray-400">
                      暂无规则，可点击下方「添加规则」。
                    </td>
                  </tr>
                ) : (
                  bundle.rules.map((rule, index) => (
                    <tr key={index} className="border-b border-gray-100 align-top">
                      <td className="p-1">
                        <input
                          className="w-full rounded border border-gray-200 px-1.5 py-1 font-mono text-[11px]"
                          value={rule.expression}
                          onChange={e => setRule(index, { expression: e.target.value })}
                          placeholder="result1.length、result2.map(...).filter(...).length"
                        />
                      </td>
                      <td className="p-1">
                        <select
                          className="w-full rounded border border-gray-200 px-1 py-1 text-[11px]"
                          value={rule.operator}
                          onChange={e =>
                            setRule(index, { operator: e.target.value as QualityRuleOperator })
                          }
                        >
                          {QUALITY_RULE_OPERATORS.map(op => (
                            <option key={op} value={op}>
                              {QUALITY_RULE_OPERATOR_LABELS[op]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-1">
                        <input
                          type="number"
                          step="any"
                          className="w-full rounded border border-gray-200 px-1.5 py-1 font-mono text-[11px]"
                          value={Number.isFinite(rule.value) ? rule.value : ''}
                          onChange={e => {
                            const v = e.target.value === '' ? NaN : Number.parseFloat(e.target.value);
                            setRule(index, { value: Number.isFinite(v) ? v : 0 });
                          }}
                        />
                      </td>
                      <td className="p-1 text-center">
                        <button
                          type="button"
                          className="inline-flex rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-red-600"
                          title="删除"
                          onClick={() => removeRule(index)}
                        >
                          <Trash2Icon className="size-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="justify-self-start">
            <button
              type="button"
              onClick={addRule}
              className="inline-flex w-fit max-w-full items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
            >
              <PlusIcon className="size-3.5 shrink-0" />
              添加规则
            </button>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" onClick={handleSave}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
