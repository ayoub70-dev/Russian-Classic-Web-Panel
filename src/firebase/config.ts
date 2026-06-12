import { initializeApp } from 'firebase/app';
import { initializeFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyAXdXIZOt8vIkGdmicoLjmel2gZPP72-ys",
  authDomain: "dostoevsky-labs.firebaseapp.com",
  projectId: "dostoevsky-labs",
  storageBucket: "dostoevsky-labs.firebasestorage.app",
  messagingSenderId: "664688444364",
  appId: "1:664688444364:web:de8fc5d328c872fe2e1369"
};

const app = initializeApp(firebaseConfig);

export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  useFetchStreams: false,
} as any);

export const storage = getStorage(app);
export const auth = getAuth(app);

// Operational and permission diagnostics support
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
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
      emailVerified: auth.currentUser?.emailVerified || null,
      isAnonymous: auth.currentUser?.isAnonymous || null,
    },
    operationType,
    path
  };
  console.error('Firestore Error Details: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default app;

export async function testFirebaseConnection(): Promise<void> {
  console.log("=== FIREBASE CONNECTION TEST ===");
  console.log("Project ID:", "dostoevsky-labs");
  console.log("App ID:", "1:664688444364:web:de8fc5d328c872fe2e1369");
  
  try {
    const { doc, setDoc, getDoc } = await import('firebase/firestore');
    
    // Test 1: Write
    console.log("Test 1: Writing test document...");
    await setDoc(doc(db, '_test_', 'connection'), {
      timestamp: new Date().toISOString(),
      test: true
    });
    console.log("✅ WRITE SUCCESS");
    
    // Test 2: Read
    console.log("Test 2: Reading test document...");
    const snap = await getDoc(doc(db, '_test_', 'connection'));
    console.log("✅ READ SUCCESS:", snap.data());
    
    console.log("=== FIREBASE CONNECTED SUCCESSFULLY ===");
    
  } catch (error: any) {
    console.error("❌ FIREBASE TEST FAILED");
    console.error("Error code:", error.code);
    console.error("Error message:", error.message);
    console.error("Full error:", error);
  }
}

