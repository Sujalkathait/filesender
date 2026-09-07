import React, { useState, useEffect } from 'react';
import { Server, AlertTriangle } from 'lucide-react';
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

  if (loading) return <div className="storage-meter skeleton">Loading storage info...</div>;
  if (error || !stats || stats.max_system_storage == null) return null; // Fallback or hide if unsupported

  const used = stats.total_storage_used || 0;
  const total = stats.max_system_storage;
  const remaining = Math.max(0, total - used);
  
  const usedMb = Math.round(used / (1024 * 1024));
  const remainingMb = Math.round(remaining / (1024 * 1024));
  const totalGb = Math.round(total / (1024 * 1024 * 1024));
  
  const percentUsed = Math.min(100, (used / total) * 100);
  const isWarning = percentUsed > 90;
  
  return (
    <div className={`storage-meter ${isWarning ? 'warning' : ''}`}>
      <div className="storage-header">
        <div className="storage-title">
          <Server size={16} />
          <span>System Storage</span>
        </div>
        <span className="storage-limit-text">Limit = {totalGb} GB</span>
      </div>
      
      <div className="storage-progress-bar">
        <div 
          className="storage-progress-fill" 
          style={{ width: `${percentUsed}%` }}
        />
      </div>
      
      <div className="storage-details">
        <span className="storage-used">Used: {usedMb} MB</span>
        {isWarning && <AlertTriangle size={14} className="warning-icon" />}
        <span className="storage-remaining">Remaining: {remainingMb} MB</span>
      </div>
    </div>
  );
}
