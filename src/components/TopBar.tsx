import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function TopBar() {
  const { user } = useAuth();
  const location = useLocation();
  const path = location.pathname;

  // Generate dynamic breadcrumbs based on active URL
  const getBreadcrumbs = () => {
    const parts = path.split('/').filter(Boolean);
    const crumbs = [{ label: 'Admin', to: '/' }];

    if (parts.length === 0) {
      crumbs.push({ label: 'Dashboard', to: '/' });
      return crumbs;
    }

    if (parts[0] === 'authors') {
      crumbs.push({ label: 'Authors', to: '/authors' });
      if (parts[1] === 'new') {
        crumbs.push({ label: 'New Author', to: '/authors/new' });
      } else if (parts[1]) {
        crumbs.push({ label: 'Edit Author', to: `/authors/${parts[1]}` });
      }
    } else if (parts[0] === 'books') {
      crumbs.push({ label: 'Books', to: '/books' });
      if (parts[1] === 'new') {
        crumbs.push({ label: 'New Book', to: '/books/new' });
      } else if (parts[1]) {
        const bookId = parts[1];
        if (parts[2] === 'content') {
          crumbs.push({ label: 'Book Details', to: `/books/${bookId}` });
          crumbs.push({ label: 'Content Editor', to: `/books/${bookId}/content` });
        } else if (parts[2] === 'preview') {
          crumbs.push({ label: 'Book Details', to: `/books/${bookId}` });
          crumbs.push({ label: 'Mockup Preview', to: `/books/${bookId}/preview` });
        } else {
          crumbs.push({ label: 'Edit Book Details', to: `/books/${bookId}` });
        }
      }
    } else if (parts[0] === 'settings') {
      crumbs.push({ label: 'Settings', to: '/settings' });
    }

    return crumbs;
  };

  const crumbs = getBreadcrumbs();
  const emailStr = user?.email || 'admin@russianclassics.com';
  const avatarLetter = emailStr.charAt(0).toUpperCase();

  return (
    <header className="app-topbar" id="app-topbar-header">
      <div className="topbar-breadcrumbs" id="breadcrumbs-nav">
        {crumbs.map((crumb, idx) => (
          <React.Fragment key={idx}>
            {idx > 0 && <span style={{ color: 'var(--border-color)' }}>/</span>}
            {idx === crumbs.length - 1 ? (
              <span className="current">{crumb.label}</span>
            ) : (
              <Link to={crumb.to}>{crumb.label}</Link>
            )}
          </React.Fragment>
        ))}
      </div>

      <div className="topbar-user" id="topbar-user-section">
        <span className="user-email">{emailStr}</span>
        <div className="user-avatar" title={`Logged in as ${emailStr}`}>
          {avatarLetter}
        </div>
      </div>
    </header>
  );
}
