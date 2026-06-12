import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useBooks, Chapter, Page } from '../hooks/useBooks';
import { db, storage } from '../firebase/config';
import { ref as storageRef, uploadString, getDownloadURL } from 'firebase/storage';
import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  getDocs, 
  query, 
  orderBy, 
  serverTimestamp 
} from 'firebase/firestore';
import { Save, Trash2, ArrowRight } from 'lucide-react';

interface BookContentEditorTabProps {
  bookId: string;
  addToast: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

// Helper to convert raw content to HTML according to rules
export function convertToHtml(raw: string): string {
  if (!raw) return '';
  // Split by double newlines (\n\n) -> each block
  const blocks = raw.split(/\n\s*\n/);
  
  const htmled = blocks.map(block => {
    let text = block.trim();
    if (!text) return '';

    // Handle [center]# t[/center] -> <h2 style="text-align:center">t</h2>
    const centerHeaderPattern = /^\[center\]#\s+([\s\S]*?)\[\/center\]$/i;
    if (centerHeaderPattern.test(text)) {
      const match = text.match(centerHeaderPattern);
      const inner = (match ? match[1] : '').trim();
      return `<h2 style="text-align:center">${inner.replace(/\n/g, '<br>')}</h2>`;
    }

    // Handle [center]t[/center] -> <p style="text-align:center">t</p>
    const centerPattern = /^\[center\]([\s\S]*?)\[\/center\]$/i;
    if (centerPattern.test(text)) {
      const match = text.match(centerPattern);
      const inner = (match ? match[1] : '').trim();
      return `<p style="text-align:center">${inner.replace(/\n/g, '<br>')}</p>`;
    }

    // Handle [right]t[/right] -> <p style="text-align:right">t</p>
    const rightPattern = /^\[right\]([\s\S]*?)\[\/right\]$/i;
    if (rightPattern.test(text)) {
      const match = text.match(rightPattern);
      const inner = (match ? match[1] : '').trim();
      return `<p style="text-align:right">${inner.replace(/\n/g, '<br>')}</p>`;
    }

    // Block starts with "# " -> <h2>text</h2>
    if (text.startsWith('# ')) {
      return `<h2>${text.substring(2).trim().replace(/\n/g, '<br>')}</h2>`;
    }

    // Block starts with "## " -> <h3>text</h3>
    if (text.startsWith('## ')) {
      return `<h3>${text.substring(3).trim().replace(/\n/g, '<br>')}</h3>`;
    }

    // Block starts with "### " -> <h4>text</h4>
    if (text.startsWith('### ')) {
      return `<h4>${text.substring(4).trim().replace(/\n/g, '<br>')}</h4>`;
    }

    // Block starts with "> " -> <blockquote>text</blockquote>
    if (text.startsWith('> ')) {
      return `<blockquote>${text.substring(2).trim().replace(/\n/g, '<br>')}</blockquote>`;
    }

    // Block equals "---" -> <hr>
    if (text === '---') {
      return '<hr>';
    }

    // Block starts with "<h" -> output AS-IS
    if (text.toLowerCase().startsWith('<h')) {
      return text;
    }

    // Block starts with "<p" -> output AS-IS
    if (text.toLowerCase().startsWith('<p')) {
      return text;
    }

    // Block starts with "<" -> output AS-IS (any HTML)
    if (text.startsWith('<')) {
      return text;
    }

    // Else paragraph with single \n converted to <br>
    return `<p>${text.replace(/\n/g, '<br>')}</p>`;
  });

  return htmled.filter(Boolean).join('\n');
}

export default function BookContentEditorTab({ bookId, addToast }: BookContentEditorTabProps) {
  const { getBook, getChapters, getPagesInChapter, recalculateBookPageIndices, loading: bkLoading } = useBooks();

  // Content structure state
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [chapterPages, setChapterPages] = useState<Record<string, Page[]>>({});
  const [expandedChapters, setExpandedChapters] = useState<Record<string, boolean>>({});

  // Active edit selections
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);

  // Buffer state
  const [pageContentBuffer, setPageContentBuffer] = useState('');
  const [chapterTitleBuffer, setChapterTitleBuffer] = useState('');
  const [customFontSize, setCustomFontSize] = useState('16');
  const [showPreview, setShowPreview] = useState(false);

  // Unsaved changes indicators
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const contentTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Load chapters & pages
  const loadBookContent = useCallback(async () => {
    if (!bookId) return;
    try {
      const chs = await getChapters(bookId);
      setChapters(chs || []);
      
      const pagesMap: Record<string, Page[]> = {};
      const expanded: Record<string, boolean> = {};
      
      for (const ch of chs) {
        const pgs = await getPagesInChapter(bookId, ch.id);
        pagesMap[ch.id] = pgs || [];
        // Expand active chapter or first by default
        expanded[ch.id] = true;
      }
      setChapterPages(pagesMap);
      setExpandedChapters(expanded);
    } catch (err) {
      console.error("Failed to load book content hierarchy", err);
    }
  }, [bookId, getChapters, getPagesInChapter]);

  // Initial load
  useEffect(() => {
    loadBookContent();
  }, [bookId, loadBookContent]);

  // Auto-save effect
  useEffect(() => {
    if (!hasUnsavedChanges || !selectedPageId) return;
    const interval = setInterval(() => {
      console.log('Background autosaving content page...');
      savePage(false);
    }, 30000);
    return () => clearInterval(interval);
  }, [hasUnsavedChanges, selectedPageId, pageContentBuffer]);

  // Handle page save operation
  const savePage = async (isManual: boolean = true) => {
    if (!bookId || !selectedChapterId || !selectedPageId) return;
    setIsSaving(true);
    try {
      const pageRef = doc(db, 'books', bookId, 'chapters', selectedChapterId, 'pages', selectedPageId);
      const compiledHtml = convertToHtml(pageContentBuffer);
      
      const charCount = pageContentBuffer.length;
      const charCountNoSpaces = pageContentBuffer.replace(/\s/g, '').length;
      
      // Words count excluding HTML tags
      const stripHtmlText = pageContentBuffer.replace(/<[^>]*>/g, ' ');
      const wordCount = stripHtmlText.trim() === '' ? 0 : stripHtmlText.trim().split(/\s+/).length;

      // Find current page within list to capture page number
      const activePg = (chapterPages[selectedChapterId] || []).find(p => p.id === selectedPageId);
      const pageNum = activePg?.pageNumber || 1;
      const globalPageNum = activePg?.globalPageNumber || pageNum;

      const currentChapter = chapters.find(c => c.id === selectedChapterId);
      const chapterNumber = currentChapter?.chapterNumber || 1;

      await updateDoc(pageRef, {
        content: pageContentBuffer,
        htmlContent: compiledHtml,
        charCount,
        charCountNoSpaces,
        wordCount,
        pageNumber: pageNum,
        sortOrder: pageNum
      });

      // Sync HTML content markup to Storage path
      try {
        const storagePath = `books/${bookId}/chapters/chapter_${chapterNumber}/page_${pageNum}.html`;
        const fileRef = storageRef(storage, storagePath);
        
        const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="book-id" content="${bookId}">
  <meta name="chapter" content="${chapterNumber}">
  <meta name="page" content="${pageNum}">
  <meta name="global-page" content="${globalPageNum}">
</head>
<body>
  ${compiledHtml}
</body>
</html>`;

        await uploadString(fileRef, fullHtml, 'raw', {
          contentType: 'text/html; charset=utf-8'
        });
        
        const downloadUrl = await getDownloadURL(fileRef);
        
        await updateDoc(pageRef, {
          storageUrl: downloadUrl,
          storagePath: storagePath
        });
        
        console.log('✅ Page uploaded to Storage:', storagePath);
      } catch (storageError) {
        console.error('Storage upload failed:', storageError);
      }

      // Recalculate book indexing and stats
      await recalculateBookPageIndices(bookId);
      
      // Reload hierarchy structures
      await loadBookContent();

      setHasUnsavedChanges(false);
      const now = new Date();
      setLastSavedTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

      if (isManual) {
        addToast('Page saved ✓', 'success');
      }
    } catch (err: any) {
      console.error("Save page failed:", err);
      addToast('Save page failed: ' + err.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdatePublishBook = async () => {
    if (!bookId) return;
    setIsSaving(true);
    try {
      // First save active buffers
      if (hasUnsavedChanges && selectedPageId) {
        await savePage(false);
      }

      // Re-run the global page index flat calculations pipeline
      await recalculateBookPageIndices(bookId);

      // Fetch book info to get original title
      const bookData = await getBook(bookId);

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
        title: bookData?.title || "Untitled Book",
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
      
      // Reload hierarchy structures
      await loadBookContent();
    } catch (err: any) {
      console.error('Manifest upload failed:', err);
      addToast(err.message || 'Error occurred while compiling or publishing book manifest.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Chapter operation: Save Title
  const handleSaveChapter = async () => {
    if (!bookId || !selectedChapterId) return;
    if (!chapterTitleBuffer.trim()) {
      addToast('Chapter title cannot be empty', 'warning');
      return;
    }
    setIsSaving(true);
    try {
      const chRef = doc(db, 'books', bookId, 'chapters', selectedChapterId);
      await updateDoc(chRef, {
        title: chapterTitleBuffer.trim()
      });
      
      setChapters((prev) => prev.map(ch => ch.id === selectedChapterId ? { ...ch, title: chapterTitleBuffer.trim() } : ch));
      addToast('Chapter saved ✓', 'success');
      setHasUnsavedChanges(false);
    } catch (err: any) {
      console.error(err);
      addToast('Failed to save chapter title: ' + err.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Add Chapter
  const handleAddChapter = async () => {
    if (!bookId) return;
    setIsSaving(true);
    try {
      const newNumber = chapters.length + 1;
      const chTitle = `Chapter ${newNumber}`;
      const chRef = collection(db, 'books', bookId, 'chapters');
      const docAdded = await addDoc(chRef, {
        chapterNumber: newNumber,
        title: chTitle,
        totalPages: 0,
        pagesStart: 0,
        pagesEnd: 0,
        sortOrder: newNumber,
        createdAt: serverTimestamp()
      });
      
      const newCh: Chapter = {
        id: docAdded.id,
        chapterNumber: newNumber,
        title: chTitle,
        totalPages: 0,
        pagesStart: 0,
        pagesEnd: 0,
        sortOrder: newNumber
      };
      
      setChapters((prev) => [...prev, newCh]);
      setChapterPages((prev) => ({ ...prev, [docAdded.id]: [] }));
      setExpandedChapters((prev) => ({ ...prev, [docAdded.id]: true }));
      
      setSelectedChapterId(docAdded.id);
      setSelectedPageId(null);
      setChapterTitleBuffer(chTitle);
      setHasUnsavedChanges(false);
      addToast('Chapter created ✓', 'success');
    } catch (err: any) {
      console.error(err);
      addToast('Failed to create chapter: ' + err.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Add Page
  const handleAddPage = async (chId: string) => {
    if (!bookId) return;
    setIsSaving(true);
    try {
      const chPagesList = chapterPages[chId] || [];
      const newPageNumber = chPagesList.length + 1;
      const initialContent = `# Section Title\n\nType or paste page content here...`;
      
      const compiledHtml = convertToHtml(initialContent);
      const charCount = initialContent.length;
      const charCountNoSpaces = initialContent.replace(/\s/g, '').length;
      const wordCount = initialContent.trim() === '' ? 0 : initialContent.trim().split(/\s+/).length;
      
      const pgsRef = collection(db, 'books', bookId, 'chapters', chId, 'pages');
      const docAdded = await addDoc(pgsRef, {
        pageNumber: newPageNumber,
        globalPageNumber: 0,
        content: initialContent,
        htmlContent: compiledHtml,
        charCount,
        charCountNoSpaces,
        wordCount,
        sortOrder: newPageNumber,
        createdAt: serverTimestamp()
      });
      
      const newPg: Page & { charCount?: number; charCountNoSpaces?: number } = {
        id: docAdded.id,
        pageNumber: newPageNumber,
        globalPageNumber: 0,
        content: initialContent,
        htmlContent: compiledHtml,
        wordCount,
        sortOrder: newPageNumber,
        charCount,
        charCountNoSpaces
      };
      
      setChapterPages((prev) => ({
        ...prev,
        [chId]: [...(prev[chId] || []), newPg]
      }));
      
      setSelectedChapterId(chId);
      setSelectedPageId(docAdded.id);
      setPageContentBuffer(initialContent);
      setHasUnsavedChanges(false);
      
      await recalculateBookPageIndices(bookId);
      await loadBookContent();
      
      addToast('Page added and saved ✓', 'success');
    } catch (err: any) {
      console.error(err);
      addToast('Failed to append page: ' + err.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Chapter deletion
  const handleDeleteChapter = async (chId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!bookId) return;
    if (!window.confirm('Are you absolutely certain you want to delete this chapter? This will delete the chapter node and ALL nested pages.')) return;
    setIsSaving(true);
    try {
      const pgsRef = collection(db, 'books', bookId, 'chapters', chId, 'pages');
      const pgsSnap = await getDocs(pgsRef);
      for (const pgDoc of pgsSnap.docs) {
        await deleteDoc(doc(db, 'books', bookId, 'chapters', chId, 'pages', pgDoc.id));
      }
      
      await deleteDoc(doc(db, 'books', bookId, 'chapters', chId));
      
      await recalculateBookPageIndices(bookId);
      await loadBookContent();
      
      if (selectedChapterId === chId) {
        setSelectedChapterId(null);
        setSelectedPageId(null);
      }
      addToast('Chapter deleted ✓', 'success');
    } catch (err: any) {
      console.error(err);
      addToast('Failed to delete chapter: ' + err.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Page deletion
  const handleDeletePage = async (chId: string, pgId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!bookId) return;
    if (!window.confirm('Are you sure you want to delete this page?')) return;
    setIsSaving(true);
    try {
      await deleteDoc(doc(db, 'books', bookId, 'chapters', chId, 'pages', pgId));
      
      await recalculateBookPageIndices(bookId);
      await loadBookContent();
      
      if (selectedPageId === pgId) {
        setSelectedPageId(null);
      }
      addToast('Page deleted ✓', 'success');
    } catch (err: any) {
      console.error(err);
      addToast('Failed to delete page: ' + err.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Wrap utility helpers for Richmond Toolbar
  const handleToolbarWrap = (openTag: string, closeTag: string, placeholder: string = 'text') => {
    const textarea = contentTextareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;

    let selectedText = text.substring(start, end);
    if (!selectedText) {
      selectedText = placeholder;
    }

    const replacement = openTag + selectedText + closeTag;
    const finalBuffer = text.substring(0, start) + replacement + text.substring(end);
    setPageContentBuffer(finalBuffer);
    setHasUnsavedChanges(true);

    setTimeout(() => {
      textarea.focus();
      const newSelectionStart = start + openTag.length;
      const newSelectionEnd = newSelectionStart + selectedText.length;
      textarea.setSelectionRange(newSelectionStart, newSelectionEnd);
    }, 50);
  };

  // Prefix lines at cursor
  const handleLineStartPrefix = (prefix: string, placeholder: string = 'Heading') => {
    const textarea = contentTextareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;

    const beforeText = text.substring(0, start);
    const lastNewline = beforeText.lastIndexOf('\n');
    const lineStartIdx = lastNewline === -1 ? 0 : lastNewline + 1;

    const selectedText = text.substring(start, end);

    if (!selectedText) {
      const replacement = prefix + placeholder;
      const finalBuffer = beforeText + replacement + text.substring(end);
      setPageContentBuffer(finalBuffer);
      setHasUnsavedChanges(true);

      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + prefix.length, start + prefix.length + placeholder.length);
      }, 50);
    } else {
      const afterLineStart = text.substring(lineStartIdx, start);
      const replacement = prefix + afterLineStart + selectedText;
      const finalBuffer = text.substring(0, lineStartIdx) + replacement + text.substring(end);
      setPageContentBuffer(finalBuffer);
      setHasUnsavedChanges(true);

      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + prefix.length, end + prefix.length);
      }, 50);
    }
  };

  // Immediate character insertion
  const handleInsertAtCursor = (insertText: string) => {
    const textarea = contentTextareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;

    const finalBuffer = text.substring(0, start) + insertText + text.substring(end);
    setPageContentBuffer(finalBuffer);
    setHasUnsavedChanges(true);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + insertText.length, start + insertText.length);
    }, 50);
  };

  // Compute live character statistics
  const computedCharCount = pageContentBuffer.length;
  const computedCharCountNoSpaces = pageContentBuffer.replace(/\s/g, '').length;
  const cleanedTextForWords = pageContentBuffer.replace(/<[^>]*>/g, ' ');
  const computedWordCount = cleanedTextForWords.trim() === '' ? 0 : cleanedTextForWords.trim().split(/\s+/).length;
  const computedEstRead = Math.ceil(computedWordCount / 200);

  // Pages balance status generator
  const getPagesBalance = (charsCount: number) => {
    if (charsCount < 500) {
      return { text: "Too Short", bg: "bg-red-500/10 text-red-400 border border-red-500/20" };
    } else if (charsCount <= 800) {
      return { text: "Short", bg: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20" };
    } else if (charsCount <= 1500) {
      return { text: "Good", bg: "bg-green-500/10 text-green-400 border border-green-500/20" };
    } else if (charsCount <= 2500) {
      return { text: "Balanced", bg: "bg-green-500/10 text-green-400 border border-green-500/20" };
    } else if (charsCount <= 3500) {
      return { text: "Long", bg: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20" };
    } else {
      return { text: "Too Long", bg: "bg-red-500/10 text-red-400 border border-red-500/20" };
    }
  };
  const balanceBadge = getPagesBalance(computedCharCount);

  // Compute stats for passive chapter
  const getChapterStats = (chId: string) => {
    const pgs = chapterPages[chId] || [];
    let totalChars = 0;
    let totalWords = 0;
    pgs.forEach((p: any) => {
      totalChars += p.charCount || p.content?.length || 0;
      totalWords += p.wordCount || 0;
    });
    return {
      pagesCount: pgs.length,
      totalChars,
      totalWords
    };
  };

  // References and indexing
  const activeChapterObj = chapters.find(c => c.id === selectedChapterId);
  const activePageList = selectedChapterId ? chapterPages[selectedChapterId] || [] : [];
  const activePageIndex = activePageList.findIndex(p => p.id === selectedPageId);

  return (
    <div className="flex flex-col md:flex-row gap-6 items-start mt-6" id="book-content-editor-tab-root">
      {/* 1. CHAPTER SIDEBAR NAVIGATION PANEL (300px) */}
      <div style={{ width: '300px', flexShrink: 0 }} className="card border border-[#30363d] bg-[#0d1117] p-4 rounded-xl flex flex-col gap-4">
        <div className="flex justify-between items-center pb-2 border-b border-[#30363d]">
          <h3 className="text-[#c5a880] text-sm font-bold tracking-wide">Chapters</h3>
          <button
            type="button"
            onClick={handleAddChapter}
            className="px-2 py-1 rounded text-xs bg-[#c5a880] text-[#0d1117] font-semibold hover:opacity-90 active:scale-95 transition-all cursor-pointer"
          >
            + Add Chapter
          </button>
        </div>

        <div className="overflow-y-auto max-h-[600px] flex flex-col gap-2">
          {chapters.length === 0 ? (
            <p className="text-gray-500 text-xs text-center py-6">No chapters added yet. Click "+ Add Chapter" to get started.</p>
          ) : (
            chapters.map((ch) => {
              const isExpanded = !!expandedChapters[ch.id] || selectedChapterId === ch.id;
              const isChSelected = selectedChapterId === ch.id && !selectedPageId;
              const pages = chapterPages[ch.id] || [];

              return (
                <div key={ch.id} className="border border-[#30363d] rounded bg-[#161b22] overflow-hidden">
                  <div 
                    onClick={() => {
                      setSelectedChapterId(ch.id);
                      setSelectedPageId(null);
                      setChapterTitleBuffer(ch.title || '');
                      setExpandedChapters(prev => ({ ...prev, [ch.id]: !prev[ch.id] }));
                      setHasUnsavedChanges(false);
                    }}
                    className={`p-3 flex justify-between items-center cursor-pointer hover:bg-[#1f242c] transition-colors ${isChSelected ? 'bg-[#c5a880]/10 border-l-2 border-[#c5a880]' : 'bg-[#0d1117]'}`}
                  >
                    <div className="flex gap-2 items-center text-xs truncate">
                      <span className="text-gray-500 font-mono">{isExpanded ? '▼' : '▶'}</span>
                      <span className="font-semibold text-[#e6edf3] truncate">Chapter {ch.chapterNumber} — {ch.title}</span>
                    </div>
                    <button 
                      type="button"
                      onClick={(e) => handleDeleteChapter(ch.id, e)}
                      className="text-red-400 hover:text-red-500 p-1"
                      title="Delete Chapter"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="p-2 border-t border-[#30363d] bg-[#0d1117]/40 flex flex-col gap-1">
                      {pages.map((pg, pIdx) => {
                        const isPgSelected = selectedPageId === pg.id;
                        return (
                          <div
                            key={pg.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedChapterId(ch.id);
                              setSelectedPageId(pg.id);
                              setPageContentBuffer(pg.content || '');
                              setHasUnsavedChanges(false);
                            }}
                            className={`p-2 rounded text-[11px] flex justify-between items-center cursor-pointer transition-all ${isPgSelected ? 'bg-[#c5a880]/20 text-[#c5a880] font-bold border border-[#c5a880]/40' : 'text-[#c9d1d9] hover:bg-[#30363d]/50'}`}
                          >
                            <span>Page {pIdx + 1}</span>
                            <button
                              type="button"
                              onClick={(e) => handleDeletePage(ch.id, pg.id, e)}
                              className="text-red-400 hover:text-red-500 p-1 bg-transparent"
                              title="Delete Page"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => handleAddPage(ch.id)}
                        className="mt-1 p-2 border border-dashed border-[#5b9bd5] rounded text-[11px] text-center text-[#5b9bd5] hover:bg-[#5b9bd5]/10 transition-colors font-bold"
                      >
                        + Add Page
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="pt-2 border-t border-[#30363d] mt-2 flex flex-col gap-2">
          <button
            type="button"
            onClick={handleUpdatePublishBook}
            className="w-full py-2 px-3 rounded bg-[#c5a880] text-[#0d1117] font-bold text-xs hover:opacity-90 active:scale-95 transition-all text-center flex items-center justify-center gap-2 cursor-pointer"
            disabled={isSaving}
          >
            <span>🚀 Update/Publish Book</span>
          </button>
        </div>
      </div>

      {/* 2. RIGHT WORKSPACE AREA */}
      <div className="flex-1 min-w-0 w-full">
        {isSaving && (
          <div className="mb-4 text-xs font-mono text-[#c5a880] flex gap-2 items-center animate-pulse">
            <span className="h-2 w-2 rounded-full bg-[#c5a880]" />
            <span>Syncing writes with Firestore cloud engine...</span>
          </div>
        )}

        {/* State A: Nothing Selected */}
        {!selectedChapterId ? (
          <div className="card border border-[#30363d] bg-[#0d1117] p-12 text-center rounded-xl flex flex-col items-center justify-center text-gray-400 min-h-[400px]">
            <span className="text-4xl mb-4">📓</span>
            <h4 className="text-white font-bold mb-2">Book Content Workspace</h4>
            <p className="text-sm max-w-sm">Select or add a chapter on the left sidebar to start organizing chapters and writing book content.</p>
          </div>
        ) : !selectedPageId ? (
          /* State B: Chapter Selected */
          <div className="card border border-[#30363d] bg-[#0d1117] p-6 rounded-xl flex flex-col gap-6" id="chapter-editor-view">
            <div>
              <span className="text-xs font-mono text-gray-500">Chapter Number: {activeChapterObj?.chapterNumber} (read-only)</span>
              <h3 className="text-[#c5a880] font-bold text-lg mt-1">Chapter Specification</h3>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-[#c9d1d9]">Chapter Title:</label>
              <input
                type="text"
                value={chapterTitleBuffer}
                onChange={(e) => {
                  setChapterTitleBuffer(e.target.value);
                  setHasUnsavedChanges(true);
                }}
                className="w-full bg-[#161b22] border border-[#30363d] rounded-lg px-4 py-2 text-[#e6edf3] focus:border-[#c5a880] focus:outline-none"
                placeholder="e.g. Part One — The Arrival"
              />
            </div>

            <div className="border border-[#30363d] bg-[#161b22] px-4 py-3 rounded-lg flex justify-between items-center text-xs font-mono">
              <span className="text-gray-400">Chapter Stats (read-only):</span>
              <span className="text-[#e6edf3]">
                Pages: <strong className="text-[#c5a880]">{getChapterStats(selectedChapterId).pagesCount}</strong>  |  Total chars: <strong className="text-[#c5a880]">{getChapterStats(selectedChapterId).totalChars}</strong>  |  Total words: <strong className="text-[#c5a880]">{getChapterStats(selectedChapterId).totalWords}</strong>
              </span>
            </div>

            <div>
              <button
                type="button"
                onClick={handleSaveChapter}
                className="px-4 py-2 bg-[#c5a880] text-[#0d1117] font-bold rounded hover:opacity-90 active:scale-95 transition-all text-xs flex gap-2 items-center cursor-pointer"
              >
                <Save size={14} />
                <span>Save Chapter</span>
              </button>
            </div>
          </div>
        ) : (
          /* State C: Page Selected (Full Rich Editor) */
          <div className="flex flex-col gap-4" id="page-editor-view">
            {/* Header / Nav row */}
            <div className="flex justify-between items-center pb-3 border-b border-[#30363d]">
              <div>
                <span className="text-xs font-mono text-gray-500 uppercase tracking-widest block font-bold">Writing Desk</span>
                <h3 className="text-[#c5a880] text-sm md:text-base font-bold">
                  Chapter {activeChapterObj?.chapterNumber}: {activeChapterObj?.title} — Page {activePageIndex + 1}
                </h3>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (activePageIndex > 0) {
                      const prevPg = activePageList[activePageIndex - 1];
                      setSelectedPageId(prevPg.id);
                      setPageContentBuffer(prevPg.content || '');
                      setHasUnsavedChanges(false);
                    }
                  }}
                  disabled={activePageIndex <= 0}
                  className="px-3 py-1 bg-[#30363d] text-xs font-semibold text-[#c9d1d9] rounded hover:bg-gray-700 disabled:opacity-30 cursor-pointer"
                >
                  ◄ Prev Page
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (activePageIndex < activePageList.length - 1) {
                      const nextPg = activePageList[activePageIndex + 1];
                      setSelectedPageId(nextPg.id);
                      setPageContentBuffer(nextPg.content || '');
                      setHasUnsavedChanges(false);
                    }
                  }}
                  disabled={activePageIndex >= activePageList.length - 1}
                  className="px-3 py-1 bg-[#30363d] text-xs font-semibold text-[#c9d1d9] rounded hover:bg-gray-700 disabled:opacity-30 cursor-pointer"
                >
                  Next Page ►
                </button>
              </div>
            </div>

            {/* MONOSPACE RICH TEXT TOOLBAR (Row 1 to Row 4) */}
            <div style={{ backgroundColor: '#1c2128', borderBottom: '1px solid #30363d' }} className="flex flex-col gap-2 p-3 rounded-t-lg border border-[#30363d]">
              {/* ROW 1 — Text Style */}
              <div className="flex gap-1.5 items-center flex-wrap">
                <button 
                  type="button" 
                  onClick={() => handleToolbarWrap('<strong>', '</strong>', 'Bold text')} 
                  className="px-2 py-1 rounded text-xs bg-[#30363d]/80 text-[#e6edf3] hover:bg-[#c5a880] hover:text-[#0d1117] transition-all font-mono font-extrabold cursor-pointer" 
                  style={{ height: '32px', minWidth: '32px' }}
                >
                  B
                </button>
                <button 
                  type="button" 
                  onClick={() => handleToolbarWrap('<em>', '</em>', 'Italic text')} 
                  className="px-2 py-1 rounded text-xs bg-[#30363d]/80 text-[#e6edf3] hover:bg-[#c5a880] hover:text-[#0d1117] transition-all font-mono italic cursor-pointer" 
                  style={{ height: '32px', minWidth: '32px' }}
                >
                  I
                </button>
                <button 
                  type="button" 
                  onClick={() => handleToolbarWrap('<u>', '</u>', 'Underlined text')} 
                  className="px-2 py-1 rounded text-xs bg-[#30363d]/80 text-[#e6edf3] hover:bg-[#c5a880] hover:text-[#0d1117] transition-all font-mono underline cursor-pointer" 
                  style={{ height: '32px', minWidth: '32px' }}
                >
                  U
                </button>
                
                <div className="h-5 w-[1px] bg-[#30363d] mx-1" />
                
                <button 
                  type="button" 
                  onClick={() => handleLineStartPrefix('# ', 'Heading 1')} 
                  className="px-2 py-1 rounded text-xs bg-[#30363d]/80 text-[#e6edf3] hover:bg-[#c5a880] hover:text-[#0d1117] transition-all font-semibold font-mono cursor-pointer" 
                  style={{ height: '32px' }}
                >
                  H1
                </button>
                <button 
                  type="button" 
                  onClick={() => handleLineStartPrefix('## ', 'Heading 2')} 
                  className="px-2 py-1 rounded text-xs bg-[#30363d]/80 text-[#e6edf3] hover:bg-[#c5a880] hover:text-[#0d1117] transition-all font-semibold font-mono cursor-pointer" 
                  style={{ height: '32px' }}
                >
                  H2
                </button>
                <button 
                  type="button" 
                  onClick={() => handleLineStartPrefix('### ', 'Heading 3')} 
                  className="px-2 py-1 rounded text-xs bg-[#30363d]/80 text-[#e6edf3] hover:bg-[#c5a880] hover:text-[#0d1117] transition-all font-semibold font-mono cursor-pointer" 
                  style={{ height: '32px' }}
                >
                  H3
                </button>
                
                <div className="h-5 w-[1px] bg-[#30363d] mx-1" />
                
                <button 
                  type="button" 
                  onClick={() => handleLineStartPrefix('> ', 'Quote text')} 
                  className="px-2 py-1 rounded text-xs bg-[#30363d]/80 text-[#e6edf3] hover:bg-[#c5a880] hover:text-[#0d1117] transition-all font-mono cursor-pointer" 
                  style={{ height: '32px', minWidth: '32px' }}
                >
                  " "
                </button>
              </div>

              {/* ROW 2 — Font Size */}
              <div className="flex gap-2 items-center flex-wrap text-xs text-gray-400">
                <span>Size:</span>
                <button 
                  type="button" 
                  onClick={() => handleToolbarWrap('<span style="font-size:14px">', '</span>', 'Small text')} 
                  className="px-2 py-1 rounded bg-[#30363d]/80 text-[#e6edf3] hover:bg-[#c5a880] hover:text-[#0d1117] transition-colors cursor-pointer" 
                  style={{ height: '32px' }}
                >
                  Small
                </button>
                <button 
                  type="button" 
                  onClick={() => {}} 
                  className="px-2 py-1 rounded bg-[#30363d]/80 text-[#e6edf3] hover:bg-[#c5a880] hover:text-[#0d1117] transition-colors cursor-pointer" 
                  style={{ height: '32px' }}
                >
                  Normal
                </button>
                <button 
                  type="button" 
                  onClick={() => handleToolbarWrap('<span style="font-size:22px">', '</span>', 'Large text')} 
                  className="px-2 py-1 rounded bg-[#30363d]/80 text-[#e6edf3] hover:bg-[#c5a880] hover:text-[#0d1117] transition-colors cursor-pointer" 
                  style={{ height: '32px' }}
                >
                  Large
                </button>
                <button 
                  type="button" 
                  onClick={() => handleToolbarWrap('<span style="font-size:28px">', '</span>', 'Extra Large text')} 
                  className="px-2 py-1 rounded bg-[#30363d]/80 text-[#e6edf3] hover:bg-[#c5a880] hover:text-[#0d1117] transition-colors cursor-pointer" 
                  style={{ height: '32px' }}
                >
                  XLarge
                </button>
                
                <div className="h-5 w-[1px] bg-[#30363d] mx-1" />
                
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-500 font-mono text-[11px]">Size:</span>
                  <input 
                    type="number" 
                    value={customFontSize} 
                    onChange={(e) => setCustomFontSize(e.target.value)}
                    className="w-12 bg-[#161b22] border border-[#30363d] text-[#e6edf3] text-center text-xs rounded px-1"
                    style={{ height: '24px' }}
                    min="1"
                  />
                  <span className="text-gray-500 font-mono text-[11px]">px</span>
                  <button 
                    type="button"
                    onClick={() => {
                      const size = customFontSize || '16';
                      handleToolbarWrap(`<span style="font-size:${size}px">`, '</span>', 'Custom text size');
                    }}
                    className="px-2 bg-[#c5a880] text-[#0d1117] rounded text-xs font-bold hover:opacity-90 transition-opacity cursor-pointer flex items-center"
                    style={{ height: '24px' }}
                  >
                    Apply
                  </button>
                </div>
              </div>

              {/* ROW 3 — Alignment */}
              <div className="flex gap-1.5 items-center flex-wrap">
                <button 
                  type="button" 
                  onClick={() => handleToolbarWrap('<p style="text-align:left">', '</p>', 'Left aligned text')} 
                  className="px-2 py-1 rounded text-xs bg-[#30363d]/80 text-[#e6edf3] hover:bg-[#c5a880] hover:text-[#0d1117] transition-all cursor-pointer" 
                  style={{ height: '32px' }}
                >
                  ≡ Left
                </button>
                <button 
                  type="button" 
                  onClick={() => handleToolbarWrap('[center]', '[/center]', 'Centered text')} 
                  className="px-2 py-1 rounded text-xs bg-[#30363d]/80 text-[#e6edf3] hover:bg-[#c5a880] hover:text-[#0d1117] transition-all cursor-pointer" 
                  style={{ height: '32px' }}
                >
                  ≡ Center
                </button>
                <button 
                  type="button" 
                  onClick={() => handleToolbarWrap('[right]', '[/right]', 'Right aligned text')} 
                  className="px-2 py-1 rounded text-xs bg-[#30363d]/80 text-[#e6edf3] hover:bg-[#c5a880] hover:text-[#0d1117] transition-all cursor-pointer" 
                  style={{ height: '32px' }}
                >
                  ≡ Right
                </button>
                <button 
                  type="button" 
                  onClick={() => handleToolbarWrap('<p style="text-align:justify">', '</p>', 'Justified text')} 
                  className="px-2 py-1 rounded text-xs bg-[#30363d]/80 text-[#e6edf3] hover:bg-[#c5a880] hover:text-[#0d1117] transition-all cursor-pointer" 
                  style={{ height: '32px' }}
                >
                  ≡ Justify
                </button>
              </div>

              {/* ROW 4 — Insert */}
              <div className="flex gap-1.5 items-center flex-wrap">
                <button 
                  type="button" 
                  onClick={() => handleInsertAtCursor('\n---\n')} 
                  className="px-2 py-1 rounded text-xs bg-[#30363d]/80 text-[#e6edf3] hover:bg-[#c5a880] hover:text-[#0d1117] transition-all font-mono cursor-pointer" 
                  style={{ height: '32px' }}
                >
                  [--- Divider]
                </button>
                <button 
                  type="button" 
                  onClick={() => handleInsertAtCursor('\n\n')} 
                  className="px-2 py-1 rounded text-xs bg-[#30363d]/80 text-[#e6edf3] hover:bg-[#c5a880] hover:text-[#0d1117] transition-all font-mono cursor-pointer" 
                  style={{ height: '32px' }}
                >
                  [↵ New Para]
                </button>
                <button 
                  type="button" 
                  onClick={() => handleInsertAtCursor('<br>')} 
                  className="px-2 py-1 rounded text-xs bg-[#30363d]/80 text-[#e6edf3] hover:bg-[#c5a880] hover:text-[#0d1117] transition-all font-mono cursor-pointer" 
                  style={{ height: '32px' }}
                >
                  [↵ Line Break]
                </button>
              </div>
            </div>

            {/* CONTENT TEXTAREA */}
            <textarea
              ref={contentTextareaRef}
              value={pageContentBuffer}
              onChange={(e) => {
                setPageContentBuffer(e.target.value);
                setHasUnsavedChanges(true);
              }}
              style={{
                minHeight: '400px',
                width: '100%',
                fontFamily: 'monospace',
                fontSize: '14px',
                lineHeight: '1.6',
                resize: 'vertical',
                backgroundColor: '#0d1117',
                color: '#e6edf3',
                borderColor: '#30363d',
                padding: '16px'
              }}
              className="border focus:border-[#c5a880] focus:outline-none rounded-b-lg scrollbar-thin"
              placeholder={`Type or paste page content here...

Formatting guide:
# Heading 1
## Heading 2  
### Heading 3
> Blockquote
--- (horizontal line)
<strong>bold</strong>
<em>italic</em>
<span style='font-size:24px'>large text</span>
[center]centered text[/center]
[right]right aligned[/right]
<br> = line break

Or use the toolbar buttons above to format selected text.`}
            />

            {/* LIVE STATS BAR */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border border-[#30363d] bg-[#161b22] text-[#e6edf3] text-xs font-mono rounded-lg">
              <div className="flex flex-col gap-1.5">
                <div>📝 Characters: <span className="text-[#c5a880] font-bold">{computedCharCount.toLocaleString()}</span></div>
                <div>📄 Characters (no spaces): <span className="text-[#c5a880] font-bold">{computedCharCountNoSpaces.toLocaleString()}</span></div>
              </div>
              <div className="flex flex-col gap-1.5 justify-between">
                <div className="flex justify-between items-center">
                  <span>Words: <span className="text-[#c5a880] font-bold">{computedWordCount.toLocaleString()}</span></span>
                  {lastSavedTime && (
                    <span className="text-[10px] text-gray-500 font-mono">● Saved {lastSavedTime}</span>
                  )}
                </div>
                <div className="flex justify-between items-center">
                  <span>⏱ Est. read: <span className="text-[#c5a880] font-bold">~{computedEstRead} min</span></span>
                  <div className="flex items-center gap-1.5">
                    <span>Pages balance:</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${balanceBadge.bg}`}>
                      {balanceBadge.text}
                    </span>
                  </div>
                </div>
              </div>
              <div className="col-span-1 md:col-span-2 text-center text-gray-400 text-[10px] pt-1 border-t border-[#30363d]/50">
                Recommended: 800–2500 chars
              </div>
            </div>

            {/* COLLAPSIBLE HTML PREVIEW */}
            <div className="border border-[#30363d] rounded-lg overflow-hidden my-2">
              <button
                type="button"
                onClick={() => setShowPreview(!showPreview)}
                className="w-full text-left p-3 font-semibold text-xs border-b border-[#30363d] bg-[#161b22] text-[#c5a880] flex justify-between items-center hover:bg-[#1f242d] transition-colors cursor-pointer"
              >
                <span>{showPreview ? '▲ Hide Preview' : '▼ Show Preview'}</span>
                <span className="text-[9px] text-gray-500 font-mono tracking-widest uppercase">Sepia Reader Simulator</span>
              </button>

              {showPreview && (
                <div className="flex justify-center bg-[#1c2128] py-8 px-4 overflow-x-auto">
                  <style>{`
                    .prose-sepia h2 { font-size: 24px; font-weight: bold; margin-top: 1.5em; margin-bottom: 0.5em; text-align: inherit; color: #1a1510; font-family: Georgia, serif; }
                    .prose-sepia h3 { font-size: 20px; font-weight: bold; margin-top: 1.5em; margin-bottom: 0.5em; text-align: inherit; color: #1a1510; font-family: Georgia, serif; }
                    .prose-sepia h4 { font-size: 18px; font-weight: bold; margin-top: 1.5em; margin-bottom: 0.5em; text-align: inherit; color: #1a1510; font-family: Georgia, serif; }
                    .prose-sepia p { margin-top: 0px; margin-bottom: 1em; text-align: inherit; }
                    .prose-sepia blockquote { border-left: 4px solid #c5a880; padding-left: 16px; margin: 1.5em 0; font-style: italic; color: #5a4b3d; }
                    .prose-sepia hr { border: 0; border-top: 1px solid #e0cfbb; margin: 2em 0; }
                    .prose-sepia strong { font-weight: bold; color: #100a00; }
                    .prose-sepia em { font-style: italic; }
                    .prose-sepia u { text-decoration: underline; }
                  `}</style>
                  <div 
                    style={{
                      backgroundColor: '#f5e6d0',
                      fontFamily: 'Georgia, serif',
                      fontSize: '18px',
                      lineHeight: '1.8',
                      padding: '24px',
                      maxWidth: '600px',
                      width: '100%',
                      color: '#2c251c',
                      borderRadius: '4.5px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                    }}
                    className="prose-sepia break-words"
                    dangerouslySetInnerHTML={{ __html: convertToHtml(pageContentBuffer) }}
                  />
                </div>
              )}
            </div>

            {/* SAVE ACTION FOOTER */}
            <div className="flex justify-end gap-3 items-center">
              {hasUnsavedChanges && (
                <span className="text-xs text-[#c5a880] font-mono select-none flex items-center gap-1">
                  ● Unsaved changes buffer
                </span>
              )}
              <button
                type="button"
                onClick={() => savePage(true)}
                className="px-4 py-2 rounded bg-[#c5a880] text-[#0d1117] font-bold hover:opacity-90 active:scale-95 transition-all text-xs flex gap-2 items-center cursor-pointer"
              >
                <Save size={15} />
                <span>Save Current Page</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
