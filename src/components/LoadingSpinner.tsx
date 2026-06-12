import React from 'react';

interface LoadingSpinnerProps {
  fullScreen?: boolean;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

export default function LoadingSpinner({
  fullScreen = false,
  size = 'md',
  label
}: LoadingSpinnerProps) {
  const spinnerSize = size === 'sm' ? '16px' : size === 'lg' ? '40px' : '24px';
  const spinnerBorder = size === 'sm' ? '2px' : '3px';

  const spinnerElement = (
    <div 
      className="spinner" 
      style={{ 
        width: spinnerSize, 
        height: spinnerSize, 
        borderWidth: spinnerBorder 
      }}
      id="loading-spinner"
    />
  );

  if (fullScreen) {
    return (
      <div 
        className="modal-overlay" 
        style={{ flexDirection: 'column', gap: '16px' }}
        id="loading-full-screen"
      >
        {spinnerElement}
        {label && <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>{label}</p>}
      </div>
    );
  }

  return (
    <div 
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '16px 0' }}
      id="loading-inline"
    >
      {spinnerElement}
      {label && <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>{label}</span>}
    </div>
  );
}

export function SkeletonLoader({ rows = 3 }: { rows?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', padding: '12px 0' }} id="skeleton-container">
      {Array.from({ length: rows }).map((_, i) => (
        <div 
          key={i} 
          className="skeleton" 
          style={{ height: '40px', width: '100%', borderRadius: '6px' }} 
        />
      ))}
    </div>
  );
}

export function CardSkeletonLoader() {
  return (
    <div className="books-grid">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '360px' }}>
          <div className="skeleton" style={{ height: '180px', borderRadius: '6px' }} />
          <div className="skeleton" style={{ height: '24px', width: '70%', borderRadius: '4px' }} />
          <div className="skeleton" style={{ height: '16px', width: '40%', borderRadius: '4px' }} />
          <div style={{ marginTop: 'auto', display: 'flex', gap: '8px' }}>
            <div className="skeleton" style={{ height: '32px', flex: 1, borderRadius: '4px' }} />
            <div className="skeleton" style={{ height: '32px', flex: 1, borderRadius: '4px' }} />
          </div>
        </div>
      ))}
    </div>
  );
}
