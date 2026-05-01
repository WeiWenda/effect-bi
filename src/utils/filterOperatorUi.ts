import type { FilterOperator } from '../types/chart';

const STRING_OPERATORS: { value: FilterOperator; label: string }[] = [
  { value: 'equals', label: '等于' },
  { value: 'notEquals', label: '不等于' },
  { value: 'contains', label: '包含' },
  { value: 'notContains', label: '不包含' },
  { value: 'set', label: '有值' },
  { value: 'notSet', label: '无值' },
];

const NUMBER_OPERATORS: { value: FilterOperator; label: string }[] = [
  { value: 'equals', label: '等于' },
  { value: 'notEquals', label: '不等于' },
  { value: 'gt', label: '大于' },
  { value: 'gte', label: '大于等于' },
  { value: 'lt', label: '小于' },
  { value: 'lte', label: '小于等于' },
  { value: 'set', label: '有值' },
  { value: 'notSet', label: '无值' },
];

const TIME_OPERATORS: { value: FilterOperator; label: string }[] = [
  { value: 'inDateRange', label: '在范围内' },
  { value: 'notInDateRange', label: '不在范围内' },
  { value: 'set', label: '有值' },
  { value: 'notSet', label: '无值' },
];

/** 与 Cube 成员类型对应的操作符列表（查询侧静态/动态配置、看板筛选编辑共用） */
export function getOperatorsForType(type: string): { value: FilterOperator; label: string }[] {
  const lower = type.toLowerCase();
  if (lower.includes('time') || lower.includes('date') || lower.includes('timestamp')) return TIME_OPERATORS;
  if (
    lower.includes('int') ||
    lower.includes('decimal') ||
    lower.includes('float') ||
    lower.includes('double') ||
    lower.includes('numeric') ||
    lower === 'number'
  ) {
    return NUMBER_OPERATORS;
  }
  return STRING_OPERATORS;
}

export function isTimeType(type: string): boolean {
  const lower = type.toLowerCase();
  return lower.includes('time') || lower.includes('date') || lower.includes('timestamp');
}

export function isNumberType(type: string): boolean {
  const lower = type.toLowerCase();
  return (
    lower.includes('int') ||
    lower.includes('decimal') ||
    lower.includes('float') ||
    lower.includes('double') ||
    lower.includes('numeric') ||
    lower === 'number'
  );
}

export function isNoValueOperator(op: FilterOperator): boolean {
  return op === 'set' || op === 'notSet';
}

export function isRangeOperator(op: FilterOperator): boolean {
  return op === 'inDateRange' || op === 'notInDateRange';
}

/** 与 {@link getOperatorsForType} 一致的中文标签；不含 `in` / `notIn`（见 FilterValueBar 扩展列表） */
export function getOperatorLabel(op: FilterOperator): string {
  for (const list of [STRING_OPERATORS, NUMBER_OPERATORS, TIME_OPERATORS]) {
    const hit = list.find(o => o.value === op);
    if (hit) return hit.label;
  }
  return op;
}
