/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { auth } from '../firebase/config';

export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  if (!auth.currentUser && typeof auth.authStateReady === 'function') {
    try {
      await auth.authStateReady();
    } catch {
      // Ignore auth state ready timeout or error
    }
  }

  const user = auth.currentUser;
  let token: string | null = null;
  if (user) {
    try {
      token = await user.getIdToken(true);
    } catch (err) {
      console.warn('[AuthFetch] Failed to acquire fresh ID token:', err);
    }
  }

  if (!token && typeof window !== 'undefined' && localStorage.getItem('apex_guest_mode') === 'true') {
    token = 'guest_session';
  }

  const headers = new Headers(init.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(input, {
    ...init,
    headers,
  });
}
