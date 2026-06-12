import { useState, useCallback } from 'react';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  serverTimestamp, 
  onSnapshot 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase/config';
import { logError, ErrorCategory } from '../utils/errorLogger';

export interface Author {
  id: string; // Document ID
  name: string;
  displayName: string;
  bio: string;
  born: number;
  died: number;
  nationality: string;
  photoPath: string;
  photoUrl: string;
  sortOrder: number;
  bookCount: number;
  createdAt?: any;
  updatedAt?: any;
}

export function useAuthors() {
  const [loading, setLoading] = useState(false);

  const getAuthorsReactive = useCallback((onUpdate: (authors: Author[]) => void, onError?: (err: any) => void) => {
    const q = query(collection(db, 'authors'), orderBy('sortOrder', 'asc'));
    return onSnapshot(q, (snapshot) => {
      const list: Author[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as Author);
      });
      onUpdate(list);
    }, async (error) => {
      console.error("onSnapshot authors error:", error);
      await logError({
        category: ErrorCategory.FIRESTORE_READ,
        message: error.message,
        details: { collection: 'authors', operation: 'onSnapshot' },
        stack: error.stack
      });
      if (onError) onError(error);
      else handleFirestoreError(error, OperationType.GET, 'authors');
    });
  }, []);

  const getAuthor = useCallback(async (id: string): Promise<Author | null> => {
    setLoading(true);
    try {
      const docRef = doc(db, 'authors', id);
      const docSnap = await getDoc(docRef);
      setLoading(false);
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() } as Author;
      }
      return null;
    } catch (error: any) {
      setLoading(false);
      await logError({
        category: ErrorCategory.FIRESTORE_READ,
        message: error.message,
        details: { path: `authors/${id}`, operation: 'getDoc' },
        stack: error.stack
      });
      handleFirestoreError(error, OperationType.GET, `authors/${id}`);
    }
  }, []);

  const createAuthor = useCallback(async (id: string, data: Omit<Author, 'id' | 'bookCount' | 'createdAt' | 'updatedAt'>): Promise<void> => {
    setLoading(true);
    try {
      // Check duplicate ID
      const docRef = doc(db, 'authors', id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        throw new Error(`Author ID "${id}" already exists. Please choose a unique ID.`);
      }

      await setDoc(docRef, {
        ...data,
        bookCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setLoading(false);
    } catch (error: any) {
      setLoading(false);
      await logError({
        category: ErrorCategory.FIRESTORE_WRITE,
        message: error.message,
        details: { path: `authors/${id}`, operation: 'setDoc' },
        stack: error.stack
      });
      handleFirestoreError(error, OperationType.WRITE, `authors/${id}`);
    }
  }, []);

  const updateAuthor = useCallback(async (id: string, data: Partial<Omit<Author, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> => {
    setLoading(true);
    try {
      const docRef = doc(db, 'authors', id);
      await updateDoc(docRef, {
        ...data,
        updatedAt: serverTimestamp()
      });
      setLoading(false);
    } catch (error: any) {
      setLoading(false);
      await logError({
        category: ErrorCategory.FIRESTORE_WRITE,
        message: error.message,
        details: { path: `authors/${id}`, operation: 'updateDoc' },
        stack: error.stack
      });
      handleFirestoreError(error, OperationType.WRITE, `authors/${id}`);
    }
  }, []);

  const deleteAuthor = useCallback(async (id: string): Promise<void> => {
    setLoading(true);
    try {
      const docRef = doc(db, 'authors', id);
      await deleteDoc(docRef);
      setLoading(false);
    } catch (error: any) {
      setLoading(false);
      await logError({
        category: ErrorCategory.FIRESTORE_WRITE,
        message: error.message,
        details: { path: `authors/${id}`, operation: 'deleteDoc' },
        stack: error.stack
      });
      handleFirestoreError(error, OperationType.DELETE, `authors/${id}`);
    }
  }, []);

  return {
    loading,
    getAuthorsReactive,
    getAuthor,
    createAuthor,
    updateAuthor,
    deleteAuthor
  };
}
