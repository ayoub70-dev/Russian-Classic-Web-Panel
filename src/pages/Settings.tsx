import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { Settings, Server, Database, Shield, Cpu } from 'lucide-react';

export default function SettingsPage() {
  const { user } = useAuth();

  return (
    <div id="settings-page">
      <div className="page-header" id="settings-header">
        <div>
          <h1 className="page-title">Admin Configuration Settings</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>
            System configurations and data mapping targets for the digital library
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '800px' }} id="settings-layout">
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }} id="firebase-card-header">
            <Database size={20} style={{ color: 'var(--accent-gold)' }} />
            <h3 style={{ fontSize: '16px' }}>Firebase Storage & Database Spec</h3>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Firebase Project ID:</span>
              <code>dostoevsky-labs</code>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Storage Bucket:</span>
              <code>dostoevsky-labs.firebasestorage.app</code>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Main App API Key Prefix:</span>
              <code>AIzaSyAXdXIZOt8vIkGdm...</code>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr' }}>
              <span style={{ color: 'var(--text-muted)' }}>Auth Target Host:</span>
              <code>dostoevsky-labs.firebaseapp.com</code>
            </div>
          </div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }} id="permissions-card-header">
            <Shield size={20} style={{ color: 'var(--accent-blue)' }} />
            <h3 style={{ fontSize: '16px' }}>Access Control Details</h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Role Assigned:</span>
              <strong style={{ color: 'var(--accent-gold)' }}>Master Library Administrator</strong>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Active Identity UID:</span>
              <code style={{ fontSize: '12px' }}>{user?.uid || 'Unknown System Admin'}</code>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr' }}>
              <span style={{ color: 'var(--text-muted)' }}>Active Session Email:</span>
              <span>{user?.email || 'admin@dostoevsky.com'}</span>
            </div>
          </div>
        </div>

        <div className="card" style={{ backgroundColor: 'rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }} id="app-metadata-card-header">
            <Cpu size={20} style={{ color: 'var(--accent-green)' }} />
            <h3 style={{ fontSize: '16px' }}>Android App Integration Spec</h3>
          </div>
          
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.6' }}>
            The Android client app expects this database structure directly to render items without translation. Specifically:
          </p>
          <ul style={{ fontSize: '13px', color: 'var(--text-muted)', marginLeft: '20px', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <li>● All author IDs are lowercase string structures used to query related books.</li>
            <li>● Cover photos are loaded from Firebase Storage matching <code>books/{"{bookId}"}/cover.png</code>.</li>
            <li>● Live reader text is loaded from the nested <code>chapters/{"{chapterId}"}/pages</code> subcollection sorted by numeric <code>sortOrder</code>.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
