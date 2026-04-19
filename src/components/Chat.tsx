import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout, Menu, Button, Avatar, Popconfirm, message } from 'antd';
import { 
  PlusSquareOutlined, 
  LogoutOutlined, 
  DeleteOutlined, 
  EditOutlined, 
  UserOutlined,
  MessageOutlined
} from '@ant-design/icons';
import { AssistantRuntimeProvider } from '@assistant-ui/react';
import { useLangGraphRuntime, LangGraphMessagesEvent, LangChainMessage } from '@assistant-ui/react-langgraph';
import { Thread } from './assistant-ui/thread';
import { authAPI, Session } from '../services/api';

const { Sider, Content, Header } = Layout;

interface ChatSession {
  id: string;
  name: string;
  updatedAt: Date;
}

function ChatContent(): JSX.Element {
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessionTokens, setSessionTokens] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editName, setEditName] = useState<string>('');
  const navigate = useNavigate();

  const fetchUser = useCallback(async (): Promise<void> => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        navigate('/login');
        return;
      }
      setUser({ email: '用户' });
    } catch {
      navigate('/login');
    }
  }, [navigate]);

  const fetchSessions = useCallback(async (): Promise<void> => {
    try {
      const response: Session[] = await authAPI.getSessions();
      const sessionList: ChatSession[] = response.map(s => ({
        id: s.session_id,
        name: s.name,
        updatedAt: new Date(),
      }));
      setSessions(sessionList);

      const tokens: Record<string, string> = {};
      response.forEach(s => {
        tokens[s.session_id] = s.token.access_token;
      });
      setSessionTokens(tokens);

      if (response.length > 0) {
        setCurrentSessionId(response[0].session_id);
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
      setSessionTokens(prev => ({
        ...prev,
        [response.session_id]: response.token.access_token,
      }));
      message.success('会话创建成功');
    } catch (err) {
      message.error('创建会话失败');
      console.error('Failed to create session:', err);
    }
  }, []);

  const handleDeleteSession = async (sessionId: string): Promise<void> => {
    try {
      const token = sessionTokens[sessionId];
      const originalToken = localStorage.getItem('token');
      localStorage.setItem('token', token);
      await authAPI.deleteSession(sessionId);
      localStorage.setItem('token', originalToken || '');

      setSessions(prev => prev.filter(s => s.id !== sessionId));

      if (currentSessionId === sessionId) {
        const remainingSessions = sessions.filter(s => s.id !== sessionId);
        setCurrentSessionId(remainingSessions.length > 0 ? remainingSessions[0].id : null);
      }
      message.success('会话删除成功');
    } catch (err) {
      message.error('删除会话失败');
      console.error('Failed to delete session:', err);
    }
  };

  const handleUpdateSessionName = async (sessionId: string): Promise<void> => {
    if (!editName.trim()) return;

    try {
      const token = sessionTokens[sessionId];
      const originalToken = localStorage.getItem('token');
      localStorage.setItem('token', token);
      await authAPI.updateSessionName(sessionId, editName);
      localStorage.setItem('token', originalToken || '');

      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, name: editName } : s));
      setEditingSessionId(null);
      setEditName('');
      message.success('会话名称更新成功');
    } catch (err) {
      message.error('更新会话名称失败');
      console.error('Failed to update session name:', err);
    }
  };

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  useEffect(() => {
    if (user) {
      fetchSessions();
      setLoading(false);
    }
  }, [user, fetchSessions]);

  const handleLogout = (): void => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const runtime = useLangGraphRuntime({
    stream: async (messages, { abortSignal }) => {
      const sessionToken = sessionTokens[currentSessionId || ''];
      if (!sessionToken || !currentSessionId) {
        throw new Error('No session selected');
      }

      const originalToken = localStorage.getItem('token');
      localStorage.setItem('token', sessionToken);

      try {
        const transformedMessages = messages.map(msg => ({
          role: msg.type === 'human' ? 'user' : 'assistant',
          content: msg.content,
        }));

        const response = await fetch('/api/v1/chatbot/chat/stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({ messages: transformedMessages }),
          signal: abortSignal,
        });

        const reader = response.body?.getReader();

        return new ReadableStream({
          async start(controller) {
            if (!reader) {
              controller.close();
              return;
            }

            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) {
                  break;
                }

                const chunk = new TextDecoder().decode(value);
                const lines = chunk.split('\n').filter(line => line.trim());

                for (const line of lines) {
                  try {
                    const data = JSON.parse(line.replace('data:', ''));
                    
                    const event: LangGraphMessagesEvent<LangChainMessage> = {
                      event: 'messages/complete',
                      data: [{
                        type: 'ai',
                        content: data.content,
                      }]
                    };

                    controller.enqueue(event);
                  } catch (error) {
                    console.error('Failed to parse stream chunk:', error);
                  }
                }
              }
            } catch (error) {
              console.error('Stream error:', error);
              controller.error(error);
            } finally {
              reader.releaseLock();
              controller.close();
            }
          },
          cancel() {
            reader?.cancel();
          },
        });
      } finally {
        localStorage.setItem('token', originalToken || '');
      }
    }
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  return (
    <Layout className="h-screen">
      <Sider width={280} theme="light">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-800">聊天助手</h2>
            <Button
              type="text"
              danger
              icon={<LogoutOutlined />}
              onClick={handleLogout}
            >
              退出
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Avatar icon={<UserOutlined />} />
            <span className="text-sm text-gray-600">{user?.email}</span>
          </div>
        </div>

        <div className="pl-2 pr-2 pb-5">
          <Button
            type="primary"
            block
            icon={<PlusSquareOutlined />}
            onClick={createNewSession}
          >
            新增 Chat
          </Button>
        </div>

        <div className="pl-2 pr-2">
          <Menu
            mode="inline"
            selectedKeys={currentSessionId ? [currentSessionId] : []}
            className="flex-1"
          >
            {sessions.length === 0 ? (
              <Menu.Item key="empty" disabled>
                <MessageOutlined />
                暂无会话
              </Menu.Item>
            ) : (
              sessions.map(session => (
                <Menu.Item key={session.id} onClick={() => setCurrentSessionId(session.id)}>
                  {editingSessionId === session.id ? (
                    <div className="flex items-center gap-2 w-full">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditName(e.target.value)}
                        autoFocus
                        onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                          if (e.key === 'Enter') handleUpdateSessionName(session.id);
                          else if (e.key === 'Escape') setEditingSessionId(null);
                        }}
                        className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none"
                      />
                      <Button
                        type="text"
                        icon={<EditOutlined />}
                        onClick={() => handleUpdateSessionName(session.id)}
                      />
                      <Button
                        type="text"
                        onClick={() => setEditingSessionId(null)}
                      >
                        取消
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between w-full">
                      <div className="flex-1 min-w-0">
                        <span className="truncate">{session.name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          type="text"
                          icon={<EditOutlined />}
                          onClick={() => {
                            setEditingSessionId(session.id);
                            setEditName(session.name);
                          }}
                        />
                        <Popconfirm
                          title="确定删除该会话？"
                          onConfirm={() => handleDeleteSession(session.id)}
                        >
                          <Button type="text" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                      </div>
                    </div>
                  )}
                </Menu.Item>
              ))
            )}
          </Menu>
        </div>
      </Sider>

      <Content className="flex flex-col">
        {currentSessionId ? (
          <>
            <Header className="bg-white border-b px-4">
              <h3 className="font-medium text-gray-800 m-0">
                {sessions.find(s => s.id === currentSessionId)?.name || 'Chat'}
              </h3>
            </Header>
            <div className="flex-1 overflow-hidden">
              <AssistantRuntimeProvider runtime={runtime}>
                <Thread sessionId={currentSessionId} />
              </AssistantRuntimeProvider>
            </div>
          </>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-500">
            <div className="text-center">
              <MessageOutlined size={48} className="mx-auto mb-3 text-gray-300" />
              <p>请选择或创建一个会话</p>
            </div>
          </div>
        )}
      </Content>
    </Layout>
  );
}

export default ChatContent;
