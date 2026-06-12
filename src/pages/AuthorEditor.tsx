import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthors, Author } from '../hooks/useAuthors';
import { useToast } from '../components/Toast';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase/config';
import { logError, ErrorCategory } from '../utils/errorLogger';
import { ChevronLeft, Upload, Trash2, Save } from 'lucide-react';
import ConfirmDialog from '../components/ConfirmDialog';
import LoadingSpinner from '../components/LoadingSpinner';

export default function AuthorEditor() {
  const { id } = useParams<{ id?: string }>();
  const isEditMode = !!id;
  
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { getAuthor, createAuthor, updateAuthor, deleteAuthor, loading: dbLoading } = useAuthors();

  // State
  const [authorId, setAuthorId] = useState('');
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [born, setBorn] = useState<number>(1800);
  const [died, setDied] = useState<number>(1880);
  const [nationality, setNationality] = useState('Russian');
  const [sortOrder, setSortOrder] = useState<number>(99);
  const [photoPath, setPhotoPath] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');

  // UI state
  const [loading, setLoading] = useState(isEditMode);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load existing author
  useEffect(() => {
    if (isEditMode && id) {
      getAuthor(id).then((author) => {
        if (author) {
          setAuthorId(author.id);
          setName(author.name || '');
          setDisplayName(author.displayName || '');
          setBio(author.bio || '');
          setBorn(author.born || 1800);
          setDied(author.died || 1880);
          setNationality(author.nationality || 'Russian');
          setSortOrder(author.sortOrder || 99);
          setPhotoPath(author.photoPath || '');
          setPhotoUrl(author.photoUrl || '');
        } else {
          addToast("Author biography not found.", "warning");
          navigate('/authors');
        }
        setLoading(false);
      }).catch((err) => {
        console.error(err);
        logError({
          category: ErrorCategory.FIRESTORE_READ,
          message: err.message || String(err),
          details: { authorId: id }
        });
        addToast("Error fetching author details.", "error");
        navigate('/authors');
      });
    }
  }, [id, isEditMode, getAuthor, navigate, addToast]);

  const sanitizeAuthorId = (value: string) => {
    return value
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '_') // replace spaces with underscores
      .replace(/[^a-z0-9_]/g, '') // remove non-alphanumeric and underscores
      .replace(/_+/g, '_'); // contract multiple underscores
  };

  const handleIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAuthorId(sanitizeAuthorId(e.target.value));
  };

  // Upload and attach author photo to Firebase Storage
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validation
    const isValidType = ['image/jpeg', 'image/jpg', 'image/png'].includes(file.type);
    if (!isValidType) {
      addToast("Upload rejected. Only PNG or JPG/JPEG photo formats are supported.", "error");
      return;
    }

    const currentId = authorId.trim() || sanitizeAuthorId(displayName);
    if (!currentId) {
      addToast("Please input the Author ID or Display Name first to link the photo.", "warning");
      return;
    }

    const path = `authors/${currentId}/photo.png`;
    const storageRef = ref(storage, path);
    const uploadTask = uploadBytesResumable(storageRef, file);

    setUploadProgress(0);

    uploadTask.on('state_changed', 
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        setUploadProgress(Math.round(progress));
      }, 
      (error) => {
        console.error("Storage upload error:", error);
        logError({
          category: ErrorCategory.STORAGE_UPLOAD,
          message: error.message || String(error),
          details: { path, authorId: currentId }
        });
        addToast("Upload failed. Check storage constraints.", "error");
        setUploadProgress(null);
      }, 
      async () => {
        try {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          setPhotoUrl(downloadUrl);
          setPhotoPath(path);
          addToast("Author photo uploaded successfully!", "success");
        } catch (err: any) {
          console.error("Failed to get download URL:", err);
          logError({
            category: ErrorCategory.STORAGE_UPLOAD,
            message: err.message || String(err),
            details: { path, authorId: currentId, step: 'download_url' }
          });
          addToast("Could not retrieve uploaded photo URL.", "error");
        } finally {
          setUploadProgress(null);
        }
      }
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validations
    if (!authorId.trim()) {
      addToast("Author ID is a required field.", "warning");
      return;
    }
    if (!name.trim() || !displayName.trim()) {
      addToast("Full Name and Display Name are required fields.", "warning");
      return;
    }

    const payload = {
      name: name.trim(),
      displayName: displayName.trim(),
      bio: bio.trim(),
      born: Number(born),
      died: Number(died),
      nationality: nationality.trim(),
      sortOrder: Number(sortOrder) || 99,
      photoPath,
      photoUrl
    };

    try {
      if (isEditMode) {
        await updateAuthor(authorId, payload);
        addToast("Author saved ✓", "success");
      } else {
        await createAuthor(authorId, payload);
        addToast("Author saved ✓", "success");
      }
      navigate('/authors');
    } catch (err: any) {
      console.error("Save author error:", err);
      logError({
        category: ErrorCategory.FIRESTORE_WRITE,
        message: err.message || String(err),
        details: { authorId, payload, isEditMode }
      });
      addToast(err.message || "Could not save author details.", "error");
    }
  };

  const handleDeleteTrigger = () => {
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!isEditMode || !authorId) return;
    setIsDeleting(true);
    try {
      await deleteAuthor(authorId);
      addToast("Author deleted ✓", "success");
      navigate('/authors');
    } catch (err: any) {
      console.error(err);
      logError({
        category: ErrorCategory.FIRESTORE_WRITE,
        message: err.message || String(err),
        details: { authorId, action: 'delete' }
      });
      addToast(err.message || "Failed to delete author biography.", "error");
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  if (loading) {
    return <LoadingSpinner fullScreen label="Resolving biographical record details..." />;
  }

  return (
    <div id="author-editor-page">
      <div className="page-header" id="author-editor-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button 
            onClick={() => navigate('/authors')} 
            className="btn btn-secondary"
            style={{ padding: '8px' }}
            title="Back to directory"
            id="back-list-btn"
          >
            <ChevronLeft size={18} />
          </button>
          <div>
            <h1 className="page-title">{isEditMode ? 'Edit Author Profile' : 'Add Creative Author'}</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '2px' }}>
              {isEditMode ? `Updating database entry for ${displayName}` : 'Instantiate a new literary writer document'}
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSave} className="card" id="author-editor-form" style={{ maxWidth: '800px' }}>
        <div className="form-grid">
          {/* Author ID */}
          <div className="form-group">
            <label htmlFor="author-id-field">Author ID</label>
            <input
              type="text"
              id="author-id-field"
              value={authorId}
              onChange={handleIdChange}
              disabled={isEditMode}
              placeholder="e.g. tolstoy"
              required
            />
            <p className="form-hint_text">
              {isEditMode 
                ? "This is used in the Android app. Cannot change after creation."
                : "Required. Alphanumeric, lowercase, and underscores (e.g. tolstoy, dostoevsky)."
              }
            </p>
          </div>

          {/* Display Name */}
          <div className="form-group">
            <label htmlFor="display-name-field">Display / Lit Name</label>
            <input
              type="text"
              id="display-name-field"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Leo Tolstoy"
              required
            />
            <p className="form-hint_text">Short name used in dashboards and selections.</p>
          </div>

          {/* Full Name */}
          <div className="form-group full-width">
            <label htmlFor="full-name-field">Full Legal/Birth Name</label>
            <input
              type="text"
              id="full-name-field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Count Lev Nikolayevich Tolstoy"
              required
            />
          </div>

          {/* Biography */}
          <div className="form-group full-width">
            <label htmlFor="bio-field">Biography Summary</label>
            <textarea
              id="bio-field"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={4}
              placeholder="Provide a comprehensive biography of the classic author details..."
            />
          </div>

          {/* Born Year */}
          <div className="form-group">
            <label htmlFor="born-field">Born (Year)</label>
            <input
              type="number"
              id="born-field"
              value={born || ''}
              onChange={(e) => setBorn(Number(e.target.value))}
              placeholder="e.g. 1828"
              required
            />
          </div>

          {/* Died Year */}
          <div className="form-group">
            <label htmlFor="died-field">Died (Year)</label>
            <input
              type="number"
              id="died-field"
              value={died || ''}
              onChange={(e) => setDied(Number(e.target.value))}
              placeholder="e.g. 1910"
              required
            />
          </div>

          {/* Nationality */}
          <div className="form-group">
            <label htmlFor="nationality-field">Nationality</label>
            <input
              type="text"
              id="nationality-field"
              value={nationality}
              onChange={(e) => setNationality(e.target.value)}
              placeholder="e.g. Russian"
            />
          </div>

          {/* Sort Order */}
          <div className="form-group">
            <label htmlFor="sort-order-field">Sort Order</label>
            <input
              type="number"
              id="sort-order-field"
              value={sortOrder || ''}
              onChange={(e) => setSortOrder(Number(e.target.value))}
              placeholder="e.g. 1, 2, 99"
              required
            />
            <p className="form-hint_text">Ascending layout index order. Default: 99</p>
          </div>

          {/* Photo upload block */}
          <div className="form-group full-width">
            <label>Author Portrait Photo</label>
            <div className="photo-uploader">
              <div className="photo-preview-circle">
                {photoUrl ? (
                  <img referrerPolicy="no-referrer" src={photoUrl} className="photo-preview-image" alt="" />
                ) : (
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No Portrait</span>
                )}
              </div>

              <div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadProgress !== null}
                  id="trigger-photo-btn"
                >
                  <Upload size={14} />
                  <span>Choose JPG/PNG Photo</span>
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handlePhotoUpload}
                  style={{ display: 'none' }}
                  accept=".png, .jpg, .jpeg"
                />
                
                {uploadProgress !== null && (
                  <div style={{ marginTop: '8px', minWidth: '200px' }}>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Uploading photo: {uploadProgress}%</div>
                    <div className="progress-container">
                      <div className="progress-bar" style={{ width: `${uploadProgress}%` }} />
                    </div>
                  </div>
                )}
                
                <p className="form-hint_text" style={{ marginTop: '6px' }}>
                  Landscape portrait file. Auto-shipped to authors/{"{authorId}"}/photo.png.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons Footer */}
        <div 
          style={{ 
            marginTop: '32px', 
            paddingTop: '20px', 
            borderTop: '1px solid var(--border-color)', 
            display: 'flex', 
            justifyContent: 'space-between' 
          }}
          id="author-editor-actions"
        >
          {isEditMode ? (
            <button
              type="button"
              className="btn btn-danger"
              onClick={handleDeleteTrigger}
              disabled={dbLoading || isDeleting}
              id="delete-author-form-btn"
            >
              <Trash2 size={16} />
              <span>Delete Author</span>
            </button>
          ) : (
            <div />
          )}

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate('/authors')}
              disabled={dbLoading || isDeleting}
              id="cancel-author-btn"
            >
              Cancel
            </button>
            
            <button
              type="submit"
              className="btn btn-gold"
              disabled={dbLoading || isDeleting || uploadProgress !== null}
              id="save-author-btn"
            >
              <Save size={16} />
              <span>Save Author Details</span>
            </button>
          </div>
        </div>
      </form>

      {/* Delete Confirmation Modal */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete Author Biography"
        message={`Are you absolute certain you want to delete ${displayName}? All associated book listings using this author ID will remain, but will lose direct biographical relationships.`}
        confirmText="Confirm Deletion"
        isDanger={true}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      {(dbLoading || isDeleting) && <LoadingSpinner fullScreen label="Writing transaction to Firestore database..." />}
    </div>
  );
}
