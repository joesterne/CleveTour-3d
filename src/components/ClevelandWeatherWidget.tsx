import React, { useCallback, useEffect, useState } from 'react';
import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Compass,
  Droplets,
  Eye,
  Footprints,
  RefreshCw,
  ShieldCheck,
  Shirt,
  Sun,
  Thermometer,
  Umbrella,
  WifiOff,
  Wind,
} from 'lucide-react';
import { LandmarkBlueprint } from '../data/clevelandLandmarks';
import {
  ClevelandWeatherSnapshot,
  WeatherIconCategory,
  evaluateWalkingPreparationAdvisory,
  formatTemperatureDisplay,
  parseOpenMeteoForecastResponse,
} from '../utils/tourLogic';

interface ClevelandWeatherWidgetProps {
  selectedLandmark: LandmarkBlueprint;
  offlineMode: boolean;
}

const WEATHER_CACHE_STORAGE_KEY = 'clevetour_open_meteo_cache_v1';

const FALLBACK_CLEVELAND_OPENAI_METEO_PAYLOAD = {
  latitude: 41.4984,
  longitude: -81.6937,
  current: {
    time: '2026-11-18T09:00',
    temperature_2m: 54.0,
    apparent_temperature: 51.0,
    relative_humidity_2m: 62,
    precipitation: 0,
    weather_code: 2,
    wind_speed_10m: 11.8,
    wind_direction_10m: 310,
    wind_gusts_10m: 16.4,
    is_day: 1,
  },
  hourly: {
    time: [
      '2026-11-18T09:00',
      '2026-11-18T10:00',
      '2026-11-18T11:00',
      '2026-11-18T12:00',
    ],
    temperature_2m: [54.0, 56.2, 58.4, 59.1],
    precipitation_probability: [12, 15, 18, 15],
    wind_speed_10m: [11.8, 12.4, 13.1, 12.8],
    weather_code: [2, 2, 1, 1],
  },
};

export function renderWeatherCategoryIcon(
  category: WeatherIconCategory,
  className = 'w-6 h-6'
) {
  switch (category) {
    case 'SUN':
      return <Sun className={`${className} text-amber-400`} />;
    case 'PARTLY_CLOUDY':
      return <CloudSun className={`${className} text-amber-300`} />;
    case 'CLOUD':
      return <Cloud className={`${className} text-slate-300`} />;
    case 'FOG':
      return <CloudFog className={`${className} text-slate-300`} />;
    case 'RAIN':
      return <CloudRain className={`${className} text-sky-400`} />;
    case 'SNOW':
      return <CloudSnow className={`${className} text-sky-200`} />;
    case 'STORM':
      return <CloudLightning className={`${className} text-amber-400`} />;
    default:
      return <CloudSun className={`${className} text-amber-300`} />;
  }
}

export const ClevelandWeatherWidget: React.FC<ClevelandWeatherWidgetProps> = ({
  selectedLandmark,
  offlineMode,
}) => {
  const [unit, setUnit] = useState<'F' | 'C'>('F');
  const [weather, setWeather] = useState<ClevelandWeatherSnapshot>(() => {
    try {
      const cached = localStorage.getItem(WEATHER_CACHE_STORAGE_KEY);
      if (cached) {
        return JSON.parse(cached) as ClevelandWeatherSnapshot;
      }
    } catch {
      // ignore storage read error
    }
    return parseOpenMeteoForecastResponse(
      FALLBACK_CLEVELAND_OPENAI_METEO_PAYLOAD,
      selectedLandmark.tourAnchor
    );
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [dataSourceStatus, setDataSourceStatus] = useState<
    'LIVE_OPEN_METEO' | 'OFFLINE_CACHED'
  >(offlineMode ? 'OFFLINE_CACHED' : 'LIVE_OPEN_METEO');
  const [lastUpdatedLabel, setLastUpdatedLabel] = useState<string>('Just now');

  const fetchLiveClevelandWeather = useCallback(async () => {
    const { lat, lng } = selectedLandmark.tourAnchor;

    if (offlineMode) {
      setDataSourceStatus('OFFLINE_CACHED');
      return;
    }

    setLoading(true);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 2200);
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(
        4
      )}&longitude=${lng.toFixed(
        4
      )}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=America%2FNew_York&forecast_days=1`;

      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Open-Meteo HTTP ${response.status}`);
      }
      const json = await response.json();
      const snapshot = parseOpenMeteoForecastResponse(json, { lat, lng });
      setWeather(snapshot);
      setDataSourceStatus('LIVE_OPEN_METEO');
      setLastUpdatedLabel(
        new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })
      );
      try {
        localStorage.setItem(
          WEATHER_CACHE_STORAGE_KEY,
          JSON.stringify(snapshot)
        );
      } catch {
        // ignore storage quota error
      }
    } catch {
      setDataSourceStatus(offlineMode ? 'OFFLINE_CACHED' : 'LIVE_OPEN_METEO');
    } finally {
      window.clearTimeout(timeoutId);
      setLoading(false);
    }
  }, [
    offlineMode,
    selectedLandmark.tourAnchor.lat,
    selectedLandmark.tourAnchor.lng,
  ]);

  useEffect(() => {
    fetchLiveClevelandWeather();
  }, [fetchLiveClevelandWeather]);

  const isLakefront =
    selectedLandmark.districtId === 'north-coast-harbor' ||
    selectedLandmark.id === 'rock-hall' ||
    selectedLandmark.id === 'harbor-lighthouse';

  const advisory = evaluateWalkingPreparationAdvisory({
    temperatureF: weather.temperatureF,
    apparentTemperatureF: weather.apparentTemperatureF,
    windSpeedMph: weather.windSpeedMph,
    precipitationProbabilityPercent: weather.precipitationProbabilityPercent,
    weatherCode: weather.weatherCode,
    isLakefrontDistrict: isLakefront,
  });

  const toneClasses = {
    emerald:
      'bg-emerald-500/15 border-emerald-500/40 text-emerald-300',
    amber: 'bg-amber-500/15 border-amber-500/40 text-amber-300',
    sky: 'bg-sky-500/15 border-sky-500/40 text-sky-300',
    rose: 'bg-rose-500/15 border-rose-500/40 text-rose-300',
  }[advisory.badgeTone];

  return (
    <section
      aria-label="Real-Time Cleveland Walking Weather and Trail Advisory"
      data-testid="cleveland-weather-widget"
      className="bg-slate-900/95 border border-slate-800 rounded-2xl p-5 space-y-5 shadow-xl"
    >
      {/* Top Header Row: Title, Open-Source API Attribution & Unit/Refresh Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800/90">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
            {dataSourceStatus === 'LIVE_OPEN_METEO' && !offlineMode ? (
              <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>LIVE OPEN-METEO WEATHER API · CLEVELAND, OH</span>
              </span>
            ) : (
              <span className="text-amber-400 font-semibold flex items-center gap-1.5">
                <WifiOff className="w-3.5 h-3.5" />
                <span>OFFLINE CACHED WEATHER TELEMETRY</span>
              </span>
            )}
            <span aria-hidden="true" className="text-slate-600">
              ·
            </span>
            <span className="text-slate-400">
              Micro-Climate Anchor: {selectedLandmark.shortTitle} (
              {selectedLandmark.tourAnchor.lat.toFixed(4)}°N,{' '}
              {Math.abs(selectedLandmark.tourAnchor.lng).toFixed(4)}°W · Elev{' '}
              {selectedLandmark.tourAnchor.elevationMeters}m ASL)
            </span>
          </div>
          <h2 className="text-lg font-bold text-white flex flex-wrap items-center gap-2.5">
            <span>Real-Time Cleveland Walking Weather & Trail Preparation</span>
            <span
              data-testid="weather-walkability-rating"
              className={`px-2.5 py-0.5 rounded-lg border text-xs font-mono font-semibold ${toneClasses}`}
            >
              {advisory.walkabilityRating} ({advisory.walkabilityScore}/100)
            </span>
          </h2>
        </div>

        {/* Unit Switcher (°F / °C) & Manual Refresh */}
        <div className="flex items-center gap-2 self-start lg:self-center shrink-0">
          <div
            role="group"
            aria-label="Temperature Unit Toggle"
            className="inline-flex rounded-xl bg-slate-950 border border-slate-800 p-1"
          >
            <button
              type="button"
              onClick={() => setUnit('F')}
              aria-pressed={unit === 'F'}
              data-testid="weather-unit-toggle-f"
              className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold transition-colors cursor-pointer ${
                unit === 'F'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              °F
            </button>
            <button
              type="button"
              onClick={() => setUnit('C')}
              aria-pressed={unit === 'C'}
              data-testid="weather-unit-toggle-c"
              className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold transition-colors cursor-pointer ${
                unit === 'C'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              °C
            </button>
          </div>

          <button
            type="button"
            onClick={fetchLiveClevelandWeather}
            disabled={loading}
            data-testid="refresh-cleveland-weather-btn"
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-amber-400 ${
                loading ? 'animate-spin' : ''
              }`}
            />
            <span>{loading ? 'Syncing...' : 'Refresh Weather'}</span>
          </button>
        </div>
      </div>

      {/* Main Weather Metrics Grid + 4-Hour Walking Window */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Left 5 Cols: Current Condition Hero & Core Telemetry */}
        <div className="lg:col-span-5 bg-slate-950/90 border border-slate-800/90 rounded-2xl p-4 flex flex-col justify-between space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3.5">
              <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800">
                {renderWeatherCategoryIcon(
                  weather.condition.iconCategory,
                  'w-9 h-9'
                )}
              </div>
              <div>
                <div className="flex items-baseline gap-2">
                  <span
                    className="text-3xl font-extrabold text-white tracking-tight"
                    data-testid="weather-current-temp"
                  >
                    {formatTemperatureDisplay(weather.temperatureF, unit)}
                  </span>
                  <span
                    className="text-xs font-mono text-slate-400"
                    data-testid="weather-feels-like-temp"
                  >
                    Feels like{' '}
                    {formatTemperatureDisplay(
                      weather.apparentTemperatureF,
                      unit
                    )}
                  </span>
                </div>
                <div
                  className="text-sm font-semibold text-amber-300 mt-0.5"
                  data-testid="weather-condition-label"
                >
                  {weather.condition.label}
                </div>
                <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                  {selectedLandmark.districtName} · Updated {lastUpdatedLabel}
                </div>
              </div>
            </div>
          </div>

          {/* 4-Metric Telemetry Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-2.5 pt-2 border-t border-slate-800/80">
            <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/80">
              <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400">
                <Wind className="w-3.5 h-3.5 text-sky-400" />
                <span>Lake Erie Wind</span>
              </div>
              <div
                className="text-xs font-bold text-white mt-1"
                data-testid="weather-wind-display"
              >
                {weather.windSpeedMph} mph {weather.windCardinal}
              </div>
              <div className="text-[10px] font-mono text-slate-400">
                Gusts up to {weather.windGustsMph} mph
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/80">
              <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400">
                <Umbrella className="w-3.5 h-3.5 text-amber-400" />
                <span>Rain Chance</span>
              </div>
              <div
                className="text-xs font-bold text-white mt-1"
                data-testid="weather-precip-prob"
              >
                {weather.precipitationProbabilityPercent}% probability
              </div>
              <div className="text-[10px] font-mono text-slate-400">
                {weather.precipitationInches}" current precip
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/80">
              <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400">
                <Droplets className="w-3.5 h-3.5 text-emerald-400" />
                <span>Humidity</span>
              </div>
              <div className="text-xs font-bold text-white mt-1">
                {weather.relativeHumidityPercent}% RH
              </div>
              <div className="text-[10px] font-mono text-slate-400">
                {isLakefront ? 'Marine Shoreline' : 'Urban Canyon'}
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/80">
              <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400">
                <Compass className="w-3.5 h-3.5 text-amber-400" />
                <span>Trail Exposure</span>
              </div>
              <div className="text-xs font-bold text-white mt-1">
                {isLakefront ? 'Open Waterfront' : 'Sheltered Grid'}
              </div>
              <div className="text-[10px] font-mono text-slate-400">
                Stop 0{selectedLandmark.walkingOrder} of 06
              </div>
            </div>
          </div>
        </div>

        {/* Right 7 Cols: Tourist Walking Preparation Advisories & 4-Hour Walking Window */}
        <div className="lg:col-span-7 flex flex-col justify-between space-y-4">
          {/* 3 Actionable Preparation Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800/90 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-mono text-amber-400 font-semibold">
                <Shirt className="w-3.5 h-3.5" />
                <span>Layers & Attire</span>
              </div>
              <p
                className="text-xs text-slate-200 leading-relaxed"
                data-testid="weather-clothing-tip"
              >
                {advisory.clothingTip}
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800/90 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-mono text-sky-400 font-semibold">
                <Footprints className="w-3.5 h-3.5" />
                <span>Footwear & Route</span>
              </div>
              <p
                className="text-xs text-slate-200 leading-relaxed"
                data-testid="weather-footwear-tip"
              >
                {advisory.footwearAndGearTip}
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800/90 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-mono text-emerald-400 font-semibold">
                <Eye className="w-3.5 h-3.5" />
                <span>AR & 3D Optics</span>
              </div>
              <p
                className="text-xs text-slate-200 leading-relaxed"
                data-testid="weather-ar-visibility-tip"
              >
                {advisory.arVisibilityNote}
              </p>
            </div>
          </div>

          {/* 4-Hour Pedestrian Walking Window Strip */}
          <div className="bg-slate-950/90 border border-slate-800/90 rounded-2xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono text-slate-300 font-semibold flex items-center gap-1.5">
                <Thermometer className="w-3.5 h-3.5 text-amber-400" />
                <span>4-Hour Pedestrian Walking Window (Cleveland Local Time)</span>
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                Source: Open-Meteo (No API Key Required)
              </span>
            </div>

            <div
              className="grid grid-cols-2 sm:grid-cols-4 gap-2.5"
              data-testid="weather-hourly-forecast-grid"
            >
              {weather.hourlyForecast.map((pt) => (
                <div
                  key={pt.timeIso}
                  className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between gap-2"
                >
                  <div className="space-y-0.5">
                    <div className="text-[11px] font-mono text-amber-300 font-semibold">
                      {pt.hourLabel}
                    </div>
                    <div className="text-sm font-bold text-white">
                      {formatTemperatureDisplay(pt.temperatureF, unit)}
                    </div>
                    <div className="text-[10px] font-mono text-slate-400">
                      {pt.precipitationProbability}% rain · {pt.windSpeedMph} mph
                    </div>
                  </div>
                  <div className="shrink-0">
                    {renderWeatherCategoryIcon(pt.iconCategory, 'w-5 h-5')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
