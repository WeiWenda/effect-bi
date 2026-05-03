import { useState, useCallback, useEffect, useRef } from 'react';
import { PlusIcon, XIcon } from 'lucide-react';
import { EtlNewTabPicker, type EtlNewTabChoice } from './EtlNewTabPicker';
import { EtlNewTaskDialog, type EtlNewTaskConfirmPayload } from './EtlNewTaskDialog';
import { EtlDdlPlaceholderTab } from './EtlDdlPlaceholderTab';
import { EtlAdhocTab } from './EtlAdhocTab';
import { EtlTaskDevTab } from './EtlTaskDevTab';
import { EtlLibrarySidebar } from './EtlLibrarySidebar';
import { etlAPI, type EtlTaskVersion } from '../../services/etlApi';
import { useToast } from '../ui/toast';
import {
  loadEtlWorkspaceSnapshot,
  saveEtlWorkspaceSnapshot,
  defaultBodyForTabKind,
  defaultTaskDevBody,
  type EtlTabPersistedBody,
  type EtlTaskDevTabPersistedBody,
  type EtlWorkspaceTab,
  type EtlWorkspaceSnapshotV1,
  type EtlTabKindPersisted,
  type EtlTaskTypePersisted,
} from '../../utils/etlWorkspaceStorage';

const VALID_ETL_TASK_TYPES: EtlTaskTypePersisted[] = ['hsql', 'data_import', 'data_export'];

function mapVersionToTaskBody(v: EtlTaskVersion, etlTaskType: EtlTaskTypePersisted): EtlTaskDevTabPersistedBody {
  const ao = (v.airflowOptionsJson || {}) as Record<string, unknown>;
  const graphText =
    typeof v.graphJson === 'string' ? v.graphJson : JSON.stringify(v.graphJson ?? {}, null, 2);
  const qrText =
    typeof v.qualityRulesJson === 'string'
      ? v.qualityRulesJson
      : JSON.stringify(v.qualityRulesJson ?? [], null, 2);
  return {
    kind: 'task-dev',
    etlTaskType,
    taskName: v.name,
    remark: v.remark ?? '',
    sqlMain: v.sqlMain,
    owner: typeof ao.owner === 'string' ? ao.owner : 'etl',
    retries: typeof ao.retries === 'number' ? ao.retries : 1,
    retryDelayMinutes: typeof ao.retryDelayMinutes === 'number' ? ao.retryDelayMinutes : 5,
    emailOnFailure: Boolean(ao.emailOnFailure),
    qualityRulesJson: qrText,
    graphJsonText: graphText,
    lastVersionId: v.id,
    dryResult: null,
  };
}

export type { EtlWorkspaceTab, EtlTabKindPersisted as EtlTabKind } from '../../utils/etlWorkspaceStorage';

function defaultTitle(kind: EtlTabKindPersisted): string {
  switch (kind) {
    case 'ddl-placeholder':
      return '建表';
    case 'task-dev':
      return '任务开发';
    case 'adhoc':
      return 'Ad-hoc';
    default:
      return 'ETL';
  }
}

export function EtlWorkspace(): React.JSX.Element {
  const { toast } = useToast();
  const [hydrated, setHydrated] = useState(false);
  const [tabs, setTabs] = useState<EtlWorkspaceTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [tabBodies, setTabBodies] = useState<Record<string, EtlTabPersistedBody>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [libraryRefresh, setLibraryRefresh] = useState(0);
  const [newEtlDialogOpen, setNewEtlDialogOpen] = useState(false);
  const [newEtlHint, setNewEtlHint] = useState('');
  const newEtlPlacementRef = useRef<{ folderId: number | null; hint: string } | null>(null);
  const [focusTaskRequest, setFocusTaskRequest] = useState<{ taskName: string; token: number } | null>(null);

  /** Tab strip drag-reorder */
  const [dragTabId, setDragTabId] = useState<string | null>(null);
  const [tabDropHint, setTabDropHint] = useState<{ tabId: string; before: boolean } | null>(null);
  const [tabDropAtEnd, setTabDropAtEnd] = useState(false);

  const clearTabDragUi = useCallback(() => {
    setDragTabId(null);
    setTabDropHint(null);
    setTabDropAtEnd(false);
  }, []);

  const reorderTabs = useCallback((sourceId: string, targetId: string, insertBefore: boolean) => {
    if (sourceId === targetId) return;
    setTabs(prev => {
      const list = [...prev];
      const fromIdx = list.findIndex(t => t.id === sourceId);
      const toIdx = list.findIndex(t => t.id === targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const [item] = list.splice(fromIdx, 1);
      let newToIdx = list.findIndex(t => t.id === targetId);
      if (newToIdx === -1) return prev;
      const insertIdx = insertBefore ? newToIdx : newToIdx + 1;
      list.splice(insertIdx, 0, item);
      return list;
    });
  }, []);

  const moveTabToEnd = useCallback((sourceId: string) => {
    setTabs(prev => {
      const i = prev.findIndex(t => t.id === sourceId);
      if (i === -1 || i === prev.length - 1) return prev;
      const next = [...prev];
      const [item] = next.splice(i, 1);
      next.push(item);
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadEtlWorkspaceSnapshot().then(snap => {
      if (cancelled) return;
      if (snap?.v === 1) {
        const bodies: Record<string, EtlTabPersistedBody> = { ...(snap.tabBodies || {}) };
        for (const t of snap.tabs) {
          if (!bodies[t.id]) {
            bodies[t.id] = defaultBodyForTabKind(t.kind);
          } else if (bodies[t.id].kind === 'task-dev') {
            const raw = bodies[t.id] as EtlTaskDevTabPersistedBody & { targetFolderId?: number | null };
            const { targetFolderId: _removed, ...rest } = raw;
            const rawType = rest.etlTaskType;
            const etlTaskType =
              rawType && VALID_ETL_TASK_TYPES.includes(rawType as EtlTaskTypePersisted)
                ? (rawType as EtlTaskTypePersisted)
                : 'hsql';
            const td: EtlTaskDevTabPersistedBody = {
              ...defaultTaskDevBody(),
              ...rest,
              etlTaskType,
            };
            bodies[t.id] = td;
          }
        }
        setTabs(snap.tabs);
        setActiveTabId(snap.activeTabId);
        setTabBodies(bodies);
      }
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const snap: EtlWorkspaceSnapshotV1 = { v: 1, tabs, activeTabId, tabBodies };
    const t = window.setTimeout(() => {
      void saveEtlWorkspaceSnapshot(snap);
    }, 500);
    return () => window.clearTimeout(t);
  }, [hydrated, tabs, activeTabId, tabBodies]);

  const openNewTab = useCallback((choice: EtlNewTabChoice) => {
    const id = crypto.randomUUID();
    const k = choice satisfies EtlTabKindPersisted;
    const tab: EtlWorkspaceTab = { id, kind: k, title: defaultTitle(k) };
    setTabs(prev => [...prev, tab]);
    setTabBodies(prev => ({ ...prev, [id]: defaultBodyForTabKind(k) }));
    setActiveTabId(id);
  }, []);

  const openNewEtlDialog = useCallback((folderId: number | null, hint: string) => {
    newEtlPlacementRef.current = { folderId, hint };
    setNewEtlHint(hint);
    setNewEtlDialogOpen(true);
  }, []);

  const closeTab = useCallback(
    (e: React.MouseEvent, tabId: string) => {
      e.stopPropagation();
      setTabs(prev => {
        const next = prev.filter(t => t.id !== tabId);
        if (activeTabId === tabId) {
          const idx = prev.findIndex(t => t.id === tabId);
          const fallback = next[Math.max(0, idx - 1)]?.id ?? next[0]?.id ?? null;
          setActiveTabId(fallback);
        }
        return next;
      });
      setTabBodies(prev => {
        const next = { ...prev };
        delete next[tabId];
        return next;
      });
    },
    [activeTabId]
  );

  const setAdhocSessionId = useCallback((tabId: string, sessionId: number) => {
    setTabs(prev =>
      prev.map(t => (t.id === tabId ? { ...t, adhocSessionId: sessionId, title: `Ad-hoc #${sessionId}` } : t))
    );
  }, []);

  const bumpLibraryRefresh = useCallback(() => {
    setLibraryRefresh(n => n + 1);
  }, []);

  const handleLibraryTaskDeleted = useCallback(
    (deletedName: string) => {
      const n = deletedName.trim();
      const idsToRemove = tabs.filter(t => {
        const b = tabBodies[t.id];
        return b?.kind === 'task-dev' && (b as EtlTaskDevTabPersistedBody).taskName.trim() === n;
      }).map(t => t.id);
      if (idsToRemove.length === 0) return;
      setTabBodies(prev => {
        const next = { ...prev };
        idsToRemove.forEach(id => {
          delete next[id];
        });
        return next;
      });
      setTabs(prev => prev.filter(t => !idsToRemove.includes(t.id)));
      setActiveTabId(prevActive => {
        if (!prevActive || !idsToRemove.includes(prevActive)) return prevActive;
        const idx = tabs.findIndex(t => t.id === prevActive);
        const remaining = tabs.filter(t => !idsToRemove.includes(t.id));
        return remaining[Math.max(0, idx - 1)]?.id ?? remaining[0]?.id ?? null;
      });
    },
    [tabs, tabBodies]
  );

  const handleConfirmNewEtl = useCallback(
    async (payload: EtlNewTaskConfirmPayload) => {
      const ctx = newEtlPlacementRef.current;
      if (!ctx) throw new Error('missing placement');
      const name = payload.taskName.trim();
      if (payload.etlTaskType !== 'hsql') throw new Error('unsupported type');
      const def = defaultTaskDevBody();
      let graphJson: unknown = {};
      let qualityRulesJsonParsed: unknown = [];
      try {
        graphJson = JSON.parse(def.graphJsonText || '{}');
      } catch {
        graphJson = {};
      }
      try {
        qualityRulesJsonParsed = JSON.parse(def.qualityRulesJson || '[]');
      } catch {
        qualityRulesJsonParsed = [];
      }
      try {
        const { version } = await etlAPI.saveTaskVersion({
          name,
          remark: '',
          sqlMain: def.sqlMain,
          graphJson,
          airflowOptionsJson: {
            owner: def.owner,
            retries: def.retries,
            retryDelayMinutes: def.retryDelayMinutes,
            emailOnFailure: def.emailOnFailure,
          },
          qualityRulesJson: qualityRulesJsonParsed,
          folderId: ctx.folderId,
        });
        newEtlPlacementRef.current = null;
        setNewEtlHint('');
        setNewEtlDialogOpen(false);
        const id = crypto.randomUUID();
        const body = mapVersionToTaskBody(version, payload.etlTaskType);
        setTabs(prev => [...prev, { id, kind: 'task-dev', title: name }]);
        setTabBodies(prev => ({ ...prev, [id]: body }));
        setActiveTabId(id);
        bumpLibraryRefresh();
        setFocusTaskRequest({ taskName: name, token: Date.now() });
        toast(`已创建任务「${name}」`, 'success');
      } catch (e) {
        console.error(e);
        toast('创建失败', 'error');
        throw e;
      }
    },
    [bumpLibraryRefresh, toast]
  );

  const clearFocusTaskRequest = useCallback(() => {
    setFocusTaskRequest(null);
  }, []);

  const openTaskFromLibrary = useCallback(
    async (taskName: string, _folderId: number | null) => {
      const normalized = taskName.trim();
      if (!normalized) return;

      const existingTab = tabs.find(t => {
        const b = tabBodies[t.id];
        return b?.kind === 'task-dev' && (b as EtlTaskDevTabPersistedBody).taskName.trim() === normalized;
      });
      if (existingTab) {
        setActiveTabId(existingTab.id);
        return;
      }

      try {
        const { versions } = await etlAPI.listTaskVersions(normalized);
        const v = versions[0];
        if (!v) {
          toast('未找到任务版本', 'error');
          return;
        }
        const id = crypto.randomUUID();
        const body = mapVersionToTaskBody(v, 'hsql');
        const tab: EtlWorkspaceTab = { id, kind: 'task-dev', title: normalized };
        setTabs(prev => [...prev, tab]);
        setTabBodies(prev => ({ ...prev, [id]: body }));
        setActiveTabId(id);
      } catch (e) {
        console.error(e);
        toast('打开任务失败', 'error');
      }
    },
    [tabs, tabBodies, toast]
  );

  const activeTab = tabs.find(t => t.id === activeTabId) ?? null;

  const taskBodyForActive: EtlTaskDevTabPersistedBody =
    activeTab && tabBodies[activeTab.id]?.kind === 'task-dev'
      ? (tabBodies[activeTab.id] as EtlTaskDevTabPersistedBody)
      : defaultTaskDevBody();

  const adhocPersisted =
    activeTab && tabBodies[activeTab.id]?.kind === 'adhoc' ? tabBodies[activeTab.id] : undefined;

  return (
    <div className="h-full flex min-h-0 bg-white">
      <EtlLibrarySidebar
        refreshToken={libraryRefresh}
        onOpenTask={(name, fid) => void openTaskFromLibrary(name, fid)}
        onOpenNewEtlDialog={openNewEtlDialog}
        onTaskDeleted={handleLibraryTaskDeleted}
        focusTaskRequest={focusTaskRequest}
        onFocusTaskHandled={clearFocusTaskRequest}
      />
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <div className="flex items-center gap-1 border-b border-gray-200 bg-gray-50/90 shrink-0 overflow-x-auto px-1 py-0.5">
        {tabs.map(tab => {
          const isHint = tabDropHint?.tabId === tab.id;
          const hintBefore = isHint && tabDropHint.before;
          const hintAfter = isHint && !tabDropHint.before;
          return (
            <div
              key={tab.id}
              onDragOver={e => {
                if (!dragTabId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const rect = e.currentTarget.getBoundingClientRect();
                const before = e.clientX < rect.left + rect.width / 2;
                setTabDropHint({ tabId: tab.id, before });
                setTabDropAtEnd(false);
              }}
              onDrop={e => {
                e.preventDefault();
                const sourceId = e.dataTransfer.getData('application/etl-workspace-tab-id');
                if (!sourceId) {
                  clearTabDragUi();
                  return;
                }
                const rect = e.currentTarget.getBoundingClientRect();
                const before = e.clientX < rect.left + rect.width / 2;
                reorderTabs(sourceId, tab.id, before);
                clearTabDragUi();
              }}
              className={`group flex items-center max-w-[200px] shrink-0 rounded-t-md border border-b-0 text-xs font-medium transition-colors ${
                tab.id === activeTabId
                  ? 'bg-white border-gray-200 text-gray-900 z-[1]'
                  : 'bg-transparent border-transparent text-gray-600 hover:bg-gray-100/80'
              } ${dragTabId === tab.id ? 'opacity-60' : ''} ${hintBefore ? 'border-l-2 border-l-blue-500' : ''} ${
                hintAfter ? 'border-r-2 border-r-blue-500' : ''
              }`}
            >
              <button
                type="button"
                draggable
                onDragStart={e => {
                  e.dataTransfer.setData('application/etl-workspace-tab-id', tab.id);
                  e.dataTransfer.effectAllowed = 'move';
                  setDragTabId(tab.id);
                }}
                onDragEnd={clearTabDragUi}
                onClick={() => setActiveTabId(tab.id)}
                className="truncate px-2.5 py-1.5 text-left flex-1 min-w-0 hover:bg-transparent cursor-grab active:cursor-grabbing"
                title="拖拽调整顺序"
              >
                {tab.title}
              </button>
              <button
                type="button"
                onClick={e => closeTab(e, tab.id)}
                className="opacity-60 hover:opacity-100 p-1.5 rounded hover:bg-gray-200 shrink-0"
                aria-label="关闭标签页"
              >
                <XIcon className="size-3" />
              </button>
            </div>
          );
        })}
        {tabs.length > 0 ? (
          <div
            className={`shrink-0 self-stretch min-w-2 rounded-sm ${tabDropAtEnd ? 'bg-blue-200/70' : ''}`}
            onDragOver={e => {
              if (!dragTabId) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setTabDropAtEnd(true);
              setTabDropHint(null);
            }}
            onDragLeave={e => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setTabDropAtEnd(false);
            }}
            onDrop={e => {
              e.preventDefault();
              const sourceId = e.dataTransfer.getData('application/etl-workspace-tab-id');
              if (sourceId) moveTabToEnd(sourceId);
              clearTabDragUi();
            }}
            aria-hidden
          />
        ) : null}
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="flex items-center gap-1 shrink-0 rounded-md px-2 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 border border-transparent hover:border-blue-100"
          title="新建标签页"
        >
          <PlusIcon className="size-3.5" />
          新建
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab ? (
          activeTab.kind === 'ddl-placeholder' ? (
            <EtlDdlPlaceholderTab />
          ) : activeTab.kind === 'task-dev' ? (
            <EtlTaskDevTab
              key={activeTab.id}
              body={taskBodyForActive}
              onBodyChange={b => setTabBodies(prev => ({ ...prev, [activeTab.id]: b }))}
              onTaskSaved={bumpLibraryRefresh}
            />
          ) : (
            <EtlAdhocTab
              key={activeTab.id}
              tabId={activeTab.id}
              sessionId={activeTab.adhocSessionId}
              onSessionReady={setAdhocSessionId}
              persistedBody={adhocPersisted?.kind === 'adhoc' ? adhocPersisted : undefined}
              onPersistedBodyChange={b => setTabBodies(prev => ({ ...prev, [activeTab.id]: b }))}
            />
          )
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-gray-500 bg-gray-50/50">
            <p className="text-sm mb-4">选择「新建」打开 Ad-hoc，或点击左侧 ETL 目录栏「新增 ETL」创建任务</p>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              新建标签页
            </button>
          </div>
        )}
      </div>

      <EtlNewTabPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onChoose={openNewTab} />
      <EtlNewTaskDialog
        open={newEtlDialogOpen}
        folderHint={newEtlHint}
        onClose={() => {
          newEtlPlacementRef.current = null;
          setNewEtlHint('');
          setNewEtlDialogOpen(false);
        }}
        onConfirm={handleConfirmNewEtl}
      />
      </div>
    </div>
  );
}
