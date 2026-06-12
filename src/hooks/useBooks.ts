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
  where, 
  orderBy, 
  serverTimestamp, 
  onSnapshot,
  writeBatch
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase/config';
import { logError, ErrorCategory } from '../utils/errorLogger';

export interface Book {
  id: string; // Document ID
  title: string;
  authorId: string;
  authorName: string;
  description: string;
  year: number;
  translator: string;
  genre: string;
  readingTime: string;
  premium: boolean;
  coverPath: string;
  coverUrl: string;
  totalChapters: number;
  totalPages: number;
  status: 'draft' | 'published';
  createdAt?: any;
  updatedAt?: any;
}

export interface Chapter {
  id: string; // Document ID
  chapterNumber: number;
  title: string;
  totalPages: number;
  pagesStart: number;
  pagesEnd: number;
  sortOrder: number;
  createdAt?: any;
}

export interface Page {
  id: string; // Document ID
  pageNumber: number;
  globalPageNumber: number;
  content: string;
  htmlContent: string;
  wordCount: number;
  sortOrder: number;
  storageUrl?: string;
  createdAt?: any;
}

export function useBooks() {
  const [loading, setLoading] = useState(false);

  const getBooksReactive = useCallback((
    onUpdate: (books: Book[]) => void, 
    filterAuthorId?: string, 
    filterStatus?: string,
    searchQuery?: string,
    onError?: (err: any) => void
  ) => {
    let q = query(collection(db, 'books'), orderBy('createdAt', 'desc'));

    return onSnapshot(q, (snapshot) => {
      let list: Book[] = [];
      snapshot.forEach((docSnap) => {
        const book = { id: docSnap.id, ...docSnap.data() } as Book;
        
        // Filter in JS for maximum flexibility without requiring manual composited indexes
        let match = true;
        
        if (filterAuthorId && filterAuthorId !== 'all' && book.authorId !== filterAuthorId) {
          match = false;
        }
        
        if (filterStatus && filterStatus !== 'all' && book.status !== filterStatus) {
          match = false;
        }
        
        if (searchQuery && !book.title.toLowerCase().includes(searchQuery.toLowerCase())) {
          match = false;
        }

        if (match) {
          list.push(book);
        }
      });
      onUpdate(list);
    }, async (error) => {
      console.error("onSnapshot books error:", error);
      await logError({
        category: ErrorCategory.FIRESTORE_READ,
        message: error.message,
        details: { collection: 'books', operation: 'onSnapshot' },
        stack: error.stack
      });
      if (onError) onError(error);
      else handleFirestoreError(error, OperationType.GET, 'books');
    });
  }, []);

  const getBook = useCallback(async (id: string): Promise<Book | null> => {
    setLoading(true);
    try {
      const docRef = doc(db, 'books', id);
      const docSnap = await getDoc(docRef);
      setLoading(false);
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() } as Book;
      }
      return null;
    } catch (error: any) {
      setLoading(false);
      await logError({
        category: ErrorCategory.FIRESTORE_READ,
        message: error.message,
        details: { path: `books/${id}`, operation: 'getDoc' },
        stack: error.stack
      });
      handleFirestoreError(error, OperationType.GET, `books/${id}`);
    }
  }, []);

  const syncAuthorBookCount = async (authorId: string) => {
    try {
      const booksSnap = await getDocs(query(collection(db, 'books'), where('authorId', '==', authorId)));
      const count = booksSnap.size;
      const authorRef = doc(db, 'authors', authorId);
      // Double check author exists
      const authorSnap = await getDoc(authorRef);
      if (authorSnap.exists()) {
        await updateDoc(authorRef, { bookCount: count });
      }
    } catch (err) {
      console.error("Error syncing author bookCount:", err);
    }
  };

  const createBook = useCallback(async (id: string, data: Omit<Book, 'id' | 'totalChapters' | 'totalPages' | 'createdAt' | 'updatedAt'>): Promise<void> => {
    setLoading(true);
    try {
      const docRef = doc(db, 'books', id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        throw new Error(`Book ID "${id}" already exists. Please select a unique path.`);
      }

      await setDoc(docRef, {
        ...data,
        totalChapters: 0,
        totalPages: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      await syncAuthorBookCount(data.authorId);
      setLoading(false);
    } catch (error: any) {
      setLoading(false);
      await logError({
        category: ErrorCategory.FIRESTORE_WRITE,
        message: error.message,
        details: { path: `books/${id}`, operation: 'setDoc' },
        stack: error.stack
      });
      handleFirestoreError(error, OperationType.WRITE, `books/${id}`);
    }
  }, []);

  const updateBook = useCallback(async (id: string, data: Partial<Omit<Book, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> => {
    setLoading(true);
    try {
      const docRef = doc(db, 'books', id);
      const oldSnap = await getDoc(docRef);
      const oldData = oldSnap.data() as Book | undefined;

      await updateDoc(docRef, {
        ...data,
        updatedAt: serverTimestamp()
      });

      if (data.authorId) {
        await syncAuthorBookCount(data.authorId);
      }
      if (oldData && oldData.authorId && oldData.authorId !== data.authorId) {
        await syncAuthorBookCount(oldData.authorId);
      }
      setLoading(false);
    } catch (error: any) {
      setLoading(false);
      await logError({
        category: ErrorCategory.FIRESTORE_WRITE,
        message: error.message,
        details: { path: `books/${id}`, operation: 'updateDoc' },
        stack: error.stack
      });
      handleFirestoreError(error, OperationType.WRITE, `books/${id}`);
    }
  }, []);

  const deleteBook = useCallback(async (id: string): Promise<void> => {
    setLoading(true);
    try {
      const docRef = doc(db, 'books', id);
      const bookSnap = await getDoc(docRef);
      const bookData = bookSnap.data() as Book | undefined;
      
      await deleteDoc(docRef);

      if (bookData?.authorId) {
        await syncAuthorBookCount(bookData.authorId);
      }
      setLoading(false);
    } catch (error: any) {
      setLoading(false);
      await logError({
        category: ErrorCategory.FIRESTORE_WRITE,
        message: error.message,
        details: { path: `books/${id}`, operation: 'deleteDoc' },
        stack: error.stack
      });
      handleFirestoreError(error, OperationType.DELETE, `books/${id}`);
    }
  }, []);

  // --- Subcollections Chapters & Pages Helpers ---

  const getChapters = useCallback(async (bookId: string): Promise<Chapter[]> => {
    try {
      const ref = collection(db, 'books', bookId, 'chapters');
      const q = query(ref, orderBy('sortOrder', 'asc'));
      const snap = await getDocs(q);
      const chapters: Chapter[] = [];
      snap.forEach((d) => {
        chapters.push({ id: d.id, ...d.data() } as Chapter);
      });
      return chapters;
    } catch (error: any) {
      await logError({
        category: ErrorCategory.FIRESTORE_READ,
        message: error.message,
        details: { path: `books/${bookId}/chapters`, operation: 'getDocs' },
        stack: error.stack
      });
      handleFirestoreError(error, OperationType.GET, `books/${bookId}/chapters`);
    }
  }, []);

  const getPagesInChapter = useCallback(async (bookId: string, chapterId: string): Promise<Page[]> => {
    try {
      const ref = collection(db, 'books', bookId, 'chapters', chapterId, 'pages');
      const q = query(ref, orderBy('sortOrder', 'asc'));
      const snap = await getDocs(q);
      const pages: Page[] = [];
      snap.forEach((d) => {
        pages.push({ id: d.id, ...d.data() } as Page);
      });
      return pages;
    } catch (error: any) {
      await logError({
        category: ErrorCategory.FIRESTORE_READ,
        message: error.message,
        details: { path: `books/${bookId}/chapters/${chapterId}/pages`, operation: 'getDocs' },
        stack: error.stack
      });
      handleFirestoreError(error, OperationType.GET, `books/${bookId}/chapters/${chapterId}/pages`);
    }
  }, []);

  // Recalculates and flattens entire book's pages global index numbering
  const recalculateBookPageIndices = useCallback(async (bookId: string): Promise<void> => {
    setLoading(true);
    try {
      const chsRef = collection(db, 'books', bookId, 'chapters');
      const chsSnap = await getDocs(query(chsRef, orderBy('sortOrder', 'asc')));
      
      let runningGlobalPage = 1;
      const chDocs = chsSnap.docs;
      
      const batch = writeBatch(db);

      for (let i = 0; i < chDocs.length; i++) {
        const chDoc = chDocs[i];
        const chId = chDoc.id;
        const chData = chDoc.data() as Chapter;

        // Fetch pages inside this chapter
        const pgsRef = collection(db, 'books', bookId, 'chapters', chId, 'pages');
        const pgsSnap = await getDocs(query(pgsRef, orderBy('sortOrder', 'asc')));
        const pgDocs = pgsSnap.docs;

        const pagesCountInChapter = pgDocs.length;
        const startPg = runningGlobalPage;

        for (let j = 0; j < pgDocs.length; j++) {
          const pgDoc = pgDocs[j];
          const pgId = pgDoc.id;
          const pgData = pgDoc.data() as Page;

          // Auto-calculate word count if not present
          const text = pgData.content || '';
          const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;

          batch.update(doc(db, 'books', bookId, 'chapters', chId, 'pages', pgId), {
            pageNumber: j + 1,
            globalPageNumber: runningGlobalPage,
            wordCount: words,
            sortOrder: j + 1
          });

          runningGlobalPage++;
        }

        const endPg = Math.max(startPg, runningGlobalPage - 1);

        batch.update(doc(db, 'books', bookId, 'chapters', chId), {
          chapterNumber: i + 1,
          sortOrder: i + 1,
          totalPages: pagesCountInChapter,
          pagesStart: pagesCountInChapter > 0 ? startPg : 0,
          pagesEnd: pagesCountInChapter > 0 ? endPg : 0
        });
      }

      // Commit all nested chapter and page sync edits
      await batch.commit();

      // Finally update the main book stats
      const finalTotalPages = runningGlobalPage - 1;
      const finalTotalChapters = chDocs.length;

      const bookRef = doc(db, 'books', bookId);
      await updateDoc(bookRef, {
        totalChapters: finalTotalChapters,
        totalPages: finalTotalPages,
        updatedAt: serverTimestamp()
      });

      setLoading(false);
    } catch (error: any) {
      setLoading(false);
      await logError({
        category: ErrorCategory.FIRESTORE_WRITE,
        message: error.message,
        details: { path: `books/${bookId}/recalculate`, operation: 'batch.commit/writeBatch' },
        stack: error.stack
      });
      handleFirestoreError(error, OperationType.WRITE, `books/${bookId}/recalculate`);
    }
  }, []);

  return {
    loading,
    getBooksReactive,
    getBook,
    createBook,
    updateBook,
    deleteBook,
    getChapters,
    getPagesInChapter,
    recalculateBookPageIndices
  };
}
