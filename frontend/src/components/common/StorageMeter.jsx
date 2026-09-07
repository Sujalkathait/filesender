import React, { useState, useEffect } from 'react';
import { Server, AlertTriangle, AlertOctagon } from 'lucide-react';
import { api } from '../../services/api';
import './StorageMeter.css';

export function StorageMeter() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStats = async () => {
    try {
      const data = await api.stats();
      setStats(data);
      setError(null);
    } catch (err) {
      setError('Failed to load storage stats');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    // Refresh stats every 30 seconds
    const intervalId = setInterval(fetchStats, 30000);
    return () => clearInterval(intervalId);
  }, []);

  if (loading) return null; // Don't show skeleton to keep UI clean, it loads fast
  if (error || !stats || stats.max_system_storage == null) return null; // Fallback or hide if unsupported

  const used = stats.total_storage_used || 0;
  const total = stats.max_system_storage;
  const remaining = Math.max(0, total - used);
  
  const usedMb = Math.round(used / (1024 * 1024));
  const remainingMb = Math.round(remaining / (1024 * 1024));
  const totalGb = Math.round(total / (1024 * 1024 * 1024));
  
  const percentUsed = Math.min(100, (used / total) * 100);
  const isDanger = percentUsed > 95;
  const isWarning = percentUsed > 80 && !isDanger;
  
  const statusClass = isDanger ? 'danger' : isWarning ? 'warning' : '';
  
  return (
    <div className={`storage-meter ${statusClass}`} title={`${percentUsed.toFixed(1)}% Storage Used`}>
      <div className="storage-header">
        <div className="storage-title">
          <div className="storage-icon-wrapper">
            <Server size={14} strokeWidth={2.5} />
          </div>
          <span>System Storage</span>
        </div>
        <span className="storage-limit-text">{totalGb} GB Limit</span>
      </div>
      
      <div className="storage-progress-bar">
        <div 
          className="storage-progress-fill" 
          style={{ width: `${percentUsed}%` }}
        />
      </div>
      
      <div className="storage-details">
        <span className="storage-used">
          {usedMb > 1024 ? (usedMb / 1024).toFixed(2) + ' GB' : usedMb + ' MB'} used
        </span>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {isDanger ? (
            <AlertOctagon size={14} className="danger-icon" />
          ) : isWarning ? (
            <AlertTriangle size={14} className="warning-icon" />
          ) : null}
          <span className="storage-remaining">
            {remainingMb > 1024 ? (remainingMb / 1024).toFixed(2) + ' GB' : remainingMb + ' MB'} remaining
          </span>
        </div>
      </div>
    </div>
  );
}
