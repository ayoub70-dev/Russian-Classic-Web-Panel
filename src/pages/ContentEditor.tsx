import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useBooks, Book, Chapter, Page } from '../hooks/useBooks';
import { useToast } from '../components/Toast';
import { 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  addDoc, 
  getDocs, 
  query, 
  orderBy, 
  serverTimestamp, 
  writeBatch 
} from 'firebase/firestore';
import { db, storage } from '../firebase/config';
import { ref as storageRef, uploadString, getDownloadURL } from 'firebase/storage';
import { logError, ErrorCategory } from '../utils/errorLogger';
import { 
  ChevronLeft, Plus, Save, Eye, Trash2, ArrowUp, ArrowDown, 
  ChevronRight, ChevronDown, ListOrdered, FileText, AlignLeft, 
  AlignCenter, AlignRight, PlayCircle, Bold, Italic, Underline,
  Quote, AlignJustify
} from 'lucide-react';
import ConfirmDialog from '../components/ConfirmDialog';
import LoadingSpinner from '../components/LoadingSpinner';

// Implements custom HTML generation rules based on user formatting instructions
export function generatePageHtml(rawContent: string): string {
  if (!rawContent) return '';
  const blocks = rawContent.split(/\n\s*\n/);
  
  const parsedHtml = blocks.map(block => {
    let text = block.trim();
    if (!text) return '';

    // Check [center]...[/c] or [center]...[/center] support
    const centerPattern = /^\[center\]([\s\S]*?)\[\/(?:c|center)\]$/i;
    if (centerPattern.test(text)) {
      const match = text.match(centerPattern);
      const inner = (match ? match[1] : '').trim();
      if (inner.startsWith('# ')) {
        const h2Text = inner.substring(2).trim();
        return `<h2 style="text-align:center">${h2Text}</h2>`;
      }
      return `<p style="text-align:center">${inner.replace(/\n/g, '<br>')}</p>`;
    }

    // Check [right]...[/r] or [right]...[/right] support
    const rightPattern = /^\[right\]([\s\S]*?)\[\/(?:r|right)\]$/i;
    if (rightPattern.test(text)) {
      const match = text.match(rightPattern);
      const inner = (match ? match[1] : '').trim();
      return `<p style="text-align:right">${inner.replace(/\n/g, '<br>')}</p>`;
    }

    if (text.startsWith('# ')) {
      return `<h2>${text.substring(2).trim().replace(/\n/g, '<br>')}</h2>`;
    }

    if (text.startsWith('### ')) {
      return `<h4>${text.substring(4).trim().replace(/\n/g, '<br>')}</h4>`;
    }
    
    if (text.startsWith('## ')) {
      return `<h3>${text.substring(3).trim().replace(/\n/g, '<br>')}</h3>`;
    }

    if (text.startsWith('> ')) {
      return `<blockquote>${text.substring(2).trim().replace(/\n/g, '<br>')}</blockquote>`;
    }

    if (text === '---') {
      return '<hr>';
    }

    if (text.startsWith('<')) {
      return text; // Output direct raw HTML elements as-is
    }

    return `<p>${text.replace(/\n/g, '<br>')}</p>`;
  });

  return parsedHtml.filter(Boolean).join('\n');
}

export default function ContentEditor() {
  const { id: bookId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { getBook, getChapters, getPagesInChapter, recalculateBookPageIndices, loading: booksLoading } = useBooks();

  // Books / Hierarchy State
  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [expandedChapterIds, setExpandedChapterIds] = useState<Record<string, boolean>>({});
  const [chapterPages, setChapterPages] = useState<Record<string, Page[]>>({});

  // Curation Selectors
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);

  // Editing buffer states
  const [chapterTitleBuffer, setChapterTitleBuffer] = useState('');
  const [pageContentBuffer, setPageContentBuffer] = useState('');
  const [isHtmlPreviewExpanded, setIsHtmlPreviewExpanded] = useState(true);

  // Sync / saving indicators
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Deletion modals state
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'chapter' | 'page'; parentId?: string; targetId: string } | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Ensure user is warned before losing unsaved pages
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = 'You have unsaved edits in the active chapter/page buffer.';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Load book details and chapters hierarchy
  const loadHierarchy = useCallback(async () => {
    if (!bookId) return;
    try {
      const bDoc = await getBook(bookId);
      setBook(bDoc);

      const chs = await getChapters(bookId);
      setChapters(chs);

      // Fetch pages for all chapters
      const pgsMap: Record<string, Page[]> = {};
      const expanded: Record<string, boolean> = {};

      for (const ch of chs) {
        const pgs = await getPagesInChapter(bookId, ch.id);
        pgsMap[ch.id] = pgs;
        expanded[ch.id] = true; // Expand chapters by default
      }

      setChapterPages(pgsMap);
      setExpandedChapterIds(expanded);

      // Automatically select first element if available
      if (chs.length > 0) {
        if (pgsMap[chs[0].id]?.length > 0) {
          setSelectedChapterId(chs[0].id);
          setSelectedPageId(pgsMap[chs[0].id][0].id);
          setPageContentBuffer(pgsMap[chs[0].id][0].content || '');
        } else {
          setSelectedChapterId(chs[0].id);
          setSelectedPageId(null);
          setChapterTitleBuffer(chs[0].title || '');
        }
      }
    } catch (err) {
      console.error(err);
      addToast('Failed to load book chapter hierarchy structures.', 'error');
    } finally {
      setLoading(false);
    }
  }, [bookId, getBook, getChapters, getPagesInChapter, addToast]);

  useEffect(() => {
    loadHierarchy();
  }, [loadHierarchy]);

  // Auto-save logic (triggers every 30s if changes exist)
  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const interval = setInterval(() => {
      console.log('Autosaving active chapter/page layout state...');
      handleSaveActiveSelection();
    }, 30000);

    return () => clearInterval(interval);
  }, [hasUnsavedChanges, selectedChapterId, selectedPageId, pageContentBuffer, chapterTitleBuffer]);

  // Handle saving of currently active edit type
  const handleSaveActiveSelection = async (): Promise<boolean> => {
    if (!bookId || !selectedChapterId) return false;
    
    // Page editing mode save
    if (selectedPageId) {
      try {
        const pageRef = doc(db, 'books', bookId, 'chapters', selectedChapterId, 'pages', selectedPageId);
        const compiledHtml = generatePageHtml(pageContentBuffer);
        const wordCount = pageContentBuffer.trim() === '' ? 0 : pageContentBuffer.trim().split(/\s+/).length;

        await updateDoc(pageRef, {
          content: pageContentBuffer,
          htmlContent: compiledHtml,
          wordCount
        });

        // Determine current page number and details for the storage path
        const pages = chapterPages[selectedChapterId] || [];
        const currentPageObj = pages.find(p => p.id === selectedPageId);
        const pageNumber = currentPageObj?.pageNumber || 1;
        const globalPageNumber = currentPageObj?.globalPageNumber || pageNumber;

        const currentChapterObj = chapters.find(c => c.id === selectedChapterId);
        const chapterNumber = currentChapterObj?.chapterNumber || 1;

        let storageUrl = '';
        let storagePath = '';

        // Sync HTML compiled markup to Cloud Storage
        try {
          storagePath = `books/${bookId}/chapters/chapter_${chapterNumber}/page_${pageNumber}.html`;
          const fileRef = storageRef(storage, storagePath);
          
          const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="book-id" content="${bookId}">
  <meta name="chapter" content="${chapterNumber}">
  <meta name="page" content="${pageNumber}">
  <meta name="global-page" content="${globalPageNumber}">
</head>
<body>
  ${compiledHtml}
</body>
</html>`;

          await uploadString(fileRef, fullHtml, 'raw', {
            contentType: 'text/html; charset=utf-8'
          });
          
          storageUrl = await getDownloadURL(fileRef);
          
          await updateDoc(pageRef, {
            storageUrl,
            storagePath
          });
          
          console.log('✅ Page uploaded to Storage:', storagePath);
        } catch (storageError) {
          console.error('Storage upload failed:', storageError);
        }

        // Update local maps
        setChapterPages(prev => {
          const list = [...(prev[selectedChapterId] || [])];
          const idx = list.findIndex(p => p.id === selectedPageId);
          if (idx !== -1) {
            list[idx] = { 
              ...list[idx], 
              content: pageContentBuffer, 
              htmlContent: compiledHtml, 
              wordCount,
              storageUrl: storageUrl || list[idx].storageUrl,
              storagePath: storagePath || list[idx].storagePath
            };
          }
          return { ...prev, [selectedChapterId]: list };
        });

        const now = new Date();
        setLastSavedTime(now.toLocaleTimeString());
        setHasUnsavedChanges(false);
        return true;
      } catch (err: any) {
        console.error(err);
        addToast('Auto-save page failed.', 'error');
        return false;
      }
    } 
    
    // Chapter details editing mode save
    if (selectedChapterId) {
      if (!chapterTitleBuffer.trim()) {
        addToast('Chapter title can not be blank.', 'warning');
        return false;
      }
      try {
        const chRef = doc(db, 'books', bookId, 'chapters', selectedChapterId);
        await updateDoc(chRef, {
          title: chapterTitleBuffer.trim()
        });

        setChapters(prev => prev.map(ch => ch.id === selectedChapterId ? { ...ch, title: chapterTitleBuffer.trim() } : ch));

        const now = new Date();
        setLastSavedTime(now.toLocaleTimeString());
        setHasUnsavedChanges(false);
        return true;
      } catch (err) {
        console.error(err);
        addToast('Failed to save chapter title updates.', 'error');
        return false;
      }
    }

    return false;
  };

  // Triggers manual global save and recalculates indices across entire book
  const handleGlobalSaveAll = async () => {
    if (!bookId) return;
    setSaving(true);
    
    try {
      // First save active buffers
      if (hasUnsavedChanges) {
        await handleSaveActiveSelection();
      }

      // Re-run the global page index flat calculations pipeline
      await recalculateBookPageIndices(bookId);

      // Refresh listings
      const chs = await getChapters(bookId);
      setChapters(chs);
      const pgsMap: Record<string, Page[]> = {};
      for (const ch of chs) {
        const pgs = await getPagesInChapter(bookId, ch.id);
        pgsMap[ch.id] = pgs;
      }
      setChapterPages(pgsMap);

      addToast('All content compiled successfully and indexed! ✓', 'success');
    } catch (err) {
      console.error(err);
      addToast('Could not compile content hierarchy.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePublishBook = async () => {
    if (!bookId) return;
    setSaving(true);
    try {
      // First save active buffers
      if (hasUnsavedChanges) {
        await handleSaveActiveSelection();
      }

      // Re-run the global page index flat calculations pipeline
      await recalculateBookPageIndices(bookId);

      // Fetch chapters and pages in order
      const chs = await getChapters(bookId);
      
      const chaptersWithPages = [];
      for (const ch of chs) {
        const pgs = await getPagesInChapter(bookId, ch.id);
        const pagesList = (pgs || []).map(pg => ({
          pageNumber: pg.pageNumber,
          htmlContent: pg.htmlContent || ""
        }));

        chaptersWithPages.push({
          chapterId: ch.id,
          title: ch.title,
          pages: pagesList
        });
      }

      // Structure Manifest
      const manifest = {
        bookId: bookId,
        title: book?.title || "Untitled Book",
        chapters: chaptersWithPages
      };

      // Serialize JSON
      const manifestJson = JSON.stringify(manifest, null, 2);

      // Upload to Storage
      const storagePath = `books/${bookId}/manifest.json`;
      const fileRef = storageRef(storage, storagePath);

      await uploadString(fileRef, manifestJson, 'raw', {
        contentType: 'application/json; charset=utf-8'
      });

      const downloadUrl = await getDownloadURL(fileRef);

      // Update the book document in Firestore
      const bookDocRef = doc(db, 'books', bookId);
      await updateDoc(bookDocRef, {
        manifestUrl: downloadUrl,
        updatedAt: serverTimestamp()
      });

      console.log('✅ Manifest JSON uploaded to Storage and manifestUrl updated in Firestore:', downloadUrl);
      addToast('Book published and EPUB manifest compiled successfully! ✓', 'success');
    } catch (err: any) {
      console.error('Manifest upload failed:', err);
      addToast(err.message || 'Error occurred while compiling or publishing book manifest.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Navigations Selection triggers
  const handleSelectChapter = async (chId: string) => {
    if (hasUnsavedChanges) {
      const saved = await handleSaveActiveSelection();
      if (!saved) return;
    }

    const ch = chapters.find(c => c.id === chId);
    if (!ch) return;

    setSelectedChapterId(chId);
    setSelectedPageId(null);
    setChapterTitleBuffer(ch.title || '');
    setHasUnsavedChanges(false);
  };

  const handleSelectPage = async (chId: string, pgId: string) => {
    if (hasUnsavedChanges) {
      const saved = await handleSaveActiveSelection();
      if (!saved) return;
    }

    const pg = chapterPages[chId]?.find(p => p.id === pgId);
    if (!pg) return;

    setSelectedChapterId(chId);
    setSelectedPageId(pgId);
    setPageContentBuffer(pg.content || '');
    setHasUnsavedChanges(false);
  };

  // Addition operations
  const handleAddChapter = async () => {
    if (!bookId) return;
    
    setSaving(true);
    const newNumber = chapters.length + 1;
    const title = `Chapter ${newNumber}`;
    
    try {
      const chRef = collection(db, 'books', bookId, 'chapters');
      const docAdded = await addDoc(chRef, {
        chapterNumber: newNumber,
        title,
        totalPages: 0,
        pagesStart: 0,
        pagesEnd: 0,
        sortOrder: newNumber,
        createdAt: serverTimestamp()
      });

      const newCh: Chapter = {
        id: docAdded.id,
        chapterNumber: newNumber,
        title,
        totalPages: 0,
        pagesStart: 0,
        pagesEnd: 0,
        sortOrder: newNumber
      };

      setChapters(prev => [...prev, newCh]);
      setChapterPages(prev => ({ ...prev, [docAdded.id]: [] }));
      setExpandedChapterIds(prev => ({ ...prev, [docAdded.id]: true }));

      // Select newly added chapter
      setSelectedChapterId(docAdded.id);
      setSelectedPageId(null);
      setChapterTitleBuffer(title);
      setHasUnsavedChanges(false);
      
      addToast('Chapter created!', 'success');
    } catch (err) {
      console.error(err);
      addToast('Failed to create new chapter.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAddPage = async (chId: string) => {
    if (!bookId) return;
    setSaving(true);

    const chPagesList = chapterPages[chId] || [];
    const newPageNumber = chPagesList.length + 1;
    const initialContent = `# Section Title\n\nType the classic book content here...`;
    const initialHtml = generatePageHtml(initialContent);

    try {
      const pgsRef = collection(db, 'books', bookId, 'chapters', chId, 'pages');
      const docAdded = await addDoc(pgsRef, {
        pageNumber: newPageNumber,
        globalPageNumber: 0, // Assigned correctly during compile / recalculate pass
        content: initialContent,
        htmlContent: initialHtml,
        wordCount: initialContent.split(/\s+/).length,
        sortOrder: newPageNumber,
        createdAt: serverTimestamp()
      });

      const newPg: Page = {
        id: docAdded.id,
        pageNumber: newPageNumber,
        globalPageNumber: 0,
        content: initialContent,
        htmlContent: initialHtml,
        wordCount: initialContent.split(/\s+/).length,
        sortOrder: newPageNumber
      };

      setChapterPages(prev => ({
        ...prev,
        [chId]: [...(prev[chId] || []), newPg]
      }));

      // Immediately select newly added page
      setSelectedChapterId(chId);
      setSelectedPageId(docAdded.id);
      setPageContentBuffer(initialContent);
      setHasUnsavedChanges(false);

      addToast('Page added to chapter!', 'success');
    } catch (err) {
      console.error(err);
      addToast('Failed to append new page.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Reorder up/down operations for chapters (highly stable desktop + touch backup)
  const handleShiftChapterOrder = async (idx: number, direction: 'up' | 'down') => {
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === chapters.length - 1) return;

    setSaving(true);
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    const updated = [...chapters];
    
    // Swap
    const temp = updated[idx];
    updated[idx] = updated[targetIdx];
    updated[targetIdx] = temp;

    // Refresh sequence
    const rewritten = updated.map((ch, oIdx) => ({
      ...ch,
      chapterNumber: oIdx + 1,
      sortOrder: oIdx + 1
    }));

    setChapters(rewritten);
    
    // Batch commit new index sort values to Firebase
    try {
      const batch = writeBatch(db);
      rewritten.forEach(ch => {
        batch.update(doc(db, 'books', bookId!, 'chapters', ch.id), {
          chapterNumber: ch.chapterNumber,
          sortOrder: ch.sortOrder
        });
      });
      await batch.commit();
      addToast('Chapters sorting refreshed! ✓', 'success');
    } catch (err) {
      console.error(err);
      addToast('Could not save reordered sort indices.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // deletion triggers
  const handleDeleteChapterTrigger = (chId: string) => {
    setDeleteTarget({ type: 'chapter', targetId: chId });
  };

  const handleDeletePageTrigger = (chId: string, pgId: string) => {
    setDeleteTarget({ type: 'page', parentId: chId, targetId: pgId });
  };

  const handleDeleteConfirm = async () => {
    if (!bookId || !deleteTarget) return;

    setIsHtmlPreviewExpanded(true);
    setSaving(true);

    try {
      if (deleteTarget.type === 'chapter') {
        const chId = deleteTarget.targetId;
        
        // Deletes chapter doc
        await deleteDoc(doc(db, 'books', bookId, 'chapters', chId));
        
        // Clear local cache variables
        setChapters(prev => prev.filter(c => c.id !== chId));
        setChapterPages(prev => {
          const c = { ...prev };
          delete c[chId];
          return c;
        });

        // Clear selectors if active
        if (selectedChapterId === chId) {
          setSelectedChapterId(null);
          setSelectedPageId(null);
        }

        addToast('Chapter removed successfully.', 'success');
      } else if (deleteTarget.type === 'page' && deleteTarget.parentId) {
        const chId = deleteTarget.parentId;
        const pgId = deleteTarget.targetId;

        await deleteDoc(doc(db, 'books', bookId, 'chapters', chId, 'pages', pgId));

        setChapterPages(prev => ({
          ...prev,
          [chId]: (prev[chId] || []).filter(p => p.id !== pgId)
        }));

        if (selectedPageId === pgId) {
          setSelectedPageId(null);
        }

        addToast('Page deleted.', 'success');
      }
    } catch (err) {
      console.error(err);
      addToast('Could not finalize deletion.', 'error');
    } finally {
      setSaving(false);
      setDeleteTarget(null);
    }
  };

  // Toolbar Formatting Wrap helper
  const handleInsertTag = (openTag: string, closeTag: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;

    const selectedText = text.substring(start, end);
    const replacement = openTag + selectedText + closeTag;

    const finalBuffer = text.substring(0, start) + replacement + text.substring(end);
    setPageContentBuffer(finalBuffer);
    setHasUnsavedChanges(true);

    // Re-focus and align cursor
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + openTag.length, start + openTag.length + selectedText.length);
    }, 50);
  };

  // Nav page-hops
  const handlePageNavigationPrev = () => {
    if (!selectedChapterId || !selectedPageId) return;
    const list = chapterPages[selectedChapterId] || [];
    const idx = list.findIndex(p => p.id === selectedPageId);
    if (idx > 0) {
      handleSelectPage(selectedChapterId, list[idx - 1].id);
    }
  };

  const handlePageNavigationNext = () => {
    if (!selectedChapterId || !selectedPageId) return;
    const list = chapterPages[selectedChapterId] || [];
    const idx = list.findIndex(p => p.id === selectedPageId);
    if (idx < list.length - 1) {
      handleSelectPage(selectedChapterId, list[idx + 1].id);
    }
  };

  if (loading) {
    return <LoadingSpinner fullScreen label="Resolving multi-chapter book content mapping..." />;
  }

  // Active calculation variables for the editor content page
  const activeChapterObj = chapters.find(c => c.id === selectedChapterId);
  const activePageList = selectedChapterId ? chapterPages[selectedChapterId] || [] : [];
  const activePageIndex = activePageList.findIndex(p => p.id === selectedPageId);
  const activeCharCount = pageContentBuffer.length;
  const activeCharNoSpaces = pageContentBuffer.replace(/\s/g, '').length;
  const activeWordsCount = pageContentBuffer.trim() === '' ? 0 : pageContentBuffer.trim().split(/\s+/).length;
  const activeReadTime = Math.max(1, Math.ceil(activeWordsCount / 200));

  let pageBalanceLabel = 'Good Balance';
  let pageBalanceColor = 'var(--accent-green)';
  let pageBalanceBg = 'rgba(106, 191, 123, 0.1)';

  if (activeWordsCount < 150) {
    pageBalanceLabel = 'Too Short';
    pageBalanceColor = '#d97706'; // amber
    pageBalanceBg = 'rgba(217, 119, 6, 0.1)';
  } else if (activeWordsCount > 800) {
    pageBalanceLabel = 'Too Long';
    pageBalanceColor = '#ef4444'; // red
    pageBalanceBg = 'rgba(239, 68, 68, 0.1)';
  }

  return (
    <div id="content-editor-page">
      {/* HEADER BAR FOR THE WORKSPACE */}
      <div className="header-bar-editor" id="content-header-bar" style={{ margin: '-24px -24px 24px -24px', position: 'sticky', top: 0, zIndex: 99 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button 
            onClick={() => navigate(`/books/${bookId}`)} 
            className="btn btn-secondary"
            style={{ padding: '8px' }}
            id="back-to-specs-btn"
          >
            <ChevronLeft size={18} />
            <span style={{ fontSize: '12px', fontWeight: 'bold' }}>Specs</span>
          </button>
          
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 'bold' }}>{book?.title || 'Loading Works...'}</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              <span>Content Workspace</span>
              {hasUnsavedChanges ? (
                <span style={{ color: 'var(--accent-gold)' }}>● Unsaved Changes</span>
              ) : (
                <span style={{ color: 'var(--accent-green)' }}>● Saved {lastSavedTime ? `@ ${lastSavedTime}` : ''}</span>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }} id="header-bar-editor-controls">
          <button
            onClick={handleGlobalSaveAll}
            className="btn btn-secondary"
            disabled={saving}
            id="global-save-compiler-btn"
          >
            <Save size={15} />
            <span>💾 Save Changes</span>
          </button>

          <button
            onClick={handleUpdatePublishBook}
            className="btn btn-gold"
            disabled={saving}
            id="publish-book-btn"
          >
            <span>🚀 Update/Publish Book</span>
          </button>

          <button
            onClick={() => navigate(`/books/${bookId}/preview`)}
            className="btn btn-secondary"
            id="inline-reader-preview-btn"
          >
            <Eye size={15} />
            <span>Mockup Preview</span>
          </button>
        </div>
      </div>

      {/* CORE FRAME LAYOUT */}
      <div className="content-editor-container" id="workspace-layout-container">
        
        {/* LEFT SIDEBAR CHAPTERS AND PAGES DIRECTORY */}
        <aside className="content-sidebar" id="workspace-sidebar">
          <div className="content-sidebar-header">
            <button
              onClick={handleAddChapter}
              className="btn btn-gold btn-sm"
              style={{ width: '100%', justifyContent: 'center' }}
              disabled={saving}
              id="sidebar-add-chapter-btn"
            >
              <Plus size={14} />
              <span>Add Chapter</span>
            </button>
          </div>

          {/* Table of items scroll */}
          <div className="chapters-list" id="sidebar-chapters-scroll">
            {chapters.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '12px', textAlign: 'center', padding: '24px 8px' }}>
                No Chapters added yet. Create a chapter partition to start writing!
              </p>
            ) : (
              chapters.map((ch, idx) => {
                const isExpanded = !!expandedChapterIds[ch.id] || selectedChapterId === ch.id;
                const isChSelected = selectedChapterId === ch.id && !selectedPageId;
                const pages = chapterPages[ch.id] || [];

                return (
                  <div 
                    key={ch.id} 
                    className={`chapter-item ${isChSelected ? 'selected' : ''}`}
                    id={`sidebar-chapter-block-${ch.id}`}
                  >
                    {/* Chapter title header node */}
                    <div className="chapter-header" style={{ backgroundColor: isChSelected ? 'rgba(197, 168, 128, 0.1)' : 'transparent' }}>
                      {/* up down action buttons */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <button 
                          type="button" 
                          onClick={(e) => { e.stopPropagation(); handleShiftChapterOrder(idx, 'up'); }}
                          className="chapter-expand-btn"
                          disabled={idx === 0 || saving}
                          title="Move Up"
                          style={{ height: '14px', width: '14px' }}
                        >
                          <ArrowUp size={11} />
                        </button>
                        <button 
                          type="button" 
                          onClick={(e) => { e.stopPropagation(); handleShiftChapterOrder(idx, 'down'); }}
                          className="chapter-expand-btn"
                          disabled={idx === chapters.length - 1 || saving}
                          title="Move Down"
                          style={{ height: '14px', width: '14px' }}
                        >
                          <ArrowDown size={11} />
                        </button>
                      </div>

                      <div 
                        onClick={() => handleSelectChapter(ch.id)} 
                        style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        <span className="chapter-num">{ch.chapterNumber}</span>
                        <span className="chapter-title-editable" style={{ color: isChSelected ? 'var(--accent-gold)' : 'var(--text-primary)' }}>
                          {ch.title}
                        </span>
                      </div>

                      {/* controls expand toggle */}
                      <div className="chapter-badges">
                        <span className="chapter-count-badge" title="Pages count in chapter">{pages.length}</span>
                        
                        <button 
                          onClick={() => setExpandedChapterIds(prev => ({ ...prev, [ch.id]: !isExpanded }))}
                          className="chapter-expand-btn"
                          style={{ padding: 0 }}
                        >
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>

                        <button
                          onClick={() => handleDeleteChapterTrigger(ch.id)}
                          className="chapter-delete-btn"
                          style={{ padding: '2px' }}
                          title="Delete Chapter"
                          id={`delete-chapter-sidebar-${ch.id}`}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>

                    {/* nested pages selection list */}
                    {isExpanded && (
                      <div className="pages-list" id={`sidebar-pages-container-${ch.id}`}>
                        {pages.map((pg, pIdx) => {
                          const isPgSelected = selectedPageId === pg.id;
                          return (
                            <div
                              key={pg.id}
                              className={`page-item ${isPgSelected ? 'selected' : ''}`}
                              onClick={() => handleSelectPage(ch.id, pg.id)}
                              id={`sidebar-page-item-${pg.id}`}
                            >
                              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <FileText size={12} style={{ color: isPgSelected ? 'var(--accent-gold)' : 'var(--text-muted)' }} />
                                <span>Page {pIdx + 1}</span>
                              </span>

                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeletePageTrigger(ch.id, pg.id); }}
                                className="page-delete-btn"
                                style={{ padding: '2px', background: 'none' }}
                                title="Delete Page"
                                id={`delete-page-sidebar-${pg.id}`}
                              >
                                <Trash2 size={11} />
                              </button>
                            </div>
                          );
                        })}

                        {/* Page append creation button */}
                        <button
                          onClick={() => handleAddPage(ch.id)}
                          className="chapter-add-page-btn"
                          id={`add-page-btn-${ch.id}`}
                        >
                          <Plus size={11} />
                          <span>Add Page</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* RIGHT ACTIVE DATA EDITOR CONTAINER */}
        <section className="editor-main" id="workspace-editor-viewport">
          {(!selectedChapterId) ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: '16px' }}>
              <ListOrdered size={48} style={{ color: 'var(--border-color)' }} />
              <p>Please select, edit, or create a Chapter node from the left menu panel.</p>
            </div>
          ) : (!selectedPageId) ? (
            
            // CHAPTER GENERAL HEADER DETAILS EDITOR VIEW
            <div id="section-chapter-details-editor" style={{ maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="card">
                <h3 style={{ fontSize: '15px', color: 'var(--accent-gold)', marginBottom: '16px' }}>
                  Chapter {activeChapterObj?.chapterNumber || ''} Metadata Configuration
                </h3>
                
                <div className="form-group">
                  <label htmlFor="chapter-title-field">Chapter Header Title</label>
                  <input
                    type="text"
                    id="chapter-title-field"
                    value={chapterTitleBuffer}
                    onChange={(e) => { setChapterTitleBuffer(e.target.value); setHasUnsavedChanges(true); }}
                    placeholder="e.g. Part One — The Arrival"
                  />
                  <p className="form-hint_text">Enter heading readable on chapter divider screens.</p>
                </div>

                <div style={{ marginTop: '24px' }}>
                  <button
                    type="button"
                    onClick={handleSaveActiveSelection}
                    className="btn btn-gold"
                    id="save-chapter-title-btn"
                  >
                    <Save size={14} />
                    <span>Save Chapter Title</span>
                  </button>
                </div>
              </div>

              {/* Sub list of pages in chapter details */}
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', alignItems: 'center' }}>
                  <h4 style={{ fontSize: '14px' }}>Chapter Pages</h4>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{activePageList.length} pages total</span>
                </div>

                {activePageList.length === 0 ? (
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', textPrompt: 'center', padding: '16px 0' }}>
                    There are no content pages mapped to this chapter section.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {activePageList.map((pg, pIdx) => (
                      <div 
                        key={pg.id}
                        onClick={() => handleSelectPage(selectedChapterId!, pg.id)}
                        style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          padding: '10px 14px', 
                          backgroundColor: 'var(--bg-secondary)', 
                          border: '1px solid var(--border-color)', 
                          borderRadius: '6px', 
                          cursor: 'pointer',
                          fontSize: '13px'
                        }}
                      >
                        <strong>Page {pIdx + 1}</strong>
                        <span style={{ color: 'var(--text-muted)' }}>{pg.wordCount || 0} words</span>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => handleAddPage(selectedChapterId!)}
                  className="btn btn-secondary"
                  style={{ width: '100%', marginTop: '16px', justifyContent: 'center' }}
                  id="chapter-editor-add-page-btn"
                >
                  <Plus size={14} />
                  <span>+ Add Page to this Chapter</span>
                </button>
              </div>
            </div>
          ) : (

            // PAGE WRITING CONTENT EXCLUSIVE AREA EDITOR
            <div id="section-page-editor" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              
              {/* PAGE SUBTITLE HEADER CONTROL */}
              <div 
                style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  paddingBottom: '16px', 
                  borderBottom: '1px solid var(--border-color)',
                  marginBottom: '16px' 
                }}
              >
                <div>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Chapter {activeChapterObj?.chapterNumber}: {activeChapterObj?.title}
                  </span>
                  <h3 style={{ fontSize: '16px' }}>
                    Page {activePageIndex + 1} of {activePageList.length}
                  </h3>
                </div>

                {/* Page Navigation jumping */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={handlePageNavigationPrev}
                    disabled={activePageIndex === 0}
                    className="btn btn-secondary btn-sm"
                    title="Jump to Previous Page"
                  >
                    ◄ Prev Page
                  </button>
                  <button
                    onClick={handlePageNavigationNext}
                    disabled={activePageIndex === activePageList.length - 1}
                    className="btn btn-secondary btn-sm"
                    title="Jump to Next Page"
                  >
                    Next Page ►
                  </button>
                </div>
              </div>

              {/* RICH TEXT FORMATTING TOOLBAR */}
              <div className="editor-hint-bar" id="page-editor-toolbar" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '10px', alignItems: 'center', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', marginBottom: '12px' }}>
                
                {/* Text Styles */}
                <div style={{ display: 'flex', gap: '4px', borderRight: '1px solid var(--border-color)', paddingRight: '8px' }}>
                  <button 
                    onClick={() => handleInsertTag('<strong>', '</strong>')} 
                    className="btn btn-secondary btn-sm" 
                    title="Bold" 
                    type="button" 
                    style={{ padding: '6px' }}
                  >
                    <Bold size={14} />
                  </button>
                  <button 
                    onClick={() => handleInsertTag('<em>', '</em>')} 
                    className="btn btn-secondary btn-sm" 
                    title="Italic" 
                    type="button" 
                    style={{ padding: '6px' }}
                  >
                    <Italic size={14} />
                  </button>
                  <button 
                    onClick={() => handleInsertTag('<u>', '</u>')} 
                    className="btn btn-secondary btn-sm" 
                    title="Underline" 
                    type="button" 
                    style={{ padding: '6px' }}
                  >
                    <Underline size={14} />
                  </button>
                </div>

                {/* Headings & Quote */}
                <div style={{ display: 'flex', gap: '4px', borderRight: '1px solid var(--border-color)', paddingRight: '8px' }}>
                  <button 
                    onClick={() => handleInsertTag('<h2>', '</h2>')} 
                    className="btn btn-secondary btn-sm" 
                    title="Heading 1" 
                    type="button" 
                    style={{ padding: '6px', fontWeight: 'bold', fontSize: '11px' }}
                  >
                    H1
                  </button>
                  <button 
                    onClick={() => handleInsertTag('<h3>', '</h3>')} 
                    className="btn btn-secondary btn-sm" 
                    title="Heading 2" 
                    type="button" 
                    style={{ padding: '6px', fontWeight: 'bold', fontSize: '11px' }}
                  >
                    H2
                  </button>
                  <button 
                    onClick={() => handleInsertTag('<h4>', '</h4>')} 
                    className="btn btn-secondary btn-sm" 
                    title="Heading 3" 
                    type="button" 
                    style={{ padding: '6px', fontWeight: 'bold', fontSize: '11px' }}
                  >
                    H3
                  </button>
                  <button 
                    onClick={() => handleInsertTag('<blockquote>', '</blockquote>')} 
                    className="btn btn-secondary btn-sm" 
                    title="Blockquote" 
                    type="button" 
                    style={{ padding: '6px' }}
                  >
                    <Quote size={14} />
                  </button>
                </div>

                {/* Alignments */}
                <div style={{ display: 'flex', gap: '4px', borderRight: '1px solid var(--border-color)', paddingRight: '8px' }}>
                  <button 
                    onClick={() => handleInsertTag('<p style="text-align: left">', '</p>')} 
                    className="btn btn-secondary btn-sm" 
                    title="Align Left" 
                    type="button" 
                    style={{ padding: '6px' }}
                  >
                    <AlignLeft size={14} />
                  </button>
                  <button 
                    onClick={() => handleInsertTag('[center]', '[/c]')} 
                    className="btn btn-secondary btn-sm" 
                    title="Center Align" 
                    type="button" 
                    style={{ padding: '6px' }}
                  >
                    <AlignCenter size={14} />
                  </button>
                  <button 
                    onClick={() => handleInsertTag('[right]', '[/r]')} 
                    className="btn btn-secondary btn-sm" 
                    title="Align Right" 
                    type="button" 
                    style={{ padding: '6px' }}
                  >
                    <AlignRight size={14} />
                  </button>
                  <button 
                    onClick={() => handleInsertTag('<p style="text-align: justify">', '</p>')} 
                    className="btn btn-secondary btn-sm" 
                    title="Justify Align" 
                    type="button" 
                    style={{ padding: '6px' }}
                  >
                    <AlignJustify size={14} />
                  </button>
                </div>

                {/* Font Size Selector */}
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center', borderRight: '1px solid var(--border-color)', paddingRight: '8px' }}>
                  <select 
                    onChange={(e) => {
                      if (!e.target.value) return;
                      handleInsertTag(`<span style="font-size: ${e.target.value}">`, '</span>');
                      e.target.value = ''; // Reset select
                    }}
                    style={{ fontSize: '12px', padding: '4px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '4px' }}
                    defaultValue=""
                  >
                    <option value="" disabled>Font Size</option>
                    <option value="small">Small</option>
                    <option value="medium">Normal</option>
                    <option value="large">Large</option>
                    <option value="x-large">XLarge</option>
                  </select>

                  {/* Custom font size */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                    <input 
                      type="number" 
                      placeholder="Size px" 
                      style={{ width: '60px', padding: '4px', fontSize: '11px', textAlign: 'center', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '4px' }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const val = (e.currentTarget as HTMLInputElement).value;
                          if (val) {
                            handleInsertTag(`<span style="font-size: ${val}px">`, '</span>');
                            e.currentTarget.value = '';
                          }
                        }
                      }}
                    />
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>px</span>
                  </div>
                </div>

                {/* Insert elements */}
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button 
                    onClick={() => handleInsertTag('\n---\n', '')} 
                    className="btn btn-secondary btn-sm" 
                    title="Insert Divider" 
                    type="button" 
                    style={{ padding: '4px 8px', fontSize: '11px' }}
                  >
                    — Divider
                  </button>
                  <button 
                    onClick={() => handleInsertTag('\n\n', '')} 
                    className="btn btn-secondary btn-sm" 
                    title="Insert New Paragraph" 
                    type="button" 
                    style={{ padding: '4px 8px', fontSize: '11px' }}
                  >
                    ¶ Para
                  </button>
                  <button 
                    onClick={() => handleInsertTag('<br>', '')} 
                    className="btn btn-secondary btn-sm" 
                    title="Insert Line Break" 
                    type="button" 
                    style={{ padding: '4px 8px', fontSize: '11px' }}
                  >
                    ↵ Break
                  </button>
                </div>

              </div>

              {/* CORE INPUT TEXTAREA BUFFER BODY */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '300px' }}>
                <textarea
                  ref={textareaRef}
                  id="page-content-buffer-textarea"
                  value={pageContentBuffer}
                  onChange={(e) => { setPageContentBuffer(e.target.value); setHasUnsavedChanges(true); }}
                  rows={15}
                  style={{ 
                    fontFamily: 'var(--font-mono)', 
                    fontSize: '14px', 
                    lineHeight: '1.6', 
                    flex: 1, 
                    resize: 'vertical',
                    backgroundColor: 'var(--bg-secondary)',
                    borderColor: 'var(--border-color)',
                    color: 'var(--text-primary)'
                  }}
                  placeholder="Type or paste page content here...&#10;&#10;Each blank line = new paragraph.&#10;&#10;# Chapter Title&#10;> Blockquote Quote text&#10;[center]Centered subtitle text[/c]&#10;HTML tags are supported natively"
                />
                
                {/* Stats bar counts */}
                <div 
                  className="editor-stats-bar" 
                  id="page-editor-word-counters" 
                  style={{ 
                    display: 'flex', 
                    flexWrap: 'wrap', 
                    gap: '16px', 
                    padding: '12px', 
                    backgroundColor: 'var(--bg-secondary)', 
                    border: '1px solid var(--border-color)', 
                    borderTop: 'none', 
                    borderBottomLeftRadius: '6px', 
                    borderBottomRightRadius: '6px', 
                    fontSize: '12px', 
                    color: 'var(--text-muted)',
                    alignItems: 'center'
                  }}
                >
                  <span>Chars: <strong>{activeCharCount}</strong></span>
                  <span>Chars (no spaces): <strong>{activeCharNoSpaces}</strong></span>
                  <span>Words: <strong>{activeWordsCount}</strong></span>
                  <span>Est. Read: <strong>{activeReadTime}</strong> min reading rate</span>
                  
                  {/* Page Balance Indicator */}
                  <div 
                    style={{ 
                      marginLeft: 'auto', 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '6px', 
                      padding: '4px 8px', 
                      borderRadius: '12px', 
                      backgroundColor: pageBalanceBg, 
                      color: pageBalanceColor,
                      fontSize: '11px',
                      fontWeight: 'bold'
                    }}
                    id="page-balance-badge"
                  >
                    <span>Page Balance:</span>
                    <span>{pageBalanceLabel}</span>
                  </div>
                </div>
              </div>

              {/* REAL-TIME COLLAPSIBLE CREAM SEPIA RENDERED HTML PREVIEW */}
              <div className="html-preview-section">
                <div 
                  className="html-preview-header" 
                  onClick={() => setIsHtmlPreviewExpanded(!isHtmlPreviewExpanded)}
                  id="toggle-html-preview-header"
                >
                  <span>{isHtmlPreviewExpanded ? '▼ Collapsible HTML Preview' : '▶ Expand HTML Preview'}</span>
                  <span style={{ fontSize: '11px', color: 'var(--accent-gold)' }}>Matches Android App Sepia Reader</span>
                </div>

                {isHtmlPreviewExpanded && (
                  <div 
                    className="html-preview-body" 
                    id="html-preview-viewport"
                    dangerouslySetInnerHTML={{ __html: generatePageHtml(pageContentBuffer) }}
                  />
                )}
              </div>

              {/* STICKY BOTTOM ACTIONS SAVER */}
              <div 
                style={{ 
                  marginTop: '16px', 
                  paddingTop: '16px', 
                  borderTop: '1px solid var(--border-color)', 
                  display: 'flex', 
                  justifyContent: 'flex-end',
                  gap: '12px' 
                }}
                id="page-editor-bottom-save-row"
              >
                <button
                  type="button"
                  onClick={handleSaveActiveSelection}
                  className="btn btn-gold"
                  disabled={saving || !hasUnsavedChanges}
                  id="save-page-content-btn"
                >
                  <Save size={14} />
                  <span>{saving ? 'Saving...' : 'Save Current Page'}</span>
                </button>
              </div>

            </div>
          )}
        </section>

      </div>

      {/* Chapter/Page delete confirmation dialog overlay */}
      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title={deleteTarget?.type === 'chapter' ? 'Delete Chapter Partition' : 'Delete Page Record'}
        message={
          deleteTarget?.type === 'chapter'
            ? 'Are you absolute certain you want to delete this chapter? This deletes the chapter node and ALL associated nested pages under it. Recalculation compilation is required afterwards to sort the rest.'
            : 'Are you sure you want to delete this page? This is irreversible and removes the text completely.'
        }
        confirmText="Confirm Delete"
        isDanger={true}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />

      {saving && <LoadingSpinner fullScreen label="Sync writes with Firebase Firestore engine..." />}
    </div>
  );
}
