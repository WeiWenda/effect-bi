import axios from 'axios';

const API_BASE_URL = '/api/v1';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    throw error;
  }
);

export const authAPI = {
  register: async (userData) => {
    const response = await api.post('/auth/register', userData);
    return response.data;
  },

  login: async (email, password) => {
    const response = await api.post('/auth/login', {
      email,
      password,
      grant_type: 'password',
    });
    return response.data;
  },

  createSession: async () => {
    const response = await api.post('/auth/session');
    return response.data;
  },

  getSessions: async () => {
    const response = await api.get('/auth/sessions');
    return response.data;
  },

  updateSessionName: async (sessionId, name) => {
    const response = await api.patch(`/auth/session/${sessionId}/name`, { name });
    return response.data;
  },

  deleteSession: async (sessionId) => {
    const response = await api.delete(`/auth/session/${sessionId}`);
    return response.data;
  },
};

export const chatAPI = {
  sendMessage: async (messages) => {
    const response = await api.post('/chatbot/chat', { messages });
    return response.data;
  },

  streamMessage: async (messages) => {
    const response = await api.post('/chatbot/chat/stream', { messages }, {
      responseType: 'stream',
    });
    return response.data;
  },

  getMessages: async () => {
    const response = await api.get('/chatbot/messages');
    return response.data;
  },

  clearHistory: async () => {
    const response = await api.delete('/chatbot/messages');
    return response.data;
  },
};

export default api;
