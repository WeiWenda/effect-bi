import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquarePlus, LogOut, Send, Trash2, Edit3, User } from 'lucide-react';
import { authAPI } from '../services/api';
function ChatContent() {
 const [user, setUser] = useState(null);
 const [sessions, setSessions] = useState([]);
 const [currentSessionId, setCurrentSessionId] = useState(null);
 const [sessionTokens, setSessionTokens] = useState({});
 const [messages, setMessages] = useState({});
 const [newMessage, setNewMessage] = useState('');
 const [loading, setLoading] = useState(true);
 const [sending, setSending] = useState(false);
 const [editingSessionId, setEditingSessionId] = useState(null);
 const [editName, setEditName] = useState('');
 const messagesEndRef = useRef(null);
 const navigate = useNavigate();
 const scrollToBottom = useCallback(() => {
 messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
 }, []);
 const fetchUser = useCallback(async () => {
 try {
 const token = localStorage.getItem('token');
 if (!token) {
 navigate('/login');
 return;
 }
 setUser({ email: '用户' });
 }
 catch (err) {
 navigate('/login');
 }
 }, [navigate]);
 const fetchSessions = useCallback(async () => {
 try {
 const response = await authAPI.getSessions();
 const sessionList = response.map(s => ({
 id: s.session_id,
 name: s.name,
 updatedAt: new Date(),
 }));
 setSessions(sessionList);
 const tokens = {};
 response.forEach(s => {
 tokens[s.session_id] = s.token.access_token;
 });
 setSessionTokens(tokens);
 if (response.length > 0) {
 setCurrentSessionId(response[0].session_id);
 await fetchMessages(response[0].session_id, tokens[response[0].session_id]);
 }
 }
 catch (err) {
 console.error('Failed to fetch sessions:', err);
 }
 }, []);
 const fetchMessages = async (sessionId, token) => {
 try {
 const originalToken = localStorage.getItem('token');
 localStorage.setItem('token', token);
 const response = await fetch('/api/v1/chatbot/messages', {
 headers: { 'Authorization': `Bearer ${token}` }
 });
 if (response.ok) {
 const data = await response.json();
 setMessages(prev => ({ ...prev, [sessionId]: data.messages || [] }));
 }
 localStorage.setItem('token', originalToken);
 }
 catch (err) {
 console.error('Failed to fetch messages:', err);
 }
 };
 const createNewSession = useCallback(async () => {
 try {
 const response = await authAPI.createSession();
 const newSession = {
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
 setMessages(prev => ({ ...prev, [response.session_id]: [] }));
 }
 catch (err) {
 console.error('Failed to create session:', err);
 }
 }, []);
 const handleSendMessage = async () => {
 if (!newMessage.trim() || !currentSessionId)
 return;
 const sessionToken = sessionTokens[currentSessionId];
 if (!sessionToken)
 return;
 setSending(true);
 const message = {
 id: Date.now().toString(),
 role: 'user',
 content: newMessage,
 timestamp: new Date(),
 };
 setMessages(prev => ({
 ...prev,
 [currentSessionId]: [...(prev[currentSessionId] || []), message],
 }));
 setNewMessage('');
 try {
 const originalToken = localStorage.getItem('token');
 localStorage.setItem('token', sessionToken);
 const response = await fetch('/api/v1/chatbot/chat/stream', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 'Authorization': `Bearer ${sessionToken}`,
 },
 body: JSON.stringify({
 messages: [...(messages[currentSessionId] || []), { role: 'user', content: newMessage }]
 }),
 });
 const reader = response.body.getReader();
 const decoder = new TextDecoder();
 let assistantContent = '';
 const assistantMessageId = (Date.now() + 1).toString();
 while (true) {
 const { done, value } = await reader.read();
 if (done)
 break;
 const text = decoder.decode(value, { stream: true });
 const lines = text.split('\n\n').filter(line => line.trim());
 for (const line of lines) {
 if (line.startsWith('data: ')) {
 const data = JSON.parse(line.slice(6));
 if (data.content) {
 assistantContent += data.content;
 setMessages(prev => {
 const currentMsgs = prev[currentSessionId] || [];
 const lastMsg = currentMsgs[currentMsgs.length - 1];
 if (lastMsg?.role === 'assistant') {
 return {
 ...prev,
 [currentSessionId]: [
 ...currentMsgs.slice(0, -1),
 { ...lastMsg, content: assistantContent }
 ]
 };
 }
 else {
 return {
 ...prev,
 [currentSessionId]: [
 ...currentMsgs,
 {
 id: assistantMessageId,
 role: 'assistant',
 content: assistantContent,
 timestamp: new Date(),
 }
 ]
 };
 }
 });
 }
 }
 }
 }
 localStorage.setItem('token', originalToken);
 }
 catch (err) {
 console.error('Failed to send message:', err);
 }
 finally {
 setSending(false);
 }
 };
 const handleDeleteSession = async (sessionId) => {
 if (!confirm('确定要删除这个会话吗？'))
 return;
 try {
 const token = sessionTokens[sessionId];
 const originalToken = localStorage.getItem('token');
 localStorage.setItem('token', token);
 await authAPI.deleteSession(sessionId);
 localStorage.setItem('token', originalToken);
 setSessions(prev => prev.filter(s => s.id !== sessionId));
 setMessages(prev => {
 const newMessages = { ...prev };
 delete newMessages[sessionId];
 return newMessages;
 });
 if (currentSessionId === sessionId) {
 setCurrentSessionId(sessions.find(s => s.id !== sessionId)?.id || null);
 }
 }
 catch (err) {
 console.error('Failed to delete session:', err);
 }
 };
 const handleUpdateSessionName = async (sessionId) => {
 if (!editName.trim())
 return;
 try {
 const token = sessionTokens[sessionId];
 const originalToken = localStorage.getItem('token');
 localStorage.setItem('token', token);
 await authAPI.updateSessionName(sessionId, editName);
 localStorage.setItem('token', originalToken);
 setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, name: editName } : s));
 setEditingSessionId(null);
 setEditName('');
 }
 catch (err) {
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
 useEffect(() => {
 scrollToBottom();
 }, [messages, scrollToBottom]);
 useEffect(() => {
 if (currentSessionId && !messages[currentSessionId]) {
 const token = sessionTokens[currentSessionId];
 if (token) {
 fetchMessages(currentSessionId, token);
 }
 }
 }, [currentSessionId]);
 const handleLogout = () => {
 localStorage.removeItem('token');
 localStorage.removeItem('user');
 navigate('/login');
 };
 if (loading) {
 return (<div className="min-h-screen flex items-center justify-center">
 <div className="text-gray-500">加载中...</div>
 </div>);
 }
 return (<div className="flex h-screen bg-gray-100">
 <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
 <div className="p-4 border-b border-gray-200">
 <div className="flex items-center justify-between mb-2">
 <h2 className="font-semibold text-gray-800">聊天助手</h2>
 <button onClick={handleLogout} className="text-sm text-red-500 hover:text-red-600 flex items-center gap-1 transition-colors">
 <LogOut size={16}/>
 退出
 </button>
 </div>
 <div className="flex items-center gap-2 text-sm text-gray-500">
 <User size={16} className="rounded-full bg-gray-200 p-1"/>
 <span>{user?.email}</span>
 </div>
 </div>

 <div className="p-3">
 <button onClick={createNewSession} className="w-full bg-blue-600 text-white py-2.5 px-4 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 font-medium">
 <MessageSquarePlus size={18}/>
 新增 Chat
 </button>
 </div>

 <div className="flex-1 overflow-y-auto">
 {sessions.length === 0 ? (<div className="p-6 text-center text-gray-500">
 <MessageSquarePlus size={48} className="mx-auto mb-3 text-gray-300"/>
 <p>暂无会话</p>
 <p className="text-sm mt-1">点击上方按钮创建新会话</p>
 </div>) : (sessions.map(session => (<div key={session.id} onClick={() => setCurrentSessionId(session.id)} className={`p-3 cursor-pointer border-b border-gray-100 hover:bg-gray-50 transition-colors ${currentSessionId === session.id ? 'bg-blue-50 border-l-2 border-l-blue-600' : ''}`}>
 {editingSessionId === session.id ? (<div className="flex items-center gap-2">
 <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" autoFocus onKeyDown={(e) => {
 if (e.key === 'Enter')
 handleUpdateSessionName(session.id);
 else if (e.key === 'Escape')
 setEditingSessionId(null);
 }}/>
 <button onClick={(e) => { e.stopPropagation(); handleUpdateSessionName(session.id); }} className="p-1 text-green-600 hover:bg-green-50 rounded">
 <Edit3 size={16}/>
 </button>
 <button onClick={(e) => { e.stopPropagation(); setEditingSessionId(null); }} className="p-1 text-gray-500 hover:bg-gray-100 rounded">
 <span className="text-sm">取消</span>
 </button>
 </div>) : (<div className="flex items-center justify-between">
 <div className="flex-1 min-w-0">
 <div className="font-medium text-gray-800 truncate">
 {session.name}
 </div>
 <div className="text-xs text-gray-400 mt-0.5">
 {session.updatedAt.toLocaleString()}
 </div>
 </div>
 <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
 <button onClick={(e) => {
 e.stopPropagation();
 setEditingSessionId(session.id);
 setEditName(session.name);
 }} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors">
 <Edit3 size={14}/>
 </button>
 <button onClick={(e) => { e.stopPropagation(); handleDeleteSession(session.id); }} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
 <Trash2 size={14}/>
 </button>
 </div>
 </div>)}
 </div>)))}
 </div>
 </div>

 <div className="flex-1 flex flex-col bg-gray-50">
 {currentSessionId ? (<>
 <div className="h-14 bg-white border-b border-gray-200 flex items-center px-4 shadow-sm">
 <h3 className="font-medium text-gray-800">
 {sessions.find(s => s.id === currentSessionId)?.name || 'Chat'}
 </h3>
 </div>
 <div className="flex-1 overflow-y-auto p-4 space-y-4">
 {(messages[currentSessionId] || []).length === 0 ? (<div className="h-full flex flex-col items-center justify-center text-gray-400">
 <MessageSquarePlus size={64} className="mb-4 text-gray-200"/>
 <h3 className="text-lg font-medium text-gray-500">欢迎使用聊天助手</h3>
 <p className="text-sm mt-2">开始新的对话，我可以帮助你解答问题。</p>
 </div>) : ((messages[currentSessionId] || []).map((message, index) => (<div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
 <div className={`max-w-[70%] px-4 py-2.5 rounded-2xl ${message.role === 'user'
 ? 'bg-blue-600 text-white rounded-br-md'
 : 'bg-white text-gray-800 rounded-bl-md shadow-sm border border-gray-100'}`}>
 <p className="text-sm whitespace-pre-wrap">{message.content}</p>
 <div className={`text-xs mt-1 opacity-70 ${message.role === 'user' ? 'text-blue-100' : 'text-gray-400'}`}>
 {new Date(message.timestamp || Date.now()).toLocaleTimeString()}
 </div>
 </div>
 </div>)))}
 <div ref={messagesEndRef}/>
 </div>
 <div className="p-4 border-t border-gray-200 bg-white">
 <div className="flex items-end gap-3">
 <div className="flex-1">
 <textarea value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyDown={(e) => {
 if (e.key === 'Enter' && !e.shiftKey) {
 e.preventDefault();
 handleSendMessage();
 }
 }} placeholder="输入消息..." className="w-full px-4 py-3 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm" rows={2}/>
 </div>
 <button onClick={handleSendMessage} disabled={!newMessage.trim() || sending} className="bg-blue-600 text-white p-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
 {sending ? (<div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"/>) : (<Send size={20}/>)}
 </button>
 </div>
 </div>
 </>) : (<div className="h-full flex items-center justify-center text-gray-500">
 <div className="text-center">
 <MessageSquarePlus size={48} className="mx-auto mb-3 text-gray-300"/>
 <p>请选择或创建一个会话</p>
 </div>
 </div>)}
 </div>
 </div>);
}
export default ChatContent;
