import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Users, BookOpen, Eye, Settings, LogOut, ShieldAlert } from 'lucide-react';

interface SidebarProps {
  onLogout: () => void;
}

export default function Sidebar({ onLogout }: SidebarProps) {
  const location = useLocation();
  const path = location.pathname;

  const isActive = (targetPath: string) => {
    if (targetPath === '/' && path === '/') return true;
    if (targetPath !== '/' && path.startsWith(targetPath)) return true;
    return false;
  };

  return (
    <aside className="app-sidebar" id="sidebar-aside">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <span>📚 Russian Classics</span>
        </div>
        <div className="sidebar-subtitle">Admin Panel</div>
      </div>

      <nav className="sidebar-nav">
        <Link 
          to="/" 
          id="nav-link-dashboard"
          className={`nav-item ${isActive('/') && path === '/' ? 'active' : ''}`}
        >
          <Home size={18} />
          <span>Dashboard</span>
        </Link>
        
        <Link 
          to="/authors" 
          id="nav-link-authors"
          className={`nav-item ${isActive('/authors') ? 'active' : ''}`}
        >
          <Users size={18} />
          <span>Authors</span>
        </Link>
        
        <Link 
          to="/books" 
          id="nav-link-books"
          className={`nav-item ${isActive('/books') ? 'active' : ''}`}
        >
          <BookOpen size={18} />
          <span>Books</span>
        </Link>

        <div className="nav-divider" />

        <Link 
          to="/books" // Redirects to books list to select a book to preview
          id="nav-link-preview"
          className="nav-item"
        >
          <Eye size={18} />
          <span>Preview App</span>
        </Link>

        <div className="nav-divider" />

        <Link 
          to="/logs" 
          id="nav-link-logs"
          className={`nav-item ${isActive('/logs') ? 'active' : ''}`}
        >
          <ShieldAlert size={18} />
          <span>Error Logs</span>
        </Link>

        <Link 
          to="/settings" 
          id="nav-link-settings"
          className={`nav-item ${isActive('/settings') ? 'active' : ''}`}
        >
          <Settings size={18} />
          <span>Settings</span>
        </Link>

        <button 
          onClick={onLogout} 
          className="nav-item" 
          type="button"
          style={{ width: '100%', textAlign: 'left', marginTop: 'auto', background: 'none' }}
          id="logout-sidebar-button"
        >
          <LogOut size={18} />
          <span>Logout</span>
        </button>
      </nav>
    </aside>
  );
}
