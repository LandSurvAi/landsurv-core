import React, { useState, useEffect } from 'react';
import { useAppState } from '../contexts/AppStateContext.tsx';
import { getCreditRunwayUnitsPerDay, useGlobalSettings } from '../utils/globalSettings';
import './UsageDashboardPanel.css';

interface UsageDashboardData {
  currentMonth: string;
  subscriptionTier: 'starter' | 'pro' | 'enterprise';
  monthlyAllocation: number;
  unitsUsed: number;
  unitsRemaining: number;
  percentageUsed: number;
  operations: Record<string, { count: number; unitsUsed: number }>;
  overageTriggered: boolean;
  overageUnitsOver: number;
  overageChargedCents: number;
  estimatedRunwayDays: number;
  nextBillingDate: string;
  lastUpdated: string;
}

interface UsageDashboardPanelProps {
  userId: string;
  userEmail?: string;
  isOpen: boolean;
  onClose: () => void;
  onPurchaseCredits: (creditPackage: '1K' | '5K' | '10K') => void;
}

export const UsageDashboardPanel: React.FC<UsageDashboardPanelProps> = ({
  userId,
  userEmail,
  isOpen,
  onClose,
  onPurchaseCredits,
}) => {
  const { addNotification } = useAppState();
  const [data, setData] = useState<UsageDashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [purchaseLoading, setPurchaseLoading] = useState<'1K' | '5K' | '10K' | null>(null);

  const globalSettings = useGlobalSettings();
  const normalUseUnitsPerDay = getCreditRunwayUnitsPerDay(globalSettings);

  const formatPackageDuration = (units: number): string => {
    const days = units / normalUseUnitsPerDay;
    if (days < 14) {
      return `~${Math.max(1, Math.round(days))} day${Math.max(1, Math.round(days)) === 1 ? '' : 's'}`;
    }

    const weeks = days / 7;
    if (weeks < 8) {
      return `~${Math.round(weeks)} week${Math.round(weeks) === 1 ? '' : 's'}`;
    }

    const months = days / 30;
    return `~${months.toFixed(months >= 10 ? 0 : 1)} month${months >= 2 ? 's' : ''}`;
  };

  const handlePurchase = async (creditPackage: '1K' | '5K' | '10K') => {
    try {
      setPurchaseLoading(creditPackage);
      onPurchaseCredits(creditPackage);
    } finally {
      setPurchaseLoading(null);
    }
  };

  // Fetch usage dashboard data
  const fetchDashboardData = async () => {
    if (!userId) return;

    setLoading(true);

    try {
      const response = await fetch('/api/billing/usage-dashboard', {
        headers: {
          'x-user-id': userId,
          'x-user-email': userEmail || '',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch usage data: ${response.statusText}`);
      }

      const dashboardData = await response.json();
      setData(dashboardData);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch usage data';
      addNotification({ kind: 'usage-dashboard', severity: 'error', title: 'Usage Dashboard', message });
      console.error('Usage dashboard error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch data when panel opens
  useEffect(() => {
    if (isOpen) {
      fetchDashboardData();
    }
  }, [isOpen, userId]);

  // Get alert level
  const getAlertLevel = () => {
    if (!data) return null;
    if (data.percentageUsed >= 95) return 'critical';
    if (data.percentageUsed >= 75) return 'warning';
    return 'normal';
  };

  // Get progress bar color
  const getProgressColor = () => {
    const level = getAlertLevel();
    if (level === 'critical') return '#ef4444'; // red
    if (level === 'warning') return '#f59e0b'; // amber
    return '#10b981'; // green
  };

  if (!isOpen) return null;

  return (
    <div className="usage-dashboard-overlay" onClick={onClose}>
      <div className="usage-dashboard-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="usage-dashboard-header">
          <h2>📊 Usage Dashboard</h2>
          <button className="close-button" onClick={onClose}>✕</button>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="usage-loading">
            <div className="spinner"></div>
            <p>Loading usage data...</p>
          </div>
        )}

        {/* Content */}

        {/* Content */}
        {data && !loading && (
          <div className="usage-content">
            {/* Tier badge */}
            <div className="tier-badge">
              <span className={`tier-${data.subscriptionTier}`}>
                {data.subscriptionTier.toUpperCase()}
              </span>
              <span className="billing-cycle">{data.currentMonth}</span>
            </div>

            {/* Usage progress */}
            <div className="usage-section">
              <div className="section-title">Monthly Allocation</div>
              <div className="progress-container">
                <div className="progress-bar" style={{ width: '100%', backgroundColor: '#e5e7eb' }}>
                  <div
                    className="progress-fill"
                    style={{
                      width: `${Math.min(data.percentageUsed, 100)}%`,
                      backgroundColor: getProgressColor(),
                    }}
                  />
                </div>
                <div className="progress-stats">
                  <span className="stat-label">Used:</span>
                  <span className="stat-value">{data.unitsUsed.toLocaleString()}</span>
                  <span className="stat-divider">/</span>
                  <span className="stat-value">{data.monthlyAllocation.toLocaleString()}</span>
                  <span className="stat-label">units</span>
                </div>
              </div>
              <div className="progress-meta">
                <div className="meta-item">
                  <span className="meta-label">Remaining:</span>
                  <span className={`meta-value ${data.unitsRemaining < 0 ? 'overage' : ''}`}>
                    {Math.max(0, data.unitsRemaining).toLocaleString()} units
                  </span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Usage:</span>
                  <span className="meta-value">{data.percentageUsed.toFixed(1)}%</span>
                </div>
              </div>
            </div>

            {/* Overage warning */}
            {data.overageTriggered && (
              <div className="overage-alert">
                <span className="alert-icon">⚠️</span>
                <div className="alert-content">
                  <p className="alert-title">Overage Charges Applied</p>
                  <p className="alert-message">
                    {data.overageUnitsOver.toLocaleString()} units over allocation
                  </p>
                  <p className="alert-charge">
                    Charge: ${(data.overageChargedCents / 100).toFixed(2)}
                  </p>
                </div>
              </div>
            )}

            {/* Operations breakdown */}
            {Object.keys(data.operations).length > 0 && (
              <div className="usage-section">
                <div className="section-title">Operations Breakdown</div>
                <div className="operations-list">
                  {Object.entries(data.operations)
                    .sort((a, b) => b[1].unitsUsed - a[1].unitsUsed)
                    .slice(0, 5)
                    .map(([opType, opData]) => (
                      <div key={opType} className="operation-item">
                        <div className="op-name">{opType}</div>
                        <div className="op-stats">
                          <span className="op-count">{opData.count}x</span>
                          <span className="op-units">{opData.unitsUsed.toLocaleString()} units</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Runway estimate */}
            {data.estimatedRunwayDays !== Infinity && (
              <div className="runway-section">
                <div className="section-title">Estimated Runway</div>
                <div className="runway-info">
                  <span className="runway-days">
                    {data.estimatedRunwayDays === Infinity ? '∞' : data.estimatedRunwayDays}
                  </span>
                  <span className="runway-label">days until allocation depleted</span>
                </div>
                <p className="runway-meta">Next billing: {data.nextBillingDate}</p>
              </div>
            )}

            {/* Purchase credits section — temporarily disabled. */}
            <div className="purchase-section">
              <div className="section-title">Choose a Buy-In Level</div>
              <div className="credit-packages-grid">
                <button
                  type="button"
                  className="credit-package-btn"
                  onClick={() => handlePurchase('1K')}
                  disabled={purchaseLoading !== null}
                >
                  <div className="pkg-amount">Starter Buy-In</div>
                  <div className="pkg-price">$75.00</div>
                  <div className="text-[11px] text-gray-300 mt-1">About 1 month of normal use</div>
                </button>
                <button
                  type="button"
                  className="credit-package-btn"
                  onClick={() => handlePurchase('5K')}
                  disabled={purchaseLoading !== null}
                >
                  <div className="pkg-amount">Growth Buy-In</div>
                  <div className="pkg-price">$135.00</div>
                  <div className="text-[11px] text-gray-300 mt-1">About 2 months of normal use</div>
                </button>
                <button
                  type="button"
                  className="credit-package-btn"
                  onClick={() => handlePurchase('10K')}
                  disabled={purchaseLoading !== null}
                >
                  <div className="pkg-amount">Pro Buy-In</div>
                  <div className="pkg-price">$190.00</div>
                  <div className="text-[11px] text-gray-300 mt-1">About 3 months of normal use</div>
                </button>
              </div>
              {purchaseLoading && (
                <p style={{ marginTop: 8, fontSize: 12, opacity: 0.9 }}>
                  Preparing checkout for {purchaseLoading} credits...
                </p>
              )}
              <p style={{ marginTop: 8, fontSize: 11, opacity: 0.8 }}>
                Buy-ins are sized from a normal-use baseline of {normalUseUnitsPerDay.toLocaleString()} compute units/day.
              </p>
            </div>

            {/* Last updated */}
            <div className="usage-footer">
              <small>Last updated: {new Date(data.lastUpdated).toLocaleString()}</small>
              <button className="refresh-btn" onClick={fetchDashboardData}>
                🔄 Refresh
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UsageDashboardPanel;
