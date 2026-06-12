import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { ToastProvider } from './components/Toast';

// Layout guards
import Layout from './components/Layout';

// Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import AuthorsList from './pages/AuthorsList';
import AuthorEditor from './pages/AuthorEditor';
import BooksList from './pages/BooksList';
import BookEditor from './pages/BookEditor';
import ContentEditor from './pages/ContentEditor';
import BookPreview from './pages/BookPreview';
import SettingsPage from './pages/Settings';
import ErrorLogs from './pages/ErrorLogs';
import { testFirebaseConnection } from './firebase/config';

// Trigger Firebase diagnostic connection test on app startup
testFirebaseConnection();

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            {/* Authenticating administrator Login route */}
            <Route path="/login" element={<Login />} />

            {/* Protected layout wraps child administrative views */}
            <Route path="/" element={<Layout />}>
              <Route index element={<Navigate to="/books" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="authors" element={<AuthorsList />} />
              <Route path="authors/new" element={<AuthorEditor />} />
              <Route path="authors/:id" element={<AuthorEditor />} />
              
              <Route path="books" element={<BooksList />} />
              <Route path="books/new" element={<BookEditor />} />
              <Route path="books/:id" element={<BookEditor />} />
              <Route path="books/:id/content" element={<ContentEditor />} />
              <Route path="books/:id/preview" element={<BookPreview />} />
              
              <Route path="logs" element={<ErrorLogs />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>

            {/* Catch-all route bounds back to Books home */}
            <Route path="*" element={<Navigate to="/books" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
