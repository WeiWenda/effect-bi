import { useState, useEffect, useCallback, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { PlayIcon, Loader2Icon } from 'lucide-react';
import { GravitinoMetadataTree } from './GravitinoMetadataTree';
import { etlAPI, type AdhocSubmission } from '../../services/etlApi';
import type { EtlAdhocTabPersistedBody } from '../../utils/etlWorkspaceStorage';
import { defaultAdhocBody } from '../../utils/etlWorkspaceStorage';
import { useToast } from '../ui/toast';

interface EtlAdhocTabProps {
  tabId: string;
  sessionId?: number;
  onSessionReady: (tabId: string, sessionId: number) => void;
  persistedBody: EtlAdhocTabPersistedBody | undefined;
  onPersistedBodyChange: (body: EtlAdhocTabPersistedBody) => void;
}

type SubmissionRow = Omit<AdhocSubmission, 'resultSchemaJson' | 'resultPreviewJson'>;

export function EtlAdhocTab({
  tabId,
  sessionId,
  onSessionReady,
  persistedBody,
  onPersistedBodyChange,
}: EtlAdhocTabProps): React.JSX.Element {
  const { toast } = useToast();
  const [sid, setSid] = useState<number | null>(sessionId ?? null);
  const [sql, setSql] = useState(() => persistedBody?.sql ?? defaultAdhocBody().sql);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(() => persistedBody?.selectedSubmissionId ?? null);
  const [resultCols, setResultCols] = useState<{ name: string; type: string }[]>([]);
  const [resultRows, setResultRows] = useState<Record<string, unknown>[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [loadingSubmission, setLoadingSubmission] = useState(false);
  const [resultError, setResultError] = useState<string | null>(null);
  const restoredSelectionRef = useRef(false);

  useEffect(() => {
    if (sessionId != null) setSid(sessionId);
  }, [sessionId]);

  useEffect(() => {
    if (sid != null) return;
    let cancelled = false;
    void (async () => {
      try {
        const { session } = await etlAPI.createAdhocSession();
        if (cancelled) return;
        setSid(session.id);
        onSessionReady(tabId, session.id);
      } catch (e) {
        console.error(e);
        toast('创建会话失败', 'error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sid, tabId, onSessionReady, toast]);

  useEffect(() => {
    if (sid == null) return;
    let cancelled = false;
    void (async () => {
      try {
        const { session, recentSubmissions } = await etlAPI.getAdhocSession(sid, 100);
        if (cancelled) return;
        const localSql = persistedBody?.sql;
        if (localSql != null && localSql.trim() !== '') {
          setSql(localSql);
          void etlAPI.patchAdhocSession(sid, { draftSql: localSql }).catch(() => {});
        } else {
          setSql(session.draftSql ?? '');
        }
        setSubmissions(recentSubmissions as SubmissionRow[]);
      } catch (e) {
        console.error(e);
        toast('加载会话失败', 'error');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate when sid first set
  }, [sid]);

  useEffect(() => {
    if (sid == null) return;
    const t = window.setTimeout(() => {
      void etlAPI.patchAdhocSession(sid, { draftSql: sql }).catch(() => {});
    }, 900);
    return () => window.clearTimeout(t);
  }, [sql, sid]);

  const persistRef = useRef(onPersistedBodyChange);
  persistRef.current = onPersistedBodyChange;
  useEffect(() => {
    const t = window.setTimeout(() => {
      persistRef.current({ kind: 'adhoc', sql, selectedSubmissionId: selectedId });
    }, 450);
    return () => window.clearTimeout(t);
  }, [sql, selectedId]);

  const loadSubmissionDetail = useCallback(
    async (id: number) => {
      setLoadingSubmission(true);
      setResultError(null);
      try {
        const { submission } = await etlAPI.getAdhocSubmission(id);
        if (submission.status === 'failed') {
          setResultCols([]);
          setResultRows([]);
          setResultError(submission.errorMessage || '执行失败');
          return;
        }
        const schema = (submission.resultSchemaJson as { name: string; type: string }[]) || [];
        const preview = (submission.resultPreviewJson as Record<string, unknown>[]) || [];
        setResultCols(Array.isArray(schema) ? schema : []);
        setResultRows(Array.isArray(preview) ? preview : []);
      } catch (e) {
        console.error(e);
        setResultCols([]);
        setResultRows([]);
        setResultError(null);
        toast('加载结果失败', 'error');
      } finally {
        setLoadingSubmission(false);
      }
    },
    [toast]
  );

  const onSelectSubmission = useCallback(
    async (row: SubmissionRow) => {
      setSelectedId(row.id);
      setSql(row.sqlText);
      await loadSubmissionDetail(row.id);
    },
    [loadSubmissionDetail]
  );

  useEffect(() => {
    if (restoredSelectionRef.current) return;
    if (sid == null) return;
    const want = persistedBody?.selectedSubmissionId;
    if (want == null) {
      restoredSelectionRef.current = true;
      return;
    }
    if (submissions.length === 0) return;
    const row = submissions.find(s => s.id === want);
    if (!row) {
      restoredSelectionRef.current = true;
      return;
    }
    restoredSelectionRef.current = true;
    void onSelectSubmission(row);
  }, [sid, submissions, persistedBody?.selectedSubmissionId, onSelectSubmission]);

  const insertAtCursor = useCallback((text: string) => {
    setSql(prev => (prev && !prev.endsWith('\n') ? `${prev}\n` : prev || '') + text);
  }, []);

  const handleSubmit = async () => {
    if (sid == null) return;
    const trimmed = sql.trim();
    if (!trimmed) {
      toast('请输入 SQL', 'error');
      return;
    }
    setSubmitting(true);
    setResultError(null);
    try {
      const { submission } = await etlAPI.submitAdhocSql(sid, trimmed);
      const summary: SubmissionRow = {
        id: submission.id,
        sessionId: submission.sessionId,
        sqlText: submission.sqlText,
        status: submission.status,
        errorMessage: submission.errorMessage,
        submittedAt: submission.submittedAt,
        finishedAt: submission.finishedAt,
        durationMs: submission.durationMs,
        rowsReturned: submission.rowsReturned,
      };
      setSubmissions(prev => [summary, ...prev.filter(s => s.id !== summary.id)]);
      setSelectedId(submission.id);
      const schema = (submission.resultSchemaJson as { name: string; type: string }[]) || [];
      const preview = (submission.resultPreviewJson as Record<string, unknown>[]) || [];
      setResultCols(Array.isArray(schema) ? schema : []);
      setResultRows(Array.isArray(preview) ? preview : []);
      setResultError(submission.status === 'failed' ? submission.errorMessage || '执行失败' : null);
      if (submission.status === 'failed') {
        toast(submission.errorMessage || '执行失败', 'error');
      }
    } catch (e) {
      console.error(e);
      toast('提交失败', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (sid == null) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <Loader2Icon className="size-8 text-gray-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex min-h-0 bg-white">
      <div className="w-56 shrink-0 border-r border-gray-200 flex flex-col min-h-0">
        <div className="px-2 py-1.5 border-b border-gray-100 text-xs font-medium text-gray-600 shrink-0">Gravitino 元数据</div>
        <GravitinoMetadataTree
          includeColumns
          onInsertQualifiedTable={insertAtCursor}
          onInsertColumnName={insertAtCursor}
        />
      </div>
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <div className="flex-[1_1_45%] min-h-[140px] border-b border-gray-200 flex flex-col">
          <div className="px-2 py-1 text-xs text-gray-500 border-b border-gray-100 shrink-0">SQL（双击左侧表/列可插入）</div>
          <div className="flex-1 min-h-0">
            <Editor
              height="100%"
              defaultLanguage="sql"
              theme="vs-light"
              value={sql}
              onChange={v => setSql(v ?? '')}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                wordWrap: 'on',
                scrollBeyondLastLine: false,
              }}
            />
          </div>
        </div>
        <div className="flex-[1_1_55%] min-h-0 flex flex-col">
          <div className="flex items-center gap-2 px-2 py-1.5 border-b border-gray-100 shrink-0">
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 text-white text-xs font-medium px-3 py-1.5 hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? <Loader2Icon className="size-3.5 animate-spin" /> : <PlayIcon className="size-3.5" />}
              提交查询
            </button>
            <span className="text-xs text-gray-400">会话 #{sid}</span>
          </div>
          <div className="flex-1 flex min-h-0">
            <div className="w-44 shrink-0 border-r border-gray-100 overflow-y-auto">
              <div className="px-2 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">历史</div>
              {submissions.length === 0 ? (
                <p className="px-2 text-xs text-gray-400 py-2">暂无提交</p>
              ) : (
                submissions.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => void onSelectSubmission(s)}
                    className={`w-full text-left px-2 py-1.5 text-[11px] border-b border-gray-50 hover:bg-gray-50 ${
                      selectedId === s.id ? 'bg-blue-50 text-blue-900' : 'text-gray-700'
                    }`}
                  >
                    <div className="truncate font-medium">{new Date(s.submittedAt).toLocaleString('zh-CN')}</div>
                    <div className="truncate text-gray-400">{s.status}</div>
                  </button>
                ))
              )}
            </div>
            <div className="flex-1 min-w-0 overflow-auto flex flex-col">
              {loadingSubmission ? (
                <div className="flex-1 flex items-center justify-center">
                  <Loader2Icon className="size-6 text-gray-300 animate-spin" />
                </div>
              ) : selectedId == null ? (
                <p className="p-4 text-xs text-gray-400">选择一条历史或提交新查询查看结果</p>
              ) : resultError ? (
                <p className="p-4 text-xs text-red-600">{resultError}</p>
              ) : resultCols.length === 0 && resultRows.length === 0 ? (
                <p className="p-4 text-xs text-gray-500">无结果数据（可能无行返回）</p>
              ) : (
                <div className="overflow-x-auto flex-1">
                  <table className="min-w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        {resultCols.map(c => (
                          <th key={c.name} className="text-left font-medium text-gray-600 px-2 py-1.5 whitespace-nowrap">
                            {c.name}
                            <span className="text-gray-400 font-normal ml-1">({c.type})</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {resultRows.map((r, i) => (
                        <tr key={i} className="border-b border-gray-100 hover:bg-gray-50/80">
                          {resultCols.map(c => (
                            <td key={c.name} className="px-2 py-1 text-gray-800 whitespace-nowrap max-w-[240px] truncate">
                              {r[c.name] === null || r[c.name] === undefined ? '' : String(r[c.name])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
