import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../components/Toast';

export default function Login() {
  const { user, login } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // If already logged in, skip the login screen
  if (user) {
    return <Navigate to="/books" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!email.trim() || !password.trim()) {
      setErrorMsg("Please fill in both email and password.");
      return;
    }

    setSubmitting(true);
    try {
      await login(email.trim(), password.trim());
      addToast("Successfully authenticated! Welcome back.", "success");
      navigate('/books');
    } catch (err: any) {
      console.error("Authentication error details:", err);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        setErrorMsg("Invalid email or password.");
      } else if (err.code === 'auth/network-request-failed') {
        setErrorMsg("Connection failed. Try again.");
      } else {
        setErrorMsg(err.message || "An error occurred during login.");
      }
      addToast("Authentication failed", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-container" id="login-container">
      <div className="auth-card" id="login-card">
        <div className="auth-logo" id="login-logo">📚</div>
        <h2 className="auth-title" id="login-title">Russian Classics</h2>
        <p className="auth-subtitle" id="login-subtitle">Digital Library Admin Panel</p>

        {errorMsg && (
          <div 
            style={{ 
              backgroundColor: 'rgba(231, 76, 60, 0.15)', 
              border: '1px solid var(--accent-red)', 
              color: '#ff6b6b', 
              padding: '12px', 
              borderRadius: '6px', 
              fontSize: '13px', 
              marginBottom: '16px' 
            }}
            id="login-error-toast"
          >
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} id="login-form">
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label htmlFor="login-email">Admin Email</label>
            <input
              type="email"
              id="login-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. admin@dostoevsky.com"
              required
              disabled={submitting}
            />
          </div>

          <div className="form-group" style={{ marginBottom: '24px' }}>
            <label htmlFor="login-password">Password</label>
            <input
              type="password"
              id="login-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your security credentials"
              required
              disabled={submitting}
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            className="btn btn-gold"
            style={{ width: '100%', padding: '10px 0', fontSize: '15px' }}
            disabled={submitting}
            id="login-submit-btn"
          >
            {submitting ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
