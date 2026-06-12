import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Book } from '../hooks/useBooks';
import { Author } from '../hooks/useAuthors';
import { useToast } from '../components/Toast';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Plus, Search, Edit2, BookOpen, Eye, Star } from 'lucide-react';
import { CardSkeletonLoader } from '../components/LoadingSpinner';

export default function BooksList() {
  const navigate = useNavigate();
  const { addToast } = useToast();

  // Raw Firestore Lists
  const [allBooks, setAllBooks] = useState<Book[]>([]);
  const [authors, setAuthors] = useState<Author[]>([]);
  
  // UI states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryTrigger, setRetryTrigger] = useState(0);

  // Filters State
  const [selectedAuthor, setSelectedAuthor] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Retry loading
  const handleRetry = () => {
    setRetryTrigger(prev => prev + 1);
  };

  // Subscribe to books real-time
  useEffect(() => {
    setLoading(true);
    setError(null);

    const q = query(
      collection(db, 'books'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const booksList = snapshot.docs.map(docSnap => ({
          id: docSnap.id,
          ...docSnap.data()
        })) as Book[];
        
        setAllBooks(booksList);
        setLoading(false);
      },
      (err: any) => {
        console.error('Books fetch error:', err);
        setError(err.message || "Failed to load books catalog database.");
        addToast("Error syncing books catalog.", "error");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [retryTrigger, addToast]);

  // Subscribe to authors real-time
  useEffect(() => {
    const q = query(collection(db, 'authors'), orderBy('sortOrder', 'asc'));
    const unsubscribe = onSnapshot(q,
      (snapshot) => {
        const authorsList = snapshot.docs.map(docSnap => ({
          id: docSnap.id,
          ...docSnap.data()
        })) as Author[];
        setAuthors(authorsList);
      },
      (err: any) => {
        console.error('Authors fetch error in books list page:', err);
      }
    );
    return () => unsubscribe();
  }, []);

  // Compute filtered list
  const filteredBooks = allBooks.filter((book) => {
    let match = true;
    
    if (selectedAuthor !== 'all' && book.authorId !== selectedAuthor) {
      match = false;
    }
    
    if (selectedStatus !== 'all' && book.status !== selectedStatus) {
      match = false;
    }
    
    if (searchQuery.trim() !== '' && !book.title.toLowerCase().includes(searchQuery.toLowerCase())) {
      match = false;
    }

    return match;
  });


  return (
    <div id="books-list-page">
      <div className="page-header" id="books-header">
        <div>
          <h1 className="page-title">Classical Books Catalog</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>
            Curate works, chapters, pages, and interactive content of Russian classics
          </p>
        </div>

        <button 
          onClick={() => navigate('/books/new')} 
          className="btn btn-gold"
          id="add-book-btn"
        >
          <Plus size={16} />
          <span>Add Book Work</span>
        </button>
      </div>

      {/* Dynamic Filter Bar */}
      <div className="books-filter-bar" id="books-filter-bar-row" style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) 200px 160px', gap: '12px', marginBottom: '24px' }}>
        {/* Search */}
        <div style={{ position: 'relative' }} id="search-filter-group">
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            style={{ paddingLeft: '36px' }}
            placeholder="Search by book title..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            id="book-search-input"
          />
        </div>

        {/* Authors Selection filter */}
        <select 
          value={selectedAuthor} 
          onChange={(e) => setSelectedAuthor(e.target.value)}
          id="author-select-filter"
        >
          <option value="all">All Authors</option>
          {authors.map((author) => (
            <option key={author.id} value={author.id}>{author.displayName}</option>
          ))}
        </select>

        {/* Status selection filter */}
        <select 
          value={selectedStatus} 
          onChange={(e) => setSelectedStatus(e.target.value)}
          id="status-select-filter"
        >
          <option value="all">All Status</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
        </select>
      </div>

      {/* Main Books Grid */}
      {loading ? (
        <CardSkeletonLoader />
      ) : error ? (
        <div className="card" style={{ padding: '60px 24px', textAlign: 'center' }}>
          <p style={{ color: '#ef4444', fontSize: '15px', marginBottom: '16px', fontWeight: 500 }}>
            Error: {error}
          </p>
          <button 
            onClick={handleRetry} 
            className="btn btn-gold" 
            style={{ margin: '0 auto' }}
          >
            Retry Loading
          </button>
        </div>
      ) : filteredBooks.length === 0 ? (
        <div className="card" style={{ padding: '60px 24px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '15px' }}>
            No books found. Add your first book →
          </p>
        </div>
      ) : (
        <div className="books-grid" id="books-responsive-grid">
          {filteredBooks.map((book) => (
            <div className="book-card" id={`book-card-${book.id}`} key={book.id}>
              {/* Cover area */}
              <div className="book-card-cover-container">
                {book.coverUrl ? (
                  <img src={book.coverUrl} className="book-card-cover" alt={book.title} referrerPolicy="no-referrer" />
                ) : (
                  <div className="book-card-no-cover">📖</div>
                )}
                
                {/* badges */}
                <div className="book-card-badge">
                  <span className={`badge ${book.status === 'published' ? 'badge-green' : 'badge-gray'}`}>
                    {book.status}
                  </span>
                </div>

                {book.premium && (
                  <div className="book-card-premium-badge" title="Exclusive premium subscription tier only">
                    <Star size={10} fill="currentColor" style={{ display: 'inline', marginRight: '3px', verticalAlign: 'middle' }} />
                    PREMIUM
                  </div>
                )}
              </div>

              {/* Title & metadata info */}
              <div className="book-card-content">
                <h3 className="book-card-title">{book.title}</h3>
                <span className="book-card-author">by {book.authorName}</span>

                <div className="book-card-stats">
                  <span>📅 {book.year || 'Unknown'}</span>
                  <span>📑 {book.totalChapters || 0} chapters</span>
                  <span>📄 {book.totalPages || 0} pages</span>
                </div>

                {/* Operations links row */}
                <div className="book-card-actions">
                  <button
                    onClick={() => navigate(`/books/${book.id}`)}
                    className="btn btn-secondary btn-sm"
                    style={{ justifySelf: 'stretch' }}
                    id={`details-btn-${book.id}`}
                    title="Edit book primary details"
                  >
                    <Edit2 size={12} />
                    <span>Details</span>
                  </button>

                  <button
                    onClick={() => navigate(`/books/${book.id}/content`)}
                    className="btn btn-gold btn-sm"
                    style={{ justifySelf: 'stretch' }}
                    id={`content-btn-${book.id}`}
                    title="Edit book chapters and page layouts"
                  >
                    <BookOpen size={12} />
                    <span>Content</span>
                  </button>

                  <button
                    onClick={() => navigate(`/books/${book.id}/preview`)}
                    className="btn btn-blue btn-sm"
                    style={{ justifySelf: 'stretch' }}
                    id={`preview-btn-${book.id}`}
                    title="Render mobile mockup readers container"
                  >
                    <Eye size={12} />
                    <span>Preview</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
