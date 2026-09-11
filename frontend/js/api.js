// Thin wrapper around the backend API. Every call sends the shared
// passcode as a header; the Lambda checks it and returns 401 if it's wrong.
import { API_BASE_URL } from './config.js';

const PASSCODE_KEY = 'periodTracker.passcode';

export function getSavedPasscode() {
  try {
    return localStorage.getItem(PASSCODE_KEY) || '';
  } catch {
    return '';
  }
}

export function savePasscode(passcode) {
  try {
    localStorage.setItem(PASSCODE_KEY, passcode);
  } catch {
    // localStorage unavailable (private browsing etc.) — passcode just
    // won't persist across reloads, which is a minor inconvenience, not
    // a functional break.
  }
}

export function clearSavedPasscode() {
  try {
    localStorage.removeItem(PASSCODE_KEY);
  } catch {
    /* ignore */
  }
}

async function request(path, options = {}) {
  const passcode = getSavedPasscode();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-passcode': passcode,
      ...(options.headers || {}),
    },
  });

  if (res.status === 401) {
    const err = new Error('Wrong passcode');
    err.code = 'UNAUTHORIZED';
    throw err;
  }
  if (!res.ok) {
    const err = new Error(`Request failed: ${res.status}`);
    err.code = 'REQUEST_FAILED';
    throw err;
  }
  return res.json();
}

export async function fetchDates() {
  const data = await request('/logs', { method: 'GET' });
  return data.dates || [];
}

export async function addDate(date) {
  return request('/logs', { method: 'POST', body: JSON.stringify({ date }) });
}

export async function deleteDate(date) {
  return request(`/logs/${encodeURIComponent(date)}`, { method: 'DELETE' });
}

/** Verifies a passcode actually works against the API (used at login). */
export async function verifyPasscode(passcode) {
  const res = await fetch(`${API_BASE_URL}/logs`, {
    headers: { 'x-passcode': passcode },
  });
  return res.ok;
}
