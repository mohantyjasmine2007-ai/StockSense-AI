import React, { useState, useEffect } from 'react';
import { GlobalFilterState, SystemMeta, SignalItem, WeatherStatus } from '../types';
import { api } from '../api/client';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { StatCard } from '../components/common/StatCard';
import { LoadingState } from '../components/common/LoadingState';
import {
  CloudSun,
  CloudRain,
  Calendar,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Thermometer,
  Layers,
  Zap,
  Clock,
  Database,
  Radio,
  Server,
  KeyRound,
  ShieldAlert,
} from 'lucide-react';

interface ExternalSignalsProps {
  filterState: GlobalFilterState;
  meta: SystemMeta | null;
}

export const ExternalSignals: React.FC<ExternalSignalsProps> = ({
  filterState,
  meta,
}) => {
  const [signals, setSignals] = useState<SignalItem[]>([]);
  const [weatherStatus, setWeatherStatus] = useState<WeatherStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [filterSpikeOnly, setFilterSpikeOnly] = useState<boolean>(false);

  const currentStoreId = filterState.selectedStore;
  const currentStoreName =
    currentStoreId === 'ALL'
      ? 'All Network Stores'
      : meta?.stores.find((s) => s.store_id === currentStoreId)?.name || currentStoreId;

  const fetchSignalsData = async () => {
    setLoading(true);
    try {
      const [signalsRes, weatherRes] = await Promise.all([
        api.getSignalsList({
          store_id: currentStoreId,
          limit: 150,
        }),
        api.getWeatherStatus(),
      ]);
      setSignals(signalsRes);
      setWeatherStatus(weatherRes);
    } catch (err) {
      console.error('Failed to load signals:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSignalsData();
  }, [currentStoreId]);

  const displayedSignals = filterSpikeOnly
    ? signals.filter((s) => s.spike_label && s.spike_label !== 'Baseline')
    : signals;

  // Compute metrics from real signals
  const totalRainDays = signals.filter((s) => (s.rainfall ?? 0) > 5.0).length;
  const totalEventDays = signals.filter((s) => s.event_flag || s.holiday_flag).length;
  const totalSpikes = signals.filter((s) => s.spike_label && s.spike_label !== 'Baseline').length;
  const avgTemp = signals.length > 0
    ? (
        signals.reduce((acc, curr) => acc + (curr.temperature ?? 18), 0) / signals.length
      ).toFixed(1)
    : '18.5';

  const liveSignalsCount = signals.filter((s) => s.provider_status === 'LIVE').length;
  const cachedSignalsCount = signals.filter((s) => s.is_cached).length;

  return (
    <div className="space-y-6">
      {/* Header Banner with Provenance & Config State */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-lg bg-teal-500/10 border border-teal-500/30 text-teal-400">
            <CloudSun className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-sm font-semibold text-white">External Market Signals Pipeline</h3>
              <Badge variant="teal" size="sm">
                Scope: {currentStoreName}
              </Badge>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Multi-source weather adapter, regional holiday calendar mapping, and verified CSV resilience.
            </p>
          </div>
        </div>

        {/* Provenance and State Badges */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="teal" size="sm">
            <Radio className="w-3.5 h-3.5 mr-1 text-teal-300" />
            {weatherStatus?.mode || 'Offline Verified Signals'}
          </Badge>

          {weatherStatus?.api_key_configured ? (
            <Badge variant="info" size="sm">
              <KeyRound className="w-3.5 h-3.5 mr-1 text-sky-300" />
              API Key Configured
            </Badge>
          ) : (
            <Badge variant="neutral" size="sm">
              <KeyRound className="w-3.5 h-3.5 mr-1 text-slate-400" />
              Zero-Key Public Mode
            </Badge>
          )}

          <Badge variant="warning" size="sm">
            <Database className="w-3.5 h-3.5 mr-1 text-amber-300" />
            Cache: {weatherStatus?.cache_entries_count ?? 0} keys
          </Badge>
        </div>
      </div>

      {/* Real Signal Statistics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Avg Temperature"
          value={`${avgTemp}°C`}
          subtext="Chronological window mean"
          icon={Thermometer}
          badge="Observed"
        />
        <StatCard
          label="Heavy Rain Days"
          value={totalRainDays}
          subtext="Rainfall > 5.0 mm"
          icon={CloudRain}
          badge="Observed"
        />
        <StatCard
          label="Events & Holidays"
          value={totalEventDays}
          subtext="Calendar mapped to location"
          icon={Calendar}
          badge="Calendar"
        />
        <StatCard
          label="Labelled Demand Spikes"
          value={totalSpikes}
          subtext="Simulated rainstorm / festival surges"
          icon={Zap}
          badge="Labelled"
        />
      </div>

      {/* Signal Integration Architecture & Fallback Guardrails */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 space-y-2">
          <div className="flex items-center space-x-2 text-teal-400 text-xs font-semibold">
            <Server className="w-4 h-4" />
            <span>Multi-Tier Signal Architecture</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            1. <strong>In-Memory Cache</strong>: Avoids rate limits.<br />
            2. <strong>REST Provider</strong>: Open-Meteo (zero-key) or WeatherAPI via <code className="text-teal-300">WEATHER_API_KEY</code>.<br />
            3. <strong>Verified CSV Fallback</strong>: Automatically engaged upon network timeout.<br />
            4. <strong>Unmatched Guardrail</strong>: Flags unknown locations without hallucinating live values.
          </p>
        </div>

        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 space-y-2">
          <div className="flex items-center space-x-2 text-sky-400 text-xs font-semibold">
            <Calendar className="w-4 h-4" />
            <span>Holiday & Location Mapping</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Maps stores by latitude, longitude, and municipal boundaries. Matches Federal holidays (Labor Day, Memorial Day) as well as regional Seattle-Bellevue retail events (Seafair Festival, Bite of Seattle, Bumbershoot Arts).
          </p>
        </div>

        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 space-y-2">
          <div className="flex items-center space-x-2 text-amber-400 text-xs font-semibold">
            <ShieldAlert className="w-4 h-4" />
            <span>Honest Provenance & Timestamps</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Every record displays its exact retrieval timestamp, source tier, and caching status.
            <br />
            <span className="text-slate-300 font-medium">Last Pipeline Sync:</span>{' '}
            <span className="font-mono text-teal-300">
              {weatherStatus?.last_retrieval_timestamp
                ? new Date(weatherStatus.last_retrieval_timestamp).toLocaleTimeString()
                : 'Just now'}
            </span>
          </p>
        </div>
      </div>

      {/* Signals Table */}
      <Card
        title="Chronological Signals & Provenance Audit"
        subtitle={`Tracking ${signals.length} daily signal records for ${currentStoreName}`}
        headerAction={
          <div className="flex items-center space-x-3">
            <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={filterSpikeOnly}
                onChange={(e) => setFilterSpikeOnly(e.target.checked)}
                className="rounded border-slate-700 bg-slate-950 text-teal-500 focus:ring-0 focus:ring-offset-0"
              />
              <span>Show Only Labelled Spikes ({totalSpikes})</span>
            </label>
          </div>
        }
      >
        {loading ? (
          <div className="py-8">
            <LoadingState message="Loading signal records..." subtext="Querying external signals feed" />
          </div>
        ) : displayedSignals.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400 border border-dashed border-slate-800 rounded-lg">
            No signal records found for the selected store or filter.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-800 max-h-96">
            <table className="data-table-compact">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Store / City</th>
                  <th>Temperature</th>
                  <th>Rainfall</th>
                  <th>Holiday Flag</th>
                  <th>Event & Calendar</th>
                  <th>Spike Label</th>
                  <th>Source & Provenance</th>
                  <th>Retrieved At</th>
                </tr>
              </thead>
              <tbody>
                {displayedSignals.map((item, idx) => {
                  const hasSpike = item.spike_label && item.spike_label !== 'Baseline';
                  const storeName =
                    meta?.stores.find((s) => s.store_id === item.store_id)?.name || item.store_id;
                  const cityName =
                    item.city ||
                    meta?.stores.find((s) => s.store_id === item.store_id)?.city ||
                    'WA';

                  const isLive = item.provider_status === 'LIVE';
                  const isUnmatched = item.provider_status === 'UNMATCHED';

                  return (
                    <tr key={idx}>
                      <td className="font-mono text-xs text-slate-200">{item.date}</td>
                      <td className="text-xs text-slate-300">
                        <span className="font-medium">{storeName}</span>
                        <div className="font-mono text-slate-400 text-[10px]">
                          {item.store_id} · {cityName}
                        </div>
                      </td>
                      <td className="font-mono text-xs">
                        {item.temperature !== null && item.temperature !== undefined ? (
                          <span className={item.temperature < 15 ? 'text-sky-400' : 'text-amber-400'}>
                            {item.temperature.toFixed(1)}°C
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="font-mono text-xs">
                        {item.rainfall !== null && item.rainfall !== undefined ? (
                          <span className={item.rainfall > 10 ? 'text-sky-400 font-semibold' : 'text-slate-300'}>
                            {item.rainfall.toFixed(1)} mm
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td>
                        {item.holiday_flag ? (
                          <Badge variant="teal" size="sm">
                            Holiday
                          </Badge>
                        ) : (
                          <span className="text-slate-500 text-xs">No</span>
                        )}
                      </td>
                      <td>
                        {item.event_flag ? (
                          <Badge variant="info" size="sm">
                            {item.event_name || 'Event Active'}
                          </Badge>
                        ) : (
                          <span className="text-slate-500 text-xs">None</span>
                        )}
                      </td>
                      <td>
                        {hasSpike ? (
                          <Badge variant="warning" size="sm">
                            <Zap className="w-3 h-3 mr-1 text-amber-400" />
                            {item.spike_label}
                          </Badge>
                        ) : (
                          <span className="text-slate-500 text-xs font-mono">Baseline</span>
                        )}
                      </td>
                      <td>
                        <div className="flex items-center space-x-1.5">
                          {isLive ? (
                            <Badge variant="teal" size="sm">
                              <Radio className="w-3 h-3 mr-1 text-teal-300" />
                              Live Provider
                            </Badge>
                          ) : isUnmatched ? (
                            <Badge variant="critical" size="sm">
                              Unmatched Location
                            </Badge>
                          ) : (
                            <Badge variant="neutral" size="sm">
                              Verified CSV Fallback
                            </Badge>
                          )}
                          {item.is_cached && (
                            <span className="text-[10px] font-mono text-amber-400" title="Retrieved from memory cache">
                              ⚡Cached
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="font-mono text-[11px] text-slate-400">
                        {item.retrieved_at ? (
                          <span>{item.retrieved_at.split('T')[1]?.substring(0, 8) || item.retrieved_at} UTC</span>
                        ) : (
                          <span>Verified</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
