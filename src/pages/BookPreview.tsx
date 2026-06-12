import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useBooks, Book, Chapter, Page } from '../hooks/useBooks';
import { useToast } from '../components/Toast';
import { ChevronLeft, ArrowLeft, Settings, ChevronRight } from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';

interface FlattenedPreviewPage {
  globalPageNumber: number;
  chapterId: string;
  chapterNumber: number;
  chapterTitle: string;
  pageNumberWithinChapter: number;
  htmlContent: string;
  wordCount: number;
}

export default function BookPreview() {
  const { id: bookId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { getBook, getChapters, getPagesInChapter } = useBooks();

  // State
  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [flattenedPages, setFlattenedPages] = useState<FlattenedPreviewPage[]>([]);
  const [activePageIndex, setActivePageIndex] = useState<number>(0);
  const [jumpPageQuery, setJumpPageQuery] = useState('');
  const [loading, setLoading] = useState(true);

  // Load and compile flattened book layout for previewing
  const loadAndCompilePreview = useCallback(async () => {
    if (!bookId) return;
    try {
      const bDoc = await getBook(bookId);
      setBook(bDoc);

      const chs = await getChapters(bookId);
      setChapters(chs);

      const flat: FlattenedPreviewPage[] = [];
      let globalIdx = 1;

      for (const ch of chs) {
        const pgs = await getPagesInChapter(bookId, ch.id);
        
        pgs.forEach((pg, pIdx) => {
          flat.push({
            globalPageNumber: globalIdx,
            chapterId: ch.id,
            chapterNumber: ch.chapterNumber,
            chapterTitle: ch.title,
            pageNumberWithinChapter: pIdx + 1,
            htmlContent: pg.htmlContent || '',
            wordCount: pg.wordCount || 0
          });
          globalIdx++;
        });
      }

      setFlattenedPages(flat);
      setActivePageIndex(0);
    } catch (err) {
      console.error(err);
      addToast("Failed to compile layout content for phone mockup reader.", "error");
    } finally {
      setLoading(false);
    }
  }, [bookId, getBook, getChapters, getPagesInChapter, addToast]);

  useEffect(() => {
    loadAndCompilePreview();
  }, [loadAndCompilePreview]);

  // Handle jump queries
  const handleJumpPageSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const pageNum = parseInt(jumpPageQuery, 10);
    if (isNaN(pageNum) || pageNum < 1 || pageNum > flattenedPages.length) {
      addToast(`Invalid page number. Catalog ranges from 1 to ${flattenedPages.length}.`, "warning");
      return;
    }
    setActivePageIndex(pageNum - 1);
    setJumpPageQuery('');
  };

  // Jump to first page of selected chapter in TOC
  const handleJumpToChapter = (chId: string) => {
    const idx = flattenedPages.findIndex((p) => p.chapterId === chId);
    if (idx !== -1) {
      setActivePageIndex(idx);
    } else {
      addToast("No content loaded inside this chapter to preview.", "info");
    }
  };

  if (loading) {
    return <LoadingSpinner fullScreen label="Compiling mobile layout mockup..." />;
  }

  const currentPage = flattenedPages[activePageIndex];
  const totalGlobalPages = flattenedPages.length;

  return (
    <div id="book-preview-page">
      {/* HEADER CONTROLS BAR */}
      <div 
        className="page-header" 
        id="preview-header" 
        style={{ 
          display: 'grid', 
          gridTemplateColumns: '1fr auto 1fr', 
          alignItems: 'center', 
          borderBottom: '1px solid var(--border-color)', 
          paddingBottom: '16px', 
          marginBottom: '24px' 
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button 
            onClick={() => navigate(`/books/${bookId}/content`)} 
            className="btn btn-secondary"
            style={{ padding: '8px' }}
            id="back-to-editor-btn"
            title="Return to content workspace"
          >
            <ChevronLeft size={18} />
            <span style={{ fontSize: '12px', fontWeight: 'bold' }}>Editor</span>
          </button>
          
          <div style={{ minWidth: 0 }}>
            <h1 className="page-title" style={{ fontSize: '18px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Preview App Simulator
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{book?.title}</p>
          </div>
        </div>

        {/* Global Page indices selectors */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => setActivePageIndex(prev => Math.max(0, prev - 1))}
            disabled={activePageIndex === 0 || totalGlobalPages === 0}
            className="btn btn-secondary"
            style={{ padding: '6px 12px' }}
            title="Previous global page"
          >
            ◄ Prev
          </button>
          
          <span style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--accent-gold)' }}>
            PAGE {totalGlobalPages > 0 ? activePageIndex + 1 : 0} OF {totalGlobalPages}
          </span>

          <button
            onClick={() => setActivePageIndex(prev => Math.min(totalGlobalPages - 1, prev + 1))}
            disabled={activePageIndex === totalGlobalPages - 1 || totalGlobalPages === 0}
            className="btn btn-secondary"
            style={{ padding: '6px 12px' }}
            title="Next global page"
          >
            Next ►
          </button>
        </div>

        {/* Jump-to-page numerical query */}
        <form onSubmit={handleJumpPageSubmit} style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <input
            type="number"
            style={{ width: '80px', padding: '6px 8px', textAlign: 'center' }}
            placeholder="Page #"
            value={jumpPageQuery}
            onChange={(e) => setJumpPageQuery(e.target.value)}
            disabled={totalGlobalPages === 0}
          />
          <button 
            type="submit" 
            className="btn btn-secondary btn-sm"
            disabled={totalGlobalPages === 0}
            id="jump-action-btn"
          >
            Go
          </button>
        </form>
      </div>

      {/* TWO COLUMN WORKSPACE SIMULATION */}
      <div className="preview-container" id="phone-simulation-container">
        
        {/* LEFTHAND CHAPTERS DIRECTORY TABLE OF CONTENTS */}
        <aside className="preview-sidebar" id="preview-sidebar-toc">
          <h3 style={{ fontSize: '14px', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.5px', marginBottom: '12px' }}>
            Table of Contents
          </h3>
          <div className="toc-list" id="preview-toc-list">
            {chapters.map((ch) => {
              const chFirstPageIdx = flattenedPages.findIndex((p) => p.chapterId === ch.id);
              const isChActive = currentPage && currentPage.chapterId === ch.id;

              return (
                <div
                  key={ch.id}
                  className={`toc-item ${isChActive ? 'active' : ''}`}
                  onClick={() => handleJumpToChapter(ch.id)}
                  id={`toc-item-${ch.id}`}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong>Part {ch.chapterNumber}: {ch.title}</strong>
                    {chFirstPageIdx !== -1 && (
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        Pg {chFirstPageIdx + 1}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Contains {ch.totalPages || 0} pages total
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* CENTER HIGH-CONTRAST PHONE MOCKUP VIEWPORT */}
        <main className="preview-content" id="phone-simulation-viewport">
          {totalGlobalPages === 0 ? (
            <div className="card" style={{ maxWidth: '400px', textAlign: 'center' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                There are currently no text content pages indexed in this book structure yet. Click "Editor" to add drafts and pages!
              </p>
            </div>
          ) : (
            <div className="phone-mockup" id="phone-device-frames">
              {/* TOP BAR SIMULATION */}
              <div className="phone-top-bar">
                <ArrowLeft size={16} className="phone-nav-btn" />
                <span className="phone-top-title">{book?.title}</span>
                <Settings size={16} className="phone-nav-btn" />
              </div>

              {/* ACTIVE CHAPTER TOP SUB-BANNER */}
              <div className="phone-chapter-indicator">
                Chapter {currentPage?.chapterNumber} — {currentPage?.chapterTitle}
              </div>

              {/* CREAM-CSS SEPIA TEXT CONTAINER */}
              <div 
                className="phone-content-area" 
                id="phone-cream-reader-viewport"
                dangerouslySetInnerHTML={{ __html: currentPage?.htmlContent || '' }}
              />

              {/* BOTTOM READ-BAR DETAILS */}
              <div className="phone-bottom-nav">
                <button 
                  onClick={() => setActivePageIndex(prev => Math.max(0, prev - 1))}
                  disabled={activePageIndex === 0}
                  className="phone-nav-btn"
                  style={{ opacity: activePageIndex === 0 ? 0.3 : 1 }}
                >
                  ◄ Prev
                </button>
                
                <span>
                  Chapter {currentPage?.chapterNumber} · Page {currentPage?.pageNumberWithinChapter} ({currentPage?.globalPageNumber}/{totalGlobalPages})
                </span>

                <button 
                  onClick={() => setActivePageIndex(prev => Math.min(totalGlobalPages - 1, prev + 1))}
                  disabled={activePageIndex === totalGlobalPages - 1}
                  className="phone-nav-btn"
                  style={{ opacity: activePageIndex === totalGlobalPages - 1 ? 0.3 : 1 }}
                >
                  Next ►
                </button>
              </div>

            </div>
          )}
        </main>

      </div>
    </div>
  );
}
