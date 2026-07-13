import axios from 'axios';
import { getToken } from './auth';

const API_URL = import.meta.env.VITE_API_URL || (
  typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://localhost:8000/api'
    : 'https://backtestbaba-api.onrender.com/api'
);

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function listUsers() {
  const { data } = await axios.get(`${API_URL}/admin/users`, {
    headers: authHeaders(),
    timeout: 10000,
  });
  return data.results || data;
}

export async function setPlan(userId, plan) {
  const { data } = await axios.post(`${API_URL}/admin/users/plan`,
    { user_id: userId, plan },
    { headers: authHeaders(), timeout: 10000 },
  );
  return data;
}

export async function revokeSessions(userId) {
  const { data } = await axios.post(`${API_URL}/admin/sessions/revoke`,
    { user_id: userId },
    { headers: authHeaders(), timeout: 10000 },
  );
  return data;
}

export async function getQuota() {
  const { data } = await axios.get(`${API_URL}/quota`, {
    headers: authHeaders(),
    timeout: 10000,
  });
  return data;
}
