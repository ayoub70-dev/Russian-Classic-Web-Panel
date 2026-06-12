import { db } from '../firebase/config';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export const ErrorCategory = {
  FIREBASE_CONNECTION: 'FIREBASE_CONNECTION',
  AUTH_ERROR: 'AUTH_ERROR',
  FIRESTORE_WRITE: 'FIRESTORE_WRITE',
  FIRESTORE_READ: 'FIRESTORE_READ',
  STORAGE_UPLOAD: 'STORAGE_UPLOAD',
  CONTENT_SAVE: 'CONTENT_SAVE',
  HTML_GENERATION: 'HTML_GENERATION',
  UNKNOWN: 'UNKNOWN'
} as const;

export type ErrorCategoryType = typeof ErrorCategory[keyof typeof ErrorCategory];

interface LogErrorParams {
  category?: ErrorCategoryType;
  message: string;
  details?: Record<string, any>;
  stack?: string | null;
  userId?: string | null;
}

export async function logError({
  category = ErrorCategory.UNKNOWN,
  message,
  details = {},
  stack = null,
  userId = null
}: LogErrorParams) {
  // Always log to browser console
  console.error(`[${category}]`, message, details);
  
  // Try to save to Firestore
  try {
    await addDoc(collection(db, 'error_logs'), {
      category,
      message: String(message),
      details: JSON.stringify(details),
      stack: stack ? String(stack).slice(0, 500) : null,
      userId,
      userAgent: navigator.userAgent,
      timestamp: serverTimestamp(),
      resolved: false
    });
  } catch (e) {
    // If Firestore save fails, store in localStorage as backup
    const localLogs = JSON.parse(
      localStorage.getItem('rc_error_logs') || '[]'
    );
    localLogs.unshift({
      category,
      message: String(message),
      details: JSON.stringify(details),
      timestamp: new Date().toISOString(),
      resolved: false,
      savedLocally: true
    });
    // Keep only last 100 local logs
    localStorage.setItem(
      'rc_error_logs', 
      JSON.stringify(localLogs.slice(0, 100))
    );
  }
}
