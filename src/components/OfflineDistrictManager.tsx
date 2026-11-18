import React, { useState } from 'react';
import {
  LandmarkBlueprint,
  OfflineDistrictPack,
} from '../data/clevelandLandmarks';
import {
  calculateOfflinePackStats,
  generateViroReactSceneCode,
} from '../utils/tourLogic';
import {
  Check,
  Code2,
  Copy,
  Download,
  HardDrive,
  Smartphone,
  Trash2,
  Wifi,
  WifiOff,
} from 'lucide-react';

interface OfflineDistrictManagerProps {
  packs: OfflineDistrictPack[];
  landmarks: LandmarkBlueprint[];
  downloadedPackIds: string[];
  onDownloadPack: (packId: string) => void;
  onRemovePack: (packId: string) => void;
  onDownloadAllPacks: () => void;
  offlineMode: boolean;
  onToggleOfflineMode: () => void;
  selectedLandmark: LandmarkBlueprint;
  onSelectLandmark: (landmark: LandmarkBlueprint) => void;
}

export const OfflineDistrictManager: React.FC<OfflineDistrictManagerProps> = ({
  packs,
  landmarks,
  downloadedPackIds,
  onDownloadPack,
  onRemovePack,
  onDownloadAllPacks,
  offlineMode,
  onToggleOfflineMode,
  selectedLandmark,
  onSelectLandmark,
}) => {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  const stats = calculateOfflinePackStats(
    packs,
    downloadedPackIds,
    landmarks.length
  );

  const viroCode = generateViroReactSceneCode(selectedLandmark);

  const handleSimulatedDownload = (packId: string) => {
    setDownloadingId(packId);
    setTimeout(() => {
      onDownloadPack(packId);
      setDownloadingId(null);
    }, 320);
  };

  const handleCopyViroCode = async () => {
    try {
      await navigator.clipboard.writeText(viroCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleDownloadViroFile = () => {
    const blob = new Blob([viroCode], { type: 'text/typescript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedLandmark.slug}-viro-ar-scene.tsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      {/* Top Summary Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <div className="text-xs font-mono text-amber-400">
            Offline Accessibility · Zero Mobile Data Required
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">
            Offline Map & 3D Landmark District Packs
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            Download Cleveland pedestrian vector corridors, multi-part 3D landmark meshes, and archival AR historical overlays directly to local device storage for uninterrupted exploration without cellular data.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onToggleOfflineMode}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 ${
              offlineMode
                ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
            }`}
          >
            {offlineMode ? (
              <>
                <WifiOff className="w-4 h-4" />
                <span>Offline Simulation: ACTIVE</span>
              </>
            ) : (
              <>
                <Wifi className="w-4 h-4 text-sky-400" />
                <span>Test Offline Mode</span>
              </>
            )}
          </button>

          {stats.coveragePercent < 100 && (
            <button
              type="button"
              onClick={onDownloadAllPacks}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-4 h-4" />
              <span>Download All Districts ({stats.totalAvailableMb} MB)</span>
            </button>
          )}
        </div>
      </div>

      {/* Storage & Coverage Telemetry Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
          <div className="text-xs font-mono text-slate-400">Local Cache Footprint</div>
          <div className="text-2xl font-bold font-mono text-white mt-1">
            {stats.downloadedMb} MB{' '}
            <span className="text-sm font-normal text-slate-400">
              / {stats.totalAvailableMb} MB
            </span>
          </div>
          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden mt-3">
            <div
              className="h-full bg-amber-500 transition-all duration-300"
              style={{
                width: `${Math.min(
                  100,
                  Math.round((stats.downloadedMb / stats.totalAvailableMb) * 100)
                )}%`,
              }}
            />
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
          <div className="text-xs font-mono text-slate-400">Offline Landmark Coverage</div>
          <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">
            {stats.offlineLandmarksCovered} of {landmarks.length} Stops ({stats.coveragePercent}%)
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Includes 3D geometry, Berea sandstone textures & AR timeline nodes.
          </p>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
          <div className="text-xs font-mono text-slate-400">Connection Status</div>
          <div className="text-lg font-bold text-white mt-1 flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-sky-400" />
            <span>
              {offlineMode
                ? 'Air-Gapped Offline Bundle'
                : 'Hybrid Online + Local Cache'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Walking bearings & proximity geofences run 100% on-device.
          </p>
        </div>
      </div>

      {/* District Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {packs.map((pack) => {
          const isDownloaded = downloadedPackIds.includes(pack.id);
          const isBusy = downloadingId === pack.id;
          const totalPackMb = (
            pack.vectorTilesMb +
            pack.meshes3DMb +
            pack.arAudioFactsMb
          ).toFixed(1);
          const packLandmarks = landmarks.filter((l) =>
            pack.landmarkIds.includes(l.id)
          );

          return (
            <div
              key={pack.id}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between gap-4"
            >
              <div>
                <div className="flex items-center justify-between gap-2 text-xs font-mono text-slate-400">
                  <span>{pack.boundsDescription}</span>
                  <span
                    className={
                      isDownloaded ? 'text-emerald-400 font-semibold' : 'text-amber-400'
                    }
                  >
                    {isDownloaded ? 'Cached Offline' : `${totalPackMb} MB`}
                  </span>
                </div>

                <h3 className="text-lg font-bold text-white mt-1.5">{pack.name}</h3>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  {pack.corridorSummary}
                </p>

                {/* Asset Breakdown */}
                <div className="mt-4 pt-3 border-t border-slate-800 space-y-1.5 text-xs font-mono text-slate-300">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Vector Walking Tiles:</span>
                    <span>{pack.vectorTilesMb} MB</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">3D Landmark Meshes:</span>
                    <span>{pack.meshes3DMb} MB</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">AR Historical Facts & Audio:</span>
                    <span>{pack.arAudioFactsMb} MB</span>
                  </div>
                </div>

                {/* Landmarks in Pack */}
                <div className="mt-4 pt-3 border-t border-slate-800">
                  <div className="text-[11px] font-mono text-slate-400 mb-2">
                    Included Landmarks:
                  </div>
                  <div className="space-y-1.5">
                    {packLandmarks.map((lm) => (
                      <div
                        key={lm.id}
                        className="text-xs text-slate-200 flex items-center justify-between"
                      >
                        <span>
                          0{lm.walkingOrder}. {lm.shortTitle}
                        </span>
                        <span className="font-mono text-slate-400">
                          {lm.arFacts.length} AR facts
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-2">
                {isDownloaded ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 py-2 px-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center justify-center gap-1.5">
                      <Check className="w-4 h-4" />
                      <span>Ready for Offline Walk</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemovePack(pack.id)}
                      aria-label={`Remove ${pack.name} offline cache`}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border border-slate-700 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleSimulatedDownload(pack.id)}
                    className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>
                      {isBusy
                        ? 'Caching Vector & 3D Assets...'
                        : `Download Offline Pack (${totalPackMb} MB)`}
                    </span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* React Native + ViroReact Cross-Platform Deployment Code Exporter */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-sky-400">
              <Smartphone className="w-4 h-4" />
              <span>React Native + ViroReact (@reactvision/react-viro) Cross-Platform Bridge</span>
            </div>
            <h3 className="text-lg font-bold text-white mt-1">
              Native iOS / Android AR Scene Exporter — {selectedLandmark.shortTitle}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Export ready-to-compile ViroARSceneNavigator and GPS-anchored ViroNode overlays for mobile deployment.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Select landmark for ViroReact code generation"
              value={selectedLandmark.id}
              onChange={(e) => {
                const found = landmarks.find((l) => l.id === e.target.value);
                if (found) onSelectLandmark(found);
              }}
              className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2"
            >
              {landmarks.map((lm) => (
                <option key={lm.id} value={lm.id}>
                  0{lm.walkingOrder}. {lm.shortTitle}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleCopyViroCode}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-colors whitespace-nowrap shrink-0"
            >
              {copiedCode ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied TSX</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy ViroReact Code</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleDownloadViroFile}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs transition-colors whitespace-nowrap shrink-0"
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>Export .tsx File</span>
            </button>
          </div>
        </div>

        <pre className="p-5 bg-slate-950 text-xs font-mono text-slate-200 overflow-x-auto max-h-[360px] leading-relaxed">
          <code>{viroCode}</code>
        </pre>
      </div>
    </div>
  );
};
