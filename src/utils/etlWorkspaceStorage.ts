import localforage from 'localforage';
import { formatDateYMD } from './filterTimeRelative';
import { migrateLegacyGraphJsonTextToRuntimeDeps } from './etlRuntimeDeps';

export type EtlTabKindPersisted = 'ddl-placeholder' | 'task-dev' | 'adhoc';

/** 产出表字段，与 API `taskOutput` / `etl_task_info` 一致 */
export interface EtlTaskOutputPersisted {
  catalogName: string;
  databaseName: string;
  tableName: string;
}

/** 兼容本地快照或旧 API 中的 schemaName → databaseName */
export function migrateTaskOutputPersisted(raw: unknown): EtlTaskOutputPersisted {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { catalogName: '', databaseName: '', tableName: '' };
  }
  const o = raw as Record<string, unknown>;
  const catalogName = typeof o.catalogName === 'string' ? o.catalogName : '';
  const legacySchema = typeof o.schemaName === 'string' ? o.schemaName : '';
  const databaseRaw = typeof o.databaseName === 'string' ? o.databaseName : '';
  const databaseName = databaseRaw.trim() ? databaseRaw : legacySchema;
  const tableName = typeof o.tableName === 'string' ? o.tableName : '';
  return { catalogName, databaseName, tableName };
}

/** ETL 任务类型（与左侧「新增 ETL」一致） */
export type EtlTaskTypePersisted = 'hsql' | 'data_import' | 'data_export';

/** Tab strip row (persisted to localforage). */
export interface EtlWorkspaceTab {
  id: string;
  kind: EtlTabKindPersisted;
  title: string;
  adhocSessionId?: number;
}

export interface EtlAdhocTabPersistedBody {
  kind: 'adhoc';
  sql: string;
  selectedSubmissionId: number | null;
}

export interface EtlTaskDevTabPersistedBody {
  kind: 'task-dev';
  etlTaskType: EtlTaskTypePersisted;
  taskName: string;
  remark: string;
  sqlMain: string;
  /** crontab，保存版本时必填 */
  cronExpression: string;
  /** DAG 调度起始日 YYYY-MM-DD，默认当日，写入 schedule_json.scheduleStartDate */
  scheduleStartDate: string;
  retries: number;
  retryDelayMinutes: number;
  /** 任务报警（与 API alertJson / DB alert_json 同步） */
  alertRulesJson: string;
  qualityRulesJson: string;
  /** 与 `runtime_deps_json` 同形：`{ "runtimeDependencies": [...] }` */
  runtimeDepsJsonText: string;
  /** 产出表（任务级，非版本）；服务端通过 PATCH `/tasks/output` 保存，本地随工作区快照持久化 */
  taskOutput: EtlTaskOutputPersisted;
  lastVersionId: number | null;
  /**
   * 仅从左侧「新增 ETL」写入：首次保存版本时随请求提交目录，成功后清除。
   * 未设置则保存时不传 folderId（目录仅由左侧拖拽维护）。
   */
  pendingFolderPlacement?: number | null;
  dryResult: { columns: { name: string; type: string }[]; rows: Record<string, unknown>[] } | null;
}

export interface EtlDdlTabPersistedBody {
  kind: 'ddl-placeholder';
}

export type EtlTabPersistedBody = EtlAdhocTabPersistedBody | EtlTaskDevTabPersistedBody | EtlDdlTabPersistedBody;

export interface EtlWorkspaceSnapshotV1 {
  v: 1;
  tabs: EtlWorkspaceTab[];
  activeTabId: string | null;
  /** keyed by tab id */
  tabBodies: Record<string, EtlTabPersistedBody>;
}

const STORE = localforage.createInstance({
  name: 'chatbotEtl',
  storeName: 'workspace',
});

const KEY = 'workspace_snapshot_v1';

export async function loadEtlWorkspaceSnapshot(): Promise<EtlWorkspaceSnapshotV1 | null> {
  try {
    const raw = await STORE.getItem<unknown>(KEY);
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Partial<EtlWorkspaceSnapshotV1>;
    if (o.v !== 1 || !Array.isArray(o.tabs)) return null;
    const tabs = o.tabs as EtlWorkspaceTab[];
    const tabBodies = o.tabBodies && typeof o.tabBodies === 'object' ? (o.tabBodies as Record<string, EtlTabPersistedBody>) : {};
    return {
      v: 1,
      tabs,
      activeTabId: typeof o.activeTabId === 'string' || o.activeTabId === null ? o.activeTabId : null,
      tabBodies,
    };
  } catch (e) {
    console.error('loadEtlWorkspaceSnapshot', e);
    return null;
  }
}

export async function saveEtlWorkspaceSnapshot(snapshot: EtlWorkspaceSnapshotV1): Promise<void> {
  try {
    await STORE.setItem(KEY, snapshot);
  } catch (e) {
    console.error('saveEtlWorkspaceSnapshot', e);
  }
}

export function defaultTaskDevBody(): EtlTaskDevTabPersistedBody {
  return {
    kind: 'task-dev',
    etlTaskType: 'hsql',
    taskName: '',
    remark: '',
    sqlMain: '-- ETL 任务 SQL\nSELECT 1',
    cronExpression: '',
    scheduleStartDate: formatDateYMD(new Date()),
    retries: 1,
    retryDelayMinutes: 5,
    alertRulesJson: '{"rules":[]}',
    qualityRulesJson: '{"sqlQueries":[],"rules":[]}',
    runtimeDepsJsonText: '{\n  "runtimeDependencies": []\n}',
    taskOutput: { catalogName: '', databaseName: '', tableName: '' },
    lastVersionId: null,
    dryResult: null,
  };
}

export function defaultAdhocBody(): EtlAdhocTabPersistedBody {
  return {
    kind: 'adhoc',
    sql: '-- 双击左侧表名可插入 qualified 名称\nSELECT 1',
    selectedSubmissionId: null,
  };
}

export function defaultDdlBody(): EtlDdlTabPersistedBody {
  return { kind: 'ddl-placeholder' };
}

export function defaultBodyForTabKind(kind: EtlTabKindPersisted): EtlTabPersistedBody {
  switch (kind) {
    case 'task-dev':
      return defaultTaskDevBody();
    case 'adhoc':
      return defaultAdhocBody();
    case 'ddl-placeholder':
    default:
      return defaultDdlBody();
  }
}
