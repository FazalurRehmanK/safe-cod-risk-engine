// =============================================================================
// src/api/index.js — Centralized Axios Instance + API Functions
// =============================================================================
// A single axios instance with JWT injection interceptor and 401 auto-logout.
// All API calls go through these exported functions — no raw axios calls in
// components, making it easy to swap base URLs or add retry logic later.
// =============================================================================

import axios from 'axios';

const api = axios.create({
  // With Vite's dev proxy, /api is forwarded to https://safe-cod-api.onrender.com/api.
  // In production, set VITE_API_URL to the deployed backend URL.
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
});

// ── Request interceptor: attach JWT to every outgoing request ──────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Response interceptor: global 401 handling ──────────────────────────────
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// ── Auth ────────────────────────────────────────────────────────────────────
export const registerUser   = (data)  => api.post('/users/register', data);
export const loginUser      = (data)  => api.post('/users/login', data);
export const getMe          = ()      => api.get('/users/me');

// ── Products ─────────────────────────────────────────────────────────────────
export const getProducts    = ()      => api.get('/products');
export const getProduct     = (id)    => api.get(`/products/${id}`);

// ── Addresses ────────────────────────────────────────────────────────────────
export const getDistricts   = ()          => api.get('/addresses/districts');
export const getTowns       = (distId)    => api.get(`/addresses/districts/${distId}/towns`);
export const getBlockSectors= (townId)    => api.get(`/addresses/towns/${townId}/block-sectors`);

// ── Checkout & Orders ────────────────────────────────────────────────────────
export const placeOrder     = (data)      => api.post('/checkout', data);
export const verifyOtp      = (orderId, otp) => api.post(`/orders/${orderId}/verify-otp`, { otp });
export const getMyOrders    = ()          => api.get('/orders');

// ── Admin ─────────────────────────────────────────────────────────────────────
export const getAdminOrders = (params)    => api.get('/orders/admin/all', { params });
export const updateOrderStatus = (orderId, status) =>
  api.patch(`/orders/${orderId}/status`, { status });

export default api;
