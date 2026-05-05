import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2Icon } from 'lucide-react';
import {
  fetchCatalogNamesCached,
  fetchDatabaseNamesCached,
  fetchTableNamesCached,
} from '../../services/gravitinoMetadataCache';
import { Select, type SelectOption } from '../ui/select';

export interface GravitinoTripleValue {
  catalog: string;
  database: string;
  table: string;
}

export function mergeOptionList(options: string[], current: string): string[] {
  const c = current.trim();
  if (!c || options.includes(c)) return options;
  return [...options, c];
}

export interface GravitinoTripleSelectProps {
  value: GravitinoTripleValue;
  onChange: (next: GravitinoTripleValue) => void;
  /** When false, skip network (e.g. hidden tab) */
  enabled?: boolean;
  /** `tableCells`: 三个 `<td>` 供表格行使用；`inlineRow`: 非表格内从左到右一行；`stacked`: 纵向表单项 */
  variant?: 'tableCells' | 'stacked' | 'inlineRow';
  className?: string;
  /**
   * 在 Dialog 等带 transform 的容器内应设为 true，下拉挂到 portal 根节点或 body，避免错位/裁切。
   */
  portal?: boolean;
  /** 与 `portal` 同用：传入 Dialog 内容区内的挂载点，否则下拉搜索框无法获得焦点（Radix 焦点陷阱） */
  portalContainer?: HTMLElement | null;
  /** 选项较多时开启搜索（Catalog / Database / Table 均支持） */
  searchable?: boolean;
}

function namesToOptions(names: string[], emptyLabel: string): SelectOption[] {
  return [{ value: '', label: emptyLabel }, ...names.map(n => ({ value: n, label: n }))];
}

/** Catalog → Database → Table（中间层名称在本产品中为 database）。 */
export function GravitinoTripleSelect({
  value,
  onChange,
  enabled = true,
  variant = 'tableCells',
  className = '',
  portal = false,
  portalContainer = null,
  searchable = true,
}: GravitinoTripleSelectProps): React.JSX.Element {
  const [catalogOptions, setCatalogOptions] = useState<string[]>([]);
  const [catalogsLoading, setCatalogsLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [databaseOptions, setDatabaseOptions] = useState<string[]>([]);
  const [databaseLoading, setDatabaseLoading] = useState(false);
  const [tableOptions, setTableOptions] = useState<string[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);

  const cat = value.catalog.trim();
  const dbMid = value.database.trim();

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setCatalogsLoading(true);
    setCatalogError(null);
    void fetchCatalogNamesCached()
      .then(names => {
        if (!cancelled) setCatalogOptions(names);
      })
      .catch(err => {
        console.error(err);
        if (!cancelled) setCatalogError('无法加载 Gravitino catalog');
      })
      .finally(() => {
        if (!cancelled) setCatalogsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const loadDatabaseOptions = useCallback(async (catalog: string) => {
    const c = catalog.trim();
    if (!c) {
      setDatabaseOptions([]);
      return;
    }
    setDatabaseLoading(true);
    try {
      const names = await fetchDatabaseNamesCached(c);
      setDatabaseOptions(names);
    } catch (e) {
      console.error(e);
      setDatabaseOptions([]);
    } finally {
      setDatabaseLoading(false);
    }
  }, []);

  const loadTables = useCallback(async (catalog: string, databaseNs: string) => {
    const c = catalog.trim();
    const s = databaseNs.trim();
    if (!c || !s) {
      setTableOptions([]);
      return;
    }
    setTablesLoading(true);
    try {
      const names = await fetchTableNamesCached(c, s);
      setTableOptions(names);
    } catch (e) {
      console.error(e);
      setTableOptions([]);
    } finally {
      setTablesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled || !cat) {
      setDatabaseOptions([]);
      return;
    }
    void loadDatabaseOptions(cat);
  }, [enabled, cat, loadDatabaseOptions]);

  useEffect(() => {
    if (!enabled || !cat || !dbMid) {
      setTableOptions([]);
      return;
    }
    void loadTables(cat, dbMid);
  }, [enabled, cat, dbMid, loadTables]);

  const catalogSel = mergeOptionList(catalogOptions, value.catalog);
  const databaseSel = mergeOptionList(databaseOptions, value.database);
  const tableSel = mergeOptionList(tableOptions, value.table);

  const catalogOpts = useMemo(
    () => namesToOptions(catalogSel, '选择 catalog…'),
    [catalogSel]
  );
  const databaseOpts = useMemo(
    () => namesToOptions(databaseSel, cat ? (databaseLoading ? '加载中…' : '选择 database…') : '先选 catalog'),
    [databaseSel, cat, databaseLoading]
  );
  const tableOpts = useMemo(
    () =>
      namesToOptions(
        tableSel,
        dbMid ? (tablesLoading ? '加载中…' : '选择 table…') : '先选 database'
      ),
    [tableSel, dbMid, tablesLoading]
  );

  /** 与顶栏 h-8 输入框统一高度；Select 根节点为 div，触发器为子级 button */
  const selectWrapCls = 'font-mono w-full min-w-0 [&>button]:box-border [&>button]:h-8 [&>button]:min-h-8 [&>button]:shrink-0 [&>button]:py-0';

  const catalogSelect = (
    <Select
      value={value.catalog}
      onChange={v => onChange({ catalog: v, database: '', table: '' })}
      options={catalogOpts}
      placeholder={catalogsLoading ? '加载中…' : '选择 catalog…'}
      disabled={!enabled}
      size="sm"
      className={selectWrapCls}
      portal={portal}
      portalContainer={portalContainer}
      searchable={searchable}
      searchPlaceholder="搜索 catalog…"
    />
  );

  const databaseSelect = (
    <Select
      value={value.database}
      onChange={v => onChange({ ...value, database: v, table: '' })}
      options={databaseOpts}
      placeholder={!cat ? '先选 catalog' : databaseLoading ? '加载中…' : '选择 database…'}
      disabled={!enabled || !cat}
      size="sm"
      className={selectWrapCls}
      portal={portal}
      portalContainer={portalContainer}
      searchable={searchable}
      searchPlaceholder="搜索 database…"
    />
  );

  const tableSelect = (
    <Select
      value={value.table}
      onChange={v => onChange({ ...value, table: v })}
      options={tableOpts}
      placeholder={!dbMid ? '先选 database' : tablesLoading ? '加载中…' : '选择 table…'}
      disabled={!enabled || !cat || !dbMid}
      size="sm"
      className={selectWrapCls}
      portal={portal}
      portalContainer={portalContainer}
      searchable={searchable}
      searchPlaceholder="搜索 table…"
    />
  );

  if (variant === 'stacked') {
    return (
      <div className={`space-y-1.5 ${className}`}>
        {catalogError ? (
          <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-1">{catalogError}</p>
        ) : null}
        <div className="flex items-center gap-1 text-[10px] text-gray-500">
          <span>Gravitino</span>
          {catalogsLoading ? <Loader2Icon className="size-3 animate-spin opacity-60" /> : null}
        </div>
        <label className="block">
          <span className="text-gray-500 text-[10px]">Catalog</span>
          <div className="mt-0.5">{catalogSelect}</div>
        </label>
        <label className="block">
          <span className="text-gray-500 text-[10px]">Database</span>
          <div className="mt-0.5">{databaseSelect}</div>
        </label>
        <label className="block">
          <span className="text-gray-500 text-[10px]">Table</span>
          <div className="mt-0.5">{tableSelect}</div>
        </label>
      </div>
    );
  }

  if (variant === 'inlineRow') {
    return (
      <div className={`min-w-0 ${className}`}>
        {catalogError ? (
          <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-1 mb-1.5">
            {catalogError}
          </p>
        ) : null}
        <div className="flex min-h-8 flex-wrap items-center gap-2 min-w-0">
          <div className="flex min-h-8 min-w-0 flex-1 basis-[5.5rem] items-center gap-1">
            {catalogsLoading ? <Loader2Icon className="size-3.5 shrink-0 animate-spin text-gray-400 opacity-80" /> : null}
            <div className="flex min-h-8 min-w-0 flex-1 items-center">{catalogSelect}</div>
          </div>
          <div className="flex min-h-8 min-w-0 flex-1 basis-[5.5rem] items-center">{databaseSelect}</div>
          <div className="flex min-h-8 min-w-0 flex-1 basis-[5.5rem] items-center">{tableSelect}</div>
        </div>
      </div>
    );
  }

  return (
    <>
      {catalogError ? (
        <td className="p-1 align-top text-[10px] text-amber-700" colSpan={3}>
          {catalogError}
        </td>
      ) : (
        <>
          <td className="p-1">
            <div className="flex items-center gap-0.5 min-w-[100px]">
              {catalogsLoading ? <Loader2Icon className="size-3 shrink-0 animate-spin opacity-60" /> : null}
              <div className="min-w-0 flex-1">{catalogSelect}</div>
            </div>
          </td>
          <td className="p-1 min-w-[100px]">
            {databaseSelect}
          </td>
          <td className="p-1 min-w-[100px]">
            {tableSelect}
          </td>
        </>
      )}
    </>
  );
}
