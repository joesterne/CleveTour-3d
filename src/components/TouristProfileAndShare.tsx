import React, { useState } from 'react';
import {
  ARHistoricalFact,
  CLEVELAND_PASSPORT_BADGES,
  LandmarkBlueprint,
  PassportBadgeDefinition,
} from '../data/clevelandLandmarks';
import {
  PassportBadgeStatus,
  evaluatePassportBadges,
} from '../utils/tourLogic';
import {
  Award,
  Bookmark,
  Check,
  CheckCircle2,
  Copy,
  Heart,
  Lock,
  Send,
  Share2,
  ShieldCheck,
  Sparkles,
  Trash2,
  User,
  Volume2,
  VolumeX,
} from 'lucide-react';

export interface SharedDiscoveryPost {
  id: string;
  explorerName: string;
  landmarkId: string;
  landmarkTitle: string;
  districtName: string;
  factTitle: string;
  factEra: string;
  personalNote: string;
  coordinatesLabel: string;
  sharedAtLabel: string;
  heroImage: string;
  badgeStickerTitle?: string;
  badgeSerialCode?: string;
}

interface TouristProfileAndShareProps {
  explorerName: string;
  onUpdateExplorerName: (name: string) => void;
  landmarks: LandmarkBlueprint[];
  favoriteIds: string[];
  onToggleFavorite: (landmarkId: string) => void;
  visitedIds: string[];
  onMarkVisited: (landmarkId: string) => void;
  onStampMultipleVisited?: (landmarkIds: string[]) => void;
  onResetVisited?: () => void;
  fieldNotes: Record<string, string>;
  onSaveFieldNote: (landmarkId: string, note: string) => void;
  onJumpToLandmark3D: (landmark: LandmarkBlueprint) => void;
  onNarrateLandmarkHistory?: (landmark: LandmarkBlueprint) => void;
  activeNarrationLandmarkId?: string | null;
  sharedPosts: SharedDiscoveryPost[];
  onPublishSharePost: (post: Omit<SharedDiscoveryPost, 'id' | 'sharedAtLabel'>) => void;
  initialShareTarget?: {
    landmark: LandmarkBlueprint;
    fact?: ARHistoricalFact | null;
  } | null;
}

/**
 * Custom vector illustration for each Cleveland District Digital Achievement Sticker.
 * Renders a die-cut heritage travel decal in full color when unlocked, or blueprint wireframe when locked.
 */
const DigitalAchievementStickerGraphic: React.FC<{
  badge: PassportBadgeDefinition;
  isUnlocked: boolean;
  progressPercent: number;
}> = ({ badge, isUnlocked, progressPercent }) => {
  const accent = isUnlocked ? badge.accentHex : '#475569';
  const secondaryStroke = isUnlocked ? '#f8fafc' : '#64748b';
  const bgFill = isUnlocked ? '#0f172a' : '#090d16';

  return (
    <div
      className={`relative w-28 h-28 shrink-0 rounded-2xl flex items-center justify-center select-none transition-transform duration-200 ${
        isUnlocked
          ? 'bg-slate-950 border-2 border-amber-400/80 shadow-lg'
          : 'bg-slate-950/70 border border-dashed border-slate-700 opacity-80'
      }`}
      data-testid={`sticker-graphic-${badge.id}`}
    >
      <svg
        viewBox="0 0 120 120"
        className="w-24 h-24"
        role="img"
        aria-label={`${badge.stickerTitle} ${isUnlocked ? 'Unlocked Digital Sticker' : 'Locked Sticker Blueprint'}`}
      >
        {/* Outer Die-Cut Sticker Backing Ring */}
        <circle
          cx="60"
          cy="60"
          r="54"
          fill={bgFill}
          stroke={accent}
          strokeWidth={isUnlocked ? '3.5' : '1.5'}
          strokeDasharray={isUnlocked ? undefined : '4 3'}
        />
        {/* Inner Perforated Heritage Stamp Ring */}
        <circle
          cx="60"
          cy="60"
          r="47"
          fill="none"
          stroke={secondaryStroke}
          strokeOpacity={isUnlocked ? '0.35' : '0.2'}
          strokeWidth="1.2"
          strokeDasharray="2 3"
        />

        {/* District-Specific Architectural Emblem */}
        {badge.emblemType === 'CIVIC_CROWN' && (
          <g>
            {/* The Arcade Glass Arch Dome Backdrop */}
            <path
              d="M 28 78 A 32 30 0 0 1 92 78"
              fill="none"
              stroke={accent}
              strokeWidth="2"
              strokeOpacity={isUnlocked ? '0.85' : '0.4'}
            />
            <path
              d="M 35 78 L 60 52 L 85 78"
              fill="none"
              stroke={accent}
              strokeWidth="1.2"
              strokeOpacity="0.5"
            />
            {/* Terminal Tower Stepped Beaux-Arts Silhouette */}
            <rect
              x="44"
              y="62"
              width="32"
              height="20"
              rx="1"
              fill={isUnlocked ? accent : '#334155'}
              fillOpacity={isUnlocked ? '0.25' : '0.15'}
              stroke={secondaryStroke}
              strokeWidth="1.6"
            />
            <rect
              x="50"
              y="46"
              width="20"
              height="16"
              fill={bgFill}
              stroke={secondaryStroke}
              strokeWidth="1.6"
            />
            <rect
              x="54"
              y="32"
              width="12"
              height="14"
              fill={isUnlocked ? accent : '#475569'}
              stroke={secondaryStroke}
              strokeWidth="1.6"
            />
            {/* Spire */}
            <polygon
              points="56,32 60,18 64,32"
              fill={accent}
              stroke={secondaryStroke}
              strokeWidth="1.2"
            />
            <line
              x1="24"
              y1="82"
              x2="96"
              y2="82"
              stroke={accent}
              strokeWidth="2.5"
            />
          </g>
        )}

        {badge.emblemType === 'LAKEFRONT_BEACON' && (
          <g>
            {/* I.M. Pei Glass Pyramid */}
            <polygon
              points="26,80 54,40 78,80"
              fill={isUnlocked ? accent : '#334155'}
              fillOpacity={isUnlocked ? '0.25' : '0.15'}
              stroke={secondaryStroke}
              strokeWidth="1.8"
            />
            <line
              x1="54"
              y1="40"
              x2="54"
              y2="80"
              stroke={accent}
              strokeWidth="1.4"
            />
            {/* 1911 West Pierhead Lighthouse */}
            <polygon
              points="76,80 79,44 87,44 90,80"
              fill={bgFill}
              stroke={secondaryStroke}
              strokeWidth="1.8"
            />
            <rect
              x="77"
              y="38"
              width="12"
              height="6"
              fill={accent}
              stroke={secondaryStroke}
              strokeWidth="1.3"
            />
            {/* Lighthouse Beacon Rays */}
            {isUnlocked && (
              <>
                <line
                  x1="74"
                  y1="41"
                  x2="60"
                  y2="34"
                  stroke="#fde047"
                  strokeWidth="1.8"
                />
                <line
                  x1="92"
                  y1="41"
                  x2="102"
                  y2="35"
                  stroke="#fde047"
                  strokeWidth="1.8"
                />
              </>
            )}
            {/* Lake Erie Waves */}
            <path
              d="M 24 85 Q 36 81, 48 85 T 72 85 T 96 85"
              fill="none"
              stroke={accent}
              strokeWidth="2.2"
            />
          </g>
        )}

        {badge.emblemType === 'SANDSTONE_GUARDIAN' && (
          <g>
            {/* Hope Memorial Bridge Arch */}
            <path
              d="M 24 84 Q 60 66, 96 84"
              fill="none"
              stroke={accent}
              strokeWidth="2.5"
            />
            {/* Art Deco Guardian Pylon Left */}
            <rect
              x="34"
              y="36"
              width="18"
              height="44"
              rx="2"
              fill={isUnlocked ? accent : '#334155'}
              fillOpacity={isUnlocked ? '0.28' : '0.15'}
              stroke={secondaryStroke}
              strokeWidth="1.8"
            />
            {/* Art Deco Wings */}
            <path
              d="M 31 44 L 34 32 L 52 32 L 55 44"
              fill="none"
              stroke={accent}
              strokeWidth="1.8"
            />
            {/* West Side Market Clock Tower Right */}
            <rect
              x="66"
              y="30"
              width="16"
              height="50"
              fill={bgFill}
              stroke={secondaryStroke}
              strokeWidth="1.8"
            />
            <polygon
              points="64,30 74,19 84,30"
              fill={accent}
              stroke={secondaryStroke}
              strokeWidth="1.4"
            />
            <circle
              cx="74"
              cy="40"
              r="4.5"
              fill={isUnlocked ? '#fef08a' : '#334155'}
              stroke={secondaryStroke}
              strokeWidth="1.2"
            />
          </g>
        )}

        {badge.emblemType === 'GRAND_LAUREATE' && (
          <g>
            {/* Radiant Heritage Sunburst */}
            <circle
              cx="60"
              cy="54"
              r="24"
              fill={isUnlocked ? accent : '#334155'}
              fillOpacity={isUnlocked ? '0.25' : '0.12'}
              stroke={accent}
              strokeWidth="1.6"
            />
            {/* Complete Cleveland Skyline Crest */}
            <rect
              x="34"
              y="56"
              width="10"
              height="22"
              fill={bgFill}
              stroke={secondaryStroke}
              strokeWidth="1.5"
            />
            <rect
              x="46"
              y="44"
              width="14"
              height="34"
              fill={isUnlocked ? accent : '#475569'}
              stroke={secondaryStroke}
              strokeWidth="1.6"
            />
            <polygon
              points="49,44 53,26 57,44"
              fill="#fde047"
              stroke={secondaryStroke}
              strokeWidth="1.2"
            />
            <polygon
              points="62,78 74,48 88,78"
              fill={bgFill}
              stroke={secondaryStroke}
              strokeWidth="1.6"
            />
            <line
              x1="24"
              y1="79"
              x2="96"
              y2="79"
              stroke="#fde047"
              strokeWidth="2.4"
            />
          </g>
        )}

        {/* Serial Code & Status Arc Text */}
        <text
          x="60"
          y="99"
          textAnchor="middle"
          fill={isUnlocked ? '#fde68a' : '#94a3b8'}
          fontSize="8.5"
          fontFamily="monospace"
          fontWeight="bold"
          letterSpacing="1"
        >
          {isUnlocked ? badge.serialCode : `${progressPercent}% STAMPED`}
        </text>
      </svg>

      {/* Postmark Seal Corner Indicator */}
      {isUnlocked ? (
        <div
          className="absolute -bottom-1.5 -right-1.5 px-2 py-0.5 rounded-md bg-amber-400 text-slate-950 font-mono text-[10px] font-bold tracking-tight shadow"
          data-testid={`sticker-unlocked-pill-${badge.id}`}
        >
          UNLOCKED
        </div>
      ) : (
        <div className="absolute -bottom-1.5 -right-1.5 p-1.5 rounded-md bg-slate-800 border border-slate-700 text-slate-400">
          <Lock className="w-3.5 h-3.5" />
        </div>
      )}
    </div>
  );
};

export const TouristProfileAndShare: React.FC<TouristProfileAndShareProps> = ({
  explorerName,
  onUpdateExplorerName,
  landmarks,
  favoriteIds,
  onToggleFavorite,
  visitedIds,
  onMarkVisited,
  onStampMultipleVisited,
  onResetVisited,
  fieldNotes,
  onSaveFieldNote,
  onJumpToLandmark3D,
  onNarrateLandmarkHistory,
  activeNarrationLandmarkId,
  sharedPosts,
  onPublishSharePost,
  initialShareTarget,
}) => {
  const [selectedShareLandmarkId, setSelectedShareLandmarkId] = useState<string>(
    initialShareTarget?.landmark.id || landmarks[0].id
  );
  const activeShareLandmark =
    landmarks.find((l) => l.id === selectedShareLandmarkId) || landmarks[0];

  const [selectedShareFactId, setSelectedShareFactId] = useState<string>(
    initialShareTarget?.fact?.id || activeShareLandmark.arFacts[0]?.id || ''
  );
  const [customShareNote, setCustomShareNote] = useState<string>(
    'Standing right beneath this historic Cleveland landmark—the 3D AR overlay brought the 1930s engineering to life!'
  );
  const [attachedBadgeId, setAttachedBadgeId] = useState<string>('');
  const [badgeFilter, setBadgeFilter] = useState<'ALL' | 'UNLOCKED' | 'LOCKED'>('ALL');
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>(fieldNotes);
  const [copiedLink, setCopiedLink] = useState(false);
  const [publishedToast, setPublishedToast] = useState(false);

  const favoriteLandmarks = landmarks.filter((l) => favoriteIds.includes(l.id));
  const activeFact =
    activeShareLandmark.arFacts.find((f) => f.id === selectedShareFactId) ||
    activeShareLandmark.arFacts[0];

  // Evaluate Passport Badges & Visual Progress Bar Metrics
  const passportProgress = evaluatePassportBadges(
    landmarks,
    CLEVELAND_PASSPORT_BADGES,
    visitedIds
  );

  const filteredBadges = passportProgress.badges.filter((b) => {
    if (badgeFilter === 'UNLOCKED') return b.isUnlocked;
    if (badgeFilter === 'LOCKED') return !b.isUnlocked;
    return true;
  });

  const attachedBadgeStatus = passportProgress.badges.find(
    (b) => b.badge.id === attachedBadgeId && b.isUnlocked
  );

  const handleCompleteDistrict = (badgeStatus: PassportBadgeStatus) => {
    if (onStampMultipleVisited) {
      onStampMultipleVisited(badgeStatus.badge.requiredLandmarkIds);
    } else {
      badgeStatus.missingLandmarkIds.forEach((id) => onMarkVisited(id));
    }
  };

  const handleFeatureBadgeOnPostcard = (badgeStatus: PassportBadgeStatus) => {
    setAttachedBadgeId(badgeStatus.badge.id);
    const firstLandmarkId = badgeStatus.badge.requiredLandmarkIds[0];
    const lm = landmarks.find((l) => l.id === firstLandmarkId);
    if (lm) {
      setSelectedShareLandmarkId(lm.id);
      if (lm.arFacts[0]) {
        setSelectedShareFactId(lm.arFacts[0].id);
      }
    }
    setCustomShareNote(
      `Unlocked the "${badgeStatus.badge.stickerTitle}" (${badgeStatus.badge.serialCode}) digital achievement sticker after visiting every landmark in ${badgeStatus.badge.districtName}!`
    );
  };

  const handleCopyShareLink = async () => {
    const shareUrl = `${window.location.origin}/?landmark=${activeShareLandmark.slug}&arFact=${activeFact?.id || ''}`;
    const badgeTag = attachedBadgeStatus
      ? ` [Sticker Unlocked: ${attachedBadgeStatus.badge.stickerTitle} · ${attachedBadgeStatus.badge.serialCode}]`
      : '';
    const shareSummary = `${activeShareLandmark.shortTitle} (${activeShareLandmark.yearCompleted})${badgeTag} — ${activeFact?.title}: "${customShareNote}" · Explore in 3D & AR: ${shareUrl}`;
    try {
      await navigator.clipboard.writeText(shareSummary);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2200);
    } catch {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2200);
    }
  };

  const handlePublishToFeed = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customShareNote.trim()) return;

    onPublishSharePost({
      explorerName: explorerName.trim() || 'Cleveland Foot Explorer',
      landmarkId: activeShareLandmark.id,
      landmarkTitle: activeShareLandmark.shortTitle,
      districtName: activeShareLandmark.districtName,
      factTitle: activeFact ? activeFact.title : activeShareLandmark.architecturalStyle,
      factEra: activeFact ? activeFact.eraLabel : String(activeShareLandmark.yearCompleted),
      personalNote: customShareNote.trim(),
      coordinatesLabel: `${activeShareLandmark.tourAnchor.lat.toFixed(4)}°N, ${Math.abs(
        activeShareLandmark.tourAnchor.lng
      ).toFixed(4)}°W`,
      heroImage: activeShareLandmark.heroImage,
      badgeStickerTitle: attachedBadgeStatus?.badge.stickerTitle,
      badgeSerialCode: attachedBadgeStatus?.badge.serialCode,
    });

    setPublishedToast(true);
    setTimeout(() => setPublishedToast(false), 2500);
  };

  return (
    <div className="space-y-8" data-testid="tourist-profile-section">
      {/* Explorer Profile & Visual Progress Bar Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
              <User className="w-7 h-7" />
            </div>
            <div>
              <div className="text-xs font-mono text-amber-400">
                Cleveland Walking Heritage Passport · Rank: {passportProgress.explorerRankTitle}
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-1">
                <label htmlFor="explorer-name-input" className="sr-only">
                  Explorer Display Name
                </label>
                <input
                  id="explorer-name-input"
                  type="text"
                  value={explorerName}
                  onChange={(e) => onUpdateExplorerName(e.target.value)}
                  className="bg-slate-950 border border-slate-700 focus:border-amber-400 rounded-lg px-3 py-1.5 text-base font-bold text-white outline-none"
                />
                <span className="text-xs font-mono tabular-nums text-slate-300">
                  {passportProgress.visitedLandmarksCount} of {passportProgress.totalLandmarks} Landmarks Stamped ·{' '}
                  <span className="text-amber-400 font-semibold">
                    {passportProgress.unlockedBadgesCount} of {passportProgress.totalBadgesCount} Digital Stickers Unlocked
                  </span>{' '}
                  · {favoriteLandmarks.length} Saved
                </span>
              </div>
            </div>
          </div>

          {/* Quick Passport Stamp Controls */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {passportProgress.visitedLandmarksCount < passportProgress.totalLandmarks &&
              onStampMultipleVisited && (
                <button
                  type="button"
                  onClick={() =>
                    onStampMultipleVisited(landmarks.map((l) => l.id))
                  }
                  className="px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors whitespace-nowrap shrink-0"
                >
                  Stamp All 6 Landmarks
                </button>
              )}
            {passportProgress.visitedLandmarksCount > 1 && onResetVisited && (
              <button
                type="button"
                onClick={onResetVisited}
                className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-medium transition-colors whitespace-nowrap shrink-0"
              >
                Reset Stamps
              </button>
            )}
          </div>
        </div>

        {/* Visual Progress Bar & District Milestone Tracker */}
        <div
          className="bg-slate-950/90 border border-slate-800/90 rounded-xl p-4 space-y-3"
          data-testid="tourist-profile-progress-bar-container"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="text-xs font-mono text-slate-400">
                Citywide Heritage Trail & District Sticker Progress
              </div>
              <div className="text-sm font-bold text-white mt-0.5">
                {passportProgress.nextMilestoneLabel}
              </div>
            </div>
            <div className="flex items-center gap-3 font-mono tabular-nums shrink-0">
              <span className="text-xs text-slate-400">
                {passportProgress.districtBadgesUnlockedCount}/3 Districts Complete
              </span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span
                className="text-lg font-bold text-amber-400"
                data-testid="passport-overall-progress-percent"
              >
                {passportProgress.overallProgressPercent}%
              </span>
            </div>
          </div>

          {/* Continuous Visual Progress Bar with Accessible Progressbar Role */}
          <div
            role="progressbar"
            aria-label="Cleveland Heritage Passport Overall Completion"
            aria-valuenow={passportProgress.overallProgressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            data-testid="passport-visual-progress-bar"
            className="w-full h-4 bg-slate-900 rounded-lg overflow-hidden border border-slate-800 p-0.5"
          >
            <div
              className="h-full rounded-md bg-amber-400"
              style={{ width: `${passportProgress.overallProgressPercent}%` }}
            />
          </div>

          {/* 6-Stop Segmented District Landmark Stamp Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-1">
            {landmarks.map((lm) => {
              const visited = visitedIds.includes(lm.id);
              return (
                <button
                  key={lm.id}
                  type="button"
                  onClick={() => onMarkVisited(lm.id)}
                  className={`px-2.5 py-2 rounded-lg text-left text-xs font-mono border transition-colors ${
                    visited
                      ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-bold">0{lm.walkingOrder}</span>
                    <span>{visited ? '✓ Stamped' : '○ Unvisited'}</span>
                  </div>
                  <div className="text-[11px] font-sans font-semibold text-white truncate mt-0.5">
                    {lm.shortTitle}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* PASSPORT BADGES & DIGITAL ACHIEVEMENT STICKERS SECTION */}
      <section
        aria-label="Passport Badges and Digital Achievement Stickers"
        data-testid="passport-badges-section"
        className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5"
      >
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="text-xs font-mono text-amber-400">
              01. Official Cleveland Passport Badges · District Achievement Stickers
            </div>
            <h3 className="text-xl font-bold text-white mt-0.5 flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-400 shrink-0" />
              <span>
                Digital Achievement Stickers ({passportProgress.unlockedBadgesCount} of{' '}
                {passportProgress.totalBadgesCount} Unlocked)
              </span>
            </h3>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl">
              Visit all landmarks within a Cleveland district—either by walking on the trail or stamping your passport—to unlock its official commemorative digital achievement sticker.
            </p>
          </div>

          {/* Interactive Segmented Filter Controls */}
          <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg self-start md:self-auto shrink-0">
            <button
              type="button"
              onClick={() => setBadgeFilter('ALL')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                badgeFilter === 'ALL'
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              All Stickers ({passportProgress.totalBadgesCount})
            </button>
            <button
              type="button"
              onClick={() => setBadgeFilter('UNLOCKED')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                badgeFilter === 'UNLOCKED'
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Unlocked ({passportProgress.unlockedBadgesCount})
            </button>
            <button
              type="button"
              onClick={() => setBadgeFilter('LOCKED')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                badgeFilter === 'LOCKED'
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              In Progress ({passportProgress.totalBadgesCount - passportProgress.unlockedBadgesCount})
            </button>
          </div>
        </div>

        {/* Badge Sticker Cards Grid */}
        {filteredBadges.length === 0 ? (
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-8 text-center space-y-2">
            <div className="text-sm font-semibold text-white">
              {badgeFilter === 'UNLOCKED'
                ? 'No District Achievement Stickers Unlocked Yet'
                : 'All District Achievement Stickers Are Unlocked!'}
            </div>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              {badgeFilter === 'UNLOCKED'
                ? 'Complete all landmarks in Downtown, North Coast Harbor, or Ohio City to unlock your first digital achievement sticker.'
                : 'You have stamped every landmark across all three Cleveland districts.'}
            </p>
            <button
              type="button"
              onClick={() => setBadgeFilter('ALL')}
              className="mt-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-amber-300 border border-slate-700"
            >
              Show All Stickers ({passportProgress.totalBadgesCount})
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {filteredBadges.map((status) => {
              const { badge, isUnlocked, visitedCount, totalRequired, progressPercent } =
                status;

              return (
                <article
                  key={badge.id}
                  data-testid={`passport-badge-card-${badge.id}`}
                  data-unlocked={isUnlocked ? 'true' : 'false'}
                  className={`rounded-2xl border p-5 flex flex-col justify-between gap-4 transition-colors ${
                    isUnlocked
                      ? 'bg-slate-950/95 border-amber-500/70 shadow-lg'
                      : 'bg-slate-950/50 border-slate-800/90'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row items-start gap-4">
                    {/* Custom Die-Cut Digital Achievement Sticker SVG */}
                    <DigitalAchievementStickerGraphic
                      badge={badge}
                      isUnlocked={isUnlocked}
                      progressPercent={progressPercent}
                    />

                    <div className="flex-1 min-w-0 space-y-2">
                      {/* Clean Unboxed Metadata */}
                      <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono text-slate-400">
                        <span className={isUnlocked ? 'text-amber-400 font-semibold' : ''}>
                          {badge.serialCode}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{badge.districtName}</span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={
                            isUnlocked
                              ? 'text-emerald-400 font-semibold'
                              : 'text-slate-400'
                          }
                        >
                          {isUnlocked ? 'Sticker Unlocked' : 'Locked'}
                        </span>
                      </div>

                      <h4 className="text-base font-bold text-white">
                        {badge.stickerTitle}
                      </h4>

                      <p className="text-xs text-slate-300 leading-relaxed">
                        {badge.rewardDescription}
                      </p>

                      {isUnlocked && (
                        <div className="text-xs font-mono text-amber-300 pt-0.5 flex items-center gap-1.5">
                          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>“{badge.unlockedMotto}”</span>
                        </div>
                      )}

                      {/* District Progress Bar */}
                      <div className="pt-1 space-y-1">
                        <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                          <span className="text-slate-400">
                            District Landmarks Visited: {visitedCount} of {totalRequired}
                          </span>
                          <span
                            className={
                              isUnlocked
                                ? 'text-emerald-400 font-semibold'
                                : 'text-amber-400'
                            }
                          >
                            {progressPercent}%
                          </span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                          <div
                            className={`h-full ${
                              isUnlocked ? 'bg-emerald-400' : 'bg-amber-500'
                            }`}
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Required Landmarks Interactive Checklist & District Action */}
                  <div className="pt-3 border-t border-slate-800/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {badge.requiredLandmarkIds.map((lmId) => {
                        const lm = landmarks.find((item) => item.id === lmId);
                        if (!lm) return null;
                        const isLmVisited = visitedIds.includes(lm.id);
                        return (
                          <button
                            key={lm.id}
                            type="button"
                            onClick={() => onMarkVisited(lm.id)}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-mono border transition-colors whitespace-nowrap shrink-0 ${
                              isLmVisited
                                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            {isLmVisited ? '✓ ' : '+ '}
                            {lm.shortTitle}
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isUnlocked ? (
                        <button
                          type="button"
                          onClick={() => handleFeatureBadgeOnPostcard(status)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                            attachedBadgeId === badge.id
                              ? 'bg-emerald-500 text-slate-950'
                              : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40'
                          }`}
                        >
                          {attachedBadgeId === badge.id
                            ? '✓ Attached to Postcard'
                            : 'Attach Sticker to Postcard'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleCompleteDistrict(status)}
                          data-testid={`unlock-district-btn-${badge.id}`}
                          className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors whitespace-nowrap shrink-0"
                        >
                          {badge.districtId === 'all-districts'
                            ? `Stamp All Remaining (${status.missingLandmarkIds.length} Left)`
                            : `Stamp District (${status.missingLandmarkIds.length} Left)`}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Two-Column Split: Left = Saved Favorite Historical Spots, Right = Social Discovery Card Studio */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Saved Favorite Historical Spots & Field Notes (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Heart className="w-5 h-5 text-rose-400" />
              <span>Saved Favorite Historical Spots ({favoriteLandmarks.length})</span>
            </h3>
            <span className="text-xs font-mono text-slate-400">
              Persisted Offline in Browser Storage
            </span>
          </div>

          {favoriteLandmarks.length === 0 ? (
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-8 text-center space-y-3">
              <Bookmark className="w-8 h-8 text-slate-500 mx-auto" />
              <div className="text-base font-semibold text-white">
                No Saved Historical Spots Yet
              </div>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Click the heart icon on any Cleveland landmark in the 3D Tour or select from the quick-save list below to bookmark spots for your walking route.
              </p>
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                {landmarks.map((lm) => (
                  <button
                    key={lm.id}
                    type="button"
                    onClick={() => onToggleFavorite(lm.id)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700"
                  >
                    + Save {lm.shortTitle}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {favoriteLandmarks.map((lm) => {
                const draft = noteDrafts[lm.id] ?? fieldNotes[lm.id] ?? '';
                return (
                  <div
                    key={lm.id}
                    className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-xs font-mono text-amber-400">
                          Stop 0{lm.walkingOrder} · Completed {lm.yearCompleted} · {lm.districtName}
                        </div>
                        <h4 className="text-base font-bold text-white mt-0.5">
                          {lm.shortTitle}
                        </h4>
                        <p className="text-xs text-slate-300 mt-1">
                          {lm.summary}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {onNarrateLandmarkHistory && (
                          <button
                            type="button"
                            onClick={() => onNarrateLandmarkHistory(lm)}
                            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                              activeNarrationLandmarkId === lm.id
                                ? 'bg-sky-500/20 border-sky-400 text-sky-300'
                                : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-100'
                            }`}
                          >
                            {activeNarrationLandmarkId === lm.id ? (
                              <>
                                <VolumeX className="w-3.5 h-3.5 text-sky-300" />
                                <span>Stop Narration</span>
                              </>
                            ) : (
                              <>
                                <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                                <span>Hear Landmark History</span>
                              </>
                            )}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onJumpToLandmark3D(lm)}
                          className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors whitespace-nowrap"
                        >
                          Open in 3D & AR
                        </button>
                        <button
                          type="button"
                          onClick={() => onToggleFavorite(lm.id)}
                          aria-label={`Remove ${lm.shortTitle} from saved favorites`}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-slate-700 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Personal Tourist Field Note */}
                    <div className="pt-3 border-t border-slate-800">
                      <label
                        htmlFor={`note-${lm.id}`}
                        className="block text-[11px] font-mono text-slate-400 mb-1.5"
                      >
                        Personal Field Note & Walking Memory:
                      </label>
                      <div className="flex gap-2">
                        <input
                          id={`note-${lm.id}`}
                          type="text"
                          placeholder={`Add a note for ${lm.shortTitle} (e.g., best photo angle, favorite stall)...`}
                          value={draft}
                          onChange={(e) =>
                            setNoteDrafts((prev) => ({
                              ...prev,
                              [lm.id]: e.target.value,
                            }))
                          }
                          className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-amber-500"
                        />
                        <button
                          type="button"
                          onClick={() => onSaveFieldNote(lm.id, draft)}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-amber-300 border border-slate-700 whitespace-nowrap"
                        >
                          Save Note
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Social Discovery Card Studio & Community Feed (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Share2 className="w-4 h-4 text-amber-400" />
                <span>Share Discovered Location</span>
              </h3>
              <span className="text-xs font-mono text-sky-400">Social Postcard</span>
            </div>

            {/* Live Visual Postcard Preview */}
            <div className="rounded-xl overflow-hidden border border-slate-700 bg-slate-950">
              <div className="relative h-40 w-full bg-slate-800">
                <img
                  src={activeShareLandmark.heroImage}
                  alt={activeShareLandmark.shortTitle}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
                {attachedBadgeStatus && (
                  <div className="absolute top-3 right-3 bg-slate-950/90 border border-amber-400/80 rounded-lg px-2.5 py-1 text-[11px] font-mono text-amber-300 flex items-center gap-1.5 shadow">
                    <Award className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>{attachedBadgeStatus.badge.serialCode} · {attachedBadgeStatus.badge.stickerTitle}</span>
                  </div>
                )}
                <div className="absolute bottom-3 left-3 right-3">
                  <div className="text-[11px] font-mono text-amber-300">
                    {activeFact?.eraLabel} · {activeShareLandmark.districtName}
                  </div>
                  <div className="text-base font-bold text-white">
                    {activeShareLandmark.shortTitle}
                  </div>
                </div>
              </div>

              <div className="p-3.5 space-y-2">
                <div className="text-xs font-semibold text-sky-300">
                  AR Fact: {activeFact?.title}
                </div>
                <p className="text-xs text-slate-300 italic">
                  "{customShareNote}"
                </p>
                <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <span>By {explorerName || 'Cleveland Explorer'}</span>
                  <span>
                    {activeShareLandmark.tourAnchor.lat.toFixed(4)}°N,{' '}
                    {Math.abs(activeShareLandmark.tourAnchor.lng).toFixed(4)}°W
                  </span>
                </div>
              </div>
            </div>

            {/* Customization Controls */}
            <form onSubmit={handlePublishToFeed} className="space-y-3">
              <div>
                <label
                  htmlFor="share-landmark-select"
                  className="block text-xs font-mono text-slate-400 mb-1"
                >
                  Discovered Landmark:
                </label>
                <select
                  id="share-landmark-select"
                  value={activeShareLandmark.id}
                  onChange={(e) => {
                    const newId = e.target.value;
                    setSelectedShareLandmarkId(newId);
                    const lm = landmarks.find((l) => l.id === newId);
                    if (lm && lm.arFacts[0]) {
                      setSelectedShareFactId(lm.arFacts[0].id);
                    }
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                >
                  {landmarks.map((lm) => (
                    <option key={lm.id} value={lm.id}>
                      0{lm.walkingOrder}. {lm.shortTitle} ({lm.yearCompleted})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="share-fact-select"
                  className="block text-xs font-mono text-slate-400 mb-1"
                >
                  Featured AR Historical Overlay:
                </label>
                <select
                  id="share-fact-select"
                  value={activeFact?.id || ''}
                  onChange={(e) => setSelectedShareFactId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                >
                  {activeShareLandmark.arFacts.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.eraLabel} — {f.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="share-note-textarea"
                  className="block text-xs font-mono text-slate-400 mb-1"
                >
                  Your Explorer Caption:
                </label>
                <textarea
                  id="share-note-textarea"
                  rows={2}
                  required
                  value={customShareNote}
                  onChange={(e) => setCustomShareNote(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="submit"
                  className="flex-1 py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Post to Explorer Feed</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyShareLink}
                  className="py-2.5 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Share Link</span>
                    </>
                  )}
                </button>
              </div>

              {publishedToast && (
                <div className="text-xs font-mono text-emerald-400 text-center pt-1">
                  ✓ Discovery card published to the Cleveland Community Feed below!
                </div>
              )}
            </form>
          </div>

          {/* Community Shared Discoveries Feed */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="text-sm font-bold text-white flex items-center justify-between">
              <span>Recent Community Discoveries ({sharedPosts.length})</span>
              <span className="text-xs font-mono text-slate-400">Live Trail Log</span>
            </div>

            <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
              {sharedPosts.map((post) => (
                <div
                  key={post.id}
                  className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800 space-y-1.5"
                >
                  <div className="flex items-center justify-between text-[11px] font-mono text-amber-400">
                    <span>
                      {post.landmarkTitle} · {post.factEra}
                    </span>
                    <span className="text-slate-500">{post.sharedAtLabel}</span>
                  </div>
                  {post.badgeStickerTitle && (
                    <div className="text-[11px] font-mono text-emerald-400">
                      ★ Sticker Unlocked: {post.badgeStickerTitle} ({post.badgeSerialCode})
                    </div>
                  )}
                  <div className="text-xs font-semibold text-white">
                    {post.factTitle}
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    "{post.personalNote}"
                  </p>
                  <div className="text-[11px] font-mono text-slate-400 pt-1 flex items-center justify-between">
                    <span>Shared by {post.explorerName}</span>
                    <span>{post.coordinatesLabel}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
