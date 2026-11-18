export interface ARHistoricalFact {
  id: string;
  year: number;
  eraLabel: string;
  title: string;
  narrative: string;
  architecturalSpec: string;
  arOffset3D: [number, number, number]; // Relative X, Y, Z in the 3D scene / ViroARNode
  category: 'Architecture' | 'Civic History' | 'Engineering' | 'Cultural Milestone';
}

export interface LandmarkBlueprint {
  id: string;
  slug: string;
  searchQuery: string; // Used with Google Maps Places API (New) Place.searchByText
  districtId: string;
  districtName: string;
  shortTitle: string;
  yearCompleted: number;
  architecturalStyle: string;
  architect: string;
  summary: string;
  walkingOrder: number;
  walkingCueToNext: string;
  // Local 3D Tour & Offline Vector Corridor Coordinates (relative & geofence anchor)
  tourAnchor: {
    lat: number;
    lng: number;
    elevationMeters: number;
  };
  scenePosition3D: [number, number, number];
  heroImage: string;
  accentHex: string;
  arFacts: ARHistoricalFact[];
}

export interface OfflineDistrictPack {
  id: string;
  name: string;
  subtitle: string;
  landmarkIds: string[];
  vectorTilesMb: number;
  meshes3DMb: number;
  arAudioFactsMb: number;
  corridorSummary: string;
  boundsDescription: string;
}

export const HERO_SKYLINE_IMAGE = '/src/assets/images/cleveland_skyline_hero_1794959341698.jpg';
export const SANDSTONE_TEXTURE_PATH = '/src/assets/images/sandstone_masonry_tile_1794959342445.jpg';
export const ROCK_HALL_IMAGE = '/src/assets/images/rock_hall_lakefront_1794959344595.jpg';
export const WEST_SIDE_MARKET_IMAGE = '/src/assets/images/west_side_market_hall_1794959345049.jpg';

export const CLEVELAND_LANDMARKS: LandmarkBlueprint[] = [
  {
    id: 'terminal-tower',
    slug: 'terminal-tower',
    searchQuery: 'Tower City Center 230 W Huron Rd Cleveland OH',
    districtId: 'downtown-public-square',
    districtName: 'Public Square & Civic Core',
    shortTitle: 'Terminal Tower',
    yearCompleted: 1930,
    architecturalStyle: 'Beaux-Arts Skyscraper',
    architect: 'Graham, Anderson, Probst & White',
    summary:
      'Rising 708 feet above Public Square, Terminal Tower stood as the tallest building in North America outside New York City until 1964 and anchored the Cleveland Union Terminal rail complex.',
    walkingOrder: 1,
    walkingCueToNext:
      'Walk northeast across Public Square toward Superior Avenue and enter the historic glass-domed Euclid Avenue concourse of The Arcade (450m, 6 min walk).',
    tourAnchor: {
      lat: 41.4984,
      lng: -81.6937,
      elevationMeters: 201,
    },
    scenePosition3D: [0, 0, 0],
    heroImage: HERO_SKYLINE_IMAGE,
    accentHex: '#f59e0b',
    arFacts: [
      {
        id: 'tt-fact-1',
        year: 1930,
        eraLabel: '1930 Dedication',
        title: '52 Stories Over the Cuyahoga Valley',
        narrative:
          'Developed by the Van Sweringen brothers, the 708-foot tower was engineered atop deep caissons reaching 250 feet down to bedrock through ancient glacial clay.',
        architecturalSpec: 'Height: 215.8m · 52 Floors · Steel Frame & Limestone Curtain',
        arOffset3D: [3.2, 11.5, 1.8],
        category: 'Engineering',
      },
      {
        id: 'tt-fact-2',
        year: 1931,
        eraLabel: '1931 Navigation Beacon',
        title: 'Great Lakes Maritime Strobe',
        narrative:
          'A high-intensity revolving airway and marine beacon was mounted at the spire apex, visible to Lake Erie freighters over 35 miles offshore.',
        architecturalSpec: 'Spire Apex: 235m ASL · 300-Watt Archival Illumination',
        arOffset3D: [-2.8, 15.2, 1.2],
        category: 'Civic History',
      },
      {
        id: 'tt-fact-3',
        year: 1894,
        eraLabel: '1894 Plaza Anchor',
        title: "Soldiers' and Sailors' Monument",
        narrative:
          'At the base of Public Square sits Levi Scofield’s 125-foot granite column and Berea sandstone memorial room honoring 9,000 Cuyahoga County Civil War veterans.',
        architecturalSpec: 'Base: Berea Sandstone · Column: Quincy Black Granite',
        arOffset3D: [4.5, 3.2, 4.0],
        category: 'Architecture',
      },
    ],
  },
  {
    id: 'the-arcade',
    slug: 'the-arcade',
    searchQuery: 'The Arcade Cleveland Euclid Avenue OH',
    districtId: 'downtown-public-square',
    districtName: 'Historic Euclid Corridor',
    shortTitle: 'The Arcade Cleveland',
    yearCompleted: 1890,
    architecturalStyle: 'Victorian Romanesque & Iron Atrium',
    architect: 'John Eisenmann & George H. Smith',
    summary:
      'Opened in May 1890 and financed by John D. Rockefeller and Marcus Hanna, America’s first indoor crystalline shopping arcade spans 300 feet beneath 1,800 panes of skylight glass.',
    walkingOrder: 2,
    walkingCueToNext:
      'Exit the Superior Avenue portal, head north down East 9th Street across the Mall parkland toward Lake Erie and North Coast Harbor (950m, 12 min walk).',
    tourAnchor: {
      lat: 41.4998,
      lng: -81.6902,
      elevationMeters: 204,
    },
    scenePosition3D: [24, 0, -10],
    heroImage: HERO_SKYLINE_IMAGE,
    accentHex: '#eab308',
    arFacts: [
      {
        id: 'arc-fact-1',
        year: 1890,
        eraLabel: '1890 Skylight Truss',
        title: '300-Foot Span of Wrought Iron & Glass',
        narrative:
          'Modeled after Milan’s Galleria Vittorio Emanuele II, the 100-foot-tall atrium bridges the 12-foot elevation grade between Euclid and Superior Avenues with grand bifurcated staircases.',
        architecturalSpec: 'Length: 91.4m · Height: 30.5m · 1,800 Glass Panels',
        arOffset3D: [24.0, 9.2, -7.5],
        category: 'Architecture',
      },
      {
        id: 'arc-fact-2',
        year: 1895,
        eraLabel: '1895 Gilded Balconies',
        title: 'Hand-Forged Brass Gargoyle Brackets',
        narrative:
          'Four tiers of recessed balconies are supported by ornamental cast-iron columns and brass caryatid medallions crafted by the Detroit Bridge & Iron Works.',
        architecturalSpec: '5 Atrium Levels · Structural Cast Iron & Polished Brass',
        arOffset3D: [27.2, 5.4, -10.8],
        category: 'Engineering',
      },
    ],
  },
  {
    id: 'rock-hall',
    slug: 'rock-hall',
    searchQuery: 'Rock and Roll Hall of Fame Cleveland OH',
    districtId: 'north-coast-harbor',
    districtName: 'North Coast Harbor & Lakefront',
    shortTitle: 'Rock & Roll Hall of Fame',
    yearCompleted: 1995,
    architecturalStyle: 'Geometric Modernist Glass Pyramid',
    architect: 'I.M. Pei',
    summary:
      'Designed by Pritzker Prize laureate I.M. Pei on the shore of Lake Erie, the 162-foot tubular steel tower and intersecting dual glass pyramids celebrate Cleveland’s 1951 Alan Freed radio heritage.',
    walkingOrder: 3,
    walkingCueToNext:
      'Stroll west along the Lake Erie waterfront promenade past the historic William G. Mather steamship toward the harbor pierhead (550m, 7 min walk).',
    tourAnchor: {
      lat: 41.5085,
      lng: -81.6954,
      elevationMeters: 177,
    },
    scenePosition3D: [14, 0, -34],
    heroImage: ROCK_HALL_IMAGE,
    accentHex: '#ef4444',
    arFacts: [
      {
        id: 'rh-fact-1',
        year: 1951,
        eraLabel: '1951 Radio Birthplace',
        title: 'Alan Freed & The Moondog Coronation Ball',
        narrative:
          'Cleveland DJ Alan Freed popularized the phrase "rock and roll" on WJW radio and staged the first major rock concert at the Cleveland Arena in March 1952.',
        architecturalSpec: '85.5 FM / 1260 AM Archive · 600,000 Voter Petition in 1986',
        arOffset3D: [11.0, 6.8, -31.0],
        category: 'Cultural Milestone',
      },
      {
        id: 'rh-fact-2',
        year: 1995,
        eraLabel: '1995 Pei Geometry',
        title: 'Cantilevered Drum & Triangulated Space Frame',
        narrative:
          'I.M. Pei anchored a 162-foot white metal tower into Lake Erie bedrock, projecting a 115-foot glass tent that floods seven exhibition levels with lakefront daylight.',
        architecturalSpec: 'Area: 14,000 sq m · 200-ft Cantilevered Theater Box',
        arOffset3D: [17.2, 10.4, -34.5],
        category: 'Architecture',
      },
    ],
  },
  {
    id: 'harbor-lighthouse',
    slug: 'harbor-lighthouse',
    searchQuery: 'Cleveland Harbor West Pierhead Light OH',
    districtId: 'north-coast-harbor',
    districtName: 'Lake Erie Breakwall & Script Vista',
    shortTitle: 'Harbor Pierhead & Lakefront',
    yearCompleted: 1911,
    architecturalStyle: 'Conical Cast-Iron Maritime Beacon',
    architect: 'U.S. Lighthouse Service',
    summary:
      'Guarding the Cuyahoga River mouth since 1911, the cast-iron West Pierhead Lighthouse and adjacent North Coast Script frame panoramic views of the Downtown skyline.',
    walkingOrder: 4,
    walkingCueToNext:
      'Follow the Cuyahoga Riverfront trail south toward the Flats and ascend to the Lorain-Carnegie Bridge east approach to meet the Guardians of Traffic (1.4km, 18 min walk).',
    tourAnchor: {
      lat: 41.5052,
      lng: -81.7012,
      elevationMeters: 175,
    },
    scenePosition3D: [-16, 0, -32],
    heroImage: ROCK_HALL_IMAGE,
    accentHex: '#38bdf8',
    arFacts: [
      {
        id: 'hl-fact-1',
        year: 1911,
        eraLabel: '1911 Fourth-Order Fresnel',
        title: 'Cast-Iron Breakwater Sentinel',
        narrative:
          'Built to guide iron-ore freighters navigating the Cuyahoga River mouth into Cleveland’s steel mills, its foghorn and Fresnel lens resisted winter Lake Erie ice gales.',
        architecturalSpec: 'Focal Plane: 20.4m · Cast-Iron Plate Tower on Concrete Pier',
        arOffset3D: [-13.5, 8.2, -30.0],
        category: 'Engineering',
      },
      {
        id: 'hl-fact-2',
        year: 2016,
        eraLabel: '2016 Civic Vista',
        title: 'Foundry Script Skyline Frame',
        narrative:
          'Six custom-fabricated steel script signs were installed across the city to frame architectural sightlines connecting Lake Erie to Terminal Tower.',
        architecturalSpec: 'Sightline Azimuth: 142° SE to Terminal Tower Spire',
        arOffset3D: [-18.5, 4.5, -33.2],
        category: 'Cultural Milestone',
      },
    ],
  },
  {
    id: 'guardians-of-traffic',
    slug: 'guardians-of-traffic',
    searchQuery: 'Guardians of Traffic Hope Memorial Bridge Cleveland OH',
    districtId: 'ohio-city-bridges',
    districtName: 'Cuyahoga Valley & Hope Bridge',
    shortTitle: 'Guardians of Traffic',
    yearCompleted: 1932,
    architecturalStyle: 'Art Deco Berea Sandstone Pylons',
    architect: 'Frank Walker (Architect) & Henry Hering (Sculptor)',
    summary:
      'Eight 43-foot-tall Art Deco Berea sandstone titans stand atop four pairs of pylons on the Hope Memorial Bridge, each clutching a historic vehicle symbolizing the spirit of progress in transportation.',
    walkingOrder: 5,
    walkingCueToNext:
      'Walk straight west across the pedestrian promenade of the Hope Memorial Bridge directly to the clock tower of the West Side Market at Lorain & West 25th (600m, 8 min walk).',
    tourAnchor: {
      lat: 41.4888,
      lng: -81.6958,
      elevationMeters: 196,
    },
    scenePosition3D: [-18, 0, 14],
    heroImage: HERO_SKYLINE_IMAGE,
    accentHex: '#10b981',
    arFacts: [
      {
        id: 'got-fact-1',
        year: 1932,
        eraLabel: '1932 Berea Stone Carving',
        title: 'Eight Titans of Progress in Transportation',
        narrative:
          'Quarried locally in Berea, Ohio, the 8,000 tons of golden sandstone were hand-chiseled by 35 immigrant Italian stonecutters during the Great Depression.',
        architecturalSpec: 'Statue Height: 13.1m · Total Pylon Height: 38m above Deck',
        arOffset3D: [-15.2, 10.5, 16.0],
        category: 'Architecture',
      },
      {
        id: 'got-fact-2',
        year: 1932,
        eraLabel: '1932 Vehicular Iconography',
        title: 'Hayrack, Stagecoach, Roadster & Locomotive',
        narrative:
          'Each Guardian holds a distinct machine: a haywain, covered wagon, stagecoach, early motorcar, electric locomotive, and four utilitarian construction trucks.',
        architecturalSpec: 'Bridge Span: 1,788m across Cuyahoga Industrial Valley',
        arOffset3D: [-21.0, 7.8, 12.2],
        category: 'Cultural Milestone',
      },
    ],
  },
  {
    id: 'west-side-market',
    slug: 'west-side-market',
    searchQuery: 'West Side Market 1979 W 25th St Cleveland OH',
    districtId: 'ohio-city-bridges',
    districtName: 'Ohio City Market District',
    shortTitle: 'West Side Market',
    yearCompleted: 1912,
    architecturalStyle: 'Neo-Byzantine & Romanesque Revival',
    architect: 'Benjamin Hubbell & W. Dominick Benes',
    summary:
      'Cleveland’s oldest publicly owned market features a 137-foot yellow-brick clock tower and a 44-foot-high Guastavino herringbone tile barrel vault housing over 100 family-run food stands.',
    walkingOrder: 6,
    walkingCueToNext:
      'Tour complete! Enjoy artisanal pierogi and bratwurst inside the Guastavino vaulted concourse, or board the RTA Red Line at West 25th Station back to Public Square (4 min transit).',
    tourAnchor: {
      lat: 41.4847,
      lng: -81.7031,
      elevationMeters: 206,
    },
    scenePosition3D: [18, 0, 18],
    heroImage: WEST_SIDE_MARKET_IMAGE,
    accentHex: '#f97316',
    arFacts: [
      {
        id: 'wsm-fact-1',
        year: 1912,
        eraLabel: '1912 Guastavino Vault',
        title: 'Self-Supporting Acoustic Tile Ceiling',
        narrative:
          'The indoor concourse spans 122 by 240 feet without interior columns, crowned by Rafael Guastavino’s interlocking acoustic white glazed terra-cotta vaults.',
        architecturalSpec: 'Vault Height: 13.4m · Clock Tower: 41.8m (137 ft)',
        arOffset3D: [15.5, 11.2, 20.0],
        category: 'Engineering',
      },
      {
        id: 'wsm-fact-2',
        year: 1840,
        eraLabel: '1840 Pearl Street Roots',
        title: 'From Josiah Barber’s Tract to Civic Commons',
        narrative:
          'Originally donated in 1840 as the Pearl Street Market on the condition the land remain a public market forever, the 1912 hall became a National Historic Landmark.',
        architecturalSpec: '85 Indoor Stalls · 36 Outdoor Covered Arcade Stalls',
        arOffset3D: [21.2, 6.0, 16.5],
        category: 'Civic History',
      },
    ],
  },
];

export const OFFLINE_DISTRICT_PACKS: OfflineDistrictPack[] = [
  {
    id: 'downtown-public-square',
    name: 'Downtown & Public Square Pack',
    subtitle: 'Terminal Tower, Soldiers Monument & The Arcade Euclid Corridor',
    landmarkIds: ['terminal-tower', 'the-arcade'],
    vectorTilesMb: 14.2,
    meshes3DMb: 8.6,
    arAudioFactsMb: 5.4,
    corridorSummary: 'Covers Public Square, Superior Ave, and Historic Euclid Ave pedestrian corridors.',
    boundsDescription: '41.495°N to 41.503°N · 81.698°W to 81.685°W',
  },
  {
    id: 'north-coast-harbor',
    name: 'North Coast Harbor & Lakefront Pack',
    subtitle: 'Rock & Roll Hall of Fame, Steamship Mather & West Pierhead Light',
    landmarkIds: ['rock-hall', 'harbor-lighthouse'],
    vectorTilesMb: 11.8,
    meshes3DMb: 9.4,
    arAudioFactsMb: 4.8,
    corridorSummary: 'Covers the Mall parkland, E 9th Pier, Voinovich Park, and Lake Erie breakwall.',
    boundsDescription: '41.503°N to 41.512°N · 81.705°W to 81.690°W',
  },
  {
    id: 'ohio-city-bridges',
    name: 'Ohio City & Cuyahoga Bridges Pack',
    subtitle: 'Guardians of Traffic Hope Memorial Bridge & West Side Market',
    landmarkIds: ['guardians-of-traffic', 'west-side-market'],
    vectorTilesMb: 16.5,
    meshes3DMb: 10.2,
    arAudioFactsMb: 6.1,
    corridorSummary: 'Covers the Cuyahoga River valley crossing, Lorain-Carnegie promenade, and W 25th St.',
    boundsDescription: '41.481°N to 41.492°N · 81.708°W to 81.691°W',
  },
];

export interface PassportBadgeDefinition {
  id: string;
  districtId: string;
  districtName: string;
  stickerTitle: string;
  stickerSubtitle: string;
  serialCode: string;
  requiredLandmarkIds: string[];
  rewardDescription: string;
  emblemType: 'CIVIC_CROWN' | 'LAKEFRONT_BEACON' | 'SANDSTONE_GUARDIAN' | 'GRAND_LAUREATE';
  accentHex: string;
  unlockedMotto: string;
}

export const CLEVELAND_PASSPORT_BADGES: PassportBadgeDefinition[] = [
  {
    id: 'badge-downtown-public-square',
    districtId: 'downtown-public-square',
    districtName: 'Public Square & Historic Euclid District',
    stickerTitle: 'Civic Core & Gilded Arcade Seal',
    stickerSubtitle: 'Downtown & Public Square District Sticker',
    serialCode: 'CLE-STAMP-01',
    requiredLandmarkIds: ['terminal-tower', 'the-arcade'],
    rewardDescription:
      'Unlocked by visiting every landmark in the Downtown & Public Square district: Terminal Tower (1930) and The Arcade Cleveland (1890).',
    emblemType: 'CIVIC_CROWN',
    accentHex: '#f59e0b',
    unlockedMotto: '708 Feet of Beaux-Arts Stone & 1,800 Skylight Panes',
  },
  {
    id: 'badge-north-coast-harbor',
    districtId: 'north-coast-harbor',
    districtName: 'North Coast Harbor & Lakefront District',
    stickerTitle: 'Lake Erie Breakwater & Rock Pyramid Sticker',
    stickerSubtitle: 'North Coast Harbor District Sticker',
    serialCode: 'CLE-STAMP-02',
    requiredLandmarkIds: ['rock-hall', 'harbor-lighthouse'],
    rewardDescription:
      'Unlocked by visiting every landmark in the North Coast Harbor district: Rock & Roll Hall of Fame (1995) and the 1911 West Pierhead Lighthouse.',
    emblemType: 'LAKEFRONT_BEACON',
    accentHex: '#38bdf8',
    unlockedMotto: 'Where 1951 Radio Waves Meet the Great Lakes Breakwall',
  },
  {
    id: 'badge-ohio-city-bridges',
    districtId: 'ohio-city-bridges',
    districtName: 'Ohio City & Cuyahoga Bridges District',
    stickerTitle: 'Berea Sandstone & Guastavino Vault Sticker',
    stickerSubtitle: 'Ohio City & Hope Bridge District Sticker',
    serialCode: 'CLE-STAMP-03',
    requiredLandmarkIds: ['guardians-of-traffic', 'west-side-market'],
    rewardDescription:
      'Unlocked by visiting every landmark in the Ohio City & Bridges district: the Guardians of Traffic (1932) and the West Side Market (1912).',
    emblemType: 'SANDSTONE_GUARDIAN',
    accentHex: '#10b981',
    unlockedMotto: 'Eight Art Deco Titans Across the Cuyahoga Valley',
  },
  {
    id: 'badge-cleveland-grand-laureate',
    districtId: 'all-districts',
    districtName: 'All 3 Cleveland Heritage Districts',
    stickerTitle: 'Grand Cleveland Heritage Master Crest',
    stickerSubtitle: 'Complete 6-Stop Citywide Achievement Sticker',
    serialCode: 'CLE-MASTER-04',
    requiredLandmarkIds: [
      'terminal-tower',
      'the-arcade',
      'rock-hall',
      'harbor-lighthouse',
      'guardians-of-traffic',
      'west-side-market',
    ],
    rewardDescription:
      'Master commemorative sticker unlocked upon stamping every iconic landmark across all three Cleveland walking districts.',
    emblemType: 'GRAND_LAUREATE',
    accentHex: '#f97316',
    unlockedMotto: 'From Public Square to Lake Erie & Across the Hope Bridge',
  },
];

