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
  ALERT_CHANNEL_LABELS,
  ALERT_CHANNELS,
  ALERT_STRATEGY_LABELS,
  ALERT_STRATEGIES,
  alertRulesBundleToJsonText,
  defaultAlertRulesBundle,
  emptyAlertRule,
  isValidHHmm,
  parseAlertRulesFromJsonText,
  type EtlAlertRuleRow,
  type EtlAlertRulesBundle,
  type AlertChannel,
  type AlertStrategy,
} from '../../utils/etlAlertRules';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { useToast } from '../ui/toast';

interface EtlAlertRulesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  alertRulesJson: string;
  onSave: (nextAlertRulesJson: string) => void;
}

export function EtlAlertRulesModal({
  open,
  onOpenChange,
  alertRulesJson,
  onSave,
}: EtlAlertRulesModalProps): React.JSX.Element {
  const { toast } = useToast();
  const [bundle, setBundle] = useState<EtlAlertRulesBundle>(defaultAlertRulesBundle());

  useEffect(() => {
    if (!open) return;
    const parsed = parseAlertRulesFromJsonText(alertRulesJson);
    setBundle(
      parsed.rules.length > 0 ? parsed : { rules: [emptyAlertRule()] }
    );
  }, [open, alertRulesJson]);

  const setRule = (index: number, partial: Partial<EtlAlertRuleRow>) => {
    setBundle(prev => ({
      ...prev,
      rules: prev.rules.map((r, i) => (i === index ? { ...r, ...partial } : r)),
    }));
  };

  const addRule = () => {
    setBundle(prev => ({ ...prev, rules: [...prev.rules, emptyAlertRule()] }));
  };

  const removeRule = (index: number) => {
    setBundle(prev => ({
      ...prev,
      rules:
        prev.rules.length <= 1 ? [emptyAlertRule()] : prev.rules.filter((_, i) => i !== index),
    }));
  };

  const handleSave = () => {
    for (const r of bundle.rules) {
      if (!r.recipients.trim()) continue;
      if (r.strategy === 'daily_cumulative_failures') {
        const n = Math.floor(r.cumulativeFailureThreshold);
        if (!Number.isFinite(n) || n < 1) {
          toast('「当天累计失败」策略需填写大于等于 1 的次数', 'error');
          return;
        }
      }
      if (r.strategy === 'success_later_than_time') {
        if (!isValidHHmm(r.successLateThanTime)) {
          toast('「运行成功晚于指定时刻」需填写合法时刻 HH:mm（如 09:30）', 'error');
          return;
        }
      }
    }
    const text = alertRulesBundleToJsonText(bundle);
    onSave(text);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-5xl max-h-[90vh] overflow-y-auto gap-3"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle>配置任务报警</DialogTitle>
          <p className="text-xs text-muted-foreground">
            每行一条规则：接收人、报警策略、手段、时段（不填时段表示全天；填写如 09:00~18:00 表示触发后延迟至该时段内发送）。策略「运行成功晚于指定时刻」表示成功结束时间若晚于当日该时刻则报警，第三列填 HH:mm。
          </p>
        </DialogHeader>

        <div className="overflow-x-auto rounded-md border border-gray-200">
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-600">
                <th className="px-2 py-1.5 font-medium min-w-[100px]">报警接收人</th>
                <th className="px-2 py-1.5 font-medium min-w-[120px]">报警策略</th>
                <th className="px-2 py-1.5 font-medium w-[5.5rem]">次数/时刻</th>
                <th className="px-2 py-1.5 font-medium w-28">报警手段</th>
                <th className="px-2 py-1.5 font-medium min-w-[100px]">报警时段</th>
                <th className="px-2 py-1.5 font-medium w-12 text-center">操作</th>
              </tr>
            </thead>
            <tbody>
              {bundle.rules.map((rule, index) => (
                <tr key={index} className="border-b border-gray-100 align-top">
                  <td className="p-1">
                    <input
                      className="w-full rounded border border-gray-200 px-1.5 py-1"
                      value={rule.recipients}
                      onChange={e => setRule(index, { recipients: e.target.value })}
                      placeholder="账号 / 手机 / 邮箱等"
                    />
                  </td>
                  <td className="p-1">
                    <select
                      className="w-full rounded border border-gray-200 px-1 py-1"
                      value={rule.strategy}
                      onChange={e =>
                        setRule(index, { strategy: e.target.value as AlertStrategy })
                      }
                    >
                      {ALERT_STRATEGIES.map(s => (
                        <option key={s} value={s}>
                          {ALERT_STRATEGY_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-1">
                    {rule.strategy === 'daily_cumulative_failures' ? (
                      <input
                        type="number"
                        min={1}
                        className="w-full rounded border border-gray-200 px-1 py-1"
                        value={rule.cumulativeFailureThreshold}
                        onChange={e =>
                          setRule(index, {
                            cumulativeFailureThreshold: parseInt(e.target.value, 10) || 1,
                          })
                        }
                      />
                    ) : rule.strategy === 'success_later_than_time' ? (
                      <input
                        className="w-full rounded border border-gray-200 px-1 py-1 font-mono text-[10px]"
                        value={rule.successLateThanTime}
                        onChange={e => setRule(index, { successLateThanTime: e.target.value })}
                        placeholder="09:30"
                      />
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="p-1">
                    <select
                      className="w-full rounded border border-gray-200 px-1 py-1"
                      value={rule.channel}
                      onChange={e =>
                        setRule(index, { channel: e.target.value as AlertChannel })
                      }
                    >
                      {ALERT_CHANNELS.map(c => (
                        <option key={c} value={c}>
                          {ALERT_CHANNEL_LABELS[c]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-1">
                    <input
                      className="w-full rounded border border-gray-200 px-1.5 py-1 font-mono text-[10px]"
                      value={rule.alertTimeWindow}
                      onChange={e => setRule(index, { alertTimeWindow: e.target.value })}
                      placeholder="留空=全天"
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
              ))}
            </tbody>
          </table>
        </div>

        <div className="justify-self-start">
          <button
            type="button"
            onClick={addRule}
            className="inline-flex w-fit max-w-full items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-50 hover:text-amber-900"
          >
            <PlusIcon className="size-3.5 shrink-0" />
            添加一行
          </button>
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
