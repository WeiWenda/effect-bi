import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
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
import { parseAlertRulesFromJsonText } from '../../utils/etlAlertRules';
import { migrateLegacyGraphJsonTextToRuntimeDeps } from '../../utils/etlRuntimeDeps';
import { migrateTaskOutputPersisted, type EtlTaskOutputPersisted } from '../../utils/etlWorkspaceStorage';
import { formatDateYMD } from '../../utils/filterTimeRelative';

const VALID_ETL_TASK_TYPES: EtlTaskTypePersisted[] = ['hsql', 'data_import', 'data_export'];

type EtlTabContextMenuState = { tabId: string; x: number; y: number };

function mapVersionToTaskBody(v: EtlTaskVersion, etlTaskType: EtlTaskTypePersisted): EtlTaskDevTabPersistedBody {
  const sched = (v.scheduleJson || {}) as Record<string, unknown>;
  const runtimeDepsJsonText = JSON.stringify(v.runtimeDepsJson ?? { runtimeDependencies: [] }, null, 2);
  const qrText =
    typeof v.qualityRulesJson === 'string'
      ? v.qualityRulesJson
      : JSON.stringify(v.qualityRulesJson ?? { sqlQueries: [], rules: [] }, null, 2);
  const alertSrc =
    v.alertJson && typeof v.alertJson === 'object' ? JSON.stringify(v.alertJson) : '{"rules":[]}';
  const alertBundle = parseAlertRulesFromJsonText(alertSrc);
  const alertRulesJson = JSON.stringify(alertBundle, null, 2);
  const taskOutput = migrateTaskOutputPersisted(v.taskOutput);
  const schedDateRaw = typeof sched.scheduleStartDate === 'string' ? sched.scheduleStartDate.trim() : '';
  const scheduleStartDate =
    /^\d{4}-\d{2}-\d{2}$/.test(schedDateRaw) ? schedDateRaw : formatDateYMD(new Date());
  return {
    kind: 'task-dev',
    etlTaskType,
    taskName: v.name,
    remark: v.remark ?? '',
    sqlMain: v.sqlMain,
    cronExpression: typeof sched.cronExpression === 'string' ? sched.cronExpression : '',
    scheduleStartDate,
    retries: typeof sched.retries === 'number' ? sched.retries : 1,
    retryDelayMinutes: typeof sched.retryDelayMinutes === 'number' ? sched.retryDelayMinutes : 1,
    alertRulesJson,
    qualityRulesJson: qrText,
    runtimeDepsJsonText,
    taskOutput,
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
  const [searchParams, setSearchParams] = useSearchParams();
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

  const tabBodiesRef = useRef(tabBodies);
  tabBodiesRef.current = tabBodies;

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
            const raw = bodies[t.id] as EtlTaskDevTabPersistedBody & { targetFolderId?: number | null; graphJsonText?: string };
            const { targetFolderId: _removed, ...rest } = raw;
            const rawType = rest.etlTaskType;
            const etlTaskType =
              rawType && VALID_ETL_TASK_TYPES.includes(rawType as EtlTaskTypePersisted)
                ? (rawType as EtlTaskTypePersisted)
                : 'hsql';
            const rawTd = rest as Partial<EtlTaskDevTabPersistedBody> & { graphJsonText?: string };
            const base = defaultTaskDevBody();
            const legacyGraph = rawTd.graphJsonText;
            const runtimeDepsJsonText =
              typeof rawTd.runtimeDepsJsonText === 'string' && rawTd.runtimeDepsJsonText.trim()
                ? rawTd.runtimeDepsJsonText
                : typeof legacyGraph === 'string'
                  ? migrateLegacyGraphJsonTextToRuntimeDeps(legacyGraph)
                  : base.runtimeDepsJsonText;
            const taskOutput: EtlTaskOutputPersisted = migrateTaskOutputPersisted(rawTd.taskOutput ?? null);
            const rawSchedDate =
              typeof rawTd.scheduleStartDate === 'string' ? rawTd.scheduleStartDate.trim() : '';
            const scheduleStartDate =
              /^\d{4}-\d{2}-\d{2}$/.test(rawSchedDate) ? rawSchedDate : base.scheduleStartDate;
            const td: EtlTaskDevTabPersistedBody = {
              ...base,
              ...rest,
              etlTaskType,
              cronExpression: typeof rawTd.cronExpression === 'string' ? rawTd.cronExpression : base.cronExpression,
              scheduleStartDate,
              alertRulesJson: typeof rawTd.alertRulesJson === 'string' ? rawTd.alertRulesJson : base.alertRulesJson,
              runtimeDepsJsonText,
              taskOutput,
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

  /** 从血缘表元数据等入口：/etl?versionId= — 打开任务并恢复该版本快照 */
  const versionIdFromUrl = searchParams.get('versionId');
  useEffect(() => {
    if (!hydrated || !versionIdFromUrl) return;
    const versionId = parseInt(versionIdFromUrl, 10);
    if (Number.isNaN(versionId)) {
      setSearchParams(
        prev => {
          const n = new URLSearchParams(prev);
          n.delete('versionId');
          return n;
        },
        { replace: true }
      );
      return;
    }
    const ac = new AbortController();
    let cancelled = false;
    void etlAPI
      .getTaskVersion(versionId, { signal: ac.signal })
      .then(({ version }) => {
        if (cancelled) return;
        const name = version.name.trim();
        const body = mapVersionToTaskBody(version, 'hsql');
        const prevBodies = tabBodiesRef.current;
        const existingId = Object.keys(prevBodies).find(tid => {
          const b = prevBodies[tid];
          return b?.kind === 'task-dev' && (b as EtlTaskDevTabPersistedBody).taskName.trim() === name;
        });
        if (existingId) {
          setTabBodies(prev => ({ ...prev, [existingId]: body }));
          setActiveTabId(existingId);
          setFocusTaskRequest({ taskName: name, token: Date.now() });
          return;
        }
        const newId = crypto.randomUUID();
        setTabs(prev => [...prev, { id: newId, kind: 'task-dev', title: name }]);
        setTabBodies(prev => ({ ...prev, [newId]: body }));
        setActiveTabId(newId);
        setFocusTaskRequest({ taskName: name, token: Date.now() });
      })
      .catch(err => {
        if (cancelled) return;
        const code =
          err && typeof err === 'object' && 'code' in err ? String((err as { code?: string }).code) : '';
        if (code === 'ERR_CANCELED') return;
        console.error(err);
        toast('无法加载该任务版本', 'error');
      })
      .finally(() => {
        if (cancelled) return;
        setSearchParams(
          prev => {
            const n = new URLSearchParams(prev);
            n.delete('versionId');
            return n;
          },
          { replace: true }
        );
      });
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [hydrated, versionIdFromUrl, setSearchParams, toast]);

  /** 链路治理等入口：/etl?task= — 按逻辑名打开任务开发 Tab 并高亮左侧目录 */
  const taskFromUrl = searchParams.get('task');
  useEffect(() => {
    if (!hydrated || taskFromUrl === null) return;
    const normalized = taskFromUrl.trim();
    if (!normalized) {
      setSearchParams(
        prev => {
          const n = new URLSearchParams(prev);
          n.delete('task');
          return n;
        },
        { replace: true }
      );
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const prevBodies = tabBodiesRef.current;
        const existingId = Object.keys(prevBodies).find(tid => {
          const b = prevBodies[tid];
          return b?.kind === 'task-dev' && (b as EtlTaskDevTabPersistedBody).taskName.trim() === normalized;
        });
        if (existingId) {
          setActiveTabId(existingId);
          setFocusTaskRequest({ taskName: normalized, token: Date.now() });
          return;
        }
        const { versions } = await etlAPI.listTaskVersions(normalized);
        if (cancelled) return;
        const v = versions[0];
        if (!v) {
          toast('未找到任务版本', 'error');
          return;
        }
        const id = crypto.randomUUID();
        const body = mapVersionToTaskBody(v, 'hsql');
        setTabs(prev => [...prev, { id, kind: 'task-dev', title: normalized }]);
        setTabBodies(prev => ({ ...prev, [id]: body }));
        setActiveTabId(id);
        setFocusTaskRequest({ taskName: normalized, token: Date.now() });
      } catch (e) {
        if (cancelled) return;
        console.error(e);
        toast('打开任务失败', 'error');
      } finally {
        if (!cancelled) {
          setSearchParams(
            prev => {
              const n = new URLSearchParams(prev);
              n.delete('task');
              return n;
            },
            { replace: true }
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, taskFromUrl, setSearchParams, toast]);

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

  /** 批量关闭标签（保留当前激活逻辑：优先左侧相邻） */
  const removeTabIds = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    setTabs(prevTabs => {
      const next = prevTabs.filter(t => !idSet.has(t.id));
      setActiveTabId(currActive => {
        if (!currActive || !idSet.has(currActive)) return currActive;
        const idx = prevTabs.findIndex(t => t.id === currActive);
        const left = prevTabs
          .slice(0, idx)
          .reverse()
          .find(t => !idSet.has(t.id));
        const right = prevTabs.slice(idx + 1).find(t => !idSet.has(t.id));
        return left?.id ?? right?.id ?? next[0]?.id ?? null;
      });
      return next;
    });
    setTabBodies(prev => {
      const n = { ...prev };
      ids.forEach(id => {
        delete n[id];
      });
      return n;
    });
  }, []);

  const [tabContextMenu, setTabContextMenu] = useState<EtlTabContextMenuState | null>(null);
  const tabContextMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!tabContextMenu) return;
    const closeMenu = () => setTabContextMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu();
    };
    const onPointerDown = (e: PointerEvent) => {
      if (tabContextMenuRef.current?.contains(e.target as Node)) return;
      closeMenu();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('scroll', closeMenu, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('scroll', closeMenu, true);
    };
  }, [tabContextMenu]);

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
      let runtimeDepsJson: Record<string, unknown> = { runtimeDependencies: [] };
      try {
        runtimeDepsJson = JSON.parse(def.runtimeDepsJsonText || '{}') as Record<string, unknown>;
      } catch {
        runtimeDepsJson = { runtimeDependencies: [] };
      }
      let qualityRulesJsonParsed: unknown = [];
      try {
        qualityRulesJsonParsed = JSON.parse(def.qualityRulesJson || '{}');
      } catch {
        qualityRulesJsonParsed = { sqlQueries: [], rules: [] };
      }
      try {
        let alertRulesParsed: unknown[] = [];
        try {
          const ar = JSON.parse(def.alertRulesJson || '{}') as { rules?: unknown[] };
          alertRulesParsed = Array.isArray(ar.rules) ? ar.rules : [];
        } catch {
          alertRulesParsed = [];
        }
        const { version } = await etlAPI.saveTaskVersion({
          name,
          remark: '',
          sqlMain: def.sqlMain,
          scheduleJson: {
            owner: 'etl',
            emailOnFailure: false,
            cronExpression: def.cronExpression.trim() || '0 0 * * *',
            scheduleStartDate: def.scheduleStartDate.trim() || formatDateYMD(new Date()),
            retries: def.retries,
            retryDelayMinutes: def.retryDelayMinutes,
          },
          alertJson: { rules: alertRulesParsed },
          runtimeDepsJson,
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

  /** 左侧目录高亮：当前激活标签为任务开发时，对应任务名 */
  const activeOpenTaskName = useMemo(() => {
    if (!activeTabId) return null;
    const b = tabBodies[activeTabId];
    if (b?.kind !== 'task-dev') return null;
    const n = (b as EtlTaskDevTabPersistedBody).taskName?.trim();
    return n || null;
  }, [activeTabId, tabBodies]);

  return (
    <div className="h-full flex min-h-0 bg-white">
      <EtlLibrarySidebar
        refreshToken={libraryRefresh}
        onOpenTask={(name, fid) => void openTaskFromLibrary(name, fid)}
        onOpenNewEtlDialog={openNewEtlDialog}
        onTaskDeleted={handleLibraryTaskDeleted}
        focusTaskRequest={focusTaskRequest}
        onFocusTaskHandled={clearFocusTaskRequest}
        activeOpenTaskName={activeOpenTaskName}
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
              onContextMenu={e => {
                e.preventDefault();
                e.stopPropagation();
                setTabContextMenu({ tabId: tab.id, x: e.clientX, y: e.clientY });
              }}
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
              onTaskIdentitySaved={({ nextName }) => {
                bumpLibraryRefresh();
                setTabs(prev =>
                  prev.map(t => (t.id === activeTab.id && t.kind === 'task-dev' ? { ...t, title: nextName } : t))
                );
              }}
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

      {tabContextMenu &&
        typeof document !== 'undefined' &&
        createPortal(
          (() => {
            const idx = tabs.findIndex(t => t.id === tabContextMenu.tabId);
            const vw = typeof window !== 'undefined' ? window.innerWidth : 0;
            const vh = typeof window !== 'undefined' ? window.innerHeight : 0;
            const mw = 168;
            const mh = 132;
            let left = tabContextMenu.x;
            let top = tabContextMenu.y;
            if (left + mw > vw) left = Math.max(8, vw - mw - 8);
            if (top + mh > vh) top = Math.max(8, vh - mh - 8);
            const closeLeft = () => {
              if (idx <= 0) return;
              removeTabIds(tabs.slice(0, idx).map(t => t.id));
              setTabContextMenu(null);
            };
            const closeRight = () => {
              if (idx < 0 || idx >= tabs.length - 1) return;
              removeTabIds(tabs.slice(idx + 1).map(t => t.id));
              setTabContextMenu(null);
            };
            const closeOthers = () => {
              if (idx < 0 || tabs.length <= 1) return;
              const keep = tabContextMenu.tabId;
              removeTabIds(tabs.filter(t => t.id !== keep).map(t => t.id));
              setTabContextMenu(null);
            };
            return (
              <div
                ref={tabContextMenuRef}
                role="menu"
                className="fixed z-[200] min-w-[168px] rounded-md border border-gray-200 bg-white py-1 shadow-lg text-sm"
                style={{ left, top }}
              >
                <button
                  type="button"
                  role="menuitem"
                  disabled={idx <= 0}
                  className="w-full px-3 py-2 text-left hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none"
                  onClick={closeLeft}
                >
                  关闭左侧
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={idx < 0 || idx >= tabs.length - 1}
                  className="w-full px-3 py-2 text-left hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none"
                  onClick={closeRight}
                >
                  关闭右侧
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={tabs.length <= 1}
                  className="w-full px-3 py-2 text-left hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none"
                  onClick={closeOthers}
                >
                  关闭其他
                </button>
              </div>
            );
          })(),
          document.body
        )}

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
