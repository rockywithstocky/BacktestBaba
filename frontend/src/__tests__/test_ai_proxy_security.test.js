import { describe, it, expect, beforeEach } from 'vitest';

const STORAGE_KEY = 'ai_api_key';
const TOKEN_KEY = 'auth_token';

function getApiKey() {
  let key = sessionStorage.getItem(STORAGE_KEY);
  if (key) return key;
  key = localStorage.getItem(STORAGE_KEY);
  if (key) {
    sessionStorage.setItem(STORAGE_KEY, key);
    localStorage.removeItem(STORAGE_KEY);
    return key;
  }
  return '';
}

function saveApiKey(key) {
  sessionStorage.setItem(STORAGE_KEY, key);
}

function getAuthToken(tokenValue) {
  const token = tokenValue !== undefined ? tokenValue : localStorage.getItem(TOKEN_KEY);
  return token;
}

function tryProxyCallHeaders(tokenValue) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getAuthToken(tokenValue);
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

describe('API key sessionStorage migration', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('reads from sessionStorage if present', () => {
    sessionStorage.setItem(STORAGE_KEY, 'sk-session');
    expect(getApiKey()).toBe('sk-session');
  });

  it('migrates from localStorage to sessionStorage on read', () => {
    localStorage.setItem(STORAGE_KEY, 'sk-old-key');
    const result = getApiKey();
    expect(result).toBe('sk-old-key');
    expect(sessionStorage.getItem(STORAGE_KEY)).toBe('sk-old-key');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('removes key from localStorage after migration', () => {
    localStorage.setItem(STORAGE_KEY, 'sk-migrate');
    getApiKey();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('returns empty string when no key exists', () => {
    expect(getApiKey()).toBe('');
  });

  it('sessionStorage key takes priority over localStorage', () => {
    sessionStorage.setItem(STORAGE_KEY, 'sk-session-value');
    localStorage.setItem(STORAGE_KEY, 'sk-local-value');
    expect(getApiKey()).toBe('sk-session-value');
  });

  it('saveApiKey writes to sessionStorage only', () => {
    saveApiKey('sk-new');
    expect(sessionStorage.getItem(STORAGE_KEY)).toBe('sk-new');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe('Auth token in proxy calls', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('includes Authorization header when token exists', () => {
    localStorage.setItem(TOKEN_KEY, 'test-session-token');
    const headers = tryProxyCallHeaders();
    expect(headers['Authorization']).toBe('Bearer test-session-token');
  });

  it('omits Authorization header when no token', () => {
    const headers = tryProxyCallHeaders();
    expect(headers['Authorization']).toBeUndefined();
  });

  it('omits Authorization header when token is null', () => {
    const headers = tryProxyCallHeaders(null);
    expect(headers['Authorization']).toBeUndefined();
  });

  it('includes correct Bearer format', () => {
    localStorage.setItem(TOKEN_KEY, 'jwt-token-123');
    const headers = tryProxyCallHeaders();
    expect(headers['Authorization']).toMatch(/^Bearer\s.+/);
  });
});
