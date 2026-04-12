import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'https://atendimento.wolfx.com.br/api/v1';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
});

// Interceptor to add auth token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Interceptor to handle 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    return Promise.reject(error);
  }
);

export default api;

// Auth
export const getMe = () => api.get('/auth/me');

export const login = (username: string, password: string) => {
  const formData = new URLSearchParams();
  formData.append('username', username);
  formData.append('password', password);
  return api.post('/auth/login', formData, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
};

// Tickets
export const getTickets = (params?: { status?: string; priority?: string }) =>
  api.get('/tickets', { params });

export const getTicket = (id: string) => api.get(`/tickets/${id}`);

export const createTicket = (data: { title: string; description: string; priority: string; category_id?: string; product_id?: string; customer_id?: string }) =>
  api.post('/tickets', data);

export const updateTicket = (id: string, data: Partial<{ status: string; agent_id: string; resolution_summary: string }>) =>
  api.patch(`/tickets/${id}`, data);

export const deleteTicket = (id: string) => api.delete(`/tickets/${id}`);

export const uploadTicketPhoto = (id: string, file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post(`/tickets/${id}/photos`, formData);
};

export const deleteTicketPhoto = (id: string, filename: string) =>
  api.delete(`/tickets/${id}/photos/${filename}`);

// Comments
export const getComments = (ticketId: string) => api.get(`/tickets/${ticketId}/comments`);

export const createComment = (ticketId: string, data: { body: string; is_public: boolean }) =>
  api.post(`/tickets/${ticketId}/comments`, data);

export const deleteComment = (ticketId: string, commentId: string) =>
  api.delete(`/tickets/${ticketId}/comments/${commentId}`);

// Approve/Reject
export const approveTicket = (id: string, comment?: string) =>
  api.post(`/tickets/${id}/approve`, { action: 'approved', comment });

export const rejectTicket = (id: string, comment: string) =>
  api.post(`/tickets/${id}/approve`, { action: 'rejected', comment });

// Categories
export const getCategories = (type?: string) =>
  api.get('/categories', { params: { type } });

// Products
export const getProducts = (params?: { category_id?: string; search?: string }) =>
  api.get('/products', { params });

export const getProduct = (id: string) => api.get(`/products/${id}`);

export const createProduct = (data: { name: string; sku: string; description?: string; price: number; category_id: string }) =>
  api.post('/products', data);

export const updateProduct = (id: string, data: Partial<{ name: string; price: number; description: string }>) =>
  api.patch(`/products/${id}`, data);

export const deleteProduct = (id: string) => api.delete(`/products/${id}`);

export const uploadProductImage = (id: string, file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post(`/products/${id}/images`, formData);
};

// Customers (admin)
export const getCustomers = () => api.get('/customers');

export const createCustomer = (data: { name: string; email: string; phone?: string; address?: string; password: string }) =>
  api.post('/customers', data);

// Agents
export const getAgents = () => api.get('/agents');

export const getAgent = (id: string) => api.get(`/agents/${id}`);

export const createAgent = (data: { user_id: string; team: string; status: string; max_tickets: number }) =>
  api.post('/agents', data);

export const updateAgentStatus = (id: string, status: string) =>
  api.patch(`/agents/${id}/status`, null, { params: { status } });

// SLAs (admin)
export const getSLAs = () => api.get('/sla');

export const getGlobalSLAs = () => api.get('/sla/global');

export const getSLADashboard = () => api.get('/sla/dashboard');
