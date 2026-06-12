import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Author, useAuthors } from '../hooks/useAuthors';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useToast } from '../components/Toast';
import { Plus, Edit2, Trash2, Calendar } from 'lucide-react';
import ConfirmDialog from '../components/ConfirmDialog';
import LoadingSpinner, { SkeletonLoader } from '../components/LoadingSpinner';

export default function AuthorsList() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { deleteAuthor } = useAuthors();

  const [authors, setAuthors] = useState<Author[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryTrigger, setRetryTrigger] = useState(0);

  // Deletion modals state
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Retry trigger logic
  const handleRetry = () => {
    setRetryTrigger(prev => prev + 1);
  };

  useEffect(() => {
    setLoadingList(true);
    setError(null);

    const q = query(
      collection(db, 'authors'),
      orderBy('sortOrder', 'asc')
    );

    const unsubscribe = onSnapshot(q,
      (snapshot) => {
        const loaded = snapshot.docs.map(docSnap => ({
          id: docSnap.id,
          ...docSnap.data()
        })) as Author[];
        
        setAuthors(loaded);
        setLoadingList(false);
      },
      (err: any) => {
        console.error('Authors fetch error direct:', err);
        setError(err.message || "Failed to load authors directory.");
        addToast("Failed to load authors directory.", "error");
        setLoadingList(false);
      }
    );

    return unsubscribe;
  }, [retryTrigger, addToast]);

  const handleDeleteTrigger = (id: string) => {
    setDeleteId(id);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      await deleteAuthor(deleteId);
      addToast("Author deleted ✓", "success");
    } catch (err: any) {
      console.error("Delete author error:", err);
      addToast(err.message || "Could not delete author.", "error");
    } finally {
      setIsDeleting(false);
      setDeleteId(null);
    }
  };

  return (
    <div id="authors-list-page">
      <div className="page-header" id="authors-header">
        <div>
          <h1 className="page-title">Authors Directory</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>
            Manage biographies and indices for classical literary writers
          </p>
        </div>
        
        <button 
          onClick={() => navigate('/authors/new')} 
          className="btn btn-gold"
          id="add-author-btn"
        >
          <Plus size={16} />
          <span>Add Author</span>
        </button>
      </div>

      <div className="card" id="authors-table-card" style={{ padding: 0, overflow: 'hidden' }}>
        {loadingList ? (
          <div style={{ padding: '24px' }}>
            <SkeletonLoader rows={6} />
          </div>
        ) : error ? (
          <div style={{ padding: '40px 24px', textAlign: 'center' }}>
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
        ) : authors.length === 0 ? (
          <div style={{ padding: '40px 24px', textAlign: 'center' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '15px' }}>
              No authors found. Click "Add Author" to begin creating the biographical index.
            </p>
          </div>
        ) : (
          <div className="table-container" style={{ border: 'none', margin: 0 }}>
            <table className="custom-table" id="authors-table">
              <thead>
                <tr>
                  <th style={{ width: '60px', textAlign: 'center' }}>Photo</th>
                  <th>Full Name</th>
                  <th>Display Name</th>
                  <th>Born — Died</th>
                  <th style={{ textAlign: 'center' }}>Books</th>
                  <th style={{ textAlign: 'center' }}>Sort Order</th>
                  <th style={{ width: '180px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {authors.map((author) => (
                  <tr key={author.id} id={`author-row-${author.id}`}>
                    <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                      <div 
                        style={{ 
                          width: '40px', 
                          height: '40px', 
                          borderRadius: '50%', 
                          overflow: 'hidden', 
                          backgroundColor: 'var(--bg-primary)', 
                          border: '1px solid var(--border-color)',
                          margin: '0 auto',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        {author.photoUrl ? (
                          <img 
                            src={author.photoUrl} 
                            alt="" 
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>👤</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{author.name}</span>
                    </td>
                    <td>{author.displayName}</td>
                    <td>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                        <Calendar size={13} style={{ color: 'var(--text-muted)' }} />
                        {author.born} — {author.died}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="badge badge-green" style={{ minWidth: '32px', justifyContent: 'center' }}>
                        {author.bookCount || 0}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <code style={{ fontSize: '12px', color: 'var(--accent-gold)' }}>#{author.sortOrder}</code>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="btn btn-sm btn-secondary"
                          onClick={() => navigate(`/authors/${author.id}`)}
                          id={`edit-author-btn-${author.id}`}
                        >
                          <Edit2 size={12} />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-danger"
                          onClick={() => handleDeleteTrigger(author.id)}
                          id={`delete-author-btn-${author.id}`}
                        >
                          <Trash2 size={12} />
                          <span>Delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        isOpen={deleteId !== null}
        title="Delete Author"
        message="Are you absolute certain you want to delete this author? This will delete their biographical profile only. Real-time books referencing them will not be deleted, but they may cause referencing warnings."
        confirmText={isDeleting ? "Deleting..." : "Delete Permanently"}
        isDanger={true}
        onConfirm={handleDeleteConfirm}
        onCancel={() => !isDeleting && setDeleteId(null)}
      />

      {isDeleting && <LoadingSpinner fullScreen label="Removing author biography..." />}
    </div>
  );
}
