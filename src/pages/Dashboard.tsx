import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Book } from '../hooks/useBooks';
import { Author } from '../hooks/useAuthors';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { BookOpen, Users, FileText, CheckCircle, Plus, ChevronRight } from 'lucide-react';
import { SkeletonLoader } from '../components/LoadingSpinner';

export default function Dashboard() {
  const navigate = useNavigate();

  const [books, setBooks] = useState<Book[]>([]);
  const [authors, setAuthors] = useState<Author[]>([]);
  const [loadingBooks, setLoadingBooks] = useState(true);
  const [loadingAuthors, setLoadingAuthors] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryTrigger, setRetryTrigger] = useState(0);

  const handleRetry = () => {
    setRetryTrigger(prev => prev + 1);
  };

  useEffect(() => {
    setLoadingBooks(true);
    setLoadingAuthors(true);
    setError(null);

    const qBooks = query(collection(db, 'books'), orderBy('createdAt', 'desc'));
    const unsubBooks = onSnapshot(qBooks, 
      (snapshot) => {
        const loadedBooks = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data()
        })) as Book[];
        setBooks(loadedBooks);
        setLoadingBooks(false);
      },
      (err: any) => {
        console.error('Dashboard books snapshot error:', err);
        setError(err.message || "Failed to sync books.");
        setLoadingBooks(false);
      }
    );

    const qAuthors = query(collection(db, 'authors'), orderBy('sortOrder', 'asc'));
    const unsubAuthors = onSnapshot(qAuthors,
      (snapshot) => {
        const loadedAuthors = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data()
        })) as Author[];
        setAuthors(loadedAuthors);
        setLoadingAuthors(false);
      },
      (err: any) => {
        console.error('Dashboard authors snapshot error:', err);
        setError(err.message || "Failed to sync authors.");
        setLoadingAuthors(false);
      }
    );

    return () => {
      unsubBooks();
      unsubAuthors();
    };
  }, [retryTrigger]);

  // Aggregate stats
  const totalBooks = books.length;
  const totalAuthors = authors.length;
  const totalPages = books.reduce((acc, book) => acc + (book.totalPages || 0), 0);
  const publishedBooks = books.filter((b) => b.status === 'published').length;

  // Recent 5 entries
  // The reactive hooks are sorted: books by order of addition/last updated or createdAt (descending). Authors are sorted by sortOrder (asc).
  // Let's sort books by createdAt desc (if present) to get raw "Recent" last-added books.
  const recentBooks = [...books]
    .sort((a, b) => {
      const timeA = a.createdAt?.seconds || 0;
      const timeB = b.createdAt?.seconds || 0;
      return timeB - timeA;
    })
    .slice(0, 5);

  const recentAuthors = [...authors]
    .sort((a, b) => {
      const timeA = a.createdAt?.seconds || 0;
      const timeB = b.createdAt?.seconds || 0;
      return timeB - timeA;
    })
    .slice(0, 5);

  return (
    <div id="dashboard-page">
      <div className="page-header" id="dashboard-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>
            Overview of the digital library database and catalog metrics
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '12px' }} id="dashboard-actions">
          <button 
            onClick={() => navigate('/authors/new')} 
            className="btn btn-secondary"
            id="dash-add-author-btn"
          >
            <Plus size={16} />
            <span>Add Author</span>
          </button>
          
          <button 
            onClick={() => navigate('/books/new')} 
            className="btn btn-gold"
            id="dash-add-book-btn"
          >
            <Plus size={16} />
            <span>Add Book</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="card" style={{ padding: '20px', marginBottom: '24px', textAlign: 'center', borderColor: '#ef4444' }}>
          <p style={{ color: '#ef4444', fontSize: '15px', marginBottom: '12px', fontWeight: 500 }}>
            Error: {error}
          </p>
          <button onClick={handleRetry} className="btn btn-gold" style={{ margin: '0 auto' }}>
            Retry Loading Dashboard Metrics
          </button>
        </div>
      )}

      {/* Stats row */}
      <div className="dashboard-stats" id="dashboard-metrics-grid">
        <div className="stat-card" id="metric-total-books">
          <div className="stat-icon">
            <BookOpen size={22} />
          </div>
          <div className="stat-info">
            <span className="stat-label">Total Books</span>
            <span className="stat-value">{loadingBooks ? '...' : totalBooks}</span>
          </div>
        </div>

        <div className="stat-card" id="metric-total-authors">
          <div className="stat-icon">
            <Users size={22} />
          </div>
          <div className="stat-info">
            <span className="stat-label">Total Authors</span>
            <span className="stat-value">{loadingAuthors ? '...' : totalAuthors}</span>
          </div>
        </div>

        <div className="stat-card" id="metric-total-pages">
          <div className="stat-icon">
            <FileText size={22} />
          </div>
          <div className="stat-info">
            <span className="stat-label">Total Pages</span>
            <span className="stat-value">{loadingBooks ? '...' : totalPages}</span>
          </div>
        </div>

        <div className="stat-card" id="metric-published-books">
          <div className="stat-icon" style={{ backgroundColor: 'rgba(106, 191, 123, 0.1)', color: 'var(--accent-green)' }}>
            <CheckCircle size={22} />
          </div>
          <div className="stat-info">
            <span className="stat-label">Published</span>
            <span className="stat-value">{loadingBooks ? '...' : publishedBooks}</span>
          </div>
        </div>
      </div>

      {/* Two columns: Recent items */}
      <div className="dashboard-columns" id="dashboard-lists-row">
        {/* Recent Books */}
        <div className="card" id="recent-books-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '16px' }}>📚 Recent Books</h3>
            <Link to="/books" style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              View Catalog <ChevronRight size={14} />
            </Link>
          </div>

          {loadingBooks ? (
            <SkeletonLoader rows={5} />
          ) : recentBooks.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', padding: '16px 0', textAlign: 'center' }}>
              No books registered in the catalog yet.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {recentBooks.map((book) => (
                <div 
                  key={book.id} 
                  id={`recent-book-${book.id}`}
                  onClick={() => navigate(`/books/${book.id}`)}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '12px', 
                    padding: '10px', 
                    borderRadius: '6px', 
                    backgroundColor: 'var(--bg-secondary)', 
                    border: '1px solid var(--border-color)', 
                    cursor: 'pointer',
                    transition: 'background var(--transition-speed)'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-primary)'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                >
                  <div style={{ width: 40, height: 50, borderRadius: 4, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.05)', flexShrink: 0 }}>
                    {book.coverUrl ? (
                      <img referrerPolicy="no-referrer" src={book.coverUrl} className="cover-preview" alt="" />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: 'var(--text-muted)' }}>📖</div>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h4 style={{ fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{book.title}</h4>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>by {book.authorName}</span>
                  </div>
                  <div>
                    <span className={`badge ${book.status === 'published' ? 'badge-green' : 'badge-gray'}`}>
                      {book.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Authors */}
        <div className="card" id="recent-authors-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '16px' }}>👤 Recent Authors</h3>
            <Link to="/authors" style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              View Directory <ChevronRight size={14} />
            </Link>
          </div>

          {loadingAuthors ? (
            <SkeletonLoader rows={5} />
          ) : recentAuthors.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', padding: '16px 0', textAlign: 'center' }}>
              No authors registered in the database yet.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {recentAuthors.map((author) => (
                <div 
                  key={author.id} 
                  id={`recent-author-${author.id}`}
                  onClick={() => navigate(`/authors/${author.id}`)}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '12px', 
                    padding: '10px', 
                    borderRadius: '6px', 
                    backgroundColor: 'var(--bg-secondary)', 
                    border: '1px solid var(--border-color)', 
                    cursor: 'pointer',
                    transition: 'background var(--transition-speed)'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-primary)'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                >
                  <div style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.05)', flexShrink: 0, border: '1px solid var(--border-color)' }}>
                    {author.photoUrl ? (
                      <img referrerPolicy="no-referrer" src={author.photoUrl} className="cover-preview" alt="" />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: 'var(--text-muted)' }}>👤</div>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h4 style={{ fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{author.displayName}</h4>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{author.born} — {author.died}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--accent-gold)' }}>
                      {author.bookCount || 0}
                    </span>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>books</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
