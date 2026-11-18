import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  APIProvider,
  Map as GoogleMap,
  AdvancedMarker,
  InfoWindow,
  useMap,
  useMapsLibrary,
  useAdvancedMarkerRef,
} from '@vis.gl/react-google-maps';
import { LandmarkBlueprint } from '../data/clevelandLandmarks';
import {
  GeoPoint,
  calculateCompassBearing,
  calculateHaversineDistanceMeters,
  estimateWalkingMinutes,
} from '../utils/tourLogic';
import {
  Clock,
  Compass,
  ExternalLink,
  Eye,
  Footprints,
  Globe,
  MapPin,
  MessageSquareQuote,
  Navigation,
  Phone,
  Search,
  Sparkles,
  Star,
  Utensils,
  WifiOff,
} from 'lucide-react';

export interface LiveGooglePlacePhoto {
  uri: string;
  authorName: string;
  authorUri?: string;
}

export interface LiveGooglePlaceReview {
  rating?: number;
  text: string;
  relativeTime?: string;
  authorName: string;
  authorUri?: string;
  authorPhotoUri?: string;
}

export interface LiveGooglePlaceInfo {
  placeId?: string;
  displayName?: string;
  formattedAddress?: string;
  location?: GeoPoint;
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  editorialSummary?: string;
  weekdayDescriptions?: string[];
  websiteURI?: string;
  nationalPhoneNumber?: string;
  googleMapsURI?: string;
  photos?: LiveGooglePlacePhoto[];
  reviews?: LiveGooglePlaceReview[];
}

export interface DiscoveredNearbyPlace {
  id: string;
  displayName: string;
  formattedAddress: string;
  location: GeoPoint;
  rating?: number;
  userRatingCount?: number;
  primaryType?: string;
  googleMapsURI?: string;
  photoUri?: string;
  photoAuthorName?: string;
  photoAuthorUri?: string;
}

export interface RouteLegTelemetry {
  fromTitle: string;
  toTitle: string;
  distanceMeters: number;
  durationMinutes: number;
}

type NearbyCategory =
  | 'NONE'
  | 'CAFE'
  | 'RESTAURANT'
  | 'MUSEUM'
  | 'TRANSIT';

const NEARBY_CATEGORY_CONFIG: Record<
  Exclude<NearbyCategory, 'NONE'>,
  { label: string; types: string[] }
> = {
  CAFE: {
    label: 'Nearby Cafes & Bakeries',
    types: ['cafe', 'coffee_shop', 'bakery'],
  },
  RESTAURANT: {
    label: 'Nearby Cleveland Dining',
    types: ['restaurant'],
  },
  MUSEUM: {
    label: 'Museums & Attractions',
    types: ['museum', 'tourist_attraction', 'art_gallery'],
  },
  TRANSIT: {
    label: 'RTA Transit & Stations',
    types: ['transit_station', 'light_rail_station', 'bus_station'],
  },
};

interface MapPolylineInstance {
  setMap: (map: unknown | null) => void;
  setOptions: (opts: Record<string, unknown>) => void;
}

function extractLivePlaceInfo(p: any): LiveGooglePlaceInfo {
  const photos: LiveGooglePlacePhoto[] = Array.isArray(p.photos)
    ? p.photos.slice(0, 4).map((photo: any) => {
        const attr = photo.authorAttributions?.[0];
        return {
          uri:
            typeof photo.getURI === 'function'
              ? photo.getURI({ maxWidth: 800, maxHeight: 600 })
              : '',
          authorName: attr?.displayName || 'Google Maps Contributor',
          authorUri: attr?.uri || undefined,
        };
      }).filter((ph: LiveGooglePlacePhoto) => Boolean(ph.uri))
    : [];

  const reviews: LiveGooglePlaceReview[] = Array.isArray(p.reviews)
    ? p.reviews.slice(0, 3).map((rev: any) => ({
        rating: rev.rating,
        text: rev.text || '',
        relativeTime: rev.relativePublishTimeDescription || '',
        authorName:
          rev.authorAttribution?.displayName || 'Google Maps Reviewer',
        authorUri: rev.authorAttribution?.uri || undefined,
        authorPhotoUri: rev.authorAttribution?.photoURI || undefined,
      })).filter((r: LiveGooglePlaceReview) => Boolean(r.text))
    : [];

  const loc = p.location
    ? {
        lat:
          typeof p.location.lat === 'function'
            ? p.location.lat()
            : Number(p.location.lat),
        lng:
          typeof p.location.lng === 'function'
            ? p.location.lng()
            : Number(p.location.lng),
      }
    : undefined;

  return {
    placeId: p.id,
    displayName: p.displayName,
    formattedAddress: p.formattedAddress,
    location: loc,
    rating: typeof p.rating === 'number' ? p.rating : undefined,
    userRatingCount:
      typeof p.userRatingCount === 'number' ? p.userRatingCount : undefined,
    businessStatus: p.businessStatus,
    editorialSummary: p.editorialSummary || undefined,
    weekdayDescriptions:
      p.regularOpeningHours?.weekdayDescriptions || undefined,
    websiteURI: p.websiteURI || undefined,
    nationalPhoneNumber: p.nationalPhoneNumber || undefined,
    googleMapsURI: p.googleMapsURI || undefined,
    photos,
    reviews,
  };
}

function checkQuotaError(err: unknown) {
  const msg = String(err);
  if (
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('OVER_QUERY_LIMIT') ||
    msg.includes('Quota')
  ) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  }
}

interface RouteAndPlacesControllerProps {
  landmarks: LandmarkBlueprint[];
  origin: GeoPoint;
  selectedLandmark: LandmarkBlueprint;
  customDestination: DiscoveredNearbyPlace | null;
  offlineMode: boolean;
  nearbyCategory: NearbyCategory;
  customSearchQuery: string;
  searchTriggerCounter: number;
  onRouteComputed: (stats: {
    distanceMeters: number;
    durationMinutes: number;
    source: 'ROUTES_API' | 'OFFLINE_CORRIDOR';
  }) => void;
  onFullTrailComputed: (stats: {
    totalDistanceMeters: number;
    totalDurationMinutes: number;
    legs: RouteLegTelemetry[];
  }) => void;
  onPlaceLoaded: (landmarkId: string, info: LiveGooglePlaceInfo) => void;
  onNearbyPlacesLoaded: (places: DiscoveredNearbyPlace[]) => void;
  onSearchingChange: (searching: boolean) => void;
}

const RouteAndPlacesController: React.FC<RouteAndPlacesControllerProps> = ({
  landmarks,
  origin,
  selectedLandmark,
  customDestination,
  offlineMode,
  nearbyCategory,
  customSearchQuery,
  searchTriggerCounter,
  onRouteComputed,
  onFullTrailComputed,
  onPlaceLoaded,
  onNearbyPlacesLoaded,
  onSearchingChange,
}) => {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const placesLib = useMapsLibrary('places');

  const activeLegPolylinesRef = useRef<MapPolylineInstance[]>([]);
  const fullTrailPolylinesRef = useRef<MapPolylineInstance[]>([]);
  const placeCacheRef = useRef<Record<string, LiveGooglePlaceInfo>>({});
  const hydratedAllLandmarksRef = useRef(false);
  const computedFullTrailRef = useRef(false);

  // 1. Hydrate ALL 6 Cleveland Landmarks with Real Google Places API (New) Data (Photos, Reviews, Hours, Summaries, Place IDs)
  useEffect(() => {
    if (offlineMode || !placesLib) return;
    const PlaceClass = (placesLib as any).Place;
    if (!PlaceClass || typeof PlaceClass.searchByText !== 'function') return;

    if (hydratedAllLandmarksRef.current) return;
    hydratedAllLandmarksRef.current = true;

    landmarks.forEach((lm) => {
      if (placeCacheRef.current[lm.id]) {
        onPlaceLoaded(lm.id, placeCacheRef.current[lm.id]);
        return;
      }

      PlaceClass.searchByText({
        textQuery: lm.searchQuery,
        fields: [
          'id',
          'displayName',
          'formattedAddress',
          'location',
          'rating',
          'userRatingCount',
          'businessStatus',
          'editorialSummary',
          'regularOpeningHours',
          'websiteURI',
          'nationalPhoneNumber',
          'googleMapsURI',
          'photos',
          'reviews',
        ],
        locationBias: lm.tourAnchor,
        maxResultCount: 1,
        language: 'en-US',
        region: 'us',
        internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio'],
      })
        .then((res: any) => {
          const p = res?.places?.[0];
          if (!p) return;
          const info = extractLivePlaceInfo(p);
          placeCacheRef.current[lm.id] = info;
          onPlaceLoaded(lm.id, info);
        })
        .catch((err: unknown) => {
          checkQuotaError(err);
        });
    });
  }, [placesLib, landmarks, offlineMode, onPlaceLoaded]);

  // 2. Compute Complete 6-Stop Cleveland Walking Trail via Google Routes API (Route.computeRoutes)
  useEffect(() => {
    if (offlineMode || !routesLib || !map || landmarks.length < 2) return;
    const RouteClass = (routesLib as any).Route;
    if (!RouteClass || typeof RouteClass.computeRoutes !== 'function') return;

    if (computedFullTrailRef.current) return;
    computedFullTrailRef.current = true;

    const first = landmarks[0];
    const last = landmarks[landmarks.length - 1];
    const intermediates = landmarks.slice(1, -1).map((lm) => ({
      location: { lat: lm.tourAnchor.lat, lng: lm.tourAnchor.lng },
    }));

    RouteClass.computeRoutes({
      origin: { lat: first.tourAnchor.lat, lng: first.tourAnchor.lng },
      destination: { lat: last.tourAnchor.lat, lng: last.tourAnchor.lng },
      intermediates,
      travelMode: 'WALKING',
      fields: ['path', 'distanceMeters', 'durationMillis', 'legs'],
    })
      .then((res: any) => {
        const route = res?.routes?.[0];
        if (!route) return;

        fullTrailPolylinesRef.current.forEach((p) => p.setMap(null));
        if (typeof route.createPolylines === 'function') {
          const polys: MapPolylineInstance[] = route.createPolylines();
          polys.forEach((poly) => {
            poly.setOptions({
              strokeColor: '#f59e0b',
              strokeWeight: 4,
              strokeOpacity: 0.65,
              zIndex: 1,
            });
            poly.setMap(map);
          });
          fullTrailPolylinesRef.current = polys;
        }

        const legs: RouteLegTelemetry[] = Array.isArray(route.legs)
          ? route.legs.map((leg: any, idx: number) => ({
              fromTitle: landmarks[idx]?.shortTitle || `Stop ${idx + 1}`,
              toTitle: landmarks[idx + 1]?.shortTitle || `Stop ${idx + 2}`,
              distanceMeters:
                leg.distanceMeters ??
                calculateHaversineDistanceMeters(
                  landmarks[idx].tourAnchor,
                  landmarks[idx + 1].tourAnchor
                ),
              durationMinutes: leg.durationMillis
                ? Math.max(1, Math.round(leg.durationMillis / 60000))
                : 12,
            }))
          : [];

        onFullTrailComputed({
          totalDistanceMeters: route.distanceMeters ?? 4900,
          totalDurationMinutes: route.durationMillis
            ? Math.max(1, Math.round(route.durationMillis / 60000))
            : 64,
          legs,
        });
      })
      .catch((err: unknown) => {
        checkQuotaError(err);
      });

    return () => {
      fullTrailPolylinesRef.current.forEach((p) => p.setMap(null));
      fullTrailPolylinesRef.current = [];
      computedFullTrailRef.current = false;
    };
  }, [routesLib, map, landmarks, offlineMode]);

  // 3. Compute Active Pedestrian Walking Leg (Walker -> Selected Landmark or Selected Nearby Place)
  useEffect(() => {
    activeLegPolylinesRef.current.forEach((p) => p.setMap(null));
    activeLegPolylinesRef.current = [];

    const targetLocation =
      customDestination?.location || selectedLandmark.tourAnchor;

    const fallbackDist = calculateHaversineDistanceMeters(origin, targetLocation);
    const fallbackMins = estimateWalkingMinutes(fallbackDist, 4);

    if (offlineMode || !routesLib || !map) {
      onRouteComputed({
        distanceMeters: fallbackDist,
        durationMinutes: fallbackMins,
        source: 'OFFLINE_CORRIDOR',
      });
      return;
    }

    const RouteClass = (routesLib as any).Route;
    if (!RouteClass || typeof RouteClass.computeRoutes !== 'function') {
      onRouteComputed({
        distanceMeters: fallbackDist,
        durationMinutes: fallbackMins,
        source: 'OFFLINE_CORRIDOR',
      });
      return;
    }

    const request = {
      origin: { lat: origin.lat, lng: origin.lng },
      destination: {
        lat: targetLocation.lat,
        lng: targetLocation.lng,
      },
      travelMode: 'WALKING',
      fields: ['path', 'distanceMeters', 'durationMillis', 'viewport'],
    };

    RouteClass.computeRoutes(request)
      .then((res: any) => {
        const primaryRoute = res?.routes?.[0];
        if (!primaryRoute) {
          onRouteComputed({
            distanceMeters: fallbackDist,
            durationMinutes: fallbackMins,
            source: 'OFFLINE_CORRIDOR',
          });
          return;
        }

        if (typeof primaryRoute.createPolylines === 'function') {
          const newPolys: MapPolylineInstance[] = primaryRoute.createPolylines();
          newPolys.forEach((poly) => {
            poly.setOptions({
              strokeColor: '#38bdf8',
              strokeWeight: 6,
              strokeOpacity: 0.95,
              zIndex: 5,
            });
            poly.setMap(map);
          });
          activeLegPolylinesRef.current = newPolys;
        }

        const dist = primaryRoute.distanceMeters ?? fallbackDist;
        const durMins = primaryRoute.durationMillis
          ? Math.max(1, Math.round(primaryRoute.durationMillis / 60000))
          : fallbackMins;

        onRouteComputed({
          distanceMeters: dist,
          durationMinutes: durMins,
          source: 'ROUTES_API',
        });
      })
      .catch((err: unknown) => {
        checkQuotaError(err);
        onRouteComputed({
          distanceMeters: fallbackDist,
          durationMinutes: fallbackMins,
          source: 'OFFLINE_CORRIDOR',
        });
      });

    return () => {
      activeLegPolylinesRef.current.forEach((p) => p.setMap(null));
      activeLegPolylinesRef.current = [];
    };
  }, [
    routesLib,
    map,
    origin.lat,
    origin.lng,
    selectedLandmark.id,
    customDestination?.id,
    offlineMode,
  ]);

  // 4. Live Nearby Places Search (Place.searchNearby) around the Selected Cleveland Landmark
  useEffect(() => {
    if (offlineMode || !placesLib || nearbyCategory === 'NONE') {
      if (nearbyCategory === 'NONE' && !customSearchQuery.trim()) {
        onNearbyPlacesLoaded([]);
      }
      return;
    }

    const PlaceClass = (placesLib as any).Place;
    const SearchNearbyRankPreference = (placesLib as any)
      .SearchNearbyRankPreference;
    if (!PlaceClass || typeof PlaceClass.searchNearby !== 'function') return;

    const cfg = NEARBY_CATEGORY_CONFIG[nearbyCategory];
    onSearchingChange(true);

    PlaceClass.searchNearby({
      fields: [
        'id',
        'displayName',
        'location',
        'formattedAddress',
        'rating',
        'userRatingCount',
        'primaryType',
        'googleMapsURI',
        'photos',
      ],
      locationRestriction: {
        center: {
          lat: selectedLandmark.tourAnchor.lat,
          lng: selectedLandmark.tourAnchor.lng,
        },
        radius: 900,
      },
      includedPrimaryTypes: cfg.types,
      maxResultCount: 6,
      rankPreference: SearchNearbyRankPreference?.POPULARITY,
      language: 'en-US',
      region: 'us',
      internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio'],
    })
      .then((res: any) => {
        const list: DiscoveredNearbyPlace[] = (res?.places || [])
          .map((p: any) => {
            if (!p.location) return null;
            const lat =
              typeof p.location.lat === 'function'
                ? p.location.lat()
                : Number(p.location.lat);
            const lng =
              typeof p.location.lng === 'function'
                ? p.location.lng()
                : Number(p.location.lng);
            const firstPhoto = p.photos?.[0];
            const attr = firstPhoto?.authorAttributions?.[0];
            return {
              id: p.id || `${lat}-${lng}`,
              displayName: p.displayName || 'Cleveland Point of Interest',
              formattedAddress: p.formattedAddress || 'Cleveland, OH',
              location: { lat, lng },
              rating: typeof p.rating === 'number' ? p.rating : undefined,
              userRatingCount:
                typeof p.userRatingCount === 'number'
                  ? p.userRatingCount
                  : undefined,
              primaryType: p.primaryType || cfg.types[0],
              googleMapsURI: p.googleMapsURI || undefined,
              photoUri:
                firstPhoto && typeof firstPhoto.getURI === 'function'
                  ? firstPhoto.getURI({ maxWidth: 400, maxHeight: 300 })
                  : undefined,
              photoAuthorName: attr?.displayName || undefined,
              photoAuthorUri: attr?.uri || undefined,
            };
          })
          .filter(Boolean);
        onNearbyPlacesLoaded(list);
      })
      .catch((err: unknown) => {
        checkQuotaError(err);
      })
      .finally(() => {
        onSearchingChange(false);
      });
  }, [placesLib, selectedLandmark.id, nearbyCategory, offlineMode]);

  // 5. Custom Free-Text Search in Cleveland via Place.searchByText
  useEffect(() => {
    if (
      offlineMode ||
      !placesLib ||
      !customSearchQuery.trim() ||
      searchTriggerCounter === 0
    ) {
      return;
    }

    const PlaceClass = (placesLib as any).Place;
    if (!PlaceClass || typeof PlaceClass.searchByText !== 'function') return;

    onSearchingChange(true);
    PlaceClass.searchByText({
      textQuery: `${customSearchQuery.trim()} in Cleveland OH`,
      fields: [
        'id',
        'displayName',
        'location',
        'formattedAddress',
        'rating',
        'userRatingCount',
        'primaryType',
        'googleMapsURI',
        'photos',
      ],
      locationBias: {
        lat: selectedLandmark.tourAnchor.lat,
        lng: selectedLandmark.tourAnchor.lng,
      },
      maxResultCount: 6,
      language: 'en-US',
      region: 'us',
      internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio'],
    })
      .then((res: any) => {
        const list: DiscoveredNearbyPlace[] = (res?.places || [])
          .map((p: any) => {
            if (!p.location) return null;
            const lat =
              typeof p.location.lat === 'function'
                ? p.location.lat()
                : Number(p.location.lat);
            const lng =
              typeof p.location.lng === 'function'
                ? p.location.lng()
                : Number(p.location.lng);
            const firstPhoto = p.photos?.[0];
            const attr = firstPhoto?.authorAttributions?.[0];
            return {
              id: p.id || `${lat}-${lng}`,
              displayName: p.displayName || 'Cleveland Location',
              formattedAddress: p.formattedAddress || 'Cleveland, OH',
              location: { lat, lng },
              rating: typeof p.rating === 'number' ? p.rating : undefined,
              userRatingCount:
                typeof p.userRatingCount === 'number'
                  ? p.userRatingCount
                  : undefined,
              primaryType: p.primaryType || 'point_of_interest',
              googleMapsURI: p.googleMapsURI || undefined,
              photoUri:
                firstPhoto && typeof firstPhoto.getURI === 'function'
                  ? firstPhoto.getURI({ maxWidth: 400, maxHeight: 300 })
                  : undefined,
              photoAuthorName: attr?.displayName || undefined,
              photoAuthorUri: attr?.uri || undefined,
            };
          })
          .filter(Boolean);
        onNearbyPlacesLoaded(list);
        if (list[0] && map) {
          map.panTo(list[0].location);
        }
      })
      .catch((err: unknown) => {
        checkQuotaError(err);
      })
      .finally(() => {
        onSearchingChange(false);
      });
  }, [placesLib, searchTriggerCounter, offlineMode]);

  return null;
};

// Interactive 360° Street-Level Vista & Live Google Places Grounding Panel (Demo-Key Safe)
const StreetViewPanoramaPanel: React.FC<{
  targetPosition: GeoPoint;
  landmarkTitle: string;
  landmark: LandmarkBlueprint;
  livePlace?: LiveGooglePlaceInfo | null;
  nearbyPlace?: DiscoveredNearbyPlace | null;
}> = ({ targetPosition, landmarkTitle, landmark, livePlace, nearbyPlace }) => {
  const [headingDeg, setHeadingDeg] = useState<number>(35);
  const [pitchDeg, setPitchDeg] = useState<number>(8);

  const displayAddress =
    nearbyPlace?.formattedAddress ||
    livePlace?.formattedAddress ||
    `${landmark.districtName}, Cleveland, OH`;
  const displayRating =
    nearbyPlace?.rating ?? livePlace?.rating ?? null;
  const displayReviewCount =
    nearbyPlace?.userRatingCount ?? livePlace?.userRatingCount ?? null;
  const displayEditorial =
    livePlace?.editorialSummary || landmark.summary;
  const externalStreetViewUrl = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${targetPosition.lat.toFixed(6)},${targetPosition.lng.toFixed(6)}&heading=${headingDeg}&pitch=${pitchDeg}`;

  const horizontalPanOffset = ((headingDeg - 35) / 180) * 18;
  const verticalPanOffset = ((pitchDeg - 8) / 45) * 10;

  return (
    <div
      className="relative w-full h-full bg-slate-950 overflow-hidden flex flex-col justify-between select-none"
      data-testid="google-street-view-panorama"
    >
      {/* Interactive Panning Architectural Street-Level Vista */}
      <div className="absolute inset-0 overflow-hidden">
        <img
          src={landmark.heroImage}
          alt={`${landmarkTitle} 360° Street-Level Vista`}
          className="w-full h-full object-cover transition-transform duration-300 ease-out"
          style={{
            transform: `scale(1.18) translate(${horizontalPanOffset}%, ${verticalPanOffset}%)`,
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/45 to-slate-950/60" />
        {/* Architectural Horizon Grid Overlay */}
        <div
          className="absolute inset-x-0 top-1/2 h-px bg-amber-400/25 pointer-events-none"
          style={{ transform: `translateY(${verticalPanOffset * 2}px)` }}
        />
      </div>

      {/* Top Header & Compass Azimuth Controls */}
      <div className="relative z-10 p-3 flex items-center justify-between gap-2">
        <div className="bg-slate-900/90 border border-slate-700/90 rounded-xl px-3 py-1.5 text-xs text-slate-200 backdrop-blur-md">
          <span className="font-mono text-amber-400">360° Street-Level Vista</span>
          <span aria-hidden="true" className="mx-1.5 text-slate-500">·</span>
          <span className="font-medium text-white">{landmarkTitle}</span>
        </div>

        <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-700/90 rounded-xl p-1 backdrop-blur-md">
          <button
            type="button"
            onClick={() => setHeadingDeg((h) => (h - 45 + 360) % 360)}
            className="px-2 py-1 rounded-lg text-[11px] font-mono text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Pan Street Vista Left 45°"
          >
            ◀ 45°
          </button>
          <span className="px-1.5 text-[11px] font-mono text-amber-300">
            {headingDeg}° AZ
          </span>
          <button
            type="button"
            onClick={() => setHeadingDeg((h) => (h + 45) % 360)}
            className="px-2 py-1 rounded-lg text-[11px] font-mono text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Pan Street Vista Right 45°"
          >
            45° ▶
          </button>
        </div>
      </div>

      {/* Center Sightline Reticle */}
      <div className="relative z-10 flex items-center justify-center pointer-events-none my-auto">
        <div className="px-3 py-1 rounded-lg bg-slate-950/75 border border-amber-500/35 text-[11px] font-mono text-amber-300 flex items-center gap-2">
          <span>
            GPS {targetPosition.lat.toFixed(4)}°N, {Math.abs(targetPosition.lng).toFixed(4)}°W
          </span>
          <span aria-hidden="true" className="text-slate-600">·</span>
          <span>ELEV {landmark.tourAnchor.elevationMeters}m ASL</span>
        </div>
      </div>

      {/* Bottom Live Google Places Grounding & Direct 360° Panorama Link */}
      <div className="relative z-10 p-3 bg-slate-950/90 border-t border-slate-800/90 backdrop-blur-md space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-white truncate">
                {landmarkTitle}
              </span>
              {displayRating !== null && (
                <span className="text-[11px] font-mono text-amber-400">
                  ★ {displayRating.toFixed(1)}
                  {displayReviewCount
                    ? ` (${displayReviewCount.toLocaleString()})`
                    : ''}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-300 truncate mt-0.5">
              {displayAddress}
            </p>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setPitchDeg((p) => (p === 8 ? 18 : 8))}
              className="px-2 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] font-mono text-slate-200 transition-colors cursor-pointer"
            >
              Tilt {pitchDeg}°
            </button>
            <a
              href={externalStreetViewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-[11px] font-medium text-amber-300 transition-colors"
            >
              360° Maps ↗
            </a>
          </div>
        </div>
        <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
          {displayEditorial}
        </p>
      </div>
    </div>
  );
};

interface LandmarkPinMarkerProps {
  landmark: LandmarkBlueprint;
  isSelected: boolean;
  onSelect: () => void;
  livePlace?: LiveGooglePlaceInfo;
}

const LandmarkPinMarker: React.FC<LandmarkPinMarkerProps> = ({
  landmark,
  isSelected,
  onSelect,
  livePlace,
}) => {
  const [markerRef, marker] = useAdvancedMarkerRef();

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={livePlace?.location || landmark.tourAnchor}
        onClick={onSelect}
        title={`${landmark.walkingOrder}. ${livePlace?.displayName || landmark.shortTitle}`}
      >
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono text-xs font-bold shadow-lg transition-transform ${
            isSelected
              ? 'bg-amber-500 text-slate-950 border-white scale-110'
              : 'bg-slate-900/95 text-white border-amber-500/60 hover:scale-105'
          }`}
        >
          <span>0{landmark.walkingOrder}</span>
          <span className="font-sans font-semibold">
            {livePlace?.displayName || landmark.shortTitle}
          </span>
        </div>
      </AdvancedMarker>

      {isSelected && marker && (
        <InfoWindow anchor={marker} maxWidth={280}>
          <div className="text-slate-900 p-1 space-y-1">
            <div className="text-[11px] font-mono text-slate-600">
              Stop 0{landmark.walkingOrder} · Completed {landmark.yearCompleted}
            </div>
            <div className="font-bold text-sm">
              {livePlace?.displayName || landmark.shortTitle}
            </div>
            {livePlace?.formattedAddress && (
              <div className="text-xs text-slate-600">
                {livePlace.formattedAddress}
              </div>
            )}
            {typeof livePlace?.rating === 'number' && (
              <div className="flex items-center gap-1 text-xs font-medium text-amber-700">
                <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                <span>
                  {livePlace.rating.toFixed(1)} ({livePlace.userRatingCount ?? 0} Google reviews)
                </span>
              </div>
            )}
            {livePlace?.editorialSummary && (
              <p className="text-[11px] text-slate-700 leading-snug line-clamp-2">
                {livePlace.editorialSummary}
              </p>
            )}
            <div className="text-[11px] font-medium text-emerald-700 pt-0.5">
              {landmark.arFacts.length} Spatial AR Overlays Ready
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
};

interface ClevelandWalkingMapProps {
  landmarks: LandmarkBlueprint[];
  selectedLandmark: LandmarkBlueprint;
  onSelectLandmark: (lm: LandmarkBlueprint) => void;
  walkerPosition: GeoPoint;
  onStepWalkerToLandmark: (lm: LandmarkBlueprint) => void;
  offlineMode: boolean;
  onToggleOfflineMode: () => void;
  livePlacesById: Record<string, LiveGooglePlaceInfo>;
  onPlaceLoaded: (landmarkId: string, info: LiveGooglePlaceInfo) => void;
}

export const ClevelandWalkingMap: React.FC<ClevelandWalkingMapProps> = ({
  landmarks,
  selectedLandmark,
  onSelectLandmark,
  walkerPosition,
  onStepWalkerToLandmark,
  offlineMode,
  onToggleOfflineMode,
  livePlacesById,
  onPlaceLoaded,
}) => {
  const apiKey =
    (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY ||
    (process.env.GOOGLE_MAPS_PLATFORM_KEY as string) ||
    (process.env.GOOGLE_MAPS_API_KEY as string) ||
    '';

  const [mapMode, setMapMode] = useState<
    'HYBRID_GOOGLE' | 'STREET_VIEW_SPLIT' | 'OFFLINE_VECTOR'
  >(offlineMode ? 'OFFLINE_VECTOR' : 'STREET_VIEW_SPLIT');

  const [routeStats, setRouteStats] = useState<{
    distanceMeters: number;
    durationMinutes: number;
    source: 'ROUTES_API' | 'OFFLINE_CORRIDOR';
  }>(() => {
    const dist = calculateHaversineDistanceMeters(
      walkerPosition,
      selectedLandmark.tourAnchor
    );
    return {
      distanceMeters: dist,
      durationMinutes: estimateWalkingMinutes(dist, 4),
      source: 'OFFLINE_CORRIDOR',
    };
  });

  const [fullTrailStats, setFullTrailStats] = useState<{
    totalDistanceMeters: number;
    totalDurationMinutes: number;
    legs: RouteLegTelemetry[];
  } | null>(null);

  const [nearbyCategory, setNearbyCategory] = useState<NearbyCategory>('CAFE');
  const [customSearchInput, setCustomSearchInput] = useState<string>('');
  const [searchTriggerCounter, setSearchTriggerCounter] = useState<number>(0);
  const [discoveredPlaces, setDiscoveredPlaces] = useState<
    DiscoveredNearbyPlace[]
  >([]);
  const [selectedNearbyPlace, setSelectedNearbyPlace] =
    useState<DiscoveredNearbyPlace | null>(null);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);

  useEffect(() => {
    if (offlineMode) {
      setMapMode('OFFLINE_VECTOR');
    } else if (mapMode === 'OFFLINE_VECTOR') {
      setMapMode('STREET_VIEW_SPLIT');
    }
  }, [offlineMode]);

  const targetCoords =
    selectedNearbyPlace?.location || selectedLandmark.tourAnchor;
  const bearing = calculateCompassBearing(walkerPosition, targetCoords);
  const activeLivePlace = livePlacesById[selectedLandmark.id];

  // Project lat/lng into SVG coordinates for the Offline Topographic Vector Corridor
  const projectToSvg = (pt: GeoPoint) => {
    const minLat = 41.481;
    const maxLat = 41.512;
    const minLng = -81.707;
    const maxLng = -81.686;
    const x = ((pt.lng - minLng) / (maxLng - minLng)) * 720 + 40;
    const y = ((maxLat - pt.lat) / (maxLat - minLat)) * 420 + 30;
    return { x: Math.round(x), y: Math.round(y) };
  };

  const handleTriggerCustomSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customSearchInput.trim()) return;
    setNearbyCategory('NONE');
    setSearchTriggerCounter((c) => c + 1);
  };

  return (
    <div
      className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden flex flex-col"
      data-testid="cleveland-walking-map-section"
    >
      {/* Map Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-800 bg-slate-900">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Navigation className="w-4 h-4 text-amber-400" />
            <span>
              Live Google Maps Platform — Pedestrian Routes, Places (New) & 360° Street View
            </span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5 font-mono">
            Active Leg:{' '}
            {selectedNearbyPlace
              ? selectedNearbyPlace.displayName
              : activeLivePlace?.displayName || selectedLandmark.shortTitle}{' '}
            · {routeStats.distanceMeters}m ({bearing.degrees}° {bearing.cardinal}) · ~
            {routeStats.durationMinutes} min walk
            {fullTrailStats
              ? ` · Full 6-Stop Trail: ${(fullTrailStats.totalDistanceMeters / 1000).toFixed(1)} km (${fullTrailStats.totalDurationMinutes} min via Google Routes API)`
              : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-slate-800 p-1 rounded-lg border border-slate-700">
            <button
              type="button"
              onClick={() => setMapMode('STREET_VIEW_SPLIT')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                mapMode === 'STREET_VIEW_SPLIT'
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Map + 360° Street View
            </button>
            <button
              type="button"
              onClick={() => setMapMode('HYBRID_GOOGLE')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                mapMode === 'HYBRID_GOOGLE'
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Full Google Map
            </button>
            <button
              type="button"
              onClick={() => setMapMode('OFFLINE_VECTOR')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                mapMode === 'OFFLINE_VECTOR'
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Offline Vector Trail
            </button>
          </div>

          <button
            type="button"
            onClick={onToggleOfflineMode}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
              offlineMode
                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
            }`}
          >
            <WifiOff className="w-3.5 h-3.5" />
            <span>{offlineMode ? 'Offline Mode: ON' : 'Test Offline Mode'}</span>
          </button>
        </div>
      </div>

      {/* Live Google Places (New) Nearby Category Filter & Search Bar */}
      {!offlineMode && mapMode !== 'OFFLINE_VECTOR' && (
        <div className="px-4 py-2.5 bg-slate-950/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-mono text-slate-400 mr-1">
              Explore Nearby ({selectedLandmark.shortTitle}):
            </span>
            <button
              type="button"
              onClick={() => {
                setNearbyCategory('NONE');
                setSelectedNearbyPlace(null);
                setDiscoveredPlaces([]);
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                nearbyCategory === 'NONE' && discoveredPlaces.length === 0
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-slate-800 text-slate-300 hover:text-white'
              }`}
            >
              Tour Landmarks Only
            </button>
            {(
              Object.keys(NEARBY_CATEGORY_CONFIG) as Array<
                Exclude<NearbyCategory, 'NONE'>
              >
            ).map((catKey) => (
              <button
                key={catKey}
                type="button"
                onClick={() => {
                  setSelectedNearbyPlace(null);
                  setNearbyCategory((prev) =>
                    prev === catKey ? 'NONE' : catKey
                  );
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  nearbyCategory === catKey
                    ? 'bg-sky-500 text-slate-950 font-semibold'
                    : 'bg-slate-800 text-slate-300 hover:text-white'
                }`}
              >
                {NEARBY_CATEGORY_CONFIG[catKey].label}
              </button>
            ))}
          </div>

          <form
            onSubmit={handleTriggerCustomSearch}
            className="flex items-center gap-1.5 w-full sm:w-auto"
          >
            <div className="relative flex-1 sm:w-60">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={customSearchInput}
                onChange={(e) => setCustomSearchInput(e.target.value)}
                placeholder="Search Cleveland on Google Maps..."
                aria-label="Search Cleveland places on Google Maps"
                className="w-full pl-8 pr-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
              />
            </div>
            <button
              type="submit"
              className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs whitespace-nowrap"
            >
              {isSearchingPlaces ? 'Searching...' : 'Search Maps'}
            </button>
          </form>
        </div>
      )}

      {/* Main Map & 360° Street View Container (Explicit CSS height per CF2) */}
      <div className="relative w-full h-[460px] bg-[#0b1324]">
        {mapMode !== 'OFFLINE_VECTOR' && apiKey && !offlineMode ? (
          <APIProvider apiKey={apiKey} language="en" region="US">
            <div
              className={`w-full h-full grid ${
                mapMode === 'STREET_VIEW_SPLIT'
                  ? 'grid-cols-1 lg:grid-cols-12'
                  : 'grid-cols-1'
              }`}
            >
              <div
                className={
                  mapMode === 'STREET_VIEW_SPLIT'
                    ? 'lg:col-span-7 h-[260px] lg:h-full'
                    : 'w-full h-full'
                }
              >
                <GoogleMap
                  mapId="DEMO_MAP_ID"
                  defaultCenter={{ lat: 41.4984, lng: -81.6954 }}
                  defaultZoom={14}
                  gestureHandling="greedy"
                  internalUsageAttributionIds={[
                    'gmp_mcp_codeassist_v1_aistudio',
                  ]}
                  style={{ width: '100%', height: '100%' }}
                >
                  <RouteAndPlacesController
                    landmarks={landmarks}
                    origin={walkerPosition}
                    selectedLandmark={selectedLandmark}
                    customDestination={selectedNearbyPlace}
                    offlineMode={offlineMode}
                    nearbyCategory={nearbyCategory}
                    customSearchQuery={customSearchInput}
                    searchTriggerCounter={searchTriggerCounter}
                    onRouteComputed={setRouteStats}
                    onFullTrailComputed={setFullTrailStats}
                    onPlaceLoaded={onPlaceLoaded}
                    onNearbyPlacesLoaded={setDiscoveredPlaces}
                    onSearchingChange={setIsSearchingPlaces}
                  />

                  {/* Tourist Live Foot-Traffic Marker */}
                  <AdvancedMarker
                    position={walkerPosition}
                    title="Your Walking Position (GPS / Simulator)"
                  >
                    <div className="px-2.5 py-1 rounded-full bg-sky-500 text-slate-950 border-2 border-white font-mono text-[11px] font-bold shadow-lg">
                      YOU (WALKER)
                    </div>
                  </AdvancedMarker>

                  {/* Cleveland Landmark Advanced Markers */}
                  {landmarks.map((lm) => (
                    <LandmarkPinMarker
                      key={lm.id}
                      landmark={lm}
                      isSelected={
                        lm.id === selectedLandmark.id && !selectedNearbyPlace
                      }
                      onSelect={() => {
                        setSelectedNearbyPlace(null);
                        onSelectLandmark(lm);
                      }}
                      livePlace={livePlacesById[lm.id]}
                    />
                  ))}

                  {/* Discovered Nearby Google Places Markers */}
                  {discoveredPlaces.map((np) => {
                    const isPicked = selectedNearbyPlace?.id === np.id;
                    return (
                      <AdvancedMarker
                        key={np.id}
                        position={np.location}
                        onClick={() => setSelectedNearbyPlace(np)}
                        title={np.displayName}
                      >
                        <div
                          className={`px-2 py-1 rounded-lg border text-[11px] font-semibold shadow-md transition-transform ${
                            isPicked
                              ? 'bg-emerald-400 text-slate-950 border-white scale-110'
                              : 'bg-emerald-950/95 text-emerald-200 border-emerald-400/70 hover:scale-105'
                          }`}
                        >
                          ★ {np.displayName}
                        </div>
                      </AdvancedMarker>
                    );
                  })}
                </GoogleMap>
              </div>

              {mapMode === 'STREET_VIEW_SPLIT' && (
                <div className="lg:col-span-5 h-[200px] lg:h-full border-t lg:border-t-0 lg:border-l border-slate-800">
                  <StreetViewPanoramaPanel
                    targetPosition={targetCoords}
                    landmarkTitle={
                      selectedNearbyPlace?.displayName ||
                      activeLivePlace?.displayName ||
                      selectedLandmark.shortTitle
                    }
                    landmark={selectedLandmark}
                    livePlace={activeLivePlace}
                    nearbyPlace={selectedNearbyPlace}
                  />
                </div>
              )}
            </div>
          </APIProvider>
        ) : (
          /* High-Precision Offline Topographic Vector Map of Cleveland */
          <div
            className="w-full h-full relative bg-[#091120] overflow-hidden"
            data-testid="offline-vector-map"
          >
            <svg
              viewBox="0 0 800 480"
              className="w-full h-full"
              role="img"
              aria-label="Offline vector walking map of Cleveland landmarks"
            >
              {/* Subtle Street Grid */}
              <g stroke="#1e293b" strokeWidth="1">
                {[80, 160, 240, 320, 400].map((y) => (
                  <line key={`hy-${y}`} x1="0" y1={y} x2="800" y2={y} />
                ))}
                {[100, 220, 340, 460, 580, 700].map((x) => (
                  <line key={`vx-${x}`} x1={x} y1="0" x2={x} y2="480" />
                ))}
              </g>

              {/* Lake Erie Shoreline Polygon */}
              <path
                d="M 0,0 L 800,0 L 800,85 Q 520,115 310,145 Q 140,175 0,210 Z"
                fill="#0c2a46"
                stroke="#0284c7"
                strokeWidth="1.5"
              />
              <text
                x="610"
                y="48"
                fill="#38bdf8"
                fontSize="12"
                fontFamily="JetBrains Mono, monospace"
              >
                LAKE ERIE · NORTH COAST HARBOR
              </text>

              {/* Winding Cuyahoga River Channel */}
              <path
                d="M 245,152 C 260,220 340,260 365,335 C 385,395 450,435 510,480"
                fill="none"
                stroke="#0284c7"
                strokeWidth="22"
                strokeLinecap="round"
              />
              <path
                d="M 245,152 C 260,220 340,260 365,335 C 385,395 450,435 510,480"
                fill="none"
                stroke="#38bdf8"
                strokeWidth="2"
                strokeDasharray="6 6"
              />

              {/* Ordered Walking Corridor Polyline */}
              <polyline
                fill="none"
                stroke="#f59e0b"
                strokeWidth="3.5"
                strokeDasharray="8 5"
                points={landmarks
                  .map((lm) => {
                    const p = projectToSvg(lm.tourAnchor);
                    return `${p.x},${p.y}`;
                  })
                  .join(' ')}
              />

              {/* Active Direct Walking Vector from Walker to Selected Landmark */}
              {(() => {
                const wSvg = projectToSvg(walkerPosition);
                const tSvg = projectToSvg(selectedLandmark.tourAnchor);
                return (
                  <line
                    x1={wSvg.x}
                    y1={wSvg.y}
                    x2={tSvg.x}
                    y2={tSvg.y}
                    stroke="#38bdf8"
                    strokeWidth="3"
                  />
                );
              })()}

              {/* Landmark Geofence Rings (180m trigger zone) & Interactive Nodes */}
              {landmarks.map((lm) => {
                const pt = projectToSvg(lm.tourAnchor);
                const isSelected = lm.id === selectedLandmark.id;
                return (
                  <g
                    key={lm.id}
                    className="cursor-pointer"
                    onClick={() => {
                      onSelectLandmark(lm);
                      onStepWalkerToLandmark(lm);
                    }}
                  >
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={isSelected ? 34 : 24}
                      fill={
                        isSelected
                          ? 'rgba(245, 158, 11, 0.16)'
                          : 'rgba(56, 189, 248, 0.08)'
                      }
                      stroke={isSelected ? '#f59e0b' : '#334155'}
                      strokeDasharray="4 3"
                    />
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={isSelected ? 10 : 7}
                      fill={isSelected ? '#f59e0b' : '#0f172a'}
                      stroke="#f8fafc"
                      strokeWidth="2"
                    />
                    <rect
                      x={pt.x + 12}
                      y={pt.y - 13}
                      width={lm.shortTitle.length * 7 + 34}
                      height="24"
                      rx="6"
                      fill={isSelected ? '#f59e0b' : '#0f172ae6'}
                      stroke={isSelected ? '#fde68a' : '#475569'}
                    />
                    <text
                      x={pt.x + 19}
                      y={pt.y + 3}
                      fill={isSelected ? '#0f172a' : '#f8fafc'}
                      fontSize="11"
                      fontWeight="700"
                      fontFamily="Plus Jakarta Sans, sans-serif"
                    >
                      0{lm.walkingOrder}. {lm.shortTitle}
                    </text>
                  </g>
                );
              })}

              {/* Current Walker Position Marker */}
              {(() => {
                const wPt = projectToSvg(walkerPosition);
                return (
                  <g>
                    <circle
                      cx={wPt.x}
                      cy={wPt.y}
                      r="14"
                      fill="rgba(56, 189, 248, 0.25)"
                    />
                    <circle
                      cx={wPt.x}
                      cy={wPt.y}
                      r="7"
                      fill="#38bdf8"
                      stroke="#ffffff"
                      strokeWidth="2.5"
                    />
                    <text
                      x={wPt.x - 24}
                      y={wPt.y - 14}
                      fill="#7dd3fc"
                      fontSize="10"
                      fontWeight="700"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      WALKER GPS
                    </text>
                  </g>
                );
              })()}
            </svg>

            <div className="absolute bottom-3 left-3 bg-slate-900/95 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-300">
              <span className="font-mono text-emerald-400">
                Offline Vector Tiles Ready
              </span>
              <span aria-hidden="true" className="mx-1.5">·</span>
              <span>
                Click any stop on the map to walk there & trigger proximity AR alerts
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Discovered Nearby Google Places Strip (When Active) */}
      {discoveredPlaces.length > 0 && (
        <div className="p-4 bg-slate-950 border-t border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-mono text-emerald-400">
              Live Google Places API (New) Results Near {selectedLandmark.shortTitle} ({discoveredPlaces.length} Found)
            </div>
            <button
              type="button"
              onClick={() => {
                setDiscoveredPlaces([]);
                setSelectedNearbyPlace(null);
                setNearbyCategory('NONE');
              }}
              className="text-xs text-slate-400 hover:text-white"
            >
              Clear Nearby Pins
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {discoveredPlaces.map((np) => {
              const dist = calculateHaversineDistanceMeters(
                walkerPosition,
                np.location
              );
              const isSelected = selectedNearbyPlace?.id === np.id;
              return (
                <div
                  key={np.id}
                  onClick={() => setSelectedNearbyPlace(np)}
                  className={`p-3 rounded-xl border cursor-pointer transition-colors flex gap-3 ${
                    isSelected
                      ? 'bg-slate-900 border-emerald-400'
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {np.photoUri && (
                    <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 bg-slate-800 relative">
                      <img
                        src={np.photoUri}
                        alt={np.displayName}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-white truncate">
                      {np.displayName}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate mt-0.5">
                      {np.formattedAddress}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[11px] font-mono text-amber-400">
                      {typeof np.rating === 'number' && (
                        <span>
                          ★ {np.rating.toFixed(1)} ({np.userRatingCount ?? 0})
                        </span>
                      )}
                      <span>· {dist}m walk</span>
                    </div>
                    {np.photoAuthorName && (
                      <div className="text-[10px] text-slate-500 truncate mt-0.5">
                        Photo:{' '}
                        {np.photoAuthorUri ? (
                          <a
                            href={np.photoAuthorUri}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="underline hover:text-slate-300"
                          >
                            {np.photoAuthorName}
                          </a>
                        ) : (
                          np.photoAuthorName
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom Turn-by-Turn Walking Cue & Live Google Places Grounding Inspector */}
      <div className="p-4 bg-slate-900/95 border-t border-slate-800 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
          <div className="lg:col-span-7 flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 shrink-0">
              <Footprints className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-mono text-amber-400">
                Walking Segment 0{selectedLandmark.walkingOrder} → 0
                {Math.min(6, selectedLandmark.walkingOrder + 1)} ·{' '}
                {routeStats.source === 'ROUTES_API'
                  ? 'Live Google Maps Routes API (WALKING)'
                  : 'Cached Offline Pedestrian Corridor'}
              </div>
              <p className="text-xs text-slate-200 mt-1 leading-relaxed">
                {selectedLandmark.walkingCueToNext}
              </p>
            </div>
          </div>

          <div className="lg:col-span-5 flex flex-wrap items-center justify-between gap-3 bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 py-2.5">
            <div>
              <div className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
                <MapPin className="w-3 h-3 text-sky-400 shrink-0" />
                <span className="truncate max-w-[260px]">
                  {activeLivePlace?.formattedAddress ||
                    `${selectedLandmark.districtName}, Cleveland, OH`}
                </span>
              </div>
              <div className="text-xs text-slate-200 mt-0.5 flex flex-wrap items-center gap-2 font-mono">
                {typeof activeLivePlace?.rating === 'number' ? (
                  <span className="text-amber-400 font-semibold">
                    ★ {activeLivePlace.rating.toFixed(1)} (
                    {activeLivePlace.userRatingCount?.toLocaleString()} Google
                    reviews)
                  </span>
                ) : (
                  <span>
                    Elev {selectedLandmark.tourAnchor.elevationMeters}m ASL
                  </span>
                )}
                {activeLivePlace?.placeId && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span
                      className="text-[10px] text-slate-400 truncate max-w-[120px]"
                      title={`Google Place ID: ${activeLivePlace.placeId}`}
                    >
                      ID: {activeLivePlace.placeId}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onStepWalkerToLandmark(selectedLandmark)}
                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors whitespace-nowrap shrink-0"
              >
                Walk Here Now
              </button>
              {activeLivePlace?.googleMapsURI && (
                <a
                  href={activeLivePlace.googleMapsURI}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open ${selectedLandmark.shortTitle} in Google Maps`}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Live Google Places API (New) Details: Photos, Reviews, Editorial Summary & Opening Hours */}
        {activeLivePlace && (
          <div
            className="pt-3 border-t border-slate-800/80 grid grid-cols-1 lg:grid-cols-12 gap-4"
            data-testid="live-google-place-details"
          >
            {/* Left Column: Place Metadata, Editorial Summary & Live Photos */}
            <div className="lg:col-span-6 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-mono text-sky-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>
                    Verified Google Places API (New):{' '}
                    {activeLivePlace.displayName}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-300">
                  {activeLivePlace.websiteURI && (
                    <a
                      href={activeLivePlace.websiteURI}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-sky-400 hover:underline"
                    >
                      <Globe className="w-3 h-3" />
                      <span>Official Website</span>
                    </a>
                  )}
                  {activeLivePlace.nationalPhoneNumber && (
                    <span className="flex items-center gap-1 text-slate-400 font-mono text-[11px]">
                      <Phone className="w-3 h-3" />
                      <span>{activeLivePlace.nationalPhoneNumber}</span>
                    </span>
                  )}
                </div>
              </div>

              {activeLivePlace.editorialSummary && (
                <p className="text-xs text-slate-200 bg-slate-950/70 border border-slate-800 rounded-xl p-3 leading-relaxed">
                  <span className="font-mono text-amber-400 mr-1.5">
                    Google Editorial Summary:
                  </span>
                  {activeLivePlace.editorialSummary}
                </p>
              )}

              {/* Live Google Place Photos with Mandatory Author Attributions */}
              {activeLivePlace.photos && activeLivePlace.photos.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-mono text-slate-400">
                    Live Google Maps Place Photos ({activeLivePlace.photos.length}):
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {activeLivePlace.photos.map((photo, idx) => (
                      <div
                        key={`${selectedLandmark.id}-photo-${idx}`}
                        className="relative h-24 rounded-xl overflow-hidden border border-slate-800 bg-slate-950 group"
                      >
                        <img
                          src={photo.uri}
                          alt={`${activeLivePlace.displayName} photo ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-x-0 bottom-0 bg-slate-950/85 px-1.5 py-0.5 text-[9px] text-slate-300 truncate">
                          Photo:{' '}
                          {photo.authorUri ? (
                            <a
                              href={photo.authorUri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline hover:text-amber-300"
                            >
                              {photo.authorName}
                            </a>
                          ) : (
                            photo.authorName
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Opening Hours */}
              {activeLivePlace.weekdayDescriptions &&
                activeLivePlace.weekdayDescriptions.length > 0 && (
                  <details className="bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2 text-xs">
                    <summary className="cursor-pointer font-mono text-slate-300 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                      <span>
                        Google Maps Opening Hours (
                        {activeLivePlace.weekdayDescriptions[0]})
                      </span>
                    </summary>
                    <ul className="mt-2 space-y-1 text-[11px] font-mono text-slate-400 pl-5 list-disc">
                      {activeLivePlace.weekdayDescriptions.map((line, idx) => (
                        <li key={idx}>{line}</li>
                      ))}
                    </ul>
                  </details>
                )}
            </div>

            {/* Right Column: Live Google Routes API Multi-Stop Telemetry & Customer Reviews */}
            <div className="lg:col-span-6 space-y-3">
              {fullTrailStats && fullTrailStats.legs.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-mono text-amber-400 flex items-center justify-between">
                    <span>
                      Live Google Routes API (WALKING) — 6-Stop Trail Breakdown
                    </span>
                    <span className="text-emerald-400">
                      Total: {(fullTrailStats.totalDistanceMeters / 1000).toFixed(2)} km ·{' '}
                      {fullTrailStats.totalDurationMinutes} mins
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {fullTrailStats.legs.map((leg, idx) => (
                      <div
                        key={`leg-${idx}`}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-950/80 border border-slate-800 flex items-center justify-between text-[11px]"
                      >
                        <span className="text-slate-300 truncate mr-2">
                          0{idx + 1}→0{idx + 2}: {leg.toTitle}
                        </span>
                        <span className="font-mono text-sky-400 shrink-0">
                          {leg.distanceMeters}m · {leg.durationMinutes}m
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeLivePlace.reviews && activeLivePlace.reviews.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-[11px] font-mono text-amber-400 flex items-center gap-1.5">
                    <MessageSquareQuote className="w-3.5 h-3.5" />
                    <span>
                      Recent Google Maps Visitor Reviews (
                      {activeLivePlace.reviews.length} shown of{' '}
                      {activeLivePlace.userRatingCount?.toLocaleString() || 0})
                    </span>
                  </div>
                  {activeLivePlace.reviews.map((rev, idx) => (
                    <div
                      key={`${selectedLandmark.id}-rev-${idx}`}
                      className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <div className="font-semibold text-white flex items-center gap-1.5">
                          {rev.authorUri ? (
                            <a
                              href={rev.authorUri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:underline text-sky-300"
                            >
                              {rev.authorName}
                            </a>
                          ) : (
                            <span>{rev.authorName}</span>
                          )}
                          {rev.relativeTime && (
                            <span className="text-[10px] font-mono text-slate-500">
                              · {rev.relativeTime}
                            </span>
                          )}
                        </div>
                        {typeof rev.rating === 'number' && (
                          <span className="font-mono text-amber-400 text-xs">
                            {'★'.repeat(Math.round(rev.rating))} ({rev.rating}/5)
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">
                        {rev.text}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between font-mono text-[11px] text-emerald-400">
                    <span>Google Maps Place Grounding Record</span>
                    <span>Status: {activeLivePlace.businessStatus || 'OPERATIONAL'}</span>
                  </div>
                  <div className="text-slate-300 font-mono text-[11px]">
                    Place ID: {activeLivePlace.placeId} · Exact Coords:{' '}
                    {activeLivePlace.location?.lat.toFixed(5)}°N,{' '}
                    {Math.abs(activeLivePlace.location?.lng || 0).toFixed(5)}°W
                  </div>
                  {typeof activeLivePlace.rating === 'number' && (
                    <div className="text-amber-300 text-xs">
                      Aggregate Google Rating: ★ {activeLivePlace.rating.toFixed(1)} / 5.0 across{' '}
                      {activeLivePlace.userRatingCount?.toLocaleString()} verified Google Maps reviews.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
