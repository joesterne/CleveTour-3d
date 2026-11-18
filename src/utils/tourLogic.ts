import {
  ARHistoricalFact,
  LandmarkBlueprint,
  OfflineDistrictPack,
  PassportBadgeDefinition,
} from '../data/clevelandLandmarks';

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface ProximityNotification {
  id: string;
  landmarkId: string;
  landmarkTitle: string;
  distanceMeters: number;
  headlineFact: ARHistoricalFact;
  triggeredAtIso: string;
}

/**
 * Calculates great-circle distance in meters between two WGS84 coordinates using Haversine formula.
 */
export function calculateHaversineDistanceMeters(a: GeoPoint, b: GeoPoint): number {
  const R = 6371000; // Earth mean radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
  return Math.round(R * c);
}

/**
 * Calculates initial compass bearing (0-359 degrees) and 8-point cardinal label from origin to destination.
 */
export function calculateCompassBearing(
  origin: GeoPoint,
  destination: GeoPoint
): { degrees: number; cardinal: string } {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;

  const lat1 = toRad(origin.lat);
  const lat2 = toRad(destination.lat);
  const dLng = toRad(destination.lng - origin.lng);

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const rawDeg = (toDeg(Math.atan2(y, x)) + 360) % 360;
  const degrees = Math.round(rawDeg) % 360;

  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round(degrees / 45) % 8;
  return { degrees, cardinal: dirs[idx] };
}

/**
 * Estimates pedestrian walking duration in minutes given distance in meters and elevation delta.
 * Uses Naismith's rule (~80m/min flat + 1 min per 10m climb).
 */
export function estimateWalkingMinutes(
  distanceMeters: number,
  elevationGainMeters = 0
): number {
  if (distanceMeters <= 0) return 0;
  const flatMinutes = distanceMeters / 78;
  const climbMinutes = Math.max(0, elevationGainMeters) / 10;
  return Math.max(1, Math.round(flatMinutes + climbMinutes));
}

/**
 * Evaluates user coordinates against all Cleveland landmarks and returns newly triggered
 * proximity push notifications for landmarks within `geofenceRadiusMeters` (default 180m)
 * that haven't been notified yet in the current session.
 */
export function evaluateProximityGeofences(
  userPosition: GeoPoint,
  landmarks: LandmarkBlueprint[],
  alreadyNotifiedIds: string[],
  geofenceRadiusMeters = 180,
  nowIso = new Date().toISOString()
): ProximityNotification[] {
  const notifiedSet = new Set(alreadyNotifiedIds);
  const alerts: ProximityNotification[] = [];

  for (const lm of landmarks) {
    if (notifiedSet.has(lm.id)) continue;
    const dist = calculateHaversineDistanceMeters(userPosition, lm.tourAnchor);
    if (dist <= geofenceRadiusMeters && lm.arFacts.length > 0) {
      alerts.push({
        id: `notif-${lm.id}-${dist}`,
        landmarkId: lm.id,
        landmarkTitle: lm.shortTitle,
        distanceMeters: dist,
        headlineFact: lm.arFacts[0],
        triggeredAtIso: nowIso,
      });
    }
  }

  return alerts.sort((a, b) => a.distanceMeters - b.distanceMeters);
}

/**
 * Interpolates a walker's position along the ordered landmark trail for the foot-traffic simulator.
 * `progress` ranges from 0 (first landmark) to `landmarks.length - 1` (final landmark).
 */
export function interpolateTrailPosition(
  landmarks: LandmarkBlueprint[],
  progress: number
): { position: GeoPoint; nearestLandmarkId: string; segmentIndex: number } {
  if (landmarks.length === 0) {
    return {
      position: { lat: 41.4984, lng: -81.6937 },
      nearestLandmarkId: '',
      segmentIndex: 0,
    };
  }
  const clamped = Math.max(0, Math.min(landmarks.length - 1, progress));
  const segIdx = Math.min(landmarks.length - 2, Math.floor(clamped));
  const t = clamped - segIdx;

  const start = landmarks[segIdx].tourAnchor;
  const end = landmarks[Math.min(landmarks.length - 1, segIdx + 1)].tourAnchor;

  const lat = Number((start.lat + (end.lat - start.lat) * t).toFixed(6));
  const lng = Number((start.lng + (end.lng - start.lng) * t).toFixed(6));

  const nearestIdx = Math.round(clamped);
  return {
    position: { lat, lng },
    nearestLandmarkId: landmarks[nearestIdx].id,
    segmentIndex: segIdx,
  };
}

/**
 * Computes total offline storage footprint and coverage percentage for downloaded district packs.
 */
export function calculateOfflinePackStats(
  packs: OfflineDistrictPack[],
  downloadedPackIds: string[],
  totalLandmarksCount: number
): {
  downloadedMb: number;
  totalAvailableMb: number;
  offlineLandmarksCovered: number;
  coveragePercent: number;
  isLandmarkAvailableOffline: (landmarkId: string) => boolean;
} {
  const downloadedSet = new Set(downloadedPackIds);
  const coveredLandmarkIds = new Set<string>();

  let downloadedMb = 0;
  let totalAvailableMb = 0;

  for (const pack of packs) {
    const packTotal =
      pack.vectorTilesMb + pack.meshes3DMb + pack.arAudioFactsMb;
    totalAvailableMb += packTotal;
    if (downloadedSet.has(pack.id)) {
      downloadedMb += packTotal;
      for (const lid of pack.landmarkIds) {
        coveredLandmarkIds.add(lid);
      }
    }
  }

  const coveragePercent =
    totalLandmarksCount > 0
      ? Math.round((coveredLandmarkIds.size / totalLandmarksCount) * 100)
      : 0;

  return {
    downloadedMb: Number(downloadedMb.toFixed(1)),
    totalAvailableMb: Number(totalAvailableMb.toFixed(1)),
    offlineLandmarksCovered: coveredLandmarkIds.size,
    coveragePercent,
    isLandmarkAvailableOffline: (landmarkId: string) =>
      coveredLandmarkIds.has(landmarkId),
  };
}

/**
 * Filters AR historical facts by era year range and category.
 */
export function filterARFactsByEra(
  facts: ARHistoricalFact[],
  maxYear: number,
  category: string = 'ALL'
): ARHistoricalFact[] {
  return facts.filter((f) => {
    const matchesYear = f.year <= maxYear;
    const matchesCategory = category === 'ALL' || f.category === category;
    return matchesYear && matchesCategory;
  });
}

/**
 * Generates production-ready React Native + ViroReact (@reactvision/react-viro) component code
 * for the selected Cleveland landmark and its spatial AR historical fact nodes.
 */
export function generateViroReactSceneCode(landmark: LandmarkBlueprint): string {
  const nodesCode = landmark.arFacts
    .map(
      (fact, idx) => `      {/* AR Historical Fact Overlay #${idx + 1}: ${fact.title} */}
      <ViroNode
        position={[${fact.arOffset3D[0].toFixed(1)}, ${(fact.arOffset3D[1] * 0.18).toFixed(2)}, ${(fact.arOffset3D[2] * 0.18 - 2.5).toFixed(2)}]}
        dragType="FixedToWorld"
        onClick={() => onSelectFact("${fact.id}")}
      >
        <ViroFlexView
          style={styles.arCard}
          width={1.6}
          height={0.95}
          rotation={[0, 0, 0]}
        >
          <ViroText
            text="${fact.eraLabel} · ${fact.category}"
            style={styles.arEraText}
            width={1.45}
            height={0.2}
          />
          <ViroText
            text="${fact.title.replace(/"/g, '\\"')}"
            style={styles.arTitleText}
            width={1.45}
            height={0.3}
          />
          <ViroText
            text="${fact.architecturalSpec.replace(/"/g, '\\"')}"
            style={styles.arSpecText}
            width={1.45}
            height={0.25}
          />
        </ViroFlexView>
      </ViroNode>`
    )
    .join('\n\n');

  return `import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import {
  ViroARScene,
  ViroARSceneNavigator,
  ViroNode,
  Viro3DObject,
  ViroAmbientLight,
  ViroDirectionalLight,
  ViroFlexView,
  ViroText,
  ViroTrackingStateConstants,
} from '@reactvision/react-viro';

// Landmark: ${landmark.shortTitle} (${landmark.yearCompleted})
// GPS Anchor: ${landmark.tourAnchor.lat.toFixed(4)}°N, ${Math.abs(landmark.tourAnchor.lng).toFixed(4)}°W
export function ClevelandLandmarkARScene({ onSelectFact }: { onSelectFact: (id: string) => void }) {
  const [trackingReady, setTrackingReady] = useState(false);

  return (
    <ViroARScene
      onTrackingUpdated={(state) => {
        if (state === ViroTrackingStateConstants.TRACKING_NORMAL) {
          setTrackingReady(true);
        }
      }}
    >
      <ViroAmbientLight color="#dbeafe" intensity={240} />
      <ViroDirectionalLight
        color="#fde68a"
        direction={[-0.4, -0.8, -0.3]}
        castsShadow={true}
      />

      {/* Offline-Cached 3D Architectural Mesh Anchor */}
      <ViroNode position={[0, -0.8, -3.2]}>
        <Viro3DObject
          source={require('./offline_assets/${landmark.slug}.glb')}
          scale={[0.35, 0.35, 0.35]}
          type="GLB"
        />
      </ViroNode>

${nodesCode}
    </ViroARScene>
  );
}

export default function ClevelandViroTourNavigator() {
  const [activeFactId, setActiveFactId] = useState<string | null>(null);
  return (
    <ViroARSceneNavigator
      autofocus={true}
      initialScene={{
        scene: () => <ClevelandLandmarkARScene onSelectFact={setActiveFactId} />,
      }}
      style={{ flex: 1 }}
    />
  );
}

const styles = StyleSheet.create({
  arCard: {
    backgroundColor: '#0f172ae6',
    padding: 0.08,
    flexDirection: 'column',
  },
  arEraText: {
    fontFamily: 'JetBrainsMono-Medium',
    fontSize: 10,
    color: '${landmark.accentHex}',
  },
  arTitleText: {
    fontFamily: 'Outfit-Bold',
    fontSize: 14,
    color: '#f8fafc',
  },
  arSpecText: {
    fontFamily: 'PlusJakartaSans-Regular',
    fontSize: 10,
    color: '#cbd5e1',
  },
});`;
}

export interface PassportBadgeStatus {
  badge: PassportBadgeDefinition;
  visitedLandmarkIds: string[];
  missingLandmarkIds: string[];
  visitedCount: number;
  totalRequired: number;
  progressPercent: number;
  isUnlocked: boolean;
}

export interface PassportOverallProgress {
  totalLandmarks: number;
  visitedLandmarksCount: number;
  overallProgressPercent: number;
  unlockedBadgesCount: number;
  totalBadgesCount: number;
  districtBadgesUnlockedCount: number;
  totalDistrictBadgesCount: number;
  explorerRankTitle: string;
  nextMilestoneLabel: string;
  badges: PassportBadgeStatus[];
}

/**
 * Evaluates all district and citywide Passport Badges against the user's visited landmark IDs,
 * returning overall progress bar metrics and individual digital achievement sticker states.
 */
export function evaluatePassportBadges(
  landmarks: LandmarkBlueprint[],
  badgeDefinitions: PassportBadgeDefinition[],
  visitedIds: string[]
): PassportOverallProgress {
  const validLandmarkIds = new Set(landmarks.map((l) => l.id));
  const visitedSet = new Set(visitedIds.filter((id) => validLandmarkIds.has(id)));

  const totalLandmarks = landmarks.length;
  const visitedLandmarksCount = visitedSet.size;
  const overallProgressPercent =
    totalLandmarks > 0
      ? Math.round((visitedLandmarksCount / totalLandmarks) * 100)
      : 0;

  const badges: PassportBadgeStatus[] = badgeDefinitions.map((badge) => {
    const visitedLandmarkIds = badge.requiredLandmarkIds.filter((id) =>
      visitedSet.has(id)
    );
    const missingLandmarkIds = badge.requiredLandmarkIds.filter(
      (id) => !visitedSet.has(id)
    );
    const visitedCount = visitedLandmarkIds.length;
    const totalRequired = badge.requiredLandmarkIds.length;
    const progressPercent =
      totalRequired > 0 ? Math.round((visitedCount / totalRequired) * 100) : 0;
    const isUnlocked = totalRequired > 0 && visitedCount === totalRequired;

    return {
      badge,
      visitedLandmarkIds,
      missingLandmarkIds,
      visitedCount,
      totalRequired,
      progressPercent,
      isUnlocked,
    };
  });

  const unlockedBadgesCount = badges.filter((b) => b.isUnlocked).length;
  const totalBadgesCount = badges.length;

  const districtBadges = badges.filter(
    (b) => b.badge.districtId !== 'all-districts'
  );
  const districtBadgesUnlockedCount = districtBadges.filter(
    (b) => b.isUnlocked
  ).length;
  const totalDistrictBadgesCount = districtBadges.length;

  let explorerRankTitle = 'First-Step Cleveland Visitor';
  if (visitedLandmarksCount >= totalLandmarks && totalLandmarks > 0) {
    explorerRankTitle = 'Grand Cleveland Heritage Laureate';
  } else if (districtBadgesUnlockedCount >= 2) {
    explorerRankTitle = 'Cuyahoga Corridor Historian';
  } else if (districtBadgesUnlockedCount === 1) {
    explorerRankTitle = 'District Heritage Pioneer';
  } else if (visitedLandmarksCount >= 2) {
    explorerRankTitle = 'Active Footpath Explorer';
  }

  // Find closest locked district badge to guide the user
  const lockedBadges = badges
    .filter((b) => !b.isUnlocked)
    .sort((a, b) => a.missingLandmarkIds.length - b.missingLandmarkIds.length);

  let nextMilestoneLabel =
    'All 4 Cleveland Passport Digital Stickers Unlocked!';
  if (lockedBadges.length > 0) {
    const nextBadge = lockedBadges[0];
    const remaining = nextBadge.missingLandmarkIds.length;
    const nextLandmarkNames = nextBadge.missingLandmarkIds
      .map((id) => landmarks.find((l) => l.id === id)?.shortTitle || id)
      .join(' & ');
    nextMilestoneLabel = `Visit ${remaining} more spot${remaining > 1 ? 's' : ''} (${nextLandmarkNames}) to unlock "${nextBadge.badge.stickerTitle}"`;
  }

  return {
    totalLandmarks,
    visitedLandmarksCount,
    overallProgressPercent,
    unlockedBadgesCount,
    totalBadgesCount,
    districtBadgesUnlockedCount,
    totalDistrictBadgesCount,
    explorerRankTitle,
    nextMilestoneLabel,
    badges,
  };
}

/**
 * Detects which Passport Badges transitioned from locked to unlocked when visitedIds changes.
 */
export function detectNewlyUnlockedBadges(
  previousVisitedIds: string[],
  nextVisitedIds: string[],
  landmarks: LandmarkBlueprint[],
  badgeDefinitions: PassportBadgeDefinition[]
): PassportBadgeDefinition[] {
  const before = evaluatePassportBadges(
    landmarks,
    badgeDefinitions,
    previousVisitedIds
  );
  const after = evaluatePassportBadges(
    landmarks,
    badgeDefinitions,
    nextVisitedIds
  );

  const previouslyUnlockedIds = new Set(
    before.badges.filter((b) => b.isUnlocked).map((b) => b.badge.id)
  );

  return after.badges
    .filter((b) => b.isUnlocked && !previouslyUnlockedIds.has(b.badge.id))
    .map((b) => b.badge);
}

export interface LandmarkNarrationPayload {
  landmarkId: string;
  landmarkTitle: string;
  factId?: string;
  factTitle?: string;
  spokenText: string;
  estimatedDurationSeconds: number;
  factCount: number;
}

/**
 * Builds a natural-language Web Speech API narration script for a Cleveland landmark
 * and its historical AR facts (or a single selected fact) so tourists can listen while walking.
 */
export function buildLandmarkNarrationScript(
  landmark: LandmarkBlueprint,
  specificFact?: ARHistoricalFact | null
): LandmarkNarrationPayload {
  if (specificFact) {
    const spokenText = `${landmark.shortTitle}, ${specificFact.eraLabel}: ${specificFact.title}. ${specificFact.narrative} Architectural specification: ${specificFact.architecturalSpec}.`;
    const wordCount = spokenText.split(/\s+/).filter(Boolean).length;
    const estimatedDurationSeconds = Math.max(5, Math.round((wordCount / 145) * 60));
    return {
      landmarkId: landmark.id,
      landmarkTitle: landmark.shortTitle,
      factId: specificFact.id,
      factTitle: specificFact.title,
      spokenText,
      estimatedDurationSeconds,
      factCount: 1,
    };
  }

  const factsNarration = landmark.arFacts
    .map(
      (fact, idx) =>
        `Historical Fact ${idx + 1}, ${fact.eraLabel} — ${fact.title}: ${fact.narrative}`
    )
    .join(' ');

  const spokenText = [
    `Stop ${landmark.walkingOrder} on the Cleveland Walking Tour: ${landmark.shortTitle}, completed in ${landmark.yearCompleted} in ${landmark.districtName}.`,
    `Architectural style: ${landmark.architecturalStyle}, designed by ${landmark.architect}.`,
    landmark.summary,
    factsNarration,
    `Next walking direction: ${landmark.walkingCueToNext}`,
  ]
    .filter(Boolean)
    .join(' ');

  const wordCount = spokenText.split(/\s+/).filter(Boolean).length;
  const estimatedDurationSeconds = Math.max(10, Math.round((wordCount / 145) * 60));

  return {
    landmarkId: landmark.id,
    landmarkTitle: landmark.shortTitle,
    spokenText,
    estimatedDurationSeconds,
    factCount: landmark.arFacts.length,
  };
}

export type WeatherIconCategory =
  | 'SUN'
  | 'PARTLY_CLOUDY'
  | 'CLOUD'
  | 'FOG'
  | 'RAIN'
  | 'SNOW'
  | 'STORM';

export interface WmoWeatherDescriptor {
  code: number;
  label: string;
  iconCategory: WeatherIconCategory;
  isPrecipitation: boolean;
}

export interface HourlyWalkingForecastPoint {
  timeIso: string;
  hourLabel: string;
  temperatureF: number;
  precipitationProbability: number;
  windSpeedMph: number;
  weatherCode: number;
  conditionLabel: string;
  iconCategory: WeatherIconCategory;
}

export interface WalkingWeatherAssessment {
  walkabilityRating:
    | 'Optimal Walking Conditions'
    | 'Breezy Lakefront — Layer Up'
    | 'Wet Pavement — Waterproof Gear'
    | 'Cold & Blustery — Thermal Layers';
  walkabilityScore: number; // 0-100
  badgeTone: 'emerald' | 'amber' | 'sky' | 'rose';
  clothingTip: string;
  footwearAndGearTip: string;
  arVisibilityNote: string;
}

export interface ClevelandWeatherSnapshot {
  fetchedAtIso: string;
  sourceLabel: string;
  latitude: number;
  longitude: number;
  temperatureF: number;
  apparentTemperatureF: number;
  relativeHumidityPercent: number;
  windSpeedMph: number;
  windGustsMph: number;
  windDirectionDegrees: number;
  windCardinal: string;
  precipitationInches: number;
  precipitationProbabilityPercent: number;
  weatherCode: number;
  isDay: boolean;
  condition: WmoWeatherDescriptor;
  hourlyForecast: HourlyWalkingForecastPoint[];
}

/**
 * Converts Fahrenheit to Celsius rounded to 1 decimal place (or nearest integer).
 */
export function convertFahrenheitToCelsius(tempF: number): number {
  return Math.round(((tempF - 32) * 5) / 9);
}

/**
 * Formats a Fahrenheit temperature into either °F or °C display string.
 */
export function formatTemperatureDisplay(
  tempF: number,
  unit: 'F' | 'C'
): string {
  if (unit === 'C') {
    return `${convertFahrenheitToCelsius(tempF)}°C`;
  }
  return `${Math.round(tempF)}°F`;
}

/**
 * Converts wind azimuth degrees (0-360) into an 8-point cardinal direction.
 */
export function degreesToCardinalWind(degrees: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const normalized = ((degrees % 360) + 360) % 360;
  return dirs[Math.round(normalized / 45) % 8];
}

/**
 * Maps WMO Weather Interpretation Codes (WW) returned by Open-Meteo to descriptive labels and icons.
 */
export function describeWmoWeatherCode(code: number): WmoWeatherDescriptor {
  if (code === 0) {
    return {
      code,
      label: 'Clear Lake Erie Sky',
      iconCategory: 'SUN',
      isPrecipitation: false,
    };
  }
  if (code === 1 || code === 2) {
    return {
      code,
      label: 'Partly Cloudy',
      iconCategory: 'PARTLY_CLOUDY',
      isPrecipitation: false,
    };
  }
  if (code === 3) {
    return {
      code,
      label: 'Overcast Canopy',
      iconCategory: 'CLOUD',
      isPrecipitation: false,
    };
  }
  if (code >= 45 && code <= 48) {
    return {
      code,
      label: 'Lakefront Mist & Fog',
      iconCategory: 'FOG',
      isPrecipitation: false,
    };
  }
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
    return {
      code,
      label: code >= 63 || code >= 81 ? 'Steady Rain Showers' : 'Light Drizzle',
      iconCategory: 'RAIN',
      isPrecipitation: true,
    };
  }
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) {
    return {
      code,
      label: 'Lake-Effect Snow Flurries',
      iconCategory: 'SNOW',
      isPrecipitation: true,
    };
  }
  if (code >= 95) {
    return {
      code,
      label: 'Thunderstorm Squall',
      iconCategory: 'STORM',
      isPrecipitation: true,
    };
  }
  return {
    code,
    label: 'Variable Cloud Cover',
    iconCategory: 'PARTLY_CLOUDY',
    isPrecipitation: false,
  };
}

/**
 * Evaluates current Cleveland weather parameters and district exposure to generate
 * actionable tourist walking preparation guidance (clothing, footwear, and AR visibility).
 */
export function evaluateWalkingPreparationAdvisory(params: {
  temperatureF: number;
  apparentTemperatureF: number;
  windSpeedMph: number;
  precipitationProbabilityPercent: number;
  weatherCode: number;
  isLakefrontDistrict?: boolean;
}): WalkingWeatherAssessment {
  const {
    temperatureF,
    apparentTemperatureF,
    windSpeedMph,
    precipitationProbabilityPercent,
    weatherCode,
    isLakefrontDistrict = false,
  } = params;

  const condition = describeWmoWeatherCode(weatherCode);
  let score = 94;

  if (condition.isPrecipitation || precipitationProbabilityPercent >= 55) {
    score -= 28;
  } else if (precipitationProbabilityPercent >= 30) {
    score -= 10;
  }

  if (windSpeedMph >= 20) {
    score -= 18;
  } else if (windSpeedMph >= 13) {
    score -= 8;
  }

  if (apparentTemperatureF < 35) {
    score -= 20;
  } else if (apparentTemperatureF < 48) {
    score -= 10;
  } else if (apparentTemperatureF > 88) {
    score -= 14;
  }

  if (isLakefrontDistrict && windSpeedMph >= 12) {
    score -= 6;
  }

  const walkabilityScore = Math.max(25, Math.min(99, Math.round(score)));

  if (condition.isPrecipitation || precipitationProbabilityPercent >= 55) {
    return {
      walkabilityRating: 'Wet Pavement — Waterproof Gear',
      walkabilityScore,
      badgeTone: 'sky',
      clothingTip:
        'Pack a hooded waterproof shell or compact wind-resistant umbrella; consider indoor historic corridors like The Arcade (1890) and West Side Market during heavier showers.',
      footwearAndGearTip:
        'Wear slip-resistant, waterproof walking shoes for wet Berea sandstone plazas and Hope Memorial Bridge sidewalks.',
      arVisibilityNote:
        'Keep a microfiber cloth handy for camera lens droplets when scanning outdoor ViroReact AR historical markers.',
    };
  }

  if (apparentTemperatureF <= 40) {
    return {
      walkabilityRating: 'Cold & Blustery — Thermal Layers',
      walkabilityScore,
      badgeTone: 'rose',
      clothingTip: `Feels like ${Math.round(apparentTemperatureF)}°F with Lake Erie wind chill. Wear an insulated coat, windproof mid-layer, warm hat, and touchscreen-friendly gloves.`,
      footwearAndGearTip:
        'Closed-toe insulated walking boots recommended for the 2.8-mile cross-town trail from Public Square to Ohio City.',
      arVisibilityNote:
        'Crisp winter air provides high contrast for 3D AR skyline overlays; cold temperatures can drain mobile batteries faster.',
    };
  }

  if (windSpeedMph >= 14 || (isLakefrontDistrict && windSpeedMph >= 10)) {
    return {
      walkabilityRating: 'Breezy Lakefront — Layer Up',
      walkabilityScore,
      badgeTone: 'amber',
      clothingTip: `Expect ${Math.round(windSpeedMph)} mph gusts off Lake Erie near North Coast Harbor. Bring a windbreaker or layered jacket over comfortable walking attire.`,
      footwearAndGearTip:
        'Supportive cushioned sneakers ideal for navigating the Pierhead Breakwall and Hope Memorial Bridge.',
      arVisibilityNote:
        'Clear horizontal sightlines across Lake Erie — brace your phone with both hands in coastal gusts for steady AR tracking.',
    };
  }

  return {
    walkabilityRating: 'Optimal Walking Conditions',
    walkabilityScore,
    badgeTone: 'emerald',
    clothingTip:
      temperatureF >= 74
        ? 'Light breathable layers, sunglasses, and sun protection for open plazas at Public Square and Mall C.'
        : 'Comfortable light layer or fleece suitable for a brisk 45-minute architectural walk across Downtown Cleveland.',
    footwearAndGearTip:
      'Dry brick and sandstone walkways across all 6 stops; standard cushioned walking shoes recommended.',
    arVisibilityNote:
      'High-visibility daylight conditions — ideal optical tracking for ViroReact 3D spatial fact nodes.',
  };
}

/**
 * Parses a raw Open-Meteo forecast API response into a structured ClevelandWeatherSnapshot.
 */
export function parseOpenMeteoForecastResponse(
  raw: any,
  fallbackCoords: GeoPoint = { lat: 41.4984, lng: -81.6937 }
): ClevelandWeatherSnapshot {
  const current = raw?.current || {};
  const hourly = raw?.hourly || {};

  const tempF =
    typeof current.temperature_2m === 'number' ? current.temperature_2m : 56;
  const apparentF =
    typeof current.apparent_temperature === 'number'
      ? current.apparent_temperature
      : tempF - 2;
  const humidity =
    typeof current.relative_humidity_2m === 'number'
      ? current.relative_humidity_2m
      : 64;
  const windSpeedMph =
    typeof current.wind_speed_10m === 'number' ? current.wind_speed_10m : 11.4;
  const windGustsMph =
    typeof current.wind_gusts_10m === 'number'
      ? current.wind_gusts_10m
      : Math.round(windSpeedMph * 1.35 * 10) / 10;
  const windDir =
    typeof current.wind_direction_10m === 'number'
      ? current.wind_direction_10m
      : 315;
  const precipIn =
    typeof current.precipitation === 'number' ? current.precipitation : 0;
  const weatherCode =
    typeof current.weather_code === 'number' ? current.weather_code : 2;
  const isDay = current.is_day !== 0;

  const times: string[] = Array.isArray(hourly.time) ? hourly.time : [];
  const temps: number[] = Array.isArray(hourly.temperature_2m)
    ? hourly.temperature_2m
    : [];
  const pop: number[] = Array.isArray(hourly.precipitation_probability)
    ? hourly.precipitation_probability
    : [];
  const winds: number[] = Array.isArray(hourly.wind_speed_10m)
    ? hourly.wind_speed_10m
    : [];
  const codes: number[] = Array.isArray(hourly.weather_code)
    ? hourly.weather_code
    : [];

  const currentIsoPrefix =
    typeof current.time === 'string' ? current.time.slice(0, 13) : '';
  let startIndex = times.findIndex((t) => t.startsWith(currentIsoPrefix));
  if (startIndex < 0) startIndex = 0;

  const hourlyForecast: HourlyWalkingForecastPoint[] = [];
  for (let i = 0; i < 4; i++) {
    const idx = startIndex + i;
    if (idx >= times.length) break;
    const rawTime = times[idx];
    const hourNum = Number(rawTime.slice(11, 13));
    const ampm = hourNum >= 12 ? 'PM' : 'AM';
    const hour12 = hourNum % 12 === 0 ? 12 : hourNum % 12;
    const hourLabel = i === 0 ? 'Now' : `${hour12} ${ampm}`;
    const hCode = typeof codes[idx] === 'number' ? codes[idx] : weatherCode;
    const desc = describeWmoWeatherCode(hCode);

    hourlyForecast.push({
      timeIso: rawTime,
      hourLabel,
      temperatureF: Math.round(
        typeof temps[idx] === 'number' ? temps[idx] : tempF
      ),
      precipitationProbability: Math.round(
        typeof pop[idx] === 'number' ? pop[idx] : 10
      ),
      windSpeedMph: Math.round(
        typeof winds[idx] === 'number' ? winds[idx] : windSpeedMph
      ),
      weatherCode: hCode,
      conditionLabel: desc.label,
      iconCategory: desc.iconCategory,
    });
  }

  const currentPop =
    hourlyForecast.length > 0 ? hourlyForecast[0].precipitationProbability : 10;

  return {
    fetchedAtIso: new Date().toISOString(),
    sourceLabel: 'Open-Meteo Open-Source Weather API (NOAA HRRR / GFS)',
    latitude: typeof raw?.latitude === 'number' ? raw.latitude : fallbackCoords.lat,
    longitude:
      typeof raw?.longitude === 'number' ? raw.longitude : fallbackCoords.lng,
    temperatureF: Math.round(tempF),
    apparentTemperatureF: Math.round(apparentF),
    relativeHumidityPercent: Math.round(humidity),
    windSpeedMph: Number(windSpeedMph.toFixed(1)),
    windGustsMph: Number(windGustsMph.toFixed(1)),
    windDirectionDegrees: Math.round(windDir),
    windCardinal: degreesToCardinalWind(windDir),
    precipitationInches: Number(precipIn.toFixed(2)),
    precipitationProbabilityPercent: currentPop,
    weatherCode,
    isDay,
    condition: describeWmoWeatherCode(weatherCode),
    hourlyForecast,
  };
}

export type HapticEventType =
  | 'LANDMARK_ARRIVAL'
  | 'BADGE_UNLOCKED'
  | 'PROXIMITY_NOTIFICATION';

export interface HapticFeedbackPulse {
  eventType: HapticEventType;
  patternMs: number[];
  totalDurationMs: number;
  label: string;
  contextTitle: string;
  patternNotation: string;
  triggeredAtIso: string;
}

const HAPTIC_PATTERNS: Record<
  HapticEventType,
  { patternMs: number[]; label: string }
> = {
  LANDMARK_ARRIVAL: {
    // Subtle crisp two-step footstep arrival pulse (35ms buzz, 45ms pause, 55ms buzz)
    patternMs: [35, 45, 55],
    label: 'Landmark Arrival Pulse',
  },
  BADGE_UNLOCKED: {
    // Celebratory triple-crest passport stamp fanfare (50ms, 40ms pause, 50ms, 40ms pause, 110ms)
    patternMs: [50, 40, 50, 40, 110],
    label: 'Passport Badge Unlocked Haptic',
  },
  PROXIMITY_NOTIFICATION: {
    // Gentle double-tap geofence alert (25ms buzz, 35ms pause, 25ms buzz)
    patternMs: [25, 35, 25],
    label: 'Proximity Geofence Double-Tap',
  },
};

/**
 * Builds a structured Web Vibration API haptic pulse specification for a tour milestone event.
 */
export function buildHapticFeedbackPulse(
  eventType: HapticEventType,
  contextTitle: string,
  nowIso: string = new Date().toISOString()
): HapticFeedbackPulse {
  const spec = HAPTIC_PATTERNS[eventType];
  const patternMs = [...spec.patternMs];
  const totalDurationMs = patternMs.reduce((sum, ms) => sum + ms, 0);
  const patternNotation = patternMs
    .map((ms, idx) => (idx % 2 === 0 ? `${ms}ms` : `${ms}ms gap`))
    .join(' · ');

  return {
    eventType,
    patternMs,
    totalDurationMs,
    label: spec.label,
    contextTitle,
    patternNotation,
    triggeredAtIso: nowIso,
  };
}

/**
 * Executes a haptic feedback pulse via the Web Vibration API (`navigator.vibrate`)
 * when enabled, returning deterministic execution metadata for UI feedback and testing.
 */
export function triggerDeviceHapticFeedback(
  pulse: HapticFeedbackPulse,
  enabled: boolean = true,
  customVibrateFn?: ((pattern: number | number[]) => boolean) | null
): {
  didVibrate: boolean;
  apiSupported: boolean;
  pulse: HapticFeedbackPulse;
} {
  const vibrateFn =
    customVibrateFn !== undefined
      ? customVibrateFn
      : typeof navigator !== 'undefined' &&
        typeof navigator.vibrate === 'function'
      ? navigator.vibrate.bind(navigator)
      : null;

  const apiSupported = typeof vibrateFn === 'function';

  if (!enabled) {
    return {
      didVibrate: false,
      apiSupported,
      pulse,
    };
  }

  let didVibrate = false;
  if (apiSupported && vibrateFn) {
    try {
      didVibrate = Boolean(vibrateFn(pulse.patternMs));
    } catch {
      didVibrate = false;
    }
  }

  return {
    didVibrate,
    apiSupported,
    pulse,
  };
}




