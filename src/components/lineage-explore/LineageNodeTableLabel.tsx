import { LineageGraphEllipsisText } from './LineageGraphEllipsisText';

interface LineageNodeTableLabelProps {
  name: string;
}

/** 血缘图节点表名：超出宽度省略，hover 展示全名并可复制 */
export function LineageNodeTableLabel({ name }: LineageNodeTableLabelProps): React.JSX.Element {
  return (
    <LineageGraphEllipsisText
      text={name}
      className="text-sm font-medium text-gray-800"
      lines={1}
      copyable
    />
  );
}
