/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { auth } from '../firebase/config';

export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const user = auth.currentUser;
  let token = user ? await user.getIdToken() : null;

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
