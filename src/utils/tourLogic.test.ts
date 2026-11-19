import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateHaversineDistanceMeters,
  calculateCompassBearing,
  estimateWalkingMinutes,
  evaluateProximityGeofences,
  interpolateTrailPosition,
  calculateOfflinePackStats,
  filterARFactsByEra,
  generateViroReactSceneCode,
  evaluatePassportBadges,
  detectNewlyUnlockedBadges,
  buildLandmarkNarrationScript,
  convertFahrenheitToCelsius,
  formatTemperatureDisplay,
  describeWmoWeatherCode,
  evaluateWalkingPreparationAdvisory,
  parseOpenMeteoForecastResponse,
  buildHapticFeedbackPulse,
  triggerDeviceHapticFeedback,
  computeLandmarkSightlineBearing,
  computeGyroCompassAlignment,
  buildARDiscoverySharePayload,
  buildGoogle3DCameraPreset,
  computeARFactGeoAltitudePoint,
  buildGoogle3DWalkingCorridorCoordinates,
} from './tourLogic';
import {
  CLEVELAND_LANDMARKS,
  OFFLINE_DISTRICT_PACKS,
  CLEVELAND_PASSPORT_BADGES,
} from '../data/clevelandLandmarks';

test('calculateHaversineDistanceMeters computes accurate distance between Terminal Tower and The Arcade', () => {
  const terminalTower = CLEVELAND_LANDMARKS[0].tourAnchor;
  const theArcade = CLEVELAND_LANDMARKS[1].tourAnchor;
  const distance = calculateHaversineDistanceMeters(terminalTower, theArcade);
  // ~330m straight-line distance across Public Square / Euclid Ave
  assert.ok(distance > 250 && distance < 450, `Expected ~330m, got ${distance}m`);
});

test('calculateCompassBearing returns NE bearing from Terminal Tower to The Arcade', () => {
  const terminalTower = CLEVELAND_LANDMARKS[0].tourAnchor;
  const theArcade = CLEVELAND_LANDMARKS[1].tourAnchor;
  const bearing = calculateCompassBearing(terminalTower, theArcade);
  assert.equal(bearing.cardinal, 'NE');
  assert.ok(bearing.degrees >= 35 && bearing.degrees <= 75);
});

test('estimateWalkingMinutes calculates pedestrian walk time with Naismith elevation adjustment', () => {
  assert.equal(estimateWalkingMinutes(0), 0);
  assert.equal(estimateWalkingMinutes(450, 5), 6);
  assert.equal(estimateWalkingMinutes(950, 0), 12);
});

test('evaluateProximityGeofences triggers push notification only when inside geofence and not yet notified', () => {
  const nearRockHall = { lat: 41.5082, lng: -81.6951 };
  const alertsFirst = evaluateProximityGeofences(
    nearRockHall,
    CLEVELAND_LANDMARKS,
    [],
    180
  );
  assert.equal(alertsFirst.length, 1);
  assert.equal(alertsFirst[0].landmarkId, 'rock-hall');
  assert.ok(alertsFirst[0].distanceMeters < 100);

  // Deduplication check when already notified
  const alertsSecond = evaluateProximityGeofences(
    nearRockHall,
    CLEVELAND_LANDMARKS,
    ['rock-hall'],
    180
  );
  assert.equal(alertsSecond.length, 0);
});

test('interpolateTrailPosition smoothly interpolates coordinates along the Cleveland walking path', () => {
  const startStep = interpolateTrailPosition(CLEVELAND_LANDMARKS, 0);
  assert.equal(startStep.nearestLandmarkId, 'terminal-tower');

  const midStep = interpolateTrailPosition(CLEVELAND_LANDMARKS, 2.1);
  assert.equal(midStep.nearestLandmarkId, 'rock-hall');
  assert.ok(midStep.position.lat > 41.5);
});

test('calculateOfflinePackStats computes MB totals and landmark offline coverage accurately', () => {
  const stats = calculateOfflinePackStats(
    OFFLINE_DISTRICT_PACKS,
    ['downtown-public-square', 'ohio-city-bridges'],
    CLEVELAND_LANDMARKS.length
  );
  assert.equal(stats.offlineLandmarksCovered, 4);
  assert.equal(stats.coveragePercent, 67);
  assert.equal(stats.isLandmarkAvailableOffline('terminal-tower'), true);
  assert.equal(stats.isLandmarkAvailableOffline('rock-hall'), false);
  assert.ok(stats.downloadedMb > 50);
});

test('filterARFactsByEra filters historical facts by year slider and category', () => {
  const facts = CLEVELAND_LANDMARKS[0].arFacts; // 1930, 1931, 1894
  const pre1900 = filterARFactsByEra(facts, 1900, 'ALL');
  assert.equal(pre1900.length, 1);
  assert.equal(pre1900[0].year, 1894);

  const engOnly = filterARFactsByEra(facts, 2026, 'Engineering');
  assert.equal(engOnly.length, 1);
  assert.equal(engOnly[0].year, 1930);
});

test('generateViroReactSceneCode outputs valid ViroARSceneNavigator and ViroNode JSX for landmark', () => {
  const code = generateViroReactSceneCode(CLEVELAND_LANDMARKS[4]); // Guardians of Traffic
  assert.ok(code.includes('ViroARSceneNavigator'));
  assert.ok(code.includes('Guardians of Traffic'));
  assert.ok(code.includes('1932 Berea Stone Carving'));
});

test('evaluatePassportBadges calculates district sticker unlocks and visual progress percentages accurately', () => {
  // 1 of 2 visited in Downtown district -> 17% overall, 50% Downtown badge, 0 unlocked
  const initialProgress = evaluatePassportBadges(
    CLEVELAND_LANDMARKS,
    CLEVELAND_PASSPORT_BADGES,
    ['terminal-tower']
  );
  assert.equal(initialProgress.visitedLandmarksCount, 1);
  assert.equal(initialProgress.totalLandmarks, 6);
  assert.equal(initialProgress.overallProgressPercent, 17);
  assert.equal(initialProgress.unlockedBadgesCount, 0);
  assert.equal(initialProgress.badges[0].progressPercent, 50);
  assert.equal(initialProgress.badges[0].isUnlocked, false);
  assert.deepEqual(initialProgress.badges[0].missingLandmarkIds, ['the-arcade']);

  // Visit both landmarks in Downtown district -> Downtown sticker unlocks!
  const downtownProgress = evaluatePassportBadges(
    CLEVELAND_LANDMARKS,
    CLEVELAND_PASSPORT_BADGES,
    ['terminal-tower', 'the-arcade']
  );
  assert.equal(downtownProgress.visitedLandmarksCount, 2);
  assert.equal(downtownProgress.overallProgressPercent, 33);
  assert.equal(downtownProgress.unlockedBadgesCount, 1);
  assert.equal(downtownProgress.districtBadgesUnlockedCount, 1);
  assert.equal(downtownProgress.badges[0].isUnlocked, true);
  assert.equal(downtownProgress.badges[0].progressPercent, 100);
  assert.equal(downtownProgress.explorerRankTitle, 'District Heritage Pioneer');

  // Visit all 6 landmarks -> All 3 district stickers + Grand Laureate sticker unlock (4 of 4)
  const fullProgress = evaluatePassportBadges(
    CLEVELAND_LANDMARKS,
    CLEVELAND_PASSPORT_BADGES,
    CLEVELAND_LANDMARKS.map((l) => l.id)
  );
  assert.equal(fullProgress.overallProgressPercent, 100);
  assert.equal(fullProgress.unlockedBadgesCount, 4);
  assert.equal(fullProgress.districtBadgesUnlockedCount, 3);
  assert.equal(fullProgress.explorerRankTitle, 'Grand Cleveland Heritage Laureate');
});

test('detectNewlyUnlockedBadges identifies only newly unlocked district or master stickers on state transition', () => {
  const newlyUnlocked = detectNewlyUnlockedBadges(
    ['terminal-tower'],
    ['terminal-tower', 'the-arcade'],
    CLEVELAND_LANDMARKS,
    CLEVELAND_PASSPORT_BADGES
  );
  assert.equal(newlyUnlocked.length, 1);
  assert.equal(newlyUnlocked[0].id, 'badge-downtown-public-square');

  // Completing the final landmark unlocks both the 3rd district badge AND the Grand Master Crest
  const masterUnlock = detectNewlyUnlockedBadges(
    [
      'terminal-tower',
      'the-arcade',
      'rock-hall',
      'harbor-lighthouse',
      'guardians-of-traffic',
    ],
    [
      'terminal-tower',
      'the-arcade',
      'rock-hall',
      'harbor-lighthouse',
      'guardians-of-traffic',
      'west-side-market',
    ],
    CLEVELAND_LANDMARKS,
    CLEVELAND_PASSPORT_BADGES
  );
  assert.equal(masterUnlock.length, 2);
  assert.deepEqual(
    masterUnlock.map((b) => b.id),
    ['badge-ohio-city-bridges', 'badge-cleveland-grand-laureate']
  );
});

test('buildLandmarkNarrationScript generates complete spoken history script for landmark and individual facts', () => {
  const terminalTower = CLEVELAND_LANDMARKS[0];
  const fullPayload = buildLandmarkNarrationScript(terminalTower);
  assert.equal(fullPayload.landmarkId, 'terminal-tower');
  assert.equal(fullPayload.factCount, 3);
  assert.ok(fullPayload.spokenText.includes('Terminal Tower'));
  assert.ok(fullPayload.spokenText.includes('52 Stories Over the Cuyahoga Valley'));
  assert.ok(fullPayload.spokenText.includes('Great Lakes Maritime Strobe'));
  assert.ok(fullPayload.spokenText.includes("Soldiers' and Sailors' Monument"));
  assert.ok(fullPayload.estimatedDurationSeconds >= 20);

  const singleFactPayload = buildLandmarkNarrationScript(
    terminalTower,
    terminalTower.arFacts[0]
  );
  assert.equal(singleFactPayload.factId, 'tt-fact-1');
  assert.equal(singleFactPayload.factCount, 1);
  assert.ok(singleFactPayload.spokenText.includes('1930 Dedication'));
  assert.ok(singleFactPayload.spokenText.includes('Height: 215.8m'));
});

test('describeWmoWeatherCode and formatTemperatureDisplay map weather codes and convert units accurately', () => {
  assert.equal(convertFahrenheitToCelsius(32), 0);
  assert.equal(convertFahrenheitToCelsius(68), 20);
  assert.equal(formatTemperatureDisplay(59, 'F'), '59°F');
  assert.equal(formatTemperatureDisplay(59, 'C'), '15°C');

  const clear = describeWmoWeatherCode(0);
  assert.equal(clear.label, 'Clear Lake Erie Sky');
  assert.equal(clear.iconCategory, 'SUN');
  assert.equal(clear.isPrecipitation, false);

  const rain = describeWmoWeatherCode(63);
  assert.equal(rain.label, 'Steady Rain Showers');
  assert.equal(rain.iconCategory, 'RAIN');
  assert.equal(rain.isPrecipitation, true);
});

test('evaluateWalkingPreparationAdvisory produces tailored Cleveland walking advisories for rain, wind, cold, and mild conditions', () => {
  const optimal = evaluateWalkingPreparationAdvisory({
    temperatureF: 65,
    apparentTemperatureF: 64,
    windSpeedMph: 7,
    precipitationProbabilityPercent: 10,
    weatherCode: 1,
    isLakefrontDistrict: false,
  });
  assert.equal(optimal.walkabilityRating, 'Optimal Walking Conditions');
  assert.equal(optimal.badgeTone, 'emerald');
  assert.ok(optimal.walkabilityScore >= 85);

  const rainy = evaluateWalkingPreparationAdvisory({
    temperatureF: 52,
    apparentTemperatureF: 49,
    windSpeedMph: 14,
    precipitationProbabilityPercent: 75,
    weatherCode: 61,
    isLakefrontDistrict: false,
  });
  assert.equal(rainy.walkabilityRating, 'Wet Pavement — Waterproof Gear');
  assert.ok(rainy.clothingTip.includes('The Arcade'));

  const lakefrontWind = evaluateWalkingPreparationAdvisory({
    temperatureF: 58,
    apparentTemperatureF: 55,
    windSpeedMph: 16,
    precipitationProbabilityPercent: 15,
    weatherCode: 2,
    isLakefrontDistrict: true,
  });
  assert.equal(lakefrontWind.walkabilityRating, 'Breezy Lakefront — Layer Up');
  assert.equal(lakefrontWind.badgeTone, 'amber');
});

test('parseOpenMeteoForecastResponse normalizes Open-Meteo JSON into ClevelandWeatherSnapshot with 4-hour walking window', () => {
  const sampleApiPayload = {
    latitude: 41.4984,
    longitude: -81.6937,
    current: {
      time: '2026-11-18T11:00',
      temperature_2m: 48.4,
      apparent_temperature: 43.2,
      relative_humidity_2m: 68,
      precipitation: 0,
      weather_code: 2,
      wind_speed_10m: 12.6,
      wind_direction_10m: 315,
      wind_gusts_10m: 18.2,
      is_day: 1,
    },
    hourly: {
      time: [
        '2026-11-18T10:00',
        '2026-11-18T11:00',
        '2026-11-18T12:00',
        '2026-11-18T13:00',
        '2026-11-18T14:00',
      ],
      temperature_2m: [46.1, 48.4, 50.2, 51.8, 51.0],
      precipitation_probability: [10, 15, 20, 25, 20],
      wind_speed_10m: [11.0, 12.6, 13.4, 14.1, 13.0],
      weather_code: [1, 2, 2, 3, 2],
    },
  };

  const parsed = parseOpenMeteoForecastResponse(sampleApiPayload);
  assert.equal(parsed.temperatureF, 48);
  assert.equal(parsed.apparentTemperatureF, 43);
  assert.equal(parsed.windCardinal, 'NW');
  assert.equal(parsed.condition.label, 'Partly Cloudy');
  assert.equal(parsed.hourlyForecast.length, 4);
  assert.equal(parsed.hourlyForecast[0].hourLabel, 'Now');
  assert.equal(parsed.hourlyForecast[1].hourLabel, '12 PM');
  assert.equal(parsed.precipitationProbabilityPercent, 15);
});

test('buildHapticFeedbackPulse and triggerDeviceHapticFeedback generate distinct Vibration API patterns for landmark arrival, badge unlock, and proximity alerts', () => {
  const recordedPatterns: Array<number | number[]> = [];
  const mockVibrate = (pattern: number | number[]) => {
    recordedPatterns.push(pattern);
    return true;
  };

  // 1. Landmark Arrival pulse ([35, 45, 55])
  const arrivalPulse = buildHapticFeedbackPulse(
    'LANDMARK_ARRIVAL',
    'The Arcade Cleveland',
    '2026-11-18T12:00:00Z'
  );
  assert.deepEqual(arrivalPulse.patternMs, [35, 45, 55]);
  assert.equal(arrivalPulse.totalDurationMs, 135);
  assert.equal(arrivalPulse.label, 'Landmark Arrival Pulse');
  assert.equal(arrivalPulse.patternNotation, '35ms · 45ms gap · 55ms');

  const arrivalResult = triggerDeviceHapticFeedback(
    arrivalPulse,
    true,
    mockVibrate
  );
  assert.equal(arrivalResult.didVibrate, true);
  assert.equal(arrivalResult.apiSupported, true);
  assert.deepEqual(recordedPatterns[0], [35, 45, 55]);

  // 2. Passport Badge Unlocked pulse ([50, 40, 50, 40, 110])
  const badgePulse = buildHapticFeedbackPulse(
    'BADGE_UNLOCKED',
    'Public Square Pioneer',
    '2026-11-18T12:01:00Z'
  );
  assert.deepEqual(badgePulse.patternMs, [50, 40, 50, 40, 110]);
  assert.equal(badgePulse.totalDurationMs, 290);
  const badgeResult = triggerDeviceHapticFeedback(
    badgePulse,
    true,
    mockVibrate
  );
  assert.equal(badgeResult.didVibrate, true);
  assert.deepEqual(recordedPatterns[1], [50, 40, 50, 40, 110]);

  // 3. Proximity Geofence Notification pulse ([25, 35, 25])
  const proximityPulse = buildHapticFeedbackPulse(
    'PROXIMITY_NOTIFICATION',
    'Rock & Roll Hall of Fame (45m)',
    '2026-11-18T12:02:00Z'
  );
  assert.deepEqual(proximityPulse.patternMs, [25, 35, 25]);
  assert.equal(proximityPulse.totalDurationMs, 85);
  const proximityResult = triggerDeviceHapticFeedback(
    proximityPulse,
    true,
    mockVibrate
  );
  assert.equal(proximityResult.didVibrate, true);
  assert.deepEqual(recordedPatterns[2], [25, 35, 25]);

  // 4. Disabled haptics suppresses navigator.vibrate call
  const mutedResult = triggerDeviceHapticFeedback(
    arrivalPulse,
    false,
    mockVibrate
  );
  assert.equal(mutedResult.didVibrate, false);
  assert.equal(recordedPatterns.length, 3);
});

test('computeLandmarkSightlineBearing and computeGyroCompassAlignment calculate 3D compass needle angles and sightline lock accurately', () => {
  const arcadeSight = computeLandmarkSightlineBearing(CLEVELAND_LANDMARKS[1]); // The Arcade (48° NE)
  assert.equal(arcadeSight.targetBearingDeg, 48);
  assert.equal(arcadeSight.targetTitle, 'The Arcade Cleveland');

  // Case 1: Phone gyroscope alpha = 312° -> compass heading = (360 - 312) = 48° NE -> exact sightline lock!
  const locked = computeGyroCompassAlignment({
    gyro: { alpha: 312, beta: 60, gamma: 10 },
    targetBearingDeg: arcadeSight.targetBearingDeg,
    targetLandmarkTitle: arcadeSight.targetTitle,
  });
  assert.equal(locked.deviceHeadingDeg, 48);
  assert.equal(locked.deviceCardinal, 'NE');
  assert.equal(locked.relativeNeedleAngleDeg, 0);
  assert.equal(locked.isAligned, true);
  assert.ok(locked.alignmentInstruction.includes('LOCKED ON SIGHTLINE'));
  assert.ok(locked.pitchTiltDeg >= 18 && locked.pitchTiltDeg <= 56);
  assert.equal(locked.rollTiltDeg, 5);

  // Case 2: Phone facing 10° N while target is 48° NE -> need to rotate 38° Right (CW)
  const offRight = computeGyroCompassAlignment({
    gyro: { alpha: 350, beta: 45, gamma: -12 },
    targetBearingDeg: 48,
    targetLandmarkTitle: 'The Arcade Cleveland',
  });
  assert.equal(offRight.deviceHeadingDeg, 10);
  assert.equal(offRight.relativeNeedleAngleDeg, 38);
  assert.equal(offRight.isAligned, false);
  assert.ok(offRight.alignmentInstruction.includes('Rotate 38° Right (CW)'));

  // Case 3: iOS webkitCompassHeading override across 0°/360° wrap-around (facing 15° N, target 335° NNW -> -40° Left CCW)
  const wrapLeft = computeGyroCompassAlignment({
    gyro: { alpha: 0, beta: 50, gamma: 0, webkitCompassHeading: 15 },
    targetBearingDeg: 335,
    targetLandmarkTitle: 'Rock & Roll Hall of Fame',
  });
  assert.equal(wrapLeft.deviceHeadingDeg, 15);
  assert.equal(wrapLeft.relativeNeedleAngleDeg, -40);
  assert.equal(wrapLeft.isAligned, false);
  assert.ok(wrapLeft.alignmentInstruction.includes('Rotate 40° Left (CCW)'));
});

test('buildARDiscoverySharePayload generates social media intent URLs and formatted 3D AR sightline caption', () => {
  const terminalTower = CLEVELAND_LANDMARKS[0];
  const fact = terminalTower.arFacts[0];
  const payload = buildARDiscoverySharePayload({
    landmark: terminalTower,
    fact,
    cameraHeadingDeg: 142,
    baseUrl: 'https://clevetour3d.app',
  });

  assert.equal(payload.landmarkId, 'terminal-tower');
  assert.equal(payload.factId, 'tt-fact-1');
  assert.equal(payload.cameraHeadingDeg, 142);
  assert.equal(payload.cameraCardinal, 'SE');
  assert.ok(payload.shareText.includes('Terminal Tower'));
  assert.ok(payload.shareText.includes('52 Stories Over the Cuyahoga Valley'));
  assert.ok(payload.shareText.includes('Sightline 142° SE'));
  assert.ok(payload.platformUrls.X_TWITTER.startsWith('https://twitter.com/intent/tweet?'));
  assert.ok(payload.platformUrls.FACEBOOK.startsWith('https://www.facebook.com/sharer/sharer.php?'));
  assert.ok(payload.platformUrls.LINKEDIN.startsWith('https://www.linkedin.com/sharing/share-offsite/?'));
  assert.ok(payload.platformUrls.REDDIT.startsWith('https://www.reddit.com/submit?'));
  assert.ok(payload.platformUrls.EMAIL.startsWith('mailto:?subject='));
});

test('buildGoogle3DCameraPreset, computeARFactGeoAltitudePoint, and buildGoogle3DWalkingCorridorCoordinates compute Google Maps 3D and Google Earth coordinates accurately', () => {
  const terminalTower = CLEVELAND_LANDMARKS[0];
  const cameraPreset = buildGoogle3DCameraPreset(terminalTower);

  assert.equal(cameraPreset.center.lat, 41.4984);
  assert.equal(cameraPreset.center.lng, -81.6937);
  assert.equal(cameraPreset.center.altitude, 286); // 201m ASL + 85m offset
  assert.equal(cameraPreset.range, 460);
  assert.equal(cameraPreset.tilt, 67.5);
  assert.equal(cameraPreset.heading, 142);
  assert.ok(cameraPreset.googleEarthUrl.startsWith('https://earth.google.com/web/@41.498400,-81.693700'));
  assert.ok(cameraPreset.googleMaps3DUrl.startsWith('https://www.google.com/maps/@41.498400,-81.693700'));

  const factPin = computeARFactGeoAltitudePoint(
    terminalTower,
    terminalTower.arFacts[0]
  );
  assert.equal(factPin.factId, 'tt-fact-1');
  assert.ok(Math.abs(factPin.lat - 41.4984) < 0.002);
  assert.ok(Math.abs(factPin.lng - -81.6937) < 0.002);
  assert.ok(factPin.altitudeMeters >= 50);

  const corridor = buildGoogle3DWalkingCorridorCoordinates(CLEVELAND_LANDMARKS);
  assert.equal(corridor.length, 6);
  assert.equal(corridor[0].lat, 41.4984);
  assert.equal(corridor[0].altitude, 22);
});







