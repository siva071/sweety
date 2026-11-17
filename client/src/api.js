// Tiny API client — all requests go through here so auth headers and
// error messages stay consistent.
const BASE = import.meta.env.VITE_API_URL || '';

function getToken() {
  return localStorage.getItem('sweety_token');
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && getToken()) headers.Authorization = `Bearer ${getToken()}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Something went wrong. Please try again.');
  }
  return data;
}

export const api = {
  register: (name, email, password) =>
    request('/api/auth/register', { method: 'POST', body: { name, email, password }, auth: false }),
  login: (email, password) =>
    request('/api/auth/login', { method: 'POST', body: { email, password }, auth: false }),
  getSlots: () => request('/api/slots', { auth: false }),
  listReadings: (page = 1, limit = 20) => request(`/api/readings?page=${page}&limit=${limit}`),
  addReading: (reading) => request('/api/readings', { method: 'POST', body: reading }),
  updateReading: (id, reading) => request(`/api/readings/${id}`, { method: 'PUT', body: reading }),
  deleteReading: (id) => request(`/api/readings/${id}`, { method: 'DELETE' }),
  getReport: (type, date) => request(`/api/reports?type=${type}&date=${date}`),
};

export function saveSession({ token, user }) {
  localStorage.setItem('sweety_token', token);
  localStorage.setItem('sweety_user', JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem('sweety_token');
  localStorage.removeItem('sweety_user');
}

export function loadUser() {
  try {
    return JSON.parse(localStorage.getItem('sweety_user'));
  } catch {
    return null;
  }
}

export function isLoggedIn() {
  return Boolean(getToken());
}
