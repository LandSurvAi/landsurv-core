/**
 * PWA Rollout Monitoring Dashboard Component (Phase 6)
 * 
 * Admin-only view for monitoring feature flag rollout progress,
 * cohort metrics, and making rollout decisions.
 * 
 * Route: /admin/pwa-monitoring (protected)
 */

import React, { useEffect, useState, useCallback } from 'react';
import { getCohortReport, exportCohortData, type CohortReport } from '../services/CohortAnalytics.ts';
import { getFeatureFlagStats, setRolloutStage } from '../services/FeatureFlags.ts';
import { RolloutStage } from '../services/FeatureFlags.ts';

interface DashboardState {
  report: CohortReport | null;
  stats: ReturnType<typeof getFeatureFlagStats> | null;
  autoRefresh: boolean;
  refreshInterval: number;
  selectedMetric: 'crashes' | 'engagement' | 'installs' | 'sync';
}

export function PwaMonitoringDashboard() {
  const [dashState, setDashState] = useState<DashboardState>({
    report: null,
    stats: null,
    autoRefresh: true,
    refreshInterval: 60, // seconds
    selectedMetric: 'engagement',
  });

  /**
   * Refresh report and statistics
   */
  const refreshMetrics = useCallback(() => {
    try {
      const newReport = getCohortReport();
      const newStats = getFeatureFlagStats();
      setDashState(prev => ({
        ...prev,
        report: newReport,
        stats: newStats,
      }));
    } catch (e) {
      console.error('[Dashboard] Failed to refresh metrics:', e);
    }
  }, []);

  /**
   * Auto-refresh on interval
   */
  useEffect(() => {
    if (!dashState.autoRefresh) return;

    const interval = setInterval(refreshMetrics, dashState.refreshInterval * 1000);
    return () => clearInterval(interval);
  }, [dashState.autoRefresh, dashState.refreshInterval, refreshMetrics]);

  /**
   * Initial load
   */
  useEffect(() => {
    refreshMetrics();
  }, [refreshMetrics]);

  /**
   * Handle rollout stage change
   */
  const handleStageChange = (newStage: RolloutStage) => {
    if (window.confirm(`Change rollout stage to: ${newStage}?\n\nThis affects all users immediately.`)) {
      setRolloutStage(newStage);
      refreshMetrics();
      console.log('[Dashboard] Rollout stage changed to:', newStage);
    }
  };

  /**
   * Export data for analysis
   */
  const handleExportData = () => {
    try {
      const data = exportCohortData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pwa-cohort-data-${new Date().toISOString()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('[Dashboard] Export failed:', e);
    }
  };

  if (!dashState.report || !dashState.stats) {
    return (
      <div className="p-6 bg-slate-900 text-white rounded-lg">
        <div className="animate-pulse">Loading monitoring data...</div>
      </div>
    );
  }

  const { report, stats } = dashState;
  const currentStage = report.rolloutStage;
  const hasWarnings = report.recommendations.some(r => r.startsWith('⚠️'));
  const isReady = report.recommendations.some(r => r.startsWith('✓ READY'));

  return (
    <div className="p-6 bg-slate-900 text-white space-y-6">
      {/* Header */}
      <div className="border-b border-slate-700 pb-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          📊 PWA Rollout Monitor
          <span className={`text-sm px-2 py-1 rounded ${
            currentStage === 'disabled' ? 'bg-red-900' :
            currentStage === 'internal' ? 'bg-blue-900' :
            currentStage === 'beta' ? 'bg-amber-900' :
            'bg-emerald-900'
          }`}>
            {currentStage.toUpperCase()}
          </span>
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          {report.reportDate.toLocaleString()}
        </p>
      </div>

      {/* Status Alert */}
      {(hasWarnings || isReady) && (
        <div className={`p-4 rounded-lg border ${
          isReady 
            ? 'bg-emerald-900/20 border-emerald-600 text-emerald-100'
            : 'bg-amber-900/20 border-amber-600 text-amber-100'
        }`}>
          <div className="font-semibold mb-2">
            {isReady ? '✓ READY FOR EXPANSION' : '⚠️ CAUTION'}
          </div>
          <ul className="text-sm space-y-1">
            {report.recommendations.map((rec, i) => (
              <li key={i}>{rec}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Control Panel */}
      <div className="bg-slate-800 p-4 rounded-lg space-y-4">
        <div className="font-semibold text-lg">Rollout Controls</div>
        
        {/* Stage Buttons */}
        <div className="flex gap-2 flex-wrap">
          {Object.values(RolloutStage).map(stage => (
            <button
              key={stage}
              onClick={() => handleStageChange(stage)}
              className={`px-3 py-2 rounded text-sm font-medium transition ${
                stage === currentStage
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
              }`}
            >
              {stage.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Refresh Controls */}
        <div className="flex items-center gap-4 pt-2 border-t border-slate-700">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={dashState.autoRefresh}
              onChange={e => setDashState(prev => ({ ...prev, autoRefresh: e.target.checked }))}
              className="w-4 h-4"
            />
            <span className="text-sm">Auto-refresh</span>
          </label>
          <select
            value={dashState.refreshInterval}
            onChange={e => setDashState(prev => ({ ...prev, refreshInterval: parseInt(e.target.value) }))}
            className="px-2 py-1 rounded bg-slate-700 text-sm"
          >
            <option value={30}>30s</option>
            <option value={60}>60s</option>
            <option value={300}>5m</option>
            <option value={600}>10m</option>
          </select>
          <button
            onClick={refreshMetrics}
            className="ml-auto px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-sm font-medium"
          >
            🔄 Refresh
          </button>
          <button
            onClick={handleExportData}
            className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 text-sm font-medium"
          >
            📥 Export
          </button>
        </div>
      </div>

      {/* Cohort Overview */}
      <div className="bg-slate-800 p-4 rounded-lg">
        <div className="font-semibold text-lg mb-4">Cohort Distribution</div>
        <div className="grid grid-cols-4 gap-4">
          {report.allCohorts.map(cohort => (
            <div
              key={cohort.cohort}
              className={`p-3 rounded-lg border ${
                cohort.totalUsers === 0
                  ? 'bg-slate-700 border-slate-600'
                  : 'bg-slate-700 border-slate-500'
              }`}
            >
              <div className="font-medium capitalize text-sm">{cohort.cohort}</div>
              <div className="text-2xl font-bold mt-1">
                {cohort.totalUsers}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                {cohort.dailyActiveUsers} DAU
              </div>
              <div className="text-xs text-slate-400">
                {cohort.totalUsers > 0 
                  ? `${((cohort.dailyActiveUsers / cohort.totalUsers) * 100).toFixed(0)}% active`
                  : 'N/A'
                }
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Metrics Comparison */}
      <div className="bg-slate-800 p-4 rounded-lg">
        <div className="font-semibold text-lg mb-4">Metrics vs Baseline (Disabled Cohort)</div>
        <div className="space-y-3">
          {report.comparisonToBaseline.map(comp => (
            <div key={comp.cohort} className="space-y-2">
              <div className="font-medium capitalize text-sm">{comp.cohort}</div>
              
              {/* Crash Rate Delta */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 w-32">Crash Rate Δ:</span>
                <div className="flex-1 bg-slate-700 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition ${
                      comp.crashRateDelta > 50 ? 'bg-red-600' :
                      comp.crashRateDelta > 10 ? 'bg-amber-600' :
                      comp.crashRateDelta > 0 ? 'bg-amber-600' :
                      'bg-emerald-600'
                    }`}
                    style={{
                      width: `${Math.min(Math.abs(comp.crashRateDelta), 100)}%`,
                    }}
                  />
                </div>
                <span className={`text-xs font-mono w-16 text-right ${
                  comp.crashRateDelta > 10 ? 'text-red-400' :
                  comp.crashRateDelta > 0 ? 'text-amber-400' :
                  'text-emerald-400'
                }`}>
                  {comp.crashRateDelta > 0 ? '+' : ''}{comp.crashRateDelta.toFixed(1)}%
                </span>
              </div>

              {/* Engagement Delta */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 w-32">Engagement Δ:</span>
                <div className="flex-1 bg-slate-700 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition ${
                      comp.engagementDelta > 20 ? 'bg-emerald-600' :
                      comp.engagementDelta > 0 ? 'bg-blue-600' :
                      'bg-amber-600'
                    }`}
                    style={{
                      width: `${Math.min(Math.abs(comp.engagementDelta), 100)}%`,
                    }}
                  />
                </div>
                <span className={`text-xs font-mono w-16 text-right ${
                  comp.engagementDelta > 0 ? 'text-emerald-400' : 'text-amber-400'
                }`}>
                  {comp.engagementDelta > 0 ? '+' : ''}{comp.engagementDelta.toFixed(1)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Detailed Metrics by Cohort */}
      <div className="bg-slate-800 p-4 rounded-lg overflow-x-auto">
        <div className="font-semibold text-lg mb-4">Detailed Metrics by Cohort</div>
        <table className="w-full text-sm">
          <thead className="border-b border-slate-700">
            <tr>
              <th className="text-left py-2">Cohort</th>
              <th className="text-right py-2">Users</th>
              <th className="text-right py-2">Crashes</th>
              <th className="text-right py-2">Error %</th>
              <th className="text-right py-2">Install %</th>
              <th className="text-right py-2">Sync %</th>
              <th className="text-right py-2">Deeplink %</th>
              <th className="text-right py-2">Queue Depth</th>
            </tr>
          </thead>
          <tbody>
            {report.allCohorts.map(cohort => (
              <tr key={cohort.cohort} className="border-b border-slate-700 hover:bg-slate-700/50">
                <td className="py-2 capitalize font-medium">{cohort.cohort}</td>
                <td className="text-right text-slate-300">{cohort.totalUsers}</td>
                <td className={`text-right font-mono ${cohort.crashCount > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {cohort.crashCount}
                </td>
                <td className={`text-right font-mono ${cohort.errorRate > 5 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {cohort.errorRate.toFixed(2)}%
                </td>
                <td className={`text-right font-mono ${cohort.installRate > 30 ? 'text-emerald-400' : cohort.installRate > 10 ? 'text-blue-400' : 'text-slate-400'}`}>
                  {cohort.installRate.toFixed(1)}%
                </td>
                <td className={`text-right font-mono ${cohort.offlineSyncRate > 95 ? 'text-emerald-400' : cohort.offlineSyncRate < 80 ? 'text-amber-400' : 'text-blue-400'}`}>
                  {cohort.offlineSyncRate.toFixed(1)}%
                </td>
                <td className="text-right text-slate-300 font-mono">
                  {cohort.deeplinkClickRate.toFixed(2)}%
                </td>
                <td className={`text-right font-mono ${cohort.avgQueueDepth > 5 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {cohort.avgQueueDepth.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Recommendations */}
      <div className="bg-slate-800 p-4 rounded-lg">
        <div className="font-semibold text-lg mb-3">Recommendations</div>
        <div className="space-y-2">
          {report.recommendations.map((rec, i) => (
            <div
              key={i}
              className={`p-2 rounded text-sm font-mono ${
                rec.startsWith('⚠️') ? 'bg-amber-900/20 text-amber-200 border border-amber-700' :
                rec.startsWith('✓') ? 'bg-emerald-900/20 text-emerald-200 border border-emerald-700' :
                'bg-blue-900/20 text-blue-200 border border-blue-700'
              }`}
            >
              {rec}
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="text-xs text-slate-500 flex items-center justify-between">
        <span>Last updated: {report.reportDate.toLocaleTimeString()}</span>
        <span>Total tracked users: {stats.totalUsers}</span>
      </div>
    </div>
  );
}

export default PwaMonitoringDashboard;
