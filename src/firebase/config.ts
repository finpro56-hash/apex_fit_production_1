/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, type User } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseAppletConfig from '../../firebase-applet-config.json';

/**
 * Explicit Configuration Strategy:
 * 1. Environment variables (VITE_FIREBASE_*) take highest precedence, enabling
 *    consistent multi-environment deployments (Vercel Production, Preview, Staging).
 * 2. Generated firebase-applet-config.json serves as the authoritative fallback for local development.
 * 3. Required public fields (apiKey, authDomain, projectId, appId) are validated at startup.
 */
function getEnv(key: string): string {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
    return String(import.meta.env[key]).trim();
  }
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return String(process.env[key]).trim();
  }
  return '';
}

function resolveFirebaseConfig() {
  const apiKey = getEnv('VITE_FIREBASE_API_KEY') || (firebaseAppletConfig?.apiKey || '').trim();
  const authDomain = getEnv('VITE_FIREBASE_AUTH_DOMAIN') || (firebaseAppletConfig?.authDomain || '').trim();
  const projectId = getEnv('VITE_FIREBASE_PROJECT_ID') || (firebaseAppletConfig?.projectId || '').trim();
  const storageBucket = getEnv('VITE_FIREBASE_STORAGE_BUCKET') || (firebaseAppletConfig?.storageBucket || '').trim();
  const messagingSenderId = getEnv('VITE_FIREBASE_MESSAGING_SENDER_ID') || (firebaseAppletConfig?.messagingSenderId || '').trim();
  const appId = getEnv('VITE_FIREBASE_APP_ID') || (firebaseAppletConfig?.appId || '').trim();

  const missing: string[] = [];
  if (!apiKey) missing.push('apiKey (VITE_FIREBASE_API_KEY)');
  if (!authDomain) missing.push('authDomain (VITE_FIREBASE_AUTH_DOMAIN)');
  if (!projectId) missing.push('projectId (VITE_FIREBASE_PROJECT_ID)');
  if (!appId) missing.push('appId (VITE_FIREBASE_APP_ID)');

  if (missing.length > 0) {
    const errorMsg = `[Apex Fit] Firebase configuration incomplete. Missing required fields: ${missing.join(', ')}. Set VITE_FIREBASE_* variables in your environment or provide a valid firebase-applet-config.json.`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
  };
}

export const firebaseConfig = resolveFirebaseConfig();

export const firestoreDatabaseId =
  getEnv('VITE_FIREBASE_FIRESTORE_DATABASE_ID') ||
  (firebaseAppletConfig?.firestoreDatabaseId || '').trim() ||
  undefined;

// Initialize singleton app
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const db =
  firestoreDatabaseId && firestoreDatabaseId !== '(default)'
    ? getFirestore(app, firestoreDatabaseId)
    : getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
if (typeof window !== 'undefined') {
  testConnection();
}

export { signInWithPopup, signOut, onAuthStateChanged };
export type { User };
