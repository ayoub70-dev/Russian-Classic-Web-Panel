import React, { useEffect, useState } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  doc, 
  updateDoc, 
  deleteDoc, 
  writeBatch,
  getDocs
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../components/Toast';
import { 
  ShieldAlert, Trash2, CheckCircle2, XCircle, Eye, 
  AlertTriangle, Filter, RefreshCw, Layers, Clock, Info
} from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';

interface ErrorLog {
  id: string;
  category: string;
  message: string;
  details: string;
  stack?: string | null;
  userAgent?: string;
  userId?: string | null;
  timestamp: any; // Firestore timestamp or date string
  resolved: boolean;
  savedLocally?: boolean;
}

export default function ErrorLogs() {
  const { user } = useAuth();
  const { addToast } = useToast();

  const [logs, setLogs] = useState<ErrorLog[]>([]);
  const [localLogs, setLocalLogs] = useState<ErrorLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('unresolved');

  // selected log details modal
  const [selectedLog, setSelectedLog] = useState<ErrorLog | null>(null);

  // Sync / clearing loading state
  const [clearing, setClearing] = useState(false);

  // 1. Fetch real-time logs from Firestore
  useEffect(() => {
    const q = query(collection(db, 'error_logs'), orderBy('timestamp', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fbLogs: ErrorLog[] = [];
      snapshot.forEach((snap) => {
        const data = snap.data();
        fbLogs.push({
          id: snap.id,
          ...data,
          timestamp: data.timestamp
        } as ErrorLog);
      });
      setLogs(fbLogs);
      setLoading(false);
    }, (error) => {
      console.error("Firestore error logs fetch failed:", error);
      setLoading(false);
      addToast("Failed to fetch error logs from database. Showing backups.", "warning");
    });

    return () => unsubscribe();
  }, [addToast]);

  // 2. Fetch local storage backup logs
  useEffect(() => {
    const fetchLocalLogs = () => {
      try {
        const local = localStorage.getItem('rc_error_logs');
        if (local) {
          const parsed = JSON.parse(local);
          setLocalLogs(parsed.map((item: any, idx: number) => ({
            id: `local-${idx}`,
            ...item,
            timestamp: item.timestamp ? new Date(item.timestamp) : new Date(),
            savedLocally: true
          })));
        } else {
          setLocalLogs([]);
        }
      } catch (e) {
        console.error("Failed to read local storage error logs:", e);
      }
    };

    fetchLocalLogs();
    // Add event listener to react to storage changes
    window.addEventListener('storage', fetchLocalLogs);
    return () => window.removeEventListener('storage', fetchLocalLogs);
  }, []);

  // Merge lists for combined view or keep them distinct
  const combinedLogs = [...logs, ...localLogs].sort((a, b) => {
    const getMs = (t: any) => {
      if (!t) return 0;
      if (t.seconds) return t.seconds * 1000; // firestore stamp
      return new Date(t).getTime(); // ISO date
    };
    return getMs(b.timestamp) - getMs(a.timestamp);
  });

  // Filter combined logs
  const filteredLogs = combinedLogs.filter((log) => {
    // 1. Category filter
    if (categoryFilter !== 'all' && log.category !== categoryFilter) {
      return false;
    }
    // 2. Resolution status filter
    if (statusFilter === 'unresolved' && log.resolved) {
      return false;
    }
    if (statusFilter === 'resolved' && !log.resolved) {
      return false;
    }
    return true;
  });

  // Toggle log resolution state
  const handleToggleResolve = async (log: ErrorLog) => {
    if (log.savedLocally) {
      // Toggle in local storage
      try {
        const local = localStorage.getItem('rc_error_logs');
        if (local) {
          const parsed = JSON.parse(local);
          // Find identical index
          const idx = parseInt(log.id.replace('local-', ''), 10);
          if (parsed[idx]) {
            parsed[idx].resolved = !parsed[idx].resolved;
            localStorage.setItem('rc_error_logs', JSON.stringify(parsed));
            // Trigger state sync
            setLocalLogs(parsed.map((item: any, i: number) => ({
              id: `local-${i}`,
              ...item,
              timestamp: item.timestamp ? new Date(item.timestamp) : new Date(),
              savedLocally: true
            })));
            addToast("Local log resolution status updated.", "success");
            if (selectedLog?.id === log.id) {
              setSelectedLog(prev => prev ? { ...prev, resolved: !prev.resolved } : null);
            }
          }
        }
      } catch (err) {
        console.error(err);
      }
      return;
    }

    try {
      const logRef = doc(db, 'error_logs', log.id);
      await updateDoc(logRef, {
        resolved: !log.resolved
      });
      addToast(`Log status updated ✓`, 'success');
      if (selectedLog?.id === log.id) {
        setSelectedLog(prev => prev ? { ...prev, resolved: !prev.resolved } : null);
      }
    } catch (err) {
      console.error(err);
      addToast("Failed to update status in database.", "error");
    }
  };

  // Delete individual log
  const handleDeleteLog = async (log: ErrorLog) => {
    if (log.savedLocally) {
      try {
        const local = localStorage.getItem('rc_error_logs');
        if (local) {
          const parsed = JSON.parse(local);
          const idx = parseInt(log.id.replace('local-', ''), 10);
          parsed.splice(idx, 1);
          localStorage.setItem('rc_error_logs', JSON.stringify(parsed));
          setLocalLogs(parsed.map((item: any, i: number) => ({
            id: `local-${i}`,
            ...item,
            timestamp: item.timestamp ? new Date(item.timestamp) : new Date(),
            savedLocally: true
          })));
          addToast("Local log deleted.", "success");
          if (selectedLog?.id === log.id) {
            setSelectedLog(null);
          }
        }
      } catch (err) {
        console.error(err);
      }
      return;
    }

    try {
      await deleteDoc(doc(db, 'error_logs', log.id));
      addToast("Log deleted ✓", "success");
      if (selectedLog?.id === log.id) {
        setSelectedLog(null);
      }
    } catch (err) {
      console.error(err);
      addToast("Failed to delete from database.", "error");
    }
  };

  // Bulk clear logs
  const handleClearLogs = async () => {
    if (!window.confirm("Are you absolutely sure you want to clear the filtered error logs shown currently?")) {
      return;
    }

    setClearing(true);
    try {
      // 1. Clear database logs matching filter
      const dbTargets = filteredLogs.filter(l => !l.savedLocally);
      if (dbTargets.length > 0) {
        const batch = writeBatch(db);
        dbTargets.forEach(log => {
          batch.delete(doc(db, 'error_logs', log.id));
        });
        await batch.commit();
      }

      // 2. Clear local storage logs matching filter
      const hasLocalTargets = filteredLogs.some(l => l.savedLocally);
      if (hasLocalTargets) {
        const local = localStorage.getItem('rc_error_logs');
        if (local) {
          let parsed = JSON.parse(local);
          // Only keep local logs that do NOT belong to filteredLogs
          const filteredLocalIndices = filteredLogs
            .filter(l => l.savedLocally)
            .map(l => parseInt(l.id.replace('local-', ''), 10));
          
          parsed = parsed.filter((_: any, idx: number) => !filteredLocalIndices.includes(idx));
          localStorage.setItem('rc_error_logs', JSON.stringify(parsed));
          
          setLocalLogs(parsed.map((item: any, i: number) => ({
            id: `local-${i}`,
            ...item,
            timestamp: item.timestamp ? new Date(item.timestamp) : new Date(),
            savedLocally: true
          })));
        }
      }

      addToast("Cleared filtered logs successfully! ✓", "success");
    } catch (err) {
      console.error(err);
      addToast("Failed to clear some error logs.", "error");
    } finally {
      setClearing(false);
    }
  };

  // Statistics counters aggregation
  const totalCount = combinedLogs.length;
  const unresolvedCount = combinedLogs.filter(l => !l.resolved).length;
  const resolvedCount = combinedLogs.filter(l => l.resolved).length;
  const localBackupCount = localLogs.length;

  const getFormatDate = (timestamp: any) => {
    if (!timestamp) return 'Unknown';
    let d: Date;
    if (timestamp.seconds) {
      d = new Date(timestamp.seconds * 1000);
    } else {
      d = new Date(timestamp);
    }
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
  };

  return (
    <div id="error-logs-page" style={{ paddingBottom: '40px' }}>
      
      {/* HEADER ROW */}
      <div className="page-header" id="error-logs-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldAlert size={24} style={{ color: 'var(--accent-gold)' }} />
            <span>Error Diagnostics & Logs</span>
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>
            Diagnostics stream and Firestore transaction error tracking reports
          </p>
        </div>

        <button 
          onClick={handleClearLogs}
          className="btn btn-danger"
          disabled={filteredLogs.length === 0 || clearing}
          id="clear-logs-btn"
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <Trash2 size={15} />
          <span>Clear Filtered Logs</span>
        </button>
      </div>

      {/* STATS DECORATION CARDS BAR */}
      <div className="dashboard-stats" id="logs-diagnostic-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div className="stat-card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="stat-icon" style={{ backgroundColor: 'rgba(197, 168, 128, 0.1)', color: 'var(--accent-gold)', padding: '10px', borderRadius: '8px' }}>
            <Layers size={20} />
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Total Tracked Logs</div>
            <strong style={{ fontSize: '18px', color: 'var(--text-primary)' }}>{totalCount}</strong>
          </div>
        </div>

        <div className="stat-card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="stat-icon" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '10px', borderRadius: '8px' }}>
            <ShieldAlert size={20} />
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Unresolved Errors</div>
            <strong style={{ fontSize: '18px', color: '#ef4444' }}>{unresolvedCount}</strong>
          </div>
        </div>

        <div className="stat-card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="stat-icon" style={{ backgroundColor: 'rgba(106, 191, 123, 0.1)', color: 'var(--accent-green)', padding: '10px', borderRadius: '8px' }}>
            <CheckCircle2 size={20} />
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Resolved Incidents</div>
            <strong style={{ fontSize: '18px', color: 'var(--accent-green)' }}>{resolvedCount}</strong>
          </div>
        </div>

        <div className="stat-card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="stat-icon" style={{ backgroundColor: 'rgba(217, 119, 6, 0.1)', color: '#d97706', padding: '10px', borderRadius: '8px' }}>
            <Clock size={20} />
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Local Cache Backups</div>
            <strong style={{ fontSize: '18px', color: '#d97706' }}>{localBackupCount}</strong>
          </div>
        </div>
      </div>

      {localBackupCount > 0 && (
        <div style={{ backgroundColor: 'rgba(217, 119, 6, 0.08)', border: '1px solid #d97706', padding: '12px 16px', borderRadius: '6px', marginBottom: '20px', display: 'flex', alignItems: 'start', gap: '10px' }} id="local-logs-alert">
          <AlertTriangle size={18} style={{ color: '#d97706', flexShrink: 0, marginTop: '2px' }} />
          <div>
            <strong style={{ color: '#d97706', fontSize: '13px' }}>Local Diagnostics Notice:</strong>
            <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '2px' }}>
              We detected <strong>{localBackupCount}</strong> logs saved in local cache backups. This indicates Firestore transactions were occasionally offline, or client connection limits were triggered. Local logs are fully included in the diagnosis list below.
            </p>
          </div>
        </div>
      )}

      {/* FILTER CONTROLS TOOLBAR */}
      <div className="card" style={{ padding: '14px 18px', marginBottom: '20px', display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 'bold' }}>
          <Filter size={14} style={{ color: 'var(--accent-gold)' }} />
          <span>Filters Toolbar:</span>
        </div>

        {/* CategorySelector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label htmlFor="log-category-select" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Category:</label>
          <select 
            id="log-category-select"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{ fontSize: '12px', padding: '4px 8px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '4px' }}
          >
            <option value="all">-- All Categories --</option>
            <option value="FIREBASE_CONNECTION">FIREBASE_CONNECTION</option>
            <option value="AUTH_ERROR">AUTH_ERROR</option>
            <option value="FIRESTORE_WRITE">FIRESTORE_WRITE</option>
            <option value="FIRESTORE_READ">FIRESTORE_READ</option>
            <option value="STORAGE_UPLOAD">STORAGE_UPLOAD</option>
            <option value="CONTENT_SAVE">CONTENT_SAVE</option>
            <option value="HTML_GENERATION">HTML_GENERATION</option>
            <option value="UNKNOWN">UNKNOWN</option>
          </select>
        </div>

        {/* StatusSelector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label htmlFor="log-status-select" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Incident Status:</label>
          <select 
            id="log-status-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ fontSize: '12px', padding: '4px 8px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '4px' }}
          >
            <option value="all">-- All Incidents --</option>
            <option value="unresolved">Unresolved Errors</option>
            <option value="resolved">Resolved Incidents</option>
          </select>
        </div>

        {/* Total stats match status */}
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
          Matching logs count: <strong>{filteredLogs.length}</strong> / {totalCount} records
        </span>
      </div>

      {loading ? (
        <LoadingSpinner fullScreen={false} label="Connecting to diagnostics database..." />
      ) : filteredLogs.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px', backgroundColor: 'var(--bg-secondary)' }}>
          <CheckCircle2 size={36} style={{ color: 'var(--accent-green)', margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '15px', color: 'var(--text-primary)' }}>No Matching Diagnosed Incidents</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px', maxWidth: '400px', marginInline: 'auto' }}>
            Congratulations! All checks are clear or filtered criteria matches no logs inside the diagnostics engine.
          </p>
        </div>
      ) : (
        /* ERROR MATRIX TABLE */
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }} id="logs-diagnostics-table">
            <thead>
              <tr style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '12px 16px' }}>Timestamp</th>
                <th style={{ padding: '12px 16px' }}>Category</th>
                <th style={{ padding: '12px 16px' }}>Error Details Summary</th>
                <th style={{ padding: '12px 16px' }}>Diagnosed Person</th>
                <th style={{ padding: '12px 16px', textAlign: 'center' }}>Incident Status</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => {
                const badgeColor = log.resolved ? 'badge-green' : 'badge-red';
                const dateStr = getFormatDate(log.timestamp);
                
                let categoryColor = 'var(--text-primary)';
                if (log.category.includes('WRITE')) categoryColor = 'var(--accent-gold)';
                if (log.category.includes('ERROR')) categoryColor = '#ef4444';
                if (log.category.includes('CONNECTION')) categoryColor = '#3b82f6';

                return (
                  <tr 
                    key={log.id} 
                    id={`log-row-${log.id}`}
                    style={{ 
                      borderBottom: '1px solid var(--border-color)', 
                      backgroundColor: log.savedLocally ? 'rgba(217,119,6,0.02)' : 'transparent',
                      transition: 'background var(--transition-speed)'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = log.savedLocally ? 'rgba(217,119,6,0.02)' : 'transparent'}
                  >
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: '12px' }}>
                      {dateStr}
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: 'bold', fontSize: '12px', color: categoryColor }}>
                      {log.category}
                      {log.savedLocally && (
                        <span style={{ fontSize: '9px', backgroundColor: 'rgba(217,119,6,0.2)', color: '#d97706', padding: '2px 4px', borderRadius: '4px', marginLeft: '6px' }}>Local Backup</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={log.message}>
                      {log.message}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '12px' }}>
                      {log.userId ? `${log.userId.slice(0, 8)}...` : 'Anonymous API'}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <span className={`badge ${badgeColor}`} style={{ fontSize: '10px' }}>
                        {log.resolved ? 'RESOLVED ✓' : 'UNRESOLVED'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button 
                          onClick={() => setSelectedLog(log)}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '4px 8px' }}
                          title="View Details"
                        >
                          <Eye size={12} />
                        </button>

                        <button 
                          onClick={() => handleToggleResolve(log)}
                          className={`btn btn-sm ${log.resolved ? 'btn-secondary' : 'btn-gold'}`}
                          style={{ padding: '4px 8px' }}
                          title={log.resolved ? "Toggle as Unresolved" : "Toggle Resolve"}
                        >
                          <CheckCircle2 size={12} />
                        </button>

                        <button 
                          onClick={() => handleDeleteLog(log)}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '4px 8px', color: '#ef4444' }}
                          title="Delete Log"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* DETAIL MODAL OVERLAY */}
      {selectedLog && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '24px' }} id="log-details-modal-overlay">
          <div className="card" style={{ maxWidth: '700px', width: '100%', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative' }} id="log-details-viewcard">
            
            {/* Modal subtitle header details */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--accent-gold)', textTransform: 'uppercase' }}>Incident Details Investigation</span>
                <h3 style={{ fontSize: '16px', marginTop: '4px', color: 'var(--text-primary)' }}>{selectedLog.category} Diagnostic Log</h3>
              </div>
              <button 
                onClick={() => setSelectedLog(null)} 
                style={{ cursor: 'pointer', background: 'none', border: 'none', fontSize: '20px', color: 'var(--text-muted)' }}
                id="close-details-modal-btn"
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', fontSize: '12px' }} id="diagnostic-meta-details">
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Event Timestamp Date:</span>
                <p style={{ fontWeight: 'bold', marginTop: '2px', color: 'var(--text-primary)' }}>{getFormatDate(selectedLog.timestamp)}</p>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Incident Scope User:</span>
                <p style={{ fontWeight: 'bold', marginTop: '2px', color: 'var(--text-primary)' }}>{selectedLog.userId || 'Anonymous Web Access / Visitor'}</p>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <span style={{ color: 'var(--text-muted)' }}>Web Browser Client (userAgent):</span>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', marginTop: '2px', backgroundColor: 'var(--bg-secondary)', padding: '6px', borderRadius: '4px', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
                  {selectedLog.userAgent || 'Not captured (Local Backup block)'}
                </p>
              </div>
            </div>

            {/* Error Message */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '12px', color: '#ef4444' }}>Error Message Summary:</span>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', backgroundColor: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '12px', borderRadius: '6px' }}>
                <AlertTriangle size={15} style={{ color: '#ef4444', flexShrink: 0, marginTop: '2px' }} />
                <span style={{ fontSize: '13px', fontWeight: 'bold', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{selectedLog.message}</span>
              </div>
            </div>

            {/* details fields JSON */}
            {selectedLog.details && selectedLog.details !== '{}' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Metadata / Tracing parameters:</span>
                <pre style={{ margin: 0, padding: '12px', backgroundColor: 'var(--bg-secondary)', color: 'var(--accent-gold)', borderRadius: '6px', fontSize: '11px', overflowX: 'auto', fontFamily: 'var(--font-mono)', border: '1px solid var(--border-color)' }}>
                  {JSON.stringify(JSON.parse(selectedLog.details), null, 2)}
                </pre>
              </div>
            )}

            {/* Stack trace */}
            {selectedLog.stack && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Technical Java/TS/JS Stack Trace:</span>
                <pre style={{ margin: 0, padding: '12px', backgroundColor: 'var(--bg-secondary)', color: '#94a3b8', borderRadius: '6px', fontSize: '10px', overflowX: 'auto', maxHeight: '180px', overflowY: 'auto', fontFamily: 'var(--font-mono)', border: '1px solid var(--border-color)', lineHeight: '1.4' }}>
                  {selectedLog.stack}
                </pre>
              </div>
            )}

            {/* Resolve Toggle Actions Inside Modal */}
            <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input 
                  type="checkbox" 
                  id="modal-resolve-toggle" 
                  checked={selectedLog.resolved} 
                  onChange={() => handleToggleResolve(selectedLog)}
                  style={{ cursor: 'pointer', scale: '1.2' }}
                />
                <label htmlFor="modal-resolve-toggle" style={{ fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', color: selectedLog.resolved ? 'var(--accent-green)' : 'var(--text-primary)' }}>
                  {selectedLog.resolved ? 'Incident Diagnosed & Resolved ✓' : 'Mark incident as Resolved'}
                </label>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button 
                  onClick={() => { handleDeleteLog(selectedLog); }} 
                  className="btn btn-danger"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Trash2 size={13} />
                  <span>Remove Log</span>
                </button>
                <button 
                  onClick={() => setSelectedLog(null)} 
                  className="btn btn-secondary"
                >
                  Close Inquiry
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {clearing && <LoadingSpinner fullScreen label="Wiping diagnostics records from Firestore database..." />}
    </div>
  );
}
