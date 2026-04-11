export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'agent' | 'customer';
  phone?: string;
  is_active: boolean;
  customer_id?: string;
  telegram_chat_id?: string;
  created_at: string;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  is_active: boolean;
  created_at: string;
}

export interface Agent {
  user_id: string;
  email: string;
  name: string;
  phone?: string;
  role: string;
  is_active: boolean;
  team: string;
  status: 'available' | 'away' | 'offline';
  max_tickets: number;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  type: 'ticket' | 'product';
  color: string;
  icon: string;
  is_active: boolean;
}

export interface Product {
  id: string;
  customer_id: string;
  name: string;
  sku: string;
  description?: string;
  price: number;
  category_id: string;
  images: string[];
  is_active: boolean;
  created_at: string;
}

export interface Ticket {
  id: string;
  title: string;
  description: string;
  status: 'open' | 'in_progress' | 'pending' | 'solved' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  customer_id: string;
  agent_id?: string;
  category_id?: string;
  product_id?: string;
  sla_status?: 'within' | 'at_risk' | 'breached';
  photos: string[];
  tags: string[];
  resolution_summary?: string;
  approved_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: string;
  ticket_id: string;
  author_id: string;
  author_name: string;
  author_role: string;
  body: string;
  is_public: boolean;
  created_at: string;
}

export interface SLA {
  id: string;
  customer_id?: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  first_response_hours: number;
  resolution_hours: number;
  is_default: boolean;
  is_active: boolean;
}

export interface AuthState {
  token: string | null;
  user: User | null;
}

export interface LoginCredentials {
  username: string;
  password: string;
}
