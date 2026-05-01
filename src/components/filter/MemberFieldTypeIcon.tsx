import { ClockIcon, HashIcon, TypeIcon } from 'lucide-react';
import { isNumberType, isTimeType } from '../../utils/filterOperatorUi';

/** 列表/下拉中按 Cube 成员类型展示的小图标（与看板维度选择一致） */
export function MemberFieldTypeIcon({ type }: { type: string }): React.JSX.Element {
  if (isTimeType(type)) return <ClockIcon className="size-3 text-orange-500 shrink-0" />;
  if (isNumberType(type)) return <HashIcon className="size-3 text-green-500 shrink-0" />;
  return <TypeIcon className="size-3 text-blue-400 shrink-0" />;
}
