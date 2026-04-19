import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';

const API_BASE_URL = '/api/v1';

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

api.interceptors.request.use((config: AxiosRequestConfig) => {
  const token = localStorage.getItem('token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      localStorage.removeItem('token');
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

export default api;
