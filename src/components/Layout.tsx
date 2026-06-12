import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import LoadingSpinner from './LoadingSpinner';

export default function Layout() {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return <LoadingSpinner fullScreen label="Authenticating administrator session..." />;
  }

  if (!user) {
    console.log("No authenticated administrator active. Redirecting to login...");
    return <Navigate to="/login" replace />;
  }

  const handleLogout = async () => {
    try {
      await logout();
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  return (
    <div className="app-layout" id="app-layout-shell">
      <Sidebar onLogout={handleLogout} />
      
      <div className="app-main" id="app-main-content-region">
        <TopBar />
        
        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
