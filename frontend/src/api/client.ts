import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'https://atendimento.wolfx.com.br/api/v1';

/** Extract a human-readable message from an API error (axios error or raw detail). */
export function extractErrorMessage(err: any): string {
  // Axios error: err.response?.data?.detail
  const detail = err?.response?.data?.detail ?? err?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    // Pydantic validation errors: [{type, loc, msg, ...}, ...]
    return (detail as any[]).map((e: any) => e.msg || JSON.stringify(e)).join('; ');
  }
  if (typeof detail === 'object' && detail !== null) {
    return detail.msg || JSON.stringify(detail);
  }
  // Fallback
  return err?.message || String(err) || 'Erro desconhecido';
}

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

// Interceptor to handle 401 — redirect to login on unauthorized
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
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

export const createTicket = (data: {
  title: string;
  description: string;
  priority: string;
  category_id?: string;
  product_id?: string;
  customer_id?: string;
  parent_ticket_id?: string;
  opened_at?: string;
}) => api.post('/tickets', data);

export const updateTicket = (id: string, data: Partial<{
  title: string;
  description: string;
  status: string;
  priority: string;
  agent_id: string;
  category_id: string;
  resolution_summary: string;
  parent_ticket_id: string;
  opened_at: string;
  attended_at: string;
  closed_at: string;
}>) => api.patch(`/tickets/${id}`, data);

export const deleteTicket = (id: string) => api.delete(`/tickets/${id}`);

export const bulkDeleteTickets = (ids: string[]) => api.post('/tickets/bulk-delete', ids);

export const uploadTicketAttachments = (id: string, files: File[]) => {
  const formData = new FormData();
  files.forEach(file => formData.append('files', file));
  return api.post(`/tickets/${id}/attachments`, formData);
};

export const uploadTicketPhoto = (id: string, file: File) => {
  const formData = new FormData();
  formData.append('files', file);
  return api.post(`/tickets/${id}/attachments`, formData);
};

export const deleteTicketPhoto = (id: string, filename: string) =>
  api.delete(`/tickets/${id}/photos/${filename}`);

// Comments
export const getComments = (ticketId: string) => api.get(`/tickets/${ticketId}/comments`);

export const createComment = (ticketId: string, data: { body: string; is_public: boolean }) =>
  api.post(`/tickets/${ticketId}/comments`, data);

export const deleteComment = (ticketId: string, commentId: string) =>
  api.delete(`/tickets/${ticketId}/comments/${commentId}`);

// Ticket Collaborators
export const getTicketCollaborators = (ticketId?: string) =>
  api.get('/ticket-collaborators', { params: ticketId ? { ticket_id: ticketId } : {} });

export const addTicketCollaborator = (data: { ticket_id: string; user_id: string; hours_spent?: number; minutes_spent?: number; notes?: string }) =>
  api.post('/ticket-collaborators', data);

export const updateTicketCollaborator = (id: string, data: { hours_spent?: number; minutes_spent?: number; notes?: string }) =>
  api.patch(`/ticket-collaborators/${id}`, data);

export const removeTicketCollaborator = (id: string) =>
  api.delete(`/ticket-collaborators/${id}`);

// Ticket Products
export const getTicketProducts = (ticketId?: string) =>
  api.get('/ticket-products', { params: ticketId ? { ticket_id: ticketId } : {} });

export const addTicketProduct = (data: { ticket_id: string; product_id: string; quantity?: number }) =>
  api.post('/ticket-products', data);

export const updateTicketProduct = (id: string, data: { quantity?: number }) =>
  api.patch(`/ticket-products/${id}`, data);

export const removeTicketProduct = (id: string) =>
  api.delete(`/ticket-products/${id}`);

// Ticket Relations
export const getTicketRelations = (ticketId?: string) =>
  api.get('/ticket-relations', { params: ticketId ? { ticket_id: ticketId } : {} });

export const addTicketRelation = (data: { source_ticket_id: string; target_ticket_id: string }) =>
  api.post('/ticket-relations', data);

export const removeTicketRelation = (id: string) =>
  api.delete(`/ticket-relations/${id}`);

// Approve/Reject
export const approveTicket = (id: string, comment?: string) =>
  api.post(`/tickets/${id}/approve`, { action: 'approved', comment });

export const rejectTicket = (id: string, comment: string) =>
  api.post(`/tickets/${id}/approve`, { action: 'rejected', comment });

// Categories
export const getCategories = (type?: string) =>
  api.get('/categories', { params: { type } });

export const createCategory = (data: {
  name: string;
  slug: string;
  type: string;
  description?: string;
  color?: string;
  icon?: string;
  order?: number;
  parent_id?: string;
}) => api.post('/categories', data);

export const updateCategory = (id: string, data: {
  name?: string;
  slug?: string;
  description?: string;
  color?: string;
  icon?: string;
  order?: number;
  is_active?: boolean;
}) => api.patch(`/categories/${id}`, data);

export const deleteCategory = (id: string) => api.delete(`/categories/${id}`);

// Products
export const getProducts = (params?: { category_id?: string; search?: string }) =>
  api.get('/products', { params });

export const getProduct = (id: string) => api.get(`/products/${id}`);

export const createProduct = (data: {
  name: string;
  sku?: string;
  description?: string;
  price?: number;
  cost_price?: number;
  category_id?: string;
  brand?: string;
  model?: string;
  barcode?: string;
  stock_quantity?: number;
  min_stock?: number;
  weight?: number;
  dimensions?: string;
  warranty_months?: number;
  supplier?: string;
  product_url?: string;
  notes?: string;
  tax_rate?: number;
  is_active?: boolean;
}) => api.post('/products', data);

export const updateProduct = (id: string, data: Partial<{
  name: string;
  sku?: string;
  description?: string;
  price?: number;
  cost_price?: number;
  category_id?: string;
  brand?: string;
  model?: string;
  barcode?: string;
  stock_quantity?: number;
  min_stock?: number;
  weight?: number;
  dimensions?: string;
  warranty_months?: number;
  supplier?: string;
  product_url?: string;
  notes?: string;
  tax_rate?: number;
  is_active?: boolean;
}>) => api.patch(`/products/${id}`, data);

export const deleteProduct = (id: string) => api.delete(`/products/${id}`);

export const uploadProductImage = (id: string, file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post(`/products/${id}/images`, formData);
};

export const deleteProductImage = (id: string, filename: string) =>
  api.delete(`/products/${id}/images/${filename}`);

// Parts (inventory management)
export const getParts = () => api.get('/parts');

export const getPart = (id: string) => api.get(`/parts/${id}`);

export const createPart = (data: {
  name: string;
  sku: string;
  description?: string;
  cost_price: number;
  sale_price: number;
  estimated_time?: string;
  image?: string;
  is_kit?: boolean;
  parent_part_id?: string;
}) => api.post('/parts', data);

export const updatePart = (id: string, data: Partial<{
  name: string;
  sku: string;
  description?: string;
  cost_price?: number;
  sale_price?: number;
  estimated_time?: string;
  image?: string;
  is_kit?: boolean;
  parent_part_id?: string;
}>) => api.patch(`/parts/${id}`, data);

export const deletePart = (id: string) => api.delete(`/parts/${id}`);

// Product-Part associations
export const getProductParts = (productId: string) =>
  api.get(`/product-parts`, { params: { product_id: productId } });

export const addPartToProduct = (data: { product_id: string; part_id: string; quantity: number }) =>
  api.post('/product-parts', data);

export const updateProductPart = (id: string, data: { quantity: number }) =>
  api.patch(`/product-parts/${id}`, data);

export const removePartFromProduct = (id: string) =>
  api.delete(`/product-parts/${id}`);

// Product Composition (product composed of other products)
export const getProductCompositions = (productId: string) =>
  api.get(`/product-compositions`, { params: { product_id: productId } });

export const addProductComposition = (data: { product_id: string; component_product_id: string; quantity: number }) =>
  api.post('/product-compositions', data);

export const updateProductComposition = (id: string, data: { quantity: number }) =>
  api.patch(`/product-compositions/${id}`, data);

export const removeProductComposition = (id: string) =>
  api.delete(`/product-compositions/${id}`);

// Customers (admin)
export const getCustomers = () => api.get('/customers');

export const getCustomer = (id: string) => api.get(`/customers/${id}`);

export const createCustomer = (data: {
  name: string;
  document?: string;
  email?: string;
  phone?: string;
  address_street?: string;
  address_number?: string;
  address_complement?: string;
  address_district?: string;
  address_city?: string;
  address_state?: string;
  address_zip?: string;
  notes?: string;
}) => api.post('/customers', data);

export const updateCustomer = (id: string, data: Partial<{
  name: string;
  document: string;
  email: string;
  phone: string;
  is_active: boolean;
  address_street: string;
  address_number: string;
  address_complement: string;
  address_district: string;
  address_city: string;
  address_state: string;
  address_zip: string;
  notes: string;
}>) => api.patch(`/customers/${id}`, data);

export const deleteCustomer = (id: string) => api.delete(`/customers/${id}`);

// Agents
export const getAgents = () => api.get('/agents');

export const getAgent = (id: string) => api.get(`/agents/${id}`);

export const createAgent = (data: { user_id: string; team: string; status: string; max_tickets: number }) =>
  api.post('/agents', data);

export const updateAgentStatus = (id: string, status: string) =>
  api.patch(`/agents/${id}/status`, null, { params: { status } });

// SLAs (admin)
export const getSLAs = (params?: { customer_id?: string; priority?: string; category_id?: string; is_active?: boolean }) =>
  api.get('/sla', { params });

export const getGlobalSLAs = () => api.get('/sla/global');

export const getSLADashboard = () => api.get('/sla/dashboard');

export const getAtRiskTickets = () => api.get('/sla/tickets/at-risk');

export const createSLA = (data: {
  name: string;
  priority: string;
  category_id?: string;
  first_response_minutes: number;
  resolution_minutes: number;
  business_hours_only?: boolean;
  is_active?: boolean;
}) => api.post('/sla', data);

export const updateSLA = (id: string, data: Partial<{
  name: string;
  category_id: string;
  first_response_minutes: number;
  resolution_minutes: number;
  business_hours_only: boolean;
  is_active: boolean;
}>) => api.patch(`/sla/${id}`, data);

export const deleteSLA = (id: string) => api.delete(`/sla/${id}`);

export const calculateSLA = (customer_id: string, priority: string, category_id?: string) =>
  api.get('/sla/calculate', { params: { customer_id, priority, category_id } });

// Menu
export const getMenuItems = () => api.get('/menu');

export const createMenuItem = (data: { category: string; title: string; href: string; icon?: string; order?: number }) =>
  api.post('/menu', data);

export const updateMenuItem = (id: string, data: { category?: string; title?: string; href?: string; icon?: string; order?: number; is_active?: boolean }) =>
  api.put(`/menu/${id}`, data);

export const deleteMenuItem = (id: string) => api.delete(`/menu/${id}`);

export const createMenuItemsBulk = (items: { category: string; title: string; href: string; icon?: string; order?: number }[]) =>
  api.post('/menu/bulk', items);

// ─── Knowledge Base ───────────────────────────────────────────────

export const getKBCategories = (include_inactive = false) =>
  api.get('/kb/categories', { params: { include_inactive } });

export const createKBCategory = (data: { name: string; description?: string; parent_id?: string }) =>
  api.post('/kb/categories', data);

export const updateKBCategory = (id: string, data: Partial<{ name: string; description: string; parent_id: string; is_active: boolean }>) =>
  api.patch(`/kb/categories/${id}`, data);

export const deleteKBCategory = (id: string) => api.delete(`/kb/categories/${id}`);

export const getKBArticles = (params?: { status?: string; category_id?: string; tag?: string }) =>
  api.get('/kb/articles', { params });

export const getKBArticle = (id: string) => api.get(`/kb/articles/${id}`);

export const createKBArticle = (data: {
  title: string; content: string; summary?: string;
  category_id?: string; status?: string; tags?: string[];
}) => api.post('/kb/articles', data);

export const updateKBArticle = (id: string, data: Partial<{
  title: string; content: string; summary: string;
  category_id: string; status: string; tags: string[];
}>) => api.patch(`/kb/articles/${id}`, data);

export const deleteKBArticle = (id: string) => api.delete(`/kb/articles/${id}`);

export const searchKBArticles = (q: string) => api.get('/kb/search', { params: { q } });

export const getRelatedArticles = (id: string, limit = 5) =>
  api.get(`/kb/articles/${id}/related`, { params: { limit } });

export const suggestKBArticles = (text: string, limit = 5) =>
  api.get('/kb/suggest', { params: { text, limit } });

export const uploadKBAttachment = (articleId: string, file: File) => {
  const form = new FormData();
  form.append('file', file);
  return api.post(`/kb/articles/${articleId}/attachments`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const deleteKBAttachment = (id: string) => api.delete(`/kb/attachments/${id}`);

export const voteKBArticle = (id: string, vote: 'useful' | 'not_useful') =>
  api.post(`/kb/articles/${id}/vote`, { vote });

export const downloadKBAttachment = (id: string) =>
  `${import.meta.env.VITE_API_URL || ''}/api/v1/kb/attachments/${id}`;

export const getKBTags = () => api.get('/kb/tags');

export const createKBTag = (name: string) => api.post('/kb/tags', { name });

export const deleteKBTag = (id: string) => api.delete(`/kb/tags/${id}`);

// Users / Colaboradores (admin HR management)
export const getUsers = (params?: { role?: string; is_active?: boolean }) =>
  api.get('/users', { params });

export const getUser = (id: string) => api.get(`/users/${id}`);

export const createUser = (data: {
  email: string;
  password: string;
  name: string;
  role: string;
  phone?: string;
  is_active?: boolean;
  birth_date?: string;
  cpf?: string;
  rg?: string;
  gender?: string;
  marital_status?: string;
  address_street?: string;
  address_city?: string;
  address_state?: string;
  address_zip?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relation?: string;
  position?: string;
  department?: string;
  hire_date?: string;
  salary?: number;
  work_shift?: string;
  notes?: string;
}) => api.post('/users', data);

export const updateUser = (id: string, data: Partial<{
  name?: string;
  phone?: string;
  is_active?: boolean;
  birth_date?: string;
  cpf?: string;
  rg?: string;
  gender?: string;
  marital_status?: string;
  address_street?: string;
  address_city?: string;
  address_state?: string;
  address_zip?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relation?: string;
  position?: string;
  department?: string;
  hire_date?: string;
  salary?: number;
  work_shift?: string;
  notes?: string;
}>) => api.patch(`/users/${id}`, data);

export const deleteUser = (id: string) => api.delete(`/users/${id}`);
