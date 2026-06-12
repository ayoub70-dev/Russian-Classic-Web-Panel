import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useBooks, Book } from '../hooks/useBooks';
import { useAuthors, Author } from '../hooks/useAuthors';
import { useToast } from '../components/Toast';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage, db } from '../firebase/config';
import { doc, onSnapshot } from 'firebase/firestore';
import { ChevronLeft, Upload, Trash2, Save, BookOpen, Eye, Info } from 'lucide-react';
import ConfirmDialog from '../components/ConfirmDialog';
import LoadingSpinner from '../components/LoadingSpinner';
import BookContentEditorTab from '../components/BookContentEditorTab';
import ContentVerification from '../components/ContentVerification';

export default function BookEditor() {
  const { id } = useParams<{ id?: string }>();
  const isEditMode = !!id;

  const navigate = useNavigate();
  const { addToast } = useToast();
  const { getBook, createBook, updateBook, deleteBook, loading: dbLoading } = useBooks();
  const { getAuthorsReactive } = useAuthors();

  // Tab State
  const [activeTab, setActiveTab] = useState<'details' | 'content'>('details');

  // State
  const [bookId, setBookId] = useState('');
  const [title, setTitle] = useState('');
  const [authorId, setAuthorId] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [description, setDescription] = useState('');
  const [year, setYear] = useState<number>(1869);
  const [translator, setTranslator] = useState('');
  const [genre, setGenre] = useState('Novel');
  const [readingTime, setReadingTime] = useState('');
  const [premium, setPremium] = useState(false);
  const [coverPath, setCoverPath] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [status, setStatus] = useState<'draft' | 'published'>('published');

  // Read-only stats from current book loading
  const [totalChapters, setTotalChapters] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [createdAtStr, setCreatedAtStr] = useState('');
  const [updatedAtStr, setUpdatedAtStr] = useState('');

  // UI State
  const [authors, setAuthors] = useState<Author[]>([]);
  const [loading, setLoading] = useState(isEditMode);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load authors for dropdown select
  useEffect(() => {
    const unsubscribe = getAuthorsReactive((loadedAuthors) => {
      setAuthors(loadedAuthors);
    });
    return unsubscribe;
  }, [getAuthorsReactive]);

  // Load book if edit mode
  useEffect(() => {
    if (isEditMode && id) {
      const docRef = doc(db, 'books', id);
      const unsubscribe = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
          const book = { id: docSnap.id, ...docSnap.data() } as Book;
          setBookId(book.id || '');
          setTitle(book.title || '');
          setAuthorId(book.authorId || '');
          setAuthorName(book.authorName || '');
          setDescription(book.description || '');
          setYear(book.year || 1869);
          setTranslator(book.translator || '');
          setGenre(book.genre || '');
          setReadingTime(book.readingTime || '');
          setPremium(!!book.premium);
          setCoverPath(book.coverPath || '');
          setCoverUrl(book.coverUrl || '');
          setStatus(book.status || 'draft');
          
          setTotalChapters(book.totalChapters || 0);
          setTotalPages(book.totalPages || 0);

          if (book.createdAt) {
            const d = new Date((book.createdAt as any).seconds * 1000);
            setCreatedAtStr(d.toLocaleDateString() + ' ' + d.toLocaleTimeString());
          }
          if (book.updatedAt) {
            const d = new Date((book.updatedAt as any).seconds * 1000);
            setUpdatedAtStr(d.toLocaleDateString() + ' ' + d.toLocaleTimeString());
          }
        } else {
          addToast("Book details reference not found.", "warning");
          navigate('/books');
        }
        setLoading(false);
      }, (err) => {
        console.error("Book doc load error:", err);
        addToast("Error fetching book document.", "error");
        navigate('/books');
        setLoading(false);
      });

      return () => unsubscribe();
    }
  }, [id, isEditMode, navigate, addToast]);

  const sanitizeBookId = (value: string) => {
    return value
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '_') // replace spaces with underscores
      .replace(/[^a-z0-9_]/g, '') // alphanumeric
      .replace(/_+/g, '_'); // contraction
  };

  const handleIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBookId(sanitizeBookId(e.target.value));
  };

  const handleAuthorChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    setAuthorId(selectedId);
    
    const aut = authors.find((a) => a.id === selectedId);
    if (aut) {
      setAuthorName(aut.displayName);
    } else {
      setAuthorName('');
    }
  };

  // Upload book cover image file to Firebase Storage
  const handleCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Type validation
    const isValidType = ['image/jpeg', 'image/jpg', 'image/png'].includes(file.type);
    if (!isValidType) {
      addToast("Upload rejected. Only PNG or JPG/JPEG artwork formats are supported.", "error");
      return;
    }

    // Size check
    if (file.size > 5 * 1024 * 1024) {
      addToast("Cover artwork exceeds 5MB size limit constraint.", "error");
      return;
    }

    const currentBookId = bookId.trim() || sanitizeBookId(title);
    if (!currentBookId) {
      addToast("Please input Book ID or Book Title first before choosing cover image.", "warning");
      return;
    }

    const path = `books/${currentBookId}/cover.png`;
    const storageRef = ref(storage, path);
    const uploadTask = uploadBytesResumable(storageRef, file);

    setUploadProgress(0);

    uploadTask.on('state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        setUploadProgress(Math.round(progress));
      },
      (error) => {
        console.error("Storage cover upload error:", error);
        addToast("Upload failed due to platform constraints.", "error");
        setUploadProgress(null);
      },
      async () => {
        try {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          setCoverUrl(downloadUrl);
          setCoverPath(path);
          addToast("Cover art uploaded fully!", "success");
        } catch (err) {
          console.error("Download URL fetching error:", err);
          addToast("Could not retrieve cover download URL.", "error");
        } finally {
          setUploadProgress(null);
        }
      }
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validations
    if (!bookId.trim()) {
      addToast("Book ID location path is a required field.", "warning");
      return;
    }
    if (!title.trim() || !authorId || !description.trim()) {
      addToast("Title, Author relationship, and Description are required properties.", "warning");
      return;
    }

    const payload = {
      title: title.trim(),
      authorId,
      authorName,
      description: description.trim(),
      year: Number(year),
      translator: translator.trim(),
      genre: genre.trim(),
      readingTime: readingTime.trim(),
      premium,
      coverPath,
      coverUrl,
      status
    };

    try {
      if (isEditMode) {
        await updateBook(bookId, payload);
        addToast("Book saved ✓", "success");
      } else {
        await createBook(bookId, payload);
        addToast("Book saved ✓", "success");
      }
      navigate('/books');
    } catch (err: any) {
      console.error("Save book details error:", err);
      addToast(err.message || "Failed to commit book changes to database.", "error");
    }
  };

  const handleDeleteTrigger = () => {
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!isEditMode || !bookId) return;
    setIsDeleting(true);
    try {
      await deleteBook(bookId);
      addToast("Book deleted ✓", "success");
      navigate('/books');
    } catch (err: any) {
      console.error(err);
      addToast(err.message || "Failed to finalize book deletion.", "error");
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  if (loading) {
    return <LoadingSpinner fullScreen label="Resolving book document and authors relationships..." />;
  }

  return (
    <div id="book-editor-page">
      <div className="page-header" id="book-editor-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button 
            onClick={() => navigate('/books')} 
            className="btn btn-secondary"
            style={{ padding: '8px' }}
            title="Back to catalog"
            id="back-list-btn"
          >
            <ChevronLeft size={18} />
          </button>
          <div>
            <h1 className="page-title">{isEditMode ? 'Edit Book Specifications' : 'Add Creative Book'}</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '2px' }}>
              {isEditMode ? `Curation of literary specs for "${title}"` : 'Establish a new classic text template'}
            </p>
          </div>
        </div>
      </div>

      {isEditMode && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
          <button
            type="button"
            onClick={() => setActiveTab('details')}
            className={`btn btn-sm ${activeTab === 'details' ? 'btn-gold' : 'btn-secondary'}`}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
          >
            <span>📋 Details</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('content')}
            className={`btn btn-sm ${activeTab === 'content' ? 'btn-gold' : 'btn-secondary'}`}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
          >
            <span>📝 Content</span>
          </button>
        </div>
      )}

      {activeTab === 'content' && isEditMode ? (
        <BookContentEditorTab bookId={bookId} addToast={addToast} />
      ) : (
        <form onSubmit={handleSave} className="editor-two-column" id="book-editor-complex-form">
        {/* Left column schema fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="card">
            <h3 style={{ fontSize: '16px', marginBottom: '16px', color: 'var(--accent-gold)' }}>Book Specifications</h3>
            
            <div className="form-grid">
              {/* Book ID */}
              <div className="form-group">
                <label htmlFor="book-id-field">Book ID / Ref Path</label>
                <input
                  type="text"
                  id="book-id-field"
                  value={bookId}
                  onChange={handleIdChange}
                  disabled={isEditMode}
                  placeholder="e.g. war_and_peace"
                  required
                />
                <p className="form-hint_text">
                  {isEditMode 
                    ? "Used in storage path structures. Cannot be altered."
                    : "Lowercase and underscores. Becomes Firebase path node."
                  }
                </p>
              </div>

              {/* Title */}
              <div className="form-group">
                <label htmlFor="title-field">Book Work Title</label>
                <input
                  type="text"
                  id="title-field"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Anna Karenina"
                  required
                />
              </div>

              {/* Author selector */}
              <div className="form-group full-width">
                <label htmlFor="author-select-field">Mapped Creative Author</label>
                <select
                  id="author-select-field"
                  value={authorId}
                  onChange={handleAuthorChange}
                  required
                >
                  <option value="">-- Choose Author Link --</option>
                  {authors.map((aut) => (
                    <option key={aut.id} value={aut.id}>
                      {aut.displayName} — {aut.name}
                    </option>
                  ))}
                </select>
                <p className="form-hint_text">Binds details reactively. Must exist in directories database.</p>
              </div>

              {/* Description summary */}
              <div className="form-group full-width">
                <label htmlFor="description-field">Overview Text Summary</label>
                <textarea
                  id="description-field"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={5}
                  placeholder="Provide synopsis summaries readable in the reader app..."
                  required
                />
              </div>

              {/* Year */}
              <div className="form-group">
                <label htmlFor="year-field">Original Publication Year</label>
                <input
                  type="number"
                  id="year-field"
                  value={year || ''}
                  onChange={(e) => setYear(Number(e.target.value))}
                  placeholder="e.g. 1877"
                />
              </div>

              {/* Translator */}
              <div className="form-group">
                <label htmlFor="translator-field">Translator Details</label>
                <input
                  type="text"
                  id="translator-field"
                  value={translator}
                  onChange={(e) => setTranslator(e.target.value)}
                  placeholder="e.g. Constance Garnett"
                />
              </div>

              {/* Genre */}
              <div className="form-group">
                <label htmlFor="genre-field">Literature Genre</label>
                <input
                  type="text"
                  id="genre-field"
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  placeholder="e.g. Novel / Philosophy"
                />
              </div>

              {/* Reading Time */}
              <div className="form-group">
                <label htmlFor="reading-time-field">Est. Reading Duration</label>
                <input
                  type="text"
                  id="reading-time-field"
                  value={readingTime}
                  onChange={(e) => setReadingTime(e.target.value)}
                  placeholder="e.g. 24 hours"
                />
              </div>

              {/* Premium toggle */}
              <div className="form-group full-width">
                <div className="toggle-switch-group">
                  <div>
                    <span style={{ fontSize: '14px', fontWeight: 600 }}>Exclusive Premium Access</span>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Locks chapter pages behind Android App premium subscription blocks.
                    </p>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={premium}
                      onChange={(e) => setPremium(e.target.checked)}
                    />
                    <span className="slider" />
                  </label>
                </div>
              </div>

              {/* Status Toggle draft / publication */}
              <div className="form-group full-width">
                <div className="toggle-switch-group" style={{ borderColor: status === 'published' ? 'var(--accent-green)' : 'var(--border-color)' }}>
                  <div>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: status === 'published' ? 'var(--accent-green)' : 'var(--text-primary)' }}>
                      {status === 'published' ? 'Published Mode active ✓' : 'Draft / Stage mode active'}
                    </span>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Published records sync instantly with Android reader devices.
                    </p>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={status === 'published'}
                      onChange={(e) => setStatus(e.target.checked ? 'published' : 'draft')}
                    />
                    <span className="slider" />
                  </label>
                </div>
                
                {status === 'published' && (
                  <div 
                    style={{ 
                      marginTop: '12px', 
                      backgroundColor: 'rgba(197, 168, 128, 0.1)', 
                      border: '1px solid var(--accent-gold)', 
                      padding: '10px 14px', 
                      borderRadius: '6px', 
                      display: 'flex', 
                      gap: '8px', 
                      alignItems: 'center' 
                    }}
                  >
                    <Info size={16} style={{ color: 'var(--accent-gold)', flexShrink: 0 }} />
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      <strong>Audit Checklist Warning:</strong> Make sure chapter text and pages content is fully loaded and completed before verifying publication status.
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right column cover page specifications */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* cover panel */}
          <div className="card">
            <h4 style={{ fontSize: '14px', marginBottom: '12px', color: 'var(--text-muted)' }}>Book Cover artwork</h4>
            
            <div 
              className="cover-dropzone" 
              onClick={() => fileInputRef.current?.click()}
              id="cover-drop-target"
            >
              {coverUrl ? (
                <img referrerPolicy="no-referrer" src={coverUrl} className="cover-preview" alt="Book cover artwork" />
              ) : (
                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                  <Upload size={36} style={{ margin: '0 auto 12px', color: 'var(--border-color)' }} />
                  <span style={{ fontSize: '13px', display: 'block', fontWeight: 'bold' }}>Upload Book Cover Art</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                    PNG or JPG only (Max 5MB)
                  </span>
                </div>
              )}
              
              {uploadProgress !== null && (
                <div 
                  style={{ 
                    position: 'absolute', 
                    bottom: 0, 
                    left: 0, 
                    right: 0, 
                    backgroundColor: 'rgba(0,0,0,0.85)', 
                    padding: '16px', 
                    borderTop: '1px solid var(--border-color)' 
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--accent-gold)', marginBottom: '6px' }}>
                    <span>Transferring core assets...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="progress-container">
                    <div className="progress-bar" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              )}
            </div>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleCoverUpload}
              style={{ display: 'none' }}
              accept=".png, .jpg, .jpeg"
            />
          </div>

          {/* stats metadata */}
          {isEditMode && (
            <div className="card" style={{ backgroundColor: 'rgba(0,0,0,0.15)' }}>
              <h4 style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>Book Metadata</h4>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Chapters total count:</span>
                  <strong style={{ color: 'var(--accent-gold)' }}>{totalChapters} chapters</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Pages total count:</span>
                  <strong style={{ color: 'var(--accent-gold)' }}>{totalPages} pages</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '8px', marginTop: '4px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Initially Created:</span>
                  <span>{createdAtStr || 'Unknown'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Last Metadata Update:</span>
                  <span>{updatedAtStr || 'Unknown'}</span>
                </div>
              </div>
            </div>
          )}

          {/* Quick links to content and preview */}
          {isEditMode && (
            <div className="card" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', padding: '16px' }}>
              <Link to={`/books/${bookId}/content`} className="btn btn-secondary btn-sm" style={{ display: 'flex', justifyContent: 'center' }}>
                <BookOpen size={14} />
                <span>✏️ Edit Content</span>
              </Link>
              <Link to={`/books/${bookId}/preview`} className="btn btn-blue btn-sm" style={{ display: 'flex', justifyContent: 'center' }}>
                <Eye size={14} />
                <span>👁 Preview</span>
              </Link>
            </div>
          )}
        </div>

        {isEditMode && (
          <ContentVerification 
            bookId={bookId} 
            book={{ 
              id: bookId, title, authorId, authorName, description, year, translator, genre, readingTime, premium, coverPath, coverUrl, status 
            } as any} 
          />
        )}

        {/* bottom submit header bar */}
        <div 
          className="full-width" 
          style={{ 
            gridColumn: 'span 2',
            marginTop: '24px', 
            paddingTop: '20px', 
            borderTop: '1px solid var(--border-color)', 
            display: 'flex', 
            justifyContent: 'space-between' 
          }}
          id="book-editor-bottom-actions"
        >
          {isEditMode ? (
            <button
              type="button"
              className="btn btn-danger"
              onClick={handleDeleteTrigger}
              disabled={dbLoading}
              id="delete-book-card-btn"
            >
              <Trash2 size={16} />
              <span>Delete Work</span>
            </button>
          ) : (
            <div />
          )}

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate('/books')}
              disabled={dbLoading}
              id="cancel-book-card-btn"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-gold"
              disabled={dbLoading || uploadProgress !== null}
              id="save-book-card-btn"
            >
              <Save size={16} />
              <span>Save Book Details</span>
            </button>
          </div>
        </div>
      </form>
      )}

      {/* Delete details confirmations */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete Classic Work"
        message={`Are you absolute certain you want to delete "${title}"? This is fatal and irreversible: it deletes the catalog metadata. If chapters or pages exist, their database collections will need independent cleanup.`}
        confirmText="Permanently Delete Book"
        isDanger={true}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      {dbLoading && <LoadingSpinner fullScreen label="Writing transaction to Firestore database..." />}
    </div>
  );
}
