import { DatabaseIcon } from 'lucide-react';

export function EtlDdlPlaceholderTab(): React.JSX.Element {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-8 py-12 bg-gray-50/80">
      <DatabaseIcon className="size-12 text-gray-300 mb-4" />
      <h2 className="text-base font-semibold text-gray-700 mb-2">建表</h2>
      <p className="text-sm text-gray-500 max-w-md leading-relaxed">
        该功能将支持在 Gravitino / 数仓侧创建与管理表结构。当前为占位页，后续可与左侧元数据树联动。
      </p>
    </div>
  );
}
