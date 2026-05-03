import axios, { AxiosInstance, AxiosResponse } from 'axios';
import type { RemoteThreadListAdapter } from '@assistant-ui/react';

const API_BASE_URL = '/langgraph/api/v1';

export interface User {
  id: number;
  email: string;
  username?: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_at: string;
}

export interface UserResponse {
  id: number;
  email: string;
  username?: string;
  token: {
    access_token: string;
    token_type: string;
    expires_at: string;
  };
}

export interface Session {
  session_id: string;
  name: string;
  token: {
    access_token: string;
    token_type: string;
    expires_at: string;
  };
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
}

export interface ChatResponse {
  messages: Message[];
}

export interface StreamResponse {
  content: string;
  done: boolean;
}

const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Token storage helpers
export const tokenStorage = {
  setUserToken: (token: string): void => {
    localStorage.setItem('userToken', token);
  },
  getUserToken: (): string | null => {
    return localStorage.getItem('userToken');
  },
  clearUserToken: (): void => {
    localStorage.removeItem('userToken');
  },
  setSessionToken: (token: string): void => {
    localStorage.setItem('sessionToken', token);
  },
  getSessionToken: (): string | null => {
    return localStorage.getItem('sessionToken');
  },
  clearSessionToken: (): void => {
    localStorage.removeItem('sessionToken');
  },
};

api.interceptors.request.use((config: any) => {
  const url = config.url || '';
  let token: string | null = null;

  // Determine which token to use based on the endpoint
  if (url.includes('/auth/login') || url.includes('/auth/register')) {
    // No token needed for login/register
    token = null;
  } else if (url.includes('/auth/session') && (config.method === 'delete' || config.method === 'patch')) {
    // Delete and patch session endpoints use session token
    token = tokenStorage.getSessionToken();
  } else if (url.includes('/auth/session')) {
    // Other auth endpoints use user token
    token = tokenStorage.getUserToken();
  } else if (url.includes('/chatbot')) {
    // Chatbot endpoints use session token
    token = tokenStorage.getSessionToken();
  } else {
    // Default to user token
    token = tokenStorage.getUserToken();
  }

  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      tokenStorage.clearUserToken();
      tokenStorage.clearSessionToken();
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    throw error;
  }
);

export const authAPI = {
  register: async (userData: { email: string; password: string; username?: string }): Promise<UserResponse> => {
    const response: AxiosResponse<UserResponse> = await api.post('/auth/register', userData);
    return response.data;
  },

  login: async (email: string, password: string): Promise<TokenResponse> => {
    const formData = new FormData();
    formData.append('email', email);
    formData.append('password', password);
    formData.append('grant_type', 'password');
    const response: AxiosResponse<TokenResponse> = await api.post('/auth/login', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  createSession: async (): Promise<Session> => {
    const response: AxiosResponse<Session> = await api.post('/auth/session');
    return response.data;
  },

  getSessions: async (): Promise<Session[]> => {
    const response: AxiosResponse<Session[]> = await api.get('/auth/sessions');
    return response.data;
  },

  updateSessionName: async (sessionId: string, name: string): Promise<Session> => {
    const formData = new FormData();
    formData.append('name', name);
    const response: AxiosResponse<Session> = await api.patch(`/auth/session/${sessionId}/name`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  deleteSession: async (sessionId: string): Promise<void> => {
    await api.delete(`/auth/session/${sessionId}`);
  },
};

export const chatAPI = {
  sendMessage: async (messages: Message[]): Promise<ChatResponse> => {
    const response: AxiosResponse<ChatResponse> = await api.post('/chatbot/chat', { messages });
    return response.data;
  },

  getMessages: async (): Promise<ChatResponse> => {
    const response: AxiosResponse<ChatResponse> = await api.get('/chatbot/messages');
    return response.data;
  },

  clearHistory: async (): Promise<void> => {
    await api.delete('/chatbot/messages');
  },
};

// Thread list adapter for session management
export const threadListAdapter: RemoteThreadListAdapter = {
  async list() {
    const response: Session[] = await authAPI.getSessions();
    return {
      threads: response.map((thread) => ({
        remoteId: thread.session_id,
        externalId: thread.session_id,
        status: 'regular',
        title: thread.name ?? undefined,
      })),
    };
  },

  async initialize(_localId) {
    const response: Session = await authAPI.createSession();
    return { remoteId: response.session_id, externalId: response.session_id };
  },

  async rename(remoteId, title) {
    await authAPI.updateSessionName(remoteId, title);
  },

  async archive(remoteId) {
    // Archive not implemented in current API - using delete as fallback
    await authAPI.deleteSession(remoteId);
  },

  async unarchive(_remoteId) {
    // Unarchive not implemented in current API
    console.warn('Unarchive not implemented');
  },

  async delete(remoteId) {
    await authAPI.deleteSession(remoteId);
  },

  async fetch(remoteId) {
    const response: Session[] = await authAPI.getSessions();
    const thread = response.find((s) => s.session_id === remoteId);
    if (!thread) {
      throw new Error(`Thread ${remoteId} not found`);
    }
    return {
      status: 'regular',
      remoteId: thread.session_id,
      title: thread.name,
    };
  },

  async generateTitle(_remoteId, _unstable_messages) {
    // Title generation is handled in the Chat component via summarizeAndRenameSession
    // Return an empty readable stream as placeholder
    return new ReadableStream({
      start(controller) {
        controller.close();
      },
    });
  },
};

export default api;
