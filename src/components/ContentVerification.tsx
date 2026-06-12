import React, { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { collection, getDocs, query, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useBooks, Book, Chapter, Page } from '../hooks/useBooks';
import { useToast } from '../components/Toast';
import { RefreshCw, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

interface ContentVerificationProps {
  book: Book;
  bookId: string;
}

export default function ContentVerification({ book, bookId }: ContentVerificationProps) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any>(null);

  const runCheck = async () => {
    setLoading(true);
    try {
      // 1. Metadata Checks
      const metaChecks = {
        bookId: !!bookId,
        title: !!book.title,
        author: !!book.authorId,
        cover: !!book.coverUrl,
        description: !!book.description,
        year: !!book.year,
        genre: !!book.genre,
        readingTime: !!book.readingTime,
        status: book.status === 'published'
      };

      // 2. Structure Checks
      const chaptersRef = collection(db, 'books', bookId, 'chapters');
      const chaptersSnapshot = await getDocs(chaptersRef);
      const chapters = chaptersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Chapter));

      let totalPages = 0;
      let pagesWithContent = 0;
      let pagesWithStorage = 0;
      let allGlobalPageNumbersOk = true;
      let allChaptersHaveTitle = true;
      let allChaptersHavePages = true;

      for (const chapter of chapters) {
        if (!chapter.title) allChaptersHaveTitle = false;
        
        const pagesRef = collection(db, 'books', bookId, 'chapters', chapter.id, 'pages');
        const pagesSnapshot = await getDocs(pagesRef);
        const pages = pagesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Page));
        
        if (pages.length === 0) allChaptersHavePages = false;
        totalPages += pages.length;
        
        for (const page of pages) {
          if (page.content && page.content.trim() !== '') pagesWithContent++;
          if (page.storageUrl) pagesWithStorage++;
          if (!page.globalPageNumber || page.globalPageNumber <= 0) allGlobalPageNumbersOk = false;
        }
      }

      setReport({
        metaChecks,
        structureChecks: {
          chapters: chapters.length > 0,
          allChaptersHaveTitle,
          allChaptersHavePages,
          totalPages,
          pagesWithContent,
          pagesWithStorage,
          allGlobalPageNumbersOk
        },
        counts: {
          totalChapters: chapters.length,
          totalPages,
          pagesWithContent,
          pagesMissingContent: totalPages - pagesWithContent,
          pagesWithStorage,
          pagesMissingStorage: totalPages - pagesWithStorage
        }
      });
    } catch (err) {
      console.error(err);
      addToast('Error running verification', 'error');
    } finally {
      setLoading(false);
    }
  };

  const publishBook = async () => {
    try {
      await updateDoc(doc(db, 'books', bookId), {
        status: 'published',
        updatedAt: serverTimestamp()
      });
      addToast('Book published successfully!', 'success');
      runCheck(); // refresh
    } catch (err) {
      console.error(err);
      addToast('Error publishing book', 'error');
    }
  };

  const allChecksPassed = report && 
    Object.values(report.metaChecks).every(v => v) &&
    report.structureChecks.chapters &&
    report.structureChecks.allChaptersHaveTitle &&
    report.structureChecks.allChaptersHavePages &&
    report.structureChecks.pagesWithContent === report.counts.totalPages &&
    report.structureChecks.allGlobalPageNumbersOk;

  return (
    <div className="card" style={{ marginTop: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ fontSize: '16px', color: 'var(--accent-gold)' }}>📋 Content Verification</h3>
        <button onClick={runCheck} className="btn btn-secondary btn-sm" disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> {loading ? 'Checking...' : 'Run Full Check'}
        </button>
      </div>

      {report ? (
        <div style={{ fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <h4 style={{ marginBottom: '8px', fontWeight: 'bold' }}>Section A — Book Metadata:</h4>
            {Object.entries(report.metaChecks).map(([key, passed]) => (
              <p key={key} style={{ color: passed ? 'var(--accent-green)' : '#ef4444' }}>
                {passed ? <CheckCircle size={14} style={{ display: 'inline' }} /> : <XCircle size={14} style={{ display: 'inline' }} />} {key.charAt(0).toUpperCase() + key.slice(1)} check
              </p>
            ))}
          </div>

          <div>
            <h4 style={{ marginBottom: '8px', fontWeight: 'bold' }}>Section B — Content Structure:</h4>
            <p style={{ color: report.structureChecks.chapters ? 'var(--accent-green)' : '#ef4444' }}>
              {report.structureChecks.chapters ? <CheckCircle size={14} style={{ display: 'inline' }} /> : <XCircle size={14} style={{ display: 'inline' }} />} At least 1 chapter exists
            </p>
            <p style={{ color: report.structureChecks.allChaptersHaveTitle ? 'var(--accent-green)' : '#ef4444' }}>
              {report.structureChecks.allChaptersHaveTitle ? <CheckCircle size={14} style={{ display: 'inline' }} /> : <XCircle size={14} style={{ display: 'inline' }} />} All chapters have titles
            </p>
            <p style={{ color: report.structureChecks.allChaptersHavePages ? 'var(--accent-green)' : '#ef4444' }}>
              {report.structureChecks.allChaptersHavePages ? <CheckCircle size={14} style={{ display: 'inline' }} /> : <XCircle size={14} style={{ display: 'inline' }} />} At least 1 page per chapter
            </p>
            <p style={{ color: report.counts.pagesMissingContent === 0 ? 'var(--accent-green)' : '#ef4444' }}>
              {report.counts.pagesMissingContent === 0 ? <CheckCircle size={14} style={{ display: 'inline' }} /> : <XCircle size={14} style={{ display: 'inline' }} />} No empty pages ({report.counts.pagesMissingContent} missing content)
            </p>
            <p style={{ color: report.structureChecks.allGlobalPageNumbersOk ? 'var(--accent-green)' : '#ef4444' }}>
              {report.structureChecks.allGlobalPageNumbersOk ? <CheckCircle size={14} style={{ display: 'inline' }} /> : <XCircle size={14} style={{ display: 'inline' }} />} All pages have globalPageNumber
            </p>
            <p style={{ color: report.counts.pagesMissingStorage === 0 ? 'var(--accent-green)' : '#d97706' }}>
              {report.counts.pagesMissingStorage === 0 ? <CheckCircle size={14} style={{ display: 'inline' }} /> : <AlertTriangle size={14} style={{ display: 'inline' }} />} Storage Sync ({report.counts.pagesMissingStorage} missing)
            </p>
          </div>

          <div style={{ marginTop: '10px' }}>
            <button 
              onClick={publishBook} 
              disabled={!allChecksPassed}
              className={`btn ${allChecksPassed ? 'btn-gold' : 'btn-secondary'}`}
              style={{ width: '100%' }}
            >
              🚀 Publish Book (Set to Published)
            </button>
            {!allChecksPassed && <p style={{ color: '#ef4444', textAlign: 'center', marginTop: '8px' }}>⚠️ Incomplete — fix critical issues listed above</p>}
          </div>
        </div>
      ) : (
        <p style={{ color: 'var(--text-muted)' }}>Click "Run Full Check" to verify content readiness.</p>
      )}
    </div>
  );
}
