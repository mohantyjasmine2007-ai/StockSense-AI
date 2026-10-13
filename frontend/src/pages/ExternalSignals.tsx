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

  return (
    <div className="space-y-6">
      {/* Header Banner */}
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
              Verified weather observations, holiday calendars, and explicitly labelled demand spikes.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Badge variant="teal" size="sm">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
            {weatherStatus?.mode || 'Offline Verified Signals'}
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
          subtext="Festivals, markets, holidays"
          icon={Calendar}
          badge="Observed"
        />
        <StatCard
          label="Labelled Demand Spikes"
          value={totalSpikes}
          subtext="Simulated rainstorm / festival surges"
          icon={Zap}
          badge="Labelled"
        />
      </div>

      {/* Signal Integration Architecture Guardrail */}
      <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 flex items-start space-x-3 text-xs text-slate-300">
        <AlertCircle className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h5 className="font-semibold text-slate-100">Configurable External Signal Integration Standard</h5>
          <p className="text-slate-400 leading-relaxed">
            {weatherStatus?.message ||
              'External signals are processed through standard tabular CSV schemas. Live weather APIs (such as Open-Meteo) remain completely optional and configurable—no synthetic API responses are fabricated.'}
          </p>
        </div>
      </div>

      {/* Signals Table */}
      <Card
        title="Chronological Signals & Demand Spikes"
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
                  <th>Store</th>
                  <th>Temperature</th>
                  <th>Rainfall</th>
                  <th>Holiday Flag</th>
                  <th>Event Flag & Name</th>
                  <th>Simulated Spike Classification</th>
                </tr>
              </thead>
              <tbody>
                {displayedSignals.map((item, idx) => {
                  const hasSpike = item.spike_label && item.spike_label !== 'Baseline';
                  const storeName =
                    meta?.stores.find((s) => s.store_id === item.store_id)?.name || item.store_id;

                  return (
                    <tr key={idx}>
                      <td className="font-mono text-xs text-slate-200">{item.date}</td>
                      <td className="text-xs text-slate-300">
                        {storeName} <span className="font-mono text-slate-400 text-[10px]">({item.store_id})</span>
                      </td>
                      <td className="font-mono text-xs">
                        {item.temperature !== null && item.temperature !== undefined ? (
                          <span className={item.temperature < 15 ? 'text-sky-400' : 'text-amber-400'}>
                            {item.temperature.toFixed(1)}°C
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="font-mono text-xs">
                        {item.rainfall !== null && item.rainfall !== undefined ? (
                          <span className={item.rainfall > 10 ? 'text-sky-400 font-semibold' : 'text-slate-300'}>
                            {item.rainfall.toFixed(1)} mm
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        {item.holiday_flag ? (
                          <Badge variant="teal" size="sm">
                            Holiday
                          </Badge>
                        ) : (
                          <span className="text-slate-400 text-xs">No</span>
                        )}
                      </td>
                      <td>
                        {item.event_flag ? (
                          <div className="flex items-center space-x-1.5">
                            <Badge variant="info" size="sm">
                              {item.event_name || 'Event Active'}
                            </Badge>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">None</span>
                        )}
                      </td>
                      <td>
                        {hasSpike ? (
                          <Badge variant="warning" size="sm">
                            <Zap className="w-3 h-3 mr-1 text-amber-400" />
                            {item.spike_label}
                          </Badge>
                        ) : (
                          <span className="text-slate-400 text-xs font-mono">Baseline</span>
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
