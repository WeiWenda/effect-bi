import { useState, useEffect, useCallback, useRef } from 'react';
import {
  PlusIcon,
  Trash2Icon,
  PencilIcon,
  MessageSquareIcon,
  XIcon,
  CheckIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
} from 'lucide-react';
import { AssistantRuntimeProvider } from '@assistant-ui/react';
import {
  useLangGraphRuntime,
  type LangGraphMessagesEvent,
  type LangChainMessage,
} from '@assistant-ui/react-langgraph';

/** Event name aligned with @assistant-ui/react-langgraph (not re-exported from package entry). */
const MESSAGES_COMPLETE_EVENT = 'messages/complete' as const;
import { Thread } from './assistant-ui/Thread';
import { authAPI, chatAPI, Session, tokenStorage, threadListAdapter, LANGGRAPH_API_V1_BASE } from '../services/llmApi';
import { useToast } from './ui/toast';
import { ConfirmDialog } from './ui/confirm-dialog';
import {
  PreDefinedWorkflowProvider,
  type PreDefinedWorkflow,
} from '../contexts/PreDefinedWorkflowContext';
import { readChatStream } from '../utils/chatStream';

interface ChatSession {
  id: string;
  name: string;
  updatedAt: Date;
}

function ChatContent(): React.JSX.Element {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessionTokens, setSessionTokens] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; sessionId: string | null }>({
    open: false,
    sessionId: null,
  });
  const [hoveredSessionId, setHoveredSessionId] = useState<string | null>(null);
  const [sessionMessages, setSessionMessages] = useState<Record<string, LangChainMessage[]>>({});
  const [sessionWorkflows, setSessionWorkflows] = useState<Record<string, PreDefinedWorkflow>>({});
  const preDefinedWorkflowRef = useRef<PreDefinedWorkflow>('default');
  const { toast } = useToast();

  const currentWorkflow: PreDefinedWorkflow = currentSessionId
    ? (sessionWorkflows[currentSessionId] ?? 'default')
    : 'default';

  useEffect(() => {
    preDefinedWorkflowRef.current = currentWorkflow;
  }, [currentWorkflow]);

  const setCurrentSessionWorkflow = useCallback((workflow: PreDefinedWorkflow) => {
    if (!currentSessionId) return;
    setSessionWorkflows((prev) => ({ ...prev, [currentSessionId]: workflow }));
  }, [currentSessionId]);

  const fetchSessions = useCallback(async (): Promise<void> => {
    try {
      const response: Session[] = await authAPI.getSessions();
      const sessionList: ChatSession[] = response.map(s => ({
        id: s.session_id,
        name: s.name,
        updatedAt: new Date(),
      })).reverse();
      setSessions(sessionList);

      // Cache session tokens
      const tokens: Record<string, string> = {};
      response.forEach(s => {
        tokens[s.session_id] = s.token.access_token;
      });
      setSessionTokens(tokens);

      if (response.length > 0) {
        setCurrentSessionId(sessionList[0].id);
      }
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
    }
  }, []);

  const createNewSession = useCallback(async (): Promise<void> => {
    try {
      const response: Session = await authAPI.createSession();
      const newSession: ChatSession = {
        id: response.session_id,
        name: response.name,
        updatedAt: new Date(),
      };
      setSessions(prev => [newSession, ...prev]);
      setCurrentSessionId(response.session_id);
      tokenStorage.setSessionToken(response.token.access_token);
      toast('会话创建成功');
    } catch (err) {
      toast('创建会话失败', 'error');
      console.error('Failed to create session:', err);
    }
  }, [toast]);

  const handleDeleteSession = async (sessionId: string): Promise<void> => {
    try {
      // Save current session token to restore later if needed
      const currentToken = tokenStorage.getSessionToken();

      // Set the session token to the token of the session being deleted
      const sessionToken = sessionTokens[sessionId];
      if (sessionToken) {
        tokenStorage.setSessionToken(sessionToken);
      }

      await authAPI.deleteSession(sessionId);

      setSessions(prev => prev.filter(s => s.id !== sessionId));

      if (currentSessionId === sessionId) {
        const remainingSessions = sessions.filter(s => s.id !== sessionId);
        setCurrentSessionId(remainingSessions.length > 0 ? remainingSessions[0].id : null);
        if (remainingSessions.length > 0) {
          // Find and set the token for the new current session
          const session = await authAPI.getSessions();
          const newSession = session.find(s => s.session_id === remainingSessions[0].id);
          if (newSession) {
            tokenStorage.setSessionToken(newSession.token.access_token);
          }
        } else {
          tokenStorage.clearSessionToken();
        }
      } else {
        // Restore the original session token if we deleted a different session
        if (currentToken) {
          tokenStorage.setSessionToken(currentToken);
        }
      }
      toast('会话删除成功');
    } catch (err) {
      toast('删除会话失败', 'error');
      console.error('Failed to delete session:', err);
    }
  };

  const handleUpdateSessionName = async (sessionId: string): Promise<void> => {
    if (!editName.trim()) return;

    try {
      await authAPI.updateSessionName(sessionId, editName);

      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, name: editName } : s));
      setEditingSessionId(null);
      setEditName('');
      toast('会话名称更新成功');
    } catch (err) {
      toast('更新会话名称失败', 'error');
      console.error('Failed to update session name:', err);
    }
  };

  const summarizeAndRenameSession = useCallback(async (
    sessionId: string,
    userMessage: string,
  ): Promise<void> => {
    try {
      const response = await fetch(`${LANGGRAPH_API_V1_BASE}/chatbot/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenStorage.getSessionToken()}`,
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: userMessage }],
          system_prompt:
            '简要概括一下用户的问题，不超过20个字，不要输出标点符号和其他多余内容，不需要调用skill和工具，只输出概括内容，不需要其他任何回复',
          // 标题生成走 default agent；与 system_prompt 同传 workflow 会导致后端路由混乱
          pre_defined_workflow: null,
        }),
      });

      const reader = response.body?.getReader();
      if (!reader) return;

      let summary = '';
      try {
        for await (const data of readChatStream(reader)) {
          if (!data.done && data.content) {
            summary += data.content;
          }
        }
      } finally {
        reader.releaseLock();
      }

      if (summary.trim()) {
        await authAPI.updateSessionName(sessionId, summary.trim());

        setSessions(prev => prev.map(s =>
          s.id === sessionId ? { ...s, name: summary.trim() } : s
        ));
      }
    } catch (err) {
      console.error('Failed to summarize session name:', err);
    }
  }, []);

  const runtime = useLangGraphRuntime({
    stream: async function* (messages, { abortSignal }) {
      const sessionToken = tokenStorage.getSessionToken();
      if (!sessionToken || !currentSessionId) {
        throw new Error('No session selected');
      }

      const currentSession = sessions.find(s => s.id === currentSessionId);
      const isFirstMessage = messages.length === 1 && messages[0].type === 'human';
      const needsRename = currentSession && !currentSession.name.trim() && isFirstMessage;

      if (needsRename) {
        const userContent = messages[0].content as string;
        summarizeAndRenameSession(currentSessionId, userContent);
      }

      // Add user message to sessionMessages before streaming
      if (currentSessionId && messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage.type === 'human') {
          setSessionMessages(prev => ({
            ...prev,
            [currentSessionId]: [...(prev[currentSessionId] || []), lastMessage],
          }));
        }
      }

      let assistantContent = '';
      const assistantMessageId = crypto.randomUUID();

      try {
        const transformedMessages = messages.map(msg => ({
          role: msg.type === 'human' ? 'user' : 'assistant',
          content: msg.content,
        }));

        const response = await fetch(`${LANGGRAPH_API_V1_BASE}/chatbot/chat/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({
            messages: transformedMessages,
            pre_defined_workflow: preDefinedWorkflowRef.current,
          }),
          signal: abortSignal,
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => response.statusText);
          throw new Error(errText || `Stream request failed (${response.status})`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body from stream');
        }

        try {
          for await (const data of readChatStream(reader)) {
            if (data.done) {
              break;
            }

            // Backend sends full assistant text per chunk (including ask_human / interrupt prompts).
            if (data.content) {
              assistantContent = data.content;
              yield {
                event: MESSAGES_COMPLETE_EVENT,
                data: [{
                  id: assistantMessageId,
                  type: 'ai',
                  content: assistantContent,
                }],
              } satisfies LangGraphMessagesEvent<LangChainMessage>;
            }
          }
        } finally {
          reader.releaseLock();
        }
      } catch (error) {
        console.error('Stream error:', error);
        throw error;
      }

      // Add complete assistant message to sessionMessages after streaming
      if (currentSessionId && assistantContent) {
        const assistantMessage: LangChainMessage = {
          type: 'ai',
          content: assistantContent,
        };
        setSessionMessages(prev => ({
          ...prev,
          [currentSessionId]: [...(prev[currentSessionId] || []), assistantMessage],
        }));
      }
    },
    load: async (externalId: string) => {
      // Return messages from state if already loaded
      const messages = sessionMessages[externalId];
      if (messages) {
        return { messages };
      }
      console.log('load from backend', externalId);
      // Fetch from backend if not loaded
      try {
        const messagesResponse = await chatAPI.getMessages();
        const loadedMessages: LangChainMessage[] = messagesResponse.messages.map(msg => ({
          type: msg.role === 'user' ? ('human' as const) : ('ai' as const),
          content: msg.content,
        }));
        setSessionMessages(prev => ({
          ...prev,
          [externalId]: loadedMessages,
        }));
        return { messages: loadedMessages };
      } catch (error) {
        console.error('Failed to load messages from backend:', error);
        return { messages: [] };
      }
    },
    unstable_threadListAdapter: threadListAdapter,
  });

  useEffect(() => {
    fetchSessions();
    setLoading(false);
  }, [fetchSessions]);

  // Handle session switching
  useEffect(() => {
    if (!currentSessionId) return;

    const switchSession = async () => {
      try {
        // First, set the session token from cached tokens
        const sessionToken = sessionTokens[currentSessionId];
        if (sessionToken) {
          tokenStorage.setSessionToken(sessionToken);
        }

        // Then switch to the thread
        if (runtime.threads && runtime.threads.switchToThread) {
          await runtime.threads.switchToThread(currentSessionId);
        }
      } catch (error) {
        console.error('Failed to switch session:', error);
      }
    };

    switchSession();
  }, [currentSessionId, sessionTokens, runtime]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500" />
          <span className="text-sm text-gray-500">加载中...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex bg-gray-50">
      {/* Sidebar */}
      <aside
        className={`flex flex-col border-r border-gray-200 bg-white transition-all duration-300 ${
          sidebarCollapsed ? 'w-0 overflow-hidden border-r-0' : 'w-[280px]'
        }`}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800 text-base">聊天助手</h2>
          <button
            onClick={() => setSidebarCollapsed(true)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <PanelLeftCloseIcon className="size-4" />
          </button>
        </div>

        {/* New Chat Button */}
        <div className="px-3 py-3">
          <button
            onClick={createNewSession}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-600 active:bg-blue-700 transition-colors"
          >
            <PlusIcon className="size-4" />
            新增 Chat
          </button>
        </div>

        {/* Session List */}
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <MessageSquareIcon className="size-8 mb-2" />
              <span className="text-xs">暂无会话</span>
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {sessions.map(session => (
                <div
                  key={session.id}
                  onClick={() => {
                    if (editingSessionId !== session.id) {
                      setCurrentSessionId(session.id);
                    }
                  }}
                  onMouseEnter={() => setHoveredSessionId(session.id)}
                  onMouseLeave={() => setHoveredSessionId(null)}
                  className={`group relative flex items-center gap-2 rounded-lg px-3 py-2.5 cursor-pointer transition-colors ${
                    currentSessionId === session.id
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <MessageSquareIcon className="size-4 shrink-0 opacity-50" />

                  {editingSessionId === session.id ? (
                    <div className="flex flex-1 items-center gap-1 min-w-0">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditName(e.target.value)}
                        autoFocus
                        onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                          if (e.key === 'Enter') handleUpdateSessionName(session.id);
                          else if (e.key === 'Escape') setEditingSessionId(null);
                        }}
                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        className="flex-1 min-w-0 rounded-md border border-blue-300 bg-white px-2 py-0.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
                      />
                      <button
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          handleUpdateSessionName(session.id);
                        }}
                        className="shrink-0 p-1 rounded text-blue-500 hover:bg-blue-100"
                      >
                        <CheckIcon className="size-3.5" />
                      </button>
                      <button
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          setEditingSessionId(null);
                        }}
                        className="shrink-0 p-1 rounded text-gray-400 hover:bg-gray-100"
                      >
                        <XIcon className="size-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="flex-1 truncate text-sm">{session.name}</span>
                      <div
                        className={`flex items-center gap-0.5 shrink-0 transition-opacity ${
                          hoveredSessionId === session.id || currentSessionId === session.id
                            ? 'opacity-100'
                            : 'opacity-0'
                        }`}
                      >
                        <button
                          onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            setEditingSessionId(session.id);
                            setEditName(session.name);
                          }}
                          className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-200"
                        >
                          <PencilIcon className="size-3.5" />
                        </button>
                        <button
                          onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            setDeleteConfirm({ open: true, sessionId: session.id });
                          }}
                          className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50"
                        >
                          <Trash2Icon className="size-3.5" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

      </aside>

      {/* Main Content */}
      <main className="flex flex-1 flex-col min-w-0">
        {/* Sidebar Toggle Button */}
        {sidebarCollapsed && (
          <div className="absolute top-4 left-4 z-10">
            <button
              onClick={() => setSidebarCollapsed(false)}
              className="p-2 rounded-lg bg-white border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors shadow-sm"
            >
              <PanelLeftOpenIcon className="size-4" />
            </button>
          </div>
        )}

        {/* Chat Body */}
        <div className="flex-1 overflow-hidden">
          {currentSessionId ? (
            <PreDefinedWorkflowProvider
              workflow={currentWorkflow}
              setWorkflow={setCurrentSessionWorkflow}
            >
              <AssistantRuntimeProvider runtime={runtime} key={currentSessionId}>
                <Thread />
              </AssistantRuntimeProvider>
            </PreDefinedWorkflowProvider>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400">
              <div className="flex flex-col items-center gap-3">
                <MessageSquareIcon className="size-12 text-gray-300" />
                <p className="text-sm">请选择或创建一个会话</p>
                <button
                  onClick={createNewSession}
                  className="mt-2 flex items-center gap-2 rounded-xl bg-blue-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-600 transition-colors"
                >
                  <PlusIcon className="size-4" />
                  开始新对话
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        open={deleteConfirm.open}
        title="删除会话"
        description="确定删除该会话？此操作不可撤销。"
        confirmText="删除"
        cancelText="取消"
        onConfirm={() => {
          if (deleteConfirm.sessionId) {
            handleDeleteSession(deleteConfirm.sessionId);
          }
          setDeleteConfirm({ open: false, sessionId: null });
        }}
        onCancel={() => setDeleteConfirm({ open: false, sessionId: null })}
      />
    </div>
  );
}

export default ChatContent;
