import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || (
  typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://localhost:8000/api'
    : 'https://backtestbaba-api.onrender.com/api'
);

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

function api() {
  const token = getToken();
  return axios.create({
    baseURL: API_URL,
    timeout: 10000,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function isAdmin() {
  const user = getUser();
  return user?.is_admin === 1 || user?.is_admin === true;
}

export function saveSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  localStorage.setItem('isLoggedIn', 'true');
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem('isLoggedIn');
}

export async function signup(name, email, password) {
  const { data } = await axios.post(`${API_URL}/auth/signup`, { name, email, password });
  if (data.token && data.user) {
    saveSession(data.token, data.user);
  }
  return data;
}

export async function login(email, password) {
  const { data } = await axios.post(`${API_URL}/auth/login`, { email, password });
  if (data.token && data.user) {
    saveSession(data.token, data.user);
  }
  return data;
}

export async function validate() {
  const token = getToken();
  if (!token) return null;
  try {
    const { data } = await api().get('/auth/me');
    if (data.user) {
      saveSession(token, data.user);
      return data.user;
    }
    return null;
  } catch {
    logout();
    return null;
  }
}
