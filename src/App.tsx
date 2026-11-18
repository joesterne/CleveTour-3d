import React, { useEffect, useState, useCallback } from 'react';
import {
  ARHistoricalFact,
  CLEVELAND_LANDMARKS,
  CLEVELAND_PASSPORT_BADGES,
  HERO_SKYLINE_IMAGE,
  LandmarkBlueprint,
  OFFLINE_DISTRICT_PACKS,
  PassportBadgeDefinition,
} from './data/clevelandLandmarks';
import {
  GeoPoint,
  LandmarkNarrationPayload,
  ProximityNotification,
  buildLandmarkNarrationScript,
  calculateCompassBearing,
  calculateHaversineDistanceMeters,
  calculateOfflinePackStats,
  detectNewlyUnlockedBadges,
  estimateWalkingMinutes,
  evaluatePassportBadges,
  evaluateProximityGeofences,
  interpolateTrailPosition,
} from './utils/tourLogic';
import { Cleveland3DViewport } from './components/Cleveland3DViewport';
import {
  ClevelandWalkingMap,
  LiveGooglePlaceInfo,
} from './components/ClevelandWalkingMap';
import { OfflineDistrictManager } from './components/OfflineDistrictManager';
import {
  SharedDiscoveryPost,
  TouristProfileAndShare,
} from './components/TouristProfileAndShare';
import { ClevelandWeatherWidget } from './components/ClevelandWeatherWidget';
import {
  Award,
  Bell,
  BellRing,
  Compass,
  ExternalLink,
  Footprints,
  Heart,
  MapPin,
  Navigation,
  Share2,
  Sparkles,
  Star,
  User,
  Volume2,
  VolumeX,
  WifiOff,
  X,
} from 'lucide-react';

type ActiveSection = 'TOUR_3D' | 'WALKING_GUIDE' | 'OFFLINE_PACKS' | 'PROFILE_SHARE';

const INITIAL_SHARED_POSTS: SharedDiscoveryPost[] = [
  {
    id: 'seed-post-1',
    explorerName: 'Elena R.',
    landmarkId: 'guardians-of-traffic',
    landmarkTitle: 'Guardians of Traffic',
    districtName: 'Cuyahoga Valley & Hope Bridge',
    factTitle: 'Eight Titans of Progress in Transportation',
    factEra: '1932 Berea Stone Carving',
    personalNote:
      'Walked across the Lorain-Carnegie promenade at golden hour. Pointing the AR lens at the Berea sandstone pylons revealed how 35 stonecutters carved each vehicle by hand!',
    coordinatesLabel: '41.4888°N, 81.6958°W',
    sharedAtLabel: '18 mins ago',
    heroImage: HERO_SKYLINE_IMAGE,
  },
  {
    id: 'seed-post-2',
    explorerName: 'Marcus T.',
    landmarkId: 'the-arcade',
    landmarkTitle: 'The Arcade Cleveland',
    districtName: 'Historic Euclid Corridor',
    factTitle: '300-Foot Span of Wrought Iron & Glass',
    factEra: '1890 Skylight Truss',
    personalNote:
      'Downloaded the Downtown Offline Pack before entering the 1890 iron-and-glass atrium. Zero cell signal needed and the 3D vaulted skylight model matched every balcony tier.',
    coordinatesLabel: '41.4998°N, 81.6902°W',
    sharedAtLabel: '1 hour ago',
    heroImage: HERO_SKYLINE_IMAGE,
  },
];

export default function App() {
  // Mandatory Tier 1/2 Google Maps Platform Demo Key Quota Banner State
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);

  useEffect(() => {
    const handleQuota = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', handleQuota);
  }, []);

  // Navigation & Primary View State
  const [activeSection, setActiveSection] = useState<ActiveSection>('TOUR_3D');
  const [selectedLandmark, setSelectedLandmark] = useState<LandmarkBlueprint>(
    CLEVELAND_LANDMARKS[0]
  );
  const [selectedFact, setSelectedFact] = useState<ARHistoricalFact | null>(
    CLEVELAND_LANDMARKS[0].arFacts[0]
  );
  const [arLensActive, setArLensActive] = useState(true);
  const [eraMaxYear, setEraMaxYear] = useState<number>(2026);
  const [factCategory, setFactCategory] = useState<string>('ALL');

  // Persisted Tourist State (Favorites, Visited Stamps, Offline Packs, Explorer Name)
  const [explorerName, setExplorerName] = useState<string>(() => {
    return localStorage.getItem('clevetour_explorer_name') || 'Alex Mercer';
  });

  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('clevetour_favorites');
      return saved ? JSON.parse(saved) : ['terminal-tower', 'guardians-of-traffic'];
    } catch {
      return ['terminal-tower', 'guardians-of-traffic'];
    }
  });

  const [visitedIds, setVisitedIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('clevetour_visited');
      return saved ? JSON.parse(saved) : ['terminal-tower'];
    } catch {
      return ['terminal-tower'];
    }
  });

  const [downloadedPackIds, setDownloadedPackIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('clevetour_offline_packs');
      return saved ? JSON.parse(saved) : ['downtown-public-square'];
    } catch {
      return ['downtown-public-square'];
    }
  });

  const [fieldNotes, setFieldNotes] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('clevetour_field_notes');
      return saved
        ? JSON.parse(saved)
        : {
            'terminal-tower':
              'Observation deck sightline looks straight out to the 1911 West Pierhead Lighthouse.',
          };
    } catch {
      return {};
    }
  });

  const [sharedPosts, setSharedPosts] = useState<SharedDiscoveryPost[]>(() => {
    try {
      const saved = localStorage.getItem('clevetour_shared_posts');
      return saved ? JSON.parse(saved) : INITIAL_SHARED_POSTS;
    } catch {
      return INITIAL_SHARED_POSTS;
    }
  });

  const [offlineMode, setOfflineMode] = useState(false);
  const [livePlacesById, setLivePlacesById] = useState<
    Record<string, LiveGooglePlaceInfo>
  >({});

  const handlePlaceLoaded = useCallback(
    (landmarkId: string, info: LiveGooglePlaceInfo) => {
      setLivePlacesById((prev) => ({ ...prev, [landmarkId]: info }));
    },
    []
  );

  // Sync persisted state to localStorage
  useEffect(() => {
    localStorage.setItem('clevetour_explorer_name', explorerName);
  }, [explorerName]);

  useEffect(() => {
    localStorage.setItem('clevetour_favorites', JSON.stringify(favoriteIds));
  }, [favoriteIds]);

  useEffect(() => {
    localStorage.setItem('clevetour_visited', JSON.stringify(visitedIds));
  }, [visitedIds]);

  useEffect(() => {
    localStorage.setItem(
      'clevetour_offline_packs',
      JSON.stringify(downloadedPackIds)
    );
  }, [downloadedPackIds]);

  useEffect(() => {
    localStorage.setItem('clevetour_field_notes', JSON.stringify(fieldNotes));
  }, [fieldNotes]);

  useEffect(() => {
    localStorage.setItem('clevetour_shared_posts', JSON.stringify(sharedPosts));
  }, [sharedPosts]);

  // Foot-Traffic Walking Position & Geofence Push Notification State
  const [trailProgress, setTrailProgress] = useState<number>(0);
  const [walkerPosition, setWalkerPosition] = useState<GeoPoint>(
    CLEVELAND_LANDMARKS[0].tourAnchor
  );
  const [notifiedLandmarkIds, setNotifiedLandmarkIds] = useState<string[]>([
    'terminal-tower',
  ]);
  const [activePushBanner, setActivePushBanner] =
    useState<ProximityNotification | null>(null);
  const [notificationHistory, setNotificationHistory] = useState<
    ProximityNotification[]
  >([
    {
      id: 'notif-init-tt',
      landmarkId: 'terminal-tower',
      landmarkTitle: 'Terminal Tower',
      distanceMeters: 18,
      headlineFact: CLEVELAND_LANDMARKS[0].arFacts[0],
      triggeredAtIso: new Date().toISOString(),
    },
  ]);

  const [shareModalTarget, setShareModalTarget] = useState<{
    landmark: LandmarkBlueprint;
    fact?: ARHistoricalFact | null;
  } | null>(null);

  const [newlyUnlockedBadgeBanner, setNewlyUnlockedBadgeBanner] =
    useState<PassportBadgeDefinition | null>(null);

  // Evaluate proximity geofence whenever walkerPosition updates
  useEffect(() => {
    const newAlerts = evaluateProximityGeofences(
      walkerPosition,
      CLEVELAND_LANDMARKS,
      notifiedLandmarkIds,
      180
    );

    if (newAlerts.length > 0) {
      const topAlert = newAlerts[0];
      setNotifiedLandmarkIds((prev) => [
        ...prev,
        ...newAlerts.map((a) => a.landmarkId),
      ]);
      setActivePushBanner(topAlert);
      setNotificationHistory((prev) => [...newAlerts, ...prev]);

      // Automatically stamp visited passport when entering landmark geofence & check for district sticker unlock
      setVisitedIds((prev) => {
        if (prev.includes(topAlert.landmarkId)) return prev;
        const nextVisited = [...prev, topAlert.landmarkId];
        const unlocked = detectNewlyUnlockedBadges(
          prev,
          nextVisited,
          CLEVELAND_LANDMARKS,
          CLEVELAND_PASSPORT_BADGES
        );
        if (unlocked.length > 0) {
          setNewlyUnlockedBadgeBanner(unlocked[unlocked.length - 1]);
        }
        return nextVisited;
      });

      // Fire native browser Notification if granted
      if (
        'Notification' in window &&
        Notification.permission === 'granted'
      ) {
        try {
          new Notification(
            `Nearby Historical Landmark (${topAlert.distanceMeters}m): ${topAlert.landmarkTitle}`,
            {
              body: `${topAlert.headlineFact.eraLabel} — ${topAlert.headlineFact.title}`,
            }
          );
        } catch {
          // Ignore in restricted iframe
        }
      }
    }
  }, [walkerPosition, notifiedLandmarkIds]);

  // Step walker to next landmark along the Cleveland walking trail
  const handleAdvanceWalkStep = useCallback(() => {
    const nextIdx = ( Math.round(trailProgress) + 1 ) % CLEVELAND_LANDMARKS.length;
    const nextLm = CLEVELAND_LANDMARKS[nextIdx];
    setTrailProgress(nextIdx);
    setWalkerPosition(nextLm.tourAnchor);
    setSelectedLandmark(nextLm);
    setSelectedFact(nextLm.arFacts[0] || null);
    // Allow re-triggering proximity alert if stepping intentionally
    setNotifiedLandmarkIds((prev) => prev.filter((id) => id !== nextLm.id));
  }, [trailProgress]);

  const handleStepWalkerToLandmark = useCallback((lm: LandmarkBlueprint) => {
    const idx = CLEVELAND_LANDMARKS.findIndex((item) => item.id === lm.id);
    if (idx >= 0) setTrailProgress(idx);
    setWalkerPosition(lm.tourAnchor);
    setSelectedLandmark(lm);
    setSelectedFact(lm.arFacts[0] || null);
    setNotifiedLandmarkIds((prev) => prev.filter((id) => id !== lm.id));
  }, []);

  const handleTrailSliderChange = (val: number) => {
    setTrailProgress(val);
    const interp = interpolateTrailPosition(CLEVELAND_LANDMARKS, val);
    setWalkerPosition(interp.position);
    const nearest = CLEVELAND_LANDMARKS.find(
      (l) => l.id === interp.nearestLandmarkId
    );
    if (nearest && nearest.id !== selectedLandmark.id) {
      setSelectedLandmark(nearest);
      setSelectedFact(nearest.arFacts[0] || null);
    }
  };

  const handleRequestDeviceGps = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setWalkerPosition({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        });
      },
      () => {
        // If GPS denied or outside Cleveland, step along the Cleveland walking path
        handleAdvanceWalkStep();
      }
    );
  };

  const toggleFavorite = useCallback((landmarkId: string) => {
    setFavoriteIds((prev) =>
      prev.includes(landmarkId)
        ? prev.filter((id) => id !== landmarkId)
        : [...prev, landmarkId]
    );
  }, []);

  const toggleVisited = useCallback((landmarkId: string) => {
    setVisitedIds((prev) => {
      const nextVisited = prev.includes(landmarkId)
        ? prev.filter((id) => id !== landmarkId)
        : [...prev, landmarkId];
      const unlocked = detectNewlyUnlockedBadges(
        prev,
        nextVisited,
        CLEVELAND_LANDMARKS,
        CLEVELAND_PASSPORT_BADGES
      );
      if (unlocked.length > 0) {
        setNewlyUnlockedBadgeBanner(unlocked[unlocked.length - 1]);
      }
      return nextVisited;
    });
  }, []);

  const handleStampMultipleVisited = useCallback((landmarkIds: string[]) => {
    setVisitedIds((prev) => {
      const merged = Array.from(new Set([...prev, ...landmarkIds]));
      const unlocked = detectNewlyUnlockedBadges(
        prev,
        merged,
        CLEVELAND_LANDMARKS,
        CLEVELAND_PASSPORT_BADGES
      );
      if (unlocked.length > 0) {
        setNewlyUnlockedBadgeBanner(unlocked[unlocked.length - 1]);
      }
      return merged;
    });
  }, []);

  const handleResetVisited = useCallback(() => {
    setVisitedIds(['terminal-tower']);
    setNewlyUnlockedBadgeBanner(null);
  }, []);

  const offlineStats = calculateOfflinePackStats(
    OFFLINE_DISTRICT_PACKS,
    downloadedPackIds,
    CLEVELAND_LANDMARKS.length
  );

  const passportProgress = evaluatePassportBadges(
    CLEVELAND_LANDMARKS,
    CLEVELAND_PASSPORT_BADGES,
    visitedIds
  );

  // Web Speech API Landmark History Narration State
  const [activeNarration, setActiveNarration] = useState<{
    payload: LandmarkNarrationPayload;
    rate: number;
    startedAt: number;
  } | null>(null);
  const [speechRate, setSpeechRate] = useState<number>(1.0);

  const handleStopLandmarkNarration = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore in restricted iframe
      }
    }
    setActiveNarration(null);
  }, []);

  const handleNarrateLandmarkHistory = useCallback(
    (
      landmark: LandmarkBlueprint,
      specificFact?: ARHistoricalFact | null,
      overrideRate?: number
    ) => {
      const targetRate = overrideRate ?? speechRate;
      const isSameTarget =
        activeNarration?.payload.landmarkId === landmark.id &&
        (activeNarration?.payload.factId || null) === (specificFact?.id || null);

      if (isSameTarget && overrideRate === undefined) {
        handleStopLandmarkNarration();
        return;
      }

      const payload = buildLandmarkNarrationScript(landmark, specificFact);
      const startedAtTimestamp = Date.now();
      setActiveNarration({
        payload,
        rate: targetRate,
        startedAt: startedAtTimestamp,
      });

      if (
        typeof window !== 'undefined' &&
        'speechSynthesis' in window &&
        'SpeechSynthesisUtterance' in window
      ) {
        try {
          window.speechSynthesis.cancel();
          const utterance = new window.SpeechSynthesisUtterance(
            payload.spokenText
          );
          utterance.rate = targetRate;
          utterance.pitch = 1.0;
          utterance.lang = 'en-US';
          utterance.onend = () => {
            // Only clear if at least 1200ms elapsed so headless environments without audio sinks don't clear immediately
            if (Date.now() - startedAtTimestamp > 1200) {
              setActiveNarration((curr) =>
                curr?.startedAt === startedAtTimestamp ? null : curr
              );
            }
          };
          window.speechSynthesis.speak(utterance);
        } catch {
          // Ignore speech error in sandboxed frame
        }
      }
    },
    [activeNarration, speechRate, handleStopLandmarkNarration]
  );

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
        } catch {
          // Ignore
        }
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#0b111e] text-slate-100 flex flex-col">
      {/* Mandatory Google Maps Platform Demo Key Quota Banner */}
      {gmpQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* Strict 3-Zone Top Bar Contract */}
      <header className="flex items-center justify-between gap-8 px-6 py-4 border-b border-slate-800/90 bg-[#0b111e]/95 sticky top-0 z-40">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveSection('TOUR_3D');
          }}
          className="text-lg font-bold tracking-tight text-white font-display whitespace-nowrap shrink-0"
        >
          CleveTour 3D
        </a>

        {/* Zone 2: 4 concise single-line navigation links */}
        <nav
          aria-label="Primary Navigation"
          className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300"
        >
          <button
            type="button"
            onClick={() => setActiveSection('TOUR_3D')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 ${
              activeSection === 'TOUR_3D'
                ? 'text-amber-400 underline underline-offset-8 decoration-2'
                : ''
            }`}
          >
            3D & AR Tour
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('WALKING_GUIDE')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 ${
              activeSection === 'WALKING_GUIDE'
                ? 'text-amber-400 underline underline-offset-8 decoration-2'
                : ''
            }`}
          >
            Walking Guide
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('OFFLINE_PACKS')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 ${
              activeSection === 'OFFLINE_PACKS'
                ? 'text-amber-400 underline underline-offset-8 decoration-2'
                : ''
            }`}
          >
            Offline Packs ({offlineStats.coveragePercent}%)
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('PROFILE_SHARE')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 ${
              activeSection === 'PROFILE_SHARE'
                ? 'text-amber-400 underline underline-offset-8 decoration-2'
                : ''
            }`}
          >
            Passport & Badges ({passportProgress.unlockedBadgesCount}/{passportProgress.totalBadgesCount})
          </button>
        </nav>

        {/* Zone 3: 1 Primary Action Button */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleAdvanceWalkStep}
            className="px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            Walk Next Stop
          </button>
        </div>
      </header>

      {/* Celebratory Passport Badge / Digital Achievement Sticker Unlocked Toast Banner */}
      {newlyUnlockedBadgeBanner && (
        <div
          role="status"
          aria-live="polite"
          data-testid="passport-badge-unlocked-banner"
          className="mx-auto max-w-7xl w-full px-4 sm:px-6 pt-4"
        >
          <div className="bg-slate-900 border border-emerald-500/70 rounded-2xl p-4 shadow-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 shrink-0">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-mono text-emerald-400">
                  Passport Badge Unlocked · {newlyUnlockedBadgeBanner.serialCode} · {newlyUnlockedBadgeBanner.districtName}
                </div>
                <div className="text-sm font-bold text-white mt-0.5">
                  Digital Achievement Sticker Earned: {newlyUnlockedBadgeBanner.stickerTitle}
                </div>
                <p className="text-xs text-slate-300 mt-0.5">
                  “{newlyUnlockedBadgeBanner.unlockedMotto}” — {newlyUnlockedBadgeBanner.rewardDescription}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {activeSection !== 'PROFILE_SHARE' && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveSection('PROFILE_SHARE');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs whitespace-nowrap"
                >
                  View Sticker in Passport
                </button>
              )}
              <button
                type="button"
                onClick={() => setNewlyUnlockedBadgeBanner(null)}
                aria-label="Dismiss badge unlocked notification"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Location-Based Proximity Push Notification Toast Banner */}
      {activePushBanner && (
        <div
          role="status"
          aria-live="polite"
          data-testid="proximity-push-notification"
          className="mx-auto max-w-7xl w-full px-4 sm:px-6 pt-4"
        >
          <div className="bg-slate-900 border border-amber-500/60 rounded-2xl p-4 shadow-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 shrink-0">
                <BellRing className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-mono text-amber-400">
                  Location Alert · {activePushBanner.distanceMeters}m Away · Geofence Triggered
                </div>
                <div className="text-sm font-bold text-white mt-0.5">
                  Approaching {activePushBanner.landmarkTitle}: {activePushBanner.headlineFact.title}
                </div>
                <p className="text-xs text-slate-300 mt-0.5 line-clamp-2">
                  {activePushBanner.headlineFact.narrative}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  const lm = CLEVELAND_LANDMARKS.find(
                    (l) => l.id === activePushBanner.landmarkId
                  );
                  if (lm) {
                    setSelectedLandmark(lm);
                    setSelectedFact(activePushBanner.headlineFact);
                    setArLensActive(true);
                    setActiveSection('TOUR_3D');
                  }
                  setActivePushBanner(null);
                }}
                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs whitespace-nowrap"
              >
                Open AR Fact
              </button>
              <button
                type="button"
                onClick={() => toggleFavorite(activePushBanner.landmarkId)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium whitespace-nowrap"
              >
                {favoriteIds.includes(activePushBanner.landmarkId)
                  ? 'Saved'
                  : 'Save Spot'}
              </button>
              <button
                type="button"
                onClick={() => setActivePushBanner(null)}
                aria-label="Dismiss proximity notification"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Web Speech API Walking Audio Narration Player Bar */}
      {activeNarration && (
        <div
          role="region"
          aria-label="Active Landmark History Speech Narration"
          data-testid="active-speech-narration-bar"
          className="mx-auto max-w-7xl w-full px-4 sm:px-6 pt-4"
        >
          <div className="bg-slate-900 border border-sky-500/70 rounded-2xl p-4 shadow-2xl space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-sky-500/20 text-sky-300 shrink-0">
                  <Volume2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-mono text-sky-400">
                    Web Speech API Narration Active · ~{activeNarration.payload.estimatedDurationSeconds}s Audio · {activeNarration.rate}x Pace
                  </div>
                  <div className="text-sm font-bold text-white mt-0.5">
                    Narrating Aloud: {activeNarration.payload.landmarkTitle}
                    {activeNarration.payload.factTitle
                      ? ` — ${activeNarration.payload.factTitle}`
                      : ` (${activeNarration.payload.factCount} Historical Facts & Walking Cue)`}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg">
                  {[0.9, 1.0, 1.2].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => {
                        setSpeechRate(r);
                        const lm = CLEVELAND_LANDMARKS.find(
                          (item) => item.id === activeNarration.payload.landmarkId
                        );
                        if (lm) {
                          const fact = activeNarration.payload.factId
                            ? lm.arFacts.find(
                                (f) => f.id === activeNarration.payload.factId
                              )
                            : null;
                          handleNarrateLandmarkHistory(lm, fact, r);
                        }
                      }}
                      className={`px-2 py-1 rounded text-[11px] font-mono transition-colors ${
                        activeNarration.rate === r
                          ? 'bg-sky-500 text-slate-950 font-bold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {r}x
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleStopLandmarkNarration}
                  data-testid="stop-global-narration-btn"
                  className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
                >
                  <VolumeX className="w-3.5 h-3.5" />
                  <span>Stop Narration</span>
                </button>
              </div>
            </div>

            <p
              className="text-xs text-slate-200 bg-slate-950/90 border border-slate-800 rounded-xl p-3 leading-relaxed"
              data-testid="active-speech-narration-transcript"
            >
              “{activeNarration.payload.spokenText}”
            </p>
          </div>
        </div>
      )}

      {/* Main Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-8 pb-24 md:pb-12">
        {/* Foot-Traffic Walk Simulator & Live Google Maps Grounding Status Bar */}
        <section
          aria-label="Pedestrian Walk Simulator and Trail Telemetry"
          className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3"
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-sky-500/15 text-sky-400 border border-sky-500/30">
                <Footprints className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-mono text-slate-400">
                  Active Foot-Traffic Coordinates · {walkerPosition.lat.toFixed(4)}°N,{' '}
                  {Math.abs(walkerPosition.lng).toFixed(4)}°W
                </div>
                <div className="text-sm font-bold text-white flex flex-wrap items-center gap-2">
                  <span>
                    Stop 0{selectedLandmark.walkingOrder} of 06:{' '}
                    {livePlacesById[selectedLandmark.id]?.displayName ||
                      selectedLandmark.shortTitle}{' '}
                    ({selectedLandmark.districtName})
                  </span>
                  {typeof livePlacesById[selectedLandmark.id]?.rating ===
                    'number' && (
                    <span className="text-xs font-mono text-amber-400">
                      ★ {livePlacesById[selectedLandmark.id].rating?.toFixed(1)} (
                      {livePlacesById[
                        selectedLandmark.id
                      ].userRatingCount?.toLocaleString()}{' '}
                      Google reviews)
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Interactive Walking Path Scrubber */}
            <div className="flex-1 max-w-md flex items-center gap-3">
              <label
                htmlFor="trail-scrubber"
                className="text-xs font-mono text-amber-400 whitespace-nowrap shrink-0"
              >
                Walk Trail:
              </label>
              <input
                id="trail-scrubber"
                type="range"
                min={0}
                max={CLEVELAND_LANDMARKS.length - 1}
                step={0.05}
                value={trailProgress}
                onChange={(e) => handleTrailSliderChange(Number(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  const mapEl = document.querySelector(
                    '[data-testid="cleveland-walking-map-section"]'
                  );
                  if (mapEl) {
                    mapEl.scrollIntoView({ behavior: 'smooth' });
                  } else {
                    setActiveSection('WALKING_GUIDE');
                  }
                }}
                className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-semibold whitespace-nowrap"
              >
                Live Google Map & 360° Street View ↓
              </button>
              <button
                type="button"
                onClick={handleRequestDeviceGps}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium whitespace-nowrap"
              >
                Sync Live GPS
              </button>
              <button
                type="button"
                onClick={() => setOfflineMode((prev) => !prev)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
                  offlineMode
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                }`}
              >
                {offlineMode ? 'Offline Mode: ON' : 'Offline Mode: OFF'}
              </button>
            </div>
          </div>

          {/* Above-the-Fold Live Google Maps Places API (New) Grounding Strip */}
          {livePlacesById[selectedLandmark.id] && (
            <div
              className="pt-2.5 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs font-mono"
              data-testid="above-fold-google-maps-strip"
            >
              <div className="flex flex-wrap items-center gap-2 text-slate-300">
                <span className="text-emerald-400 font-semibold">
                  ● Live Google Places API (New) Grounded:
                </span>
                <span className="text-sky-300">
                  {livePlacesById[selectedLandmark.id].formattedAddress}
                </span>
                {livePlacesById[selectedLandmark.id].placeId && (
                  <>
                    <span aria-hidden="true" className="text-slate-600">·</span>
                    <span className="text-slate-400">
                      Place ID: {livePlacesById[selectedLandmark.id].placeId}
                    </span>
                  </>
                )}
                {livePlacesById[selectedLandmark.id].editorialSummary && (
                  <>
                    <span aria-hidden="true" className="text-slate-600">·</span>
                    <span className="text-slate-200 font-sans">
                      “{livePlacesById[selectedLandmark.id].editorialSummary}”
                    </span>
                  </>
                )}
              </div>
              {livePlacesById[selectedLandmark.id].googleMapsURI && (
                <a
                  href={livePlacesById[selectedLandmark.id].googleMapsURI}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-400 hover:underline flex items-center gap-1 shrink-0"
                >
                  <span>Open in Google Maps</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          )}
        </section>

        {/* SECTION 1: 3D & AR LANDMARK TOUR + SPLIT WALKING MAP */}
        {activeSection === 'TOUR_3D' && (
          <div className="space-y-8">
            <Cleveland3DViewport
              landmarks={CLEVELAND_LANDMARKS}
              selectedLandmark={selectedLandmark}
              onSelectLandmark={(lm) => {
                setSelectedLandmark(lm);
                setSelectedFact(lm.arFacts[0] || null);
              }}
              selectedFact={selectedFact}
              onSelectFact={setSelectedFact}
              arLensActive={arLensActive}
              onToggleArLens={() => setArLensActive((prev) => !prev)}
              eraMaxYear={eraMaxYear}
              onChangeEraMaxYear={setEraMaxYear}
              factCategory={factCategory}
              onChangeFactCategory={setFactCategory}
              isFavorite={favoriteIds.includes(selectedLandmark.id)}
              onToggleFavorite={toggleFavorite}
              onOpenShareModal={(lm, fact) => {
                setShareModalTarget({ landmark: lm, fact });
                setActiveSection('PROFILE_SHARE');
              }}
              onOpenViroExport={(lm) => {
                setSelectedLandmark(lm);
                setActiveSection('OFFLINE_PACKS');
              }}
              isOfflineAvailable={offlineStats.isLandmarkAvailableOffline(
                selectedLandmark.id
              )}
            />

            {/* Interactive Google Maps & Offline Vector Walking Guide */}
            <ClevelandWalkingMap
              landmarks={CLEVELAND_LANDMARKS}
              selectedLandmark={selectedLandmark}
              onSelectLandmark={(lm) => {
                setSelectedLandmark(lm);
                setSelectedFact(lm.arFacts[0] || null);
              }}
              walkerPosition={walkerPosition}
              onStepWalkerToLandmark={handleStepWalkerToLandmark}
              offlineMode={offlineMode}
              onToggleOfflineMode={() => setOfflineMode((prev) => !prev)}
              livePlacesById={livePlacesById}
              onPlaceLoaded={handlePlaceLoaded}
            />

            {/* Curated 6-Stop Architectural & AR Historical Fact Directory with Live Google Maps Grounding */}
            <section className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
                <div>
                  <div className="text-xs font-mono text-amber-400">
                    01. Curated Walking Itinerary · Grounded with Live Google Maps Places API (New)
                  </div>
                  <h2 className="text-xl font-bold text-white mt-0.5">
                    Iconic Cleveland Landmarks, Live Google Maps Data & AR Overlays
                  </h2>
                </div>
                <div className="text-xs font-mono text-slate-400">
                  {Object.keys(livePlacesById).length} of 6 Stops Grounded via Google Maps · 13 AR Nodes
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {CLEVELAND_LANDMARKS.map((lm) => {
                  const isSelected = lm.id === selectedLandmark.id;
                  const isFav = favoriteIds.includes(lm.id);
                  const livePlace = livePlacesById[lm.id];
                  const firstPhoto = livePlace?.photos?.[0];
                  const firstReview = livePlace?.reviews?.[0];
                  const distFromWalker = calculateHaversineDistanceMeters(
                    walkerPosition,
                    livePlace?.location || lm.tourAnchor
                  );
                  const walkMins = estimateWalkingMinutes(distFromWalker, 4);
                  const bearing = calculateCompassBearing(
                    walkerPosition,
                    livePlace?.location || lm.tourAnchor
                  );

                  return (
                    <article
                      key={lm.id}
                      className={`rounded-2xl border p-5 flex flex-col justify-between transition-colors ${
                        isSelected
                          ? 'bg-slate-900 border-amber-500/70 shadow-lg'
                          : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div>
                        {/* Live Google Maps Photo Thumbnail (with Mandatory Author Attribution) */}
                        {firstPhoto && (
                          <div className="relative h-36 -mx-1 -mt-1 mb-3 rounded-xl overflow-hidden border border-slate-800 bg-slate-950">
                            <img
                              src={firstPhoto.uri}
                              alt={livePlace?.displayName || lm.shortTitle}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute top-2 left-2 bg-slate-950/85 border border-slate-700/80 rounded-md px-2 py-0.5 text-[10px] font-mono text-emerald-300">
                              Google Places Photo
                            </div>
                            <div className="absolute inset-x-0 bottom-0 bg-slate-950/85 px-2.5 py-1 text-[10px] text-slate-300 truncate">
                              Photo by{' '}
                              {firstPhoto.authorUri ? (
                                <a
                                  href={firstPhoto.authorUri}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline hover:text-amber-300"
                                >
                                  {firstPhoto.authorName}
                                </a>
                              ) : (
                                firstPhoto.authorName
                              )}
                            </div>
                          </div>
                        )}

                        {/* Unboxed Metadata Line */}
                        <div className="flex items-center justify-between gap-2 text-xs font-mono text-slate-400">
                          <span>
                            0{lm.walkingOrder} · {lm.yearCompleted} · {lm.districtName}
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleFavorite(lm.id)}
                            aria-label={
                              isFav
                                ? `Unsave ${lm.shortTitle}`
                                : `Save ${lm.shortTitle} to favorites`
                            }
                            className={`p-1 rounded transition-colors ${
                              isFav
                                ? 'text-rose-400'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            <Heart
                              className="w-4 h-4"
                              fill={isFav ? 'currentColor' : 'none'}
                            />
                          </button>
                        </div>

                        <div className="flex items-start justify-between gap-2 mt-1.5">
                          <h3 className="text-base font-bold text-white">
                            {livePlace?.displayName || lm.shortTitle}
                          </h3>
                          {typeof livePlace?.rating === 'number' && (
                            <span className="flex items-center gap-1 text-xs font-mono text-amber-400 shrink-0">
                              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                              {livePlace.rating.toFixed(1)} (
                              {livePlace.userRatingCount?.toLocaleString()})
                            </span>
                          )}
                        </div>

                        {livePlace?.formattedAddress && (
                          <div className="text-[11px] font-mono text-sky-400 mt-0.5 truncate">
                            {livePlace.formattedAddress}
                          </div>
                        )}

                        <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                          {livePlace?.editorialSummary || lm.summary}
                        </p>

                        {/* Top Live Google Maps Customer Review Snippet */}
                        {firstReview && (
                          <div className="mt-3 p-2.5 rounded-xl bg-slate-950/90 border border-slate-800/90 text-[11px] text-slate-300">
                            <div className="flex items-center justify-between text-[10px] font-mono text-amber-300 mb-0.5">
                              <span>
                                Google Review by{' '}
                                {firstReview.authorUri ? (
                                  <a
                                    href={firstReview.authorUri}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="underline text-sky-300"
                                  >
                                    {firstReview.authorName}
                                  </a>
                                ) : (
                                  firstReview.authorName
                                )}
                              </span>
                              {typeof firstReview.rating === 'number' && (
                                <span>★ {firstReview.rating}/5</span>
                              )}
                            </div>
                            <p className="line-clamp-2 text-slate-300">
                              “{firstReview.text}”
                            </p>
                          </div>
                        )}

                        {/* AR Historical Overlays Preview List */}
                        <div className="mt-4 pt-3 border-t border-slate-800/90 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-mono text-amber-400">
                              AR Historical Fact Overlays ({lm.arFacts.length}):
                            </span>
                            <span className="text-[10px] font-mono text-slate-400">
                              Web Speech Audio Ready
                            </span>
                          </div>
                          {lm.arFacts.map((fact) => {
                            const isFactNarrating =
                              activeNarration?.payload.landmarkId === lm.id &&
                              activeNarration?.payload.factId === fact.id;
                            return (
                              <div
                                key={fact.id}
                                className="flex items-stretch gap-1.5"
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedLandmark(lm);
                                    setSelectedFact(fact);
                                    setArLensActive(true);
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                  }}
                                  className="flex-1 text-left p-2 rounded-lg bg-slate-950/80 hover:bg-slate-800 border border-slate-800 transition-colors"
                                >
                                  <div className="text-[10px] font-mono text-sky-400">
                                    {fact.eraLabel} · {fact.category}
                                  </div>
                                  <div className="text-xs font-semibold text-slate-100 mt-0.5">
                                    {fact.title}
                                  </div>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleNarrateLandmarkHistory(lm, fact)}
                                  aria-label={
                                    isFactNarrating
                                      ? `Stop narrating ${fact.title}`
                                      : `Narrate fact: ${fact.title}`
                                  }
                                  className={`px-2.5 rounded-lg border transition-colors flex items-center justify-center shrink-0 ${
                                    isFactNarrating
                                      ? 'bg-sky-500/20 border-sky-500/60 text-sky-300'
                                      : 'bg-slate-950/80 hover:bg-slate-800 border-slate-800 text-slate-400 hover:text-white'
                                  }`}
                                >
                                  {isFactNarrating ? (
                                    <VolumeX className="w-3.5 h-3.5" />
                                  ) : (
                                    <Volume2 className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-800 space-y-2.5">
                        {/* Prominent 'Hear Landmark History' Web Speech API Button */}
                        {(() => {
                          const isLandmarkNarrating =
                            activeNarration?.payload.landmarkId === lm.id &&
                            !activeNarration?.payload.factId;
                          return (
                            <button
                              type="button"
                              onClick={() => handleNarrateLandmarkHistory(lm)}
                              aria-pressed={isLandmarkNarrating}
                              data-testid={`hear-landmark-history-${lm.id}`}
                              className={`w-full py-2 px-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 border transition-colors whitespace-nowrap ${
                                isLandmarkNarrating
                                  ? 'bg-sky-500/20 border-sky-400 text-sky-300'
                                  : 'bg-slate-800/90 hover:bg-slate-800 border-slate-700 text-slate-100'
                              }`}
                            >
                              {isLandmarkNarrating ? (
                                <>
                                  <VolumeX className="w-4 h-4 text-sky-300 shrink-0" />
                                  <span>Stop Narration ({lm.shortTitle})</span>
                                </>
                              ) : (
                                <>
                                  <Volume2 className="w-4 h-4 text-amber-400 shrink-0" />
                                  <span>Hear Landmark History</span>
                                </>
                              )}
                            </button>
                          );
                        })()}

                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[11px] font-mono text-slate-400">
                            {distFromWalker}m {bearing.cardinal} · ~{walkMins} min walk
                          </div>
                          <div className="flex items-center gap-1.5">
                            {livePlace?.googleMapsURI && (
                              <a
                                href={livePlace.googleMapsURI}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`Open ${lm.shortTitle} on Google Maps`}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => handleStepWalkerToLandmark(lm)}
                              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors whitespace-nowrap"
                            >
                              Walk & Inspect 3D
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        {/* SECTION 2: DEDICATED WALKING GUIDE & PROXIMITY NOTIFICATION LOG */}
        {activeSection === 'WALKING_GUIDE' && (
          <div className="space-y-8">
            <ClevelandWeatherWidget
              selectedLandmark={selectedLandmark}
              offlineMode={offlineMode}
            />

            <ClevelandWalkingMap
              landmarks={CLEVELAND_LANDMARKS}
              selectedLandmark={selectedLandmark}
              onSelectLandmark={(lm) => {
                setSelectedLandmark(lm);
                setSelectedFact(lm.arFacts[0] || null);
              }}
              walkerPosition={walkerPosition}
              onStepWalkerToLandmark={handleStepWalkerToLandmark}
              offlineMode={offlineMode}
              onToggleOfflineMode={() => setOfflineMode((prev) => !prev)}
              livePlacesById={livePlacesById}
              onPlaceLoaded={handlePlaceLoaded}
            />

            {/* Step-by-Step Pedestrian Trail & Proximity Push Log */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-7 space-y-4">
                <h2 className="text-lg font-bold text-white">
                  Step-by-Step Pedestrian Walking Trail (Grounded with Google Maps)
                </h2>
                <div className="space-y-3">
                  {CLEVELAND_LANDMARKS.map((lm) => {
                    const livePlace = livePlacesById[lm.id];
                    const dist = calculateHaversineDistanceMeters(
                      walkerPosition,
                      livePlace?.location || lm.tourAnchor
                    );
                    const isCurrent = lm.id === selectedLandmark.id;
                    return (
                      <div
                        key={lm.id}
                        className={`p-4 rounded-2xl border transition-colors ${
                          isCurrent
                            ? 'bg-slate-900 border-amber-500/70'
                            : 'bg-slate-900/70 border-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-mono text-amber-400">
                            Leg 0{lm.walkingOrder} · {lm.districtName} · {dist}m from you
                            {typeof livePlace?.rating === 'number'
                              ? ` · ★ ${livePlace.rating.toFixed(1)} (${livePlace.userRatingCount?.toLocaleString()})`
                              : ''}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleNarrateLandmarkHistory(lm)}
                              className={`px-2.5 py-1 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                                activeNarration?.payload.landmarkId === lm.id &&
                                !activeNarration?.payload.factId
                                  ? 'bg-sky-500/20 border-sky-400 text-sky-300'
                                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                              }`}
                            >
                              <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                              <span>
                                {activeNarration?.payload.landmarkId === lm.id &&
                                !activeNarration?.payload.factId
                                  ? 'Stop Narration'
                                  : 'Hear Landmark History'}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStepWalkerToLandmark(lm)}
                              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap"
                            >
                              Simulate Arrival
                            </button>
                          </div>
                        </div>
                        <h3 className="text-base font-bold text-white mt-1">
                          {livePlace?.displayName || lm.shortTitle} ({lm.yearCompleted})
                        </h3>
                        {livePlace?.formattedAddress && (
                          <div className="text-xs font-mono text-slate-400 mt-0.5">
                            {livePlace.formattedAddress}
                          </div>
                        )}
                        <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                          <span className="font-semibold text-sky-300">
                            Walking Direction:{' '}
                          </span>
                          {lm.walkingCueToNext}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Location-Based Push Notification Center */}
              <div className="lg:col-span-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Bell className="w-5 h-5 text-amber-400" />
                    <span>Geofence Push Notification Log</span>
                  </h2>
                  <span className="text-xs font-mono text-slate-400">
                    Radius ≤ 180m
                  </span>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                  <p className="text-xs text-slate-400">
                    Notifications trigger automatically as your GPS coordinates approach within 180 meters of any historical Cleveland landmark.
                  </p>
                  {notificationHistory.map((item) => (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-[11px] font-mono text-amber-400">
                        <span>
                          {item.landmarkTitle} · {item.distanceMeters}m away
                        </span>
                        <span>{item.headlineFact.eraLabel}</span>
                      </div>
                      <div className="text-xs font-bold text-white">
                        {item.headlineFact.title}
                      </div>
                      <p className="text-xs text-slate-300">
                        {item.headlineFact.narrative}
                      </p>
                      <div className="pt-1 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const lm = CLEVELAND_LANDMARKS.find(
                              (l) => l.id === item.landmarkId
                            );
                            if (lm) {
                              setSelectedLandmark(lm);
                              setSelectedFact(item.headlineFact);
                              setActiveSection('TOUR_3D');
                            }
                          }}
                          className="text-xs font-semibold text-sky-400 hover:text-sky-300"
                        >
                          Inspect in 3D AR →
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 3: OFFLINE DISTRICT PACKS & VIROREACT EXPORTER */}
        {activeSection === 'OFFLINE_PACKS' && (
          <OfflineDistrictManager
            packs={OFFLINE_DISTRICT_PACKS}
            landmarks={CLEVELAND_LANDMARKS}
            downloadedPackIds={downloadedPackIds}
            onDownloadPack={(id) =>
              setDownloadedPackIds((prev) =>
                prev.includes(id) ? prev : [...prev, id]
              )
            }
            onRemovePack={(id) =>
              setDownloadedPackIds((prev) => prev.filter((item) => item !== id))
            }
            onDownloadAllPacks={() =>
              setDownloadedPackIds(OFFLINE_DISTRICT_PACKS.map((p) => p.id))
            }
            offlineMode={offlineMode}
            onToggleOfflineMode={() => setOfflineMode((prev) => !prev)}
            selectedLandmark={selectedLandmark}
            onSelectLandmark={setSelectedLandmark}
          />
        )}

        {/* SECTION 4: TOURIST PROFILE, SAVED FAVORITES & SOCIAL SHARING */}
        {activeSection === 'PROFILE_SHARE' && (
          <TouristProfileAndShare
            explorerName={explorerName}
            onUpdateExplorerName={setExplorerName}
            landmarks={CLEVELAND_LANDMARKS}
            favoriteIds={favoriteIds}
            onToggleFavorite={toggleFavorite}
            visitedIds={visitedIds}
            onMarkVisited={toggleVisited}
            onStampMultipleVisited={handleStampMultipleVisited}
            onResetVisited={handleResetVisited}
            fieldNotes={fieldNotes}
            onSaveFieldNote={(lmId, note) =>
              setFieldNotes((prev) => ({ ...prev, [lmId]: note }))
            }
            onJumpToLandmark3D={(lm) => {
              setSelectedLandmark(lm);
              setSelectedFact(lm.arFacts[0] || null);
              setActiveSection('TOUR_3D');
            }}
            onNarrateLandmarkHistory={(lm) => handleNarrateLandmarkHistory(lm)}
            activeNarrationLandmarkId={
              activeNarration && !activeNarration.payload.factId
                ? activeNarration.payload.landmarkId
                : null
            }
            sharedPosts={sharedPosts}
            onPublishSharePost={(newPost) => {
              const post: SharedDiscoveryPost = {
                ...newPost,
                id: `post-${Date.now()}`,
                sharedAtLabel: 'Just now',
              };
              setSharedPosts((prev) => [post, ...prev]);
            }}
            initialShareTarget={shareModalTarget}
          />
        )}
      </main>

      {/* Mobile Ergonomic Bottom Tab Bar (Visible on Mobile Viewports) */}
      <nav
        aria-label="Mobile Bottom Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 border-t border-slate-800 grid grid-cols-4 items-center h-16"
      >
        <button
          type="button"
          onClick={() => setActiveSection('TOUR_3D')}
          className={`flex flex-col items-center justify-center min-h-[44px] ${
            activeSection === 'TOUR_3D' ? 'text-amber-400' : 'text-slate-400'
          }`}
        >
          <Compass className="w-5 h-5" />
          <span className="text-[10px] font-medium mt-1">3D & AR</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('WALKING_GUIDE')}
          className={`flex flex-col items-center justify-center min-h-[44px] ${
            activeSection === 'WALKING_GUIDE' ? 'text-amber-400' : 'text-slate-400'
          }`}
        >
          <Navigation className="w-5 h-5" />
          <span className="text-[10px] font-medium mt-1">Walk Map</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('OFFLINE_PACKS')}
          className={`flex flex-col items-center justify-center min-h-[44px] ${
            activeSection === 'OFFLINE_PACKS' ? 'text-amber-400' : 'text-slate-400'
          }`}
        >
          <WifiOff className="w-5 h-5" />
          <span className="text-[10px] font-medium mt-1">Offline</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('PROFILE_SHARE')}
          className={`flex flex-col items-center justify-center min-h-[44px] ${
            activeSection === 'PROFILE_SHARE' ? 'text-amber-400' : 'text-slate-400'
          }`}
        >
          <User className="w-5 h-5" />
          <span className="text-[10px] font-medium mt-1">Passport</span>
        </button>
      </nav>
    </div>
  );
}
