import localforage from 'localforage';

export type EtlTabKindPersisted = 'ddl-placeholder' | 'task-dev' | 'adhoc';

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
  owner: string;
  retries: number;
  retryDelayMinutes: number;
  emailOnFailure: boolean;
  qualityRulesJson: string;
  graphJsonText: string;
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
    owner: 'etl',
    retries: 1,
    retryDelayMinutes: 5,
    emailOnFailure: false,
    qualityRulesJson: '[]',
    graphJsonText: '{}',
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
