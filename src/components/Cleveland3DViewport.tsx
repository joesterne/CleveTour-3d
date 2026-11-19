import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { AltitudeMode } from '@vis.gl/react-google-maps';
import {
  Map3D,
  Map3DRef,
  MapMode,
  Marker3D,
  Polyline3D,
  Map3DCameraChangedEvent,
} from '@vis.gl/react-google-maps/3d';
import {
  ARHistoricalFact,
  CLEVELAND_LANDMARKS,
  LandmarkBlueprint,
  SANDSTONE_TEXTURE_PATH,
} from '../data/clevelandLandmarks';
import {
  GeoPoint,
  GyroOrientationInput,
  buildARDiscoverySharePayload,
  buildGoogle3DCameraPreset,
  buildGoogle3DWalkingCorridorCoordinates,
  computeARFactGeoAltitudePoint,
  computeGyroCompassAlignment,
  computeLandmarkSightlineBearing,
  filterARFactsByEra,
} from '../utils/tourLogic';
import {
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Compass,
  Copy,
  Download,
  ExternalLink,
  Eye,
  Globe,
  Heart,
  Layers,
  Navigation,
  RotateCcw,
  Share2,
  Sparkles,
  Volume2,
  VolumeX,
  Code2,
  X,
} from 'lucide-react';

interface ProjectedFactNode {
  fact: ARHistoricalFact;
  x: number;
  y: number;
  visible: boolean;
}

interface Cleveland3DViewportProps {
  landmarks: LandmarkBlueprint[];
  selectedLandmark: LandmarkBlueprint;
  onSelectLandmark: (landmark: LandmarkBlueprint) => void;
  selectedFact: ARHistoricalFact | null;
  onSelectFact: (fact: ARHistoricalFact | null) => void;
  arLensActive: boolean;
  onToggleArLens: () => void;
  eraMaxYear: number;
  onChangeEraMaxYear: (year: number) => void;
  factCategory: string;
  onChangeFactCategory: (cat: string) => void;
  isFavorite: boolean;
  onToggleFavorite: (landmarkId: string) => void;
  onOpenShareModal: (landmark: LandmarkBlueprint, fact?: ARHistoricalFact | null) => void;
  onOpenViroExport: (landmark: LandmarkBlueprint) => void;
  isOfflineAvailable: boolean;
  hasGoogleMapsApiKey?: boolean;
  offlineMode?: boolean;
  liveLocationsById?: Record<string, GeoPoint | undefined>;
}

const isSoftwareGl = (() => {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
})();

function createProceduralBumpTexture(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 16) {
      ctx.fillStyle = '#555555';
      ctx.fillRect(0, y, 128, 2);
      for (let x = (y % 32 === 0 ? 0 : 16); x < 128; x += 32) {
        ctx.fillRect(x, y, 2, 16);
      }
    }
    for (let i = 0; i < 600; i++) {
      const shade = 100 + ((i * 37) % 55);
      ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
      ctx.fillRect((i * 23) % 128, (i * 41) % 128, 2, 2);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

function createClockFaceTexture(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 128, 128);
    ctx.beginPath();
    ctx.arc(64, 64, 54, 0, Math.PI * 2);
    ctx.fillStyle = '#fef3c7';
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#d97706';
    ctx.stroke();

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 3;
    for (let i = 0; i < 12; i++) {
      const angle = (i * Math.PI) / 6;
      ctx.beginPath();
      ctx.moveTo(64 + Math.cos(angle) * 42, 64 + Math.sin(angle) * 42);
      ctx.lineTo(64 + Math.cos(angle) * 50, 64 + Math.sin(angle) * 50);
      ctx.stroke();
    }
    // Hands
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(64, 64);
    ctx.lineTo(64, 28);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(64, 64);
    ctx.lineTo(90, 64);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

export const Cleveland3DViewport: React.FC<Cleveland3DViewportProps> = ({
  landmarks,
  selectedLandmark,
  onSelectLandmark,
  selectedFact,
  onSelectFact,
  arLensActive,
  onToggleArLens,
  eraMaxYear,
  onChangeEraMaxYear,
  factCategory,
  onChangeFactCategory,
  isFavorite,
  onToggleFavorite,
  onOpenShareModal,
  onOpenViroExport,
  isOfflineAvailable,
  hasGoogleMapsApiKey = true,
  offlineMode = false,
  liveLocationsById,
}) => {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const map3DRef = useRef<Map3DRef | null>(null);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [cameraFeedActive, setCameraFeedActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [audioSpeaking, setAudioSpeaking] = useState(false);
  const [projectedNodes, setProjectedNodes] = useState<ProjectedFactNode[]>([]);
  const [finishMode, setFinishMode] = useState<'REALISTIC' | 'ARCHITECTURAL_CLAY' | 'BLUEPRINT'>('REALISTIC');

  // Google Maps 3D / Google Earth Photorealistic 3D Tiles Engine State
  const [viewportEngine, setViewportEngine] = useState<
    'GOOGLE_EARTH_3D' | 'ARCHITECTURAL_3D_AR'
  >(() =>
    hasGoogleMapsApiKey && !offlineMode ? 'GOOGLE_EARTH_3D' : 'ARCHITECTURAL_3D_AR'
  );
  const [google3DMapMode, setGoogle3DMapMode] = useState<'HYBRID' | 'SATELLITE'>('HYBRID');
  const [google3DOrbiting, setGoogle3DOrbiting] = useState<boolean>(false);

  // Switch gracefully if offlineMode toggles on
  useEffect(() => {
    if (offlineMode && viewportEngine === 'GOOGLE_EARTH_3D') {
      setViewportEngine('ARCHITECTURAL_3D_AR');
    }
  }, [offlineMode, viewportEngine]);

  const google3DCameraPose = buildGoogle3DCameraPreset(
    selectedLandmark,
    liveLocationsById?.[selectedLandmark.id] || null
  );
  const google3DCorridorCoords = buildGoogle3DWalkingCorridorCoordinates(
    landmarks,
    liveLocationsById
  );

  // Store latest props in refs so WebGL scene never tears down on HUD state updates
  const selectedLandmarkRef = useRef(selectedLandmark);
  selectedLandmarkRef.current = selectedLandmark;
  const arLensRef = useRef(arLensActive);
  arLensRef.current = arLensActive;
  const eraMaxYearRef = useRef(eraMaxYear);
  eraMaxYearRef.current = eraMaxYear;
  const factCategoryRef = useRef(factCategory);
  factCategoryRef.current = factCategory;
  const onSelectLandmarkRef = useRef(onSelectLandmark);
  onSelectLandmarkRef.current = onSelectLandmark;
  const onSelectFactRef = useRef(onSelectFact);
  onSelectFactRef.current = onSelectFact;

  // Trigger camera transition target ref
  const cameraTargetRef = useRef<{
    pos: THREE.Vector3;
    lookAt: THREE.Vector3;
    active: boolean;
  }>({
    pos: new THREE.Vector3(14, 16, 22),
    lookAt: new THREE.Vector3(0, 7, 0),
    active: true,
  });

  const requestRenderRef = useRef<() => void>(() => {});
  const applyFinishModeRef = useRef<(mode: 'REALISTIC' | 'ARCHITECTURAL_CLAY' | 'BLUEPRINT') => void>(() => {});
  const captureViewportSnapshotRef = useRef<() => string | null>(() => null);

  // Direct AR Overlay Social Share State
  const [arShareOverlayOpen, setArShareOverlayOpen] = useState<boolean>(false);
  const [arShareTargetFact, setArShareTargetFact] =
    useState<ARHistoricalFact | null>(null);
  const [capturedViewDataUrl, setCapturedViewDataUrl] = useState<string | null>(
    null
  );
  const [shareCopied, setShareCopied] = useState<boolean>(false);
  const [shareStatusMessage, setShareStatusMessage] = useState<string | null>(
    null
  );

  // 3D Gyroscope Orientation & Historical Sightline Alignment State
  const [gyroOrientation, setGyroOrientation] = useState<GyroOrientationInput>({
    alpha: 242, // Initial heading: (360 - 242) = 118° ESE (slightly off 142° SE Terminal Tower sightline)
    beta: 58,
    gamma: 0,
    webkitCompassHeading: null,
  });
  const [gyroSource, setGyroSource] = useState<
    'DEVICE_GYRO' | 'CAMERA_SYNC'
  >('CAMERA_SYNC');
  const hasHardwareGyroRef = useRef<boolean>(false);
  const lastOrbitGyroSyncRef = useRef<number>(0);

  const sightlineSpec = computeLandmarkSightlineBearing(selectedLandmark);
  const compassAlignment = computeGyroCompassAlignment({
    gyro: gyroOrientation,
    targetBearingDeg: sightlineSpec.targetBearingDeg,
    targetLandmarkTitle: sightlineSpec.targetTitle,
  });

  // Fly Google Maps 3D camera smoothly when selectedLandmark changes
  useEffect(() => {
    const pose = buildGoogle3DCameraPreset(
      selectedLandmark,
      liveLocationsById?.[selectedLandmark.id] || null
    );
    setGoogle3DOrbiting(false);
    if (map3DRef.current?.map3d) {
      try {
        map3DRef.current.flyCameraTo({
          endCamera: {
            center: pose.center,
            range: pose.range,
            tilt: pose.tilt,
            heading: pose.heading,
            roll: pose.roll,
          },
          durationMillis: 1500,
        });
      } catch {
        // Fallback direct assignment if flyCameraTo is not yet ready
        Object.assign(map3DRef.current.map3d, {
          center: pose.center,
          range: pose.range,
          tilt: pose.tilt,
          heading: pose.heading,
          roll: pose.roll,
        });
      }
    }
  }, [selectedLandmark, liveLocationsById]);

  const handleToggleGoogle3DOrbit = useCallback(() => {
    const pose = buildGoogle3DCameraPreset(
      selectedLandmarkRef.current,
      liveLocationsById?.[selectedLandmarkRef.current.id] || null
    );
    if (!map3DRef.current?.map3d) {
      setGoogle3DOrbiting((prev) => !prev);
      return;
    }
    if (google3DOrbiting) {
      try {
        map3DRef.current.stopCameraAnimation();
      } catch {
        // Ignore
      }
      setGoogle3DOrbiting(false);
    } else {
      try {
        map3DRef.current.flyCameraAround({
          camera: {
            center: pose.center,
            range: pose.range,
            tilt: pose.tilt,
            heading: pose.heading,
            roll: 0,
          },
          durationMillis: 18000,
          repeatCount: 1,
        } as any);
      } catch {
        // Ignore
      }
      setGoogle3DOrbiting(true);
    }
  }, [google3DOrbiting, liveLocationsById]);

  const handleGoogle3DCameraChanged = useCallback(
    (ev: Map3DCameraChangedEvent) => {
      if (hasHardwareGyroRef.current) return;
      const now = performance.now();
      if (now - lastOrbitGyroSyncRef.current < 140) return;
      lastOrbitGyroSyncRef.current = now;
      const heading = ev?.detail?.heading;
      if (typeof heading === 'number' && !Number.isNaN(heading)) {
        const normalized = Math.round(((heading % 360) + 360) % 360) % 360;
        const nextAlpha = (360 - normalized) % 360;
        setGyroOrientation((prev) => {
          if (prev.alpha !== null && Math.abs(prev.alpha - nextAlpha) < 1) return prev;
          return {
            ...prev,
            alpha: nextAlpha,
            webkitCompassHeading: null,
          };
        });
      }
    },
    []
  );

  // Pivot 3D camera around the active landmark to match a compass heading (0..359°)
  const syncCameraToCompassHeading = useCallback(
    (headingDeg: number, lm: LandmarkBlueprint = selectedLandmarkRef.current) => {
      const [lx, ly, lz] = lm.scenePosition3D;
      const radius = arLensRef.current ? 22.8 : 26.4;
      const heightOffset = arLensRef.current ? 11.5 : 13.5;
      // Convert compass azimuth so targetBearingDeg places camera at canonical front view
      const targetSight = computeLandmarkSightlineBearing(lm).targetBearingDeg;
      const canonicalAngleRad = Math.atan2(16.0, 21.0); // ~37.3 deg canonical camera angle
      const deltaRad = ((headingDeg - targetSight) * Math.PI) / 180;
      const orbitAngle = canonicalAngleRad + deltaRad;

      cameraTargetRef.current = {
        pos: new THREE.Vector3(
          lx + Math.sin(orbitAngle) * radius,
          ly + heightOffset,
          lz + Math.cos(orbitAngle) * radius
        ),
        lookAt: new THREE.Vector3(lx, ly + 5.2, lz),
        active: true,
      };
      requestRenderRef.current();

      // Also sync Google Maps 3D Photorealistic camera heading when active
      if (map3DRef.current?.map3d) {
        try {
          map3DRef.current.map3d.heading = headingDeg;
        } catch {
          // Ignore
        }
      }
    },
    []
  );

  // Listen to real W3C DeviceOrientation / Gyroscope events on window
  useEffect(() => {
    const handleDeviceOrientation = (event: DeviceOrientationEvent) => {
      const webkitHeading = (event as any).webkitCompassHeading;
      const hasValidAngles =
        typeof event.alpha === 'number' ||
        typeof event.beta === 'number' ||
        typeof event.gamma === 'number' ||
        typeof webkitHeading === 'number';

      if (!hasValidAngles) return;

      hasHardwareGyroRef.current = true;
      setGyroSource('DEVICE_GYRO');
      const nextGyro: GyroOrientationInput = {
        alpha: typeof event.alpha === 'number' ? event.alpha : 0,
        beta: typeof event.beta === 'number' ? event.beta : 55,
        gamma: typeof event.gamma === 'number' ? event.gamma : 0,
        webkitCompassHeading:
          typeof webkitHeading === 'number' ? webkitHeading : null,
      };
      setGyroOrientation(nextGyro);

      const resolvedHeading =
        typeof webkitHeading === 'number'
          ? webkitHeading
          : typeof event.alpha === 'number'
          ? (360 - (event.alpha % 360) + 360) % 360
          : 0;
      syncCameraToCompassHeading(resolvedHeading);
    };

    window.addEventListener('deviceorientation', handleDeviceOrientation, true);
    window.addEventListener(
      'deviceorientationabsolute' as any,
      handleDeviceOrientation,
      true
    );
    return () => {
      window.removeEventListener(
        'deviceorientation',
        handleDeviceOrientation,
        true
      );
      window.removeEventListener(
        'deviceorientationabsolute' as any,
        handleDeviceOrientation,
        true
      );
    };
  }, [syncCameraToCompassHeading]);

  // Snap gyroscope compass needle and 3D camera directly onto the active landmark's historical sightline
  const handleAlignCompassToSight = useCallback(async () => {
    // Request iOS 13+ DeviceOrientation permission if available on device
    try {
      const DeviceOrientationEvt = (window as any).DeviceOrientationEvent;
      if (
        DeviceOrientationEvt &&
        typeof DeviceOrientationEvt.requestPermission === 'function'
      ) {
        await DeviceOrientationEvt.requestPermission();
      }
    } catch {
      // Fallback to calibrated alignment
    }

    const targetDeg = computeLandmarkSightlineBearing(
      selectedLandmarkRef.current
    ).targetBearingDeg;
    const alignedAlpha = (360 - targetDeg) % 360;
    setGyroOrientation((prev) => ({
      ...prev,
      alpha: alignedAlpha,
      beta: 56,
      gamma: 0,
      webkitCompassHeading: null,
    }));
    syncCameraToCompassHeading(targetDeg, selectedLandmarkRef.current);
  }, [syncCameraToCompassHeading]);

  // Manual gyroscope heading scrubber (0..359°) for testing & fine alignment
  const handleManualGyroHeadingChange = useCallback(
    (newHeadingDeg: number) => {
      const normalized = ((newHeadingDeg % 360) + 360) % 360;
      const nextAlpha = (360 - normalized) % 360;
      setGyroOrientation((prev) => ({
        ...prev,
        alpha: nextAlpha,
        webkitCompassHeading: null,
      }));
      syncCameraToCompassHeading(normalized, selectedLandmarkRef.current);
    },
    [syncCameraToCompassHeading]
  );

  // Open direct AR overlay social media share modal with live 3D view capture
  const handleOpenDirectARShare = useCallback(
    (factToShare?: ARHistoricalFact | null) => {
      const resolvedFact =
        factToShare || selectedFact || selectedLandmark.arFacts[0] || null;
      if (resolvedFact && resolvedFact.id !== selectedFact?.id) {
        onSelectFact(resolvedFact);
      }
      setArShareTargetFact(resolvedFact);
      const snap = captureViewportSnapshotRef.current();
      setCapturedViewDataUrl(snap || selectedLandmark.heroImage);
      setShareCopied(false);
      setShareStatusMessage(null);
      setArShareOverlayOpen(true);
    },
    [selectedFact, selectedLandmark, onSelectFact]
  );

  const activeSharePayload = buildARDiscoverySharePayload({
    landmark: selectedLandmark,
    fact: arShareTargetFact || selectedFact || selectedLandmark.arFacts[0],
    cameraHeadingDeg: compassAlignment.deviceHeadingDeg,
    baseUrl:
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'https://clevetour3d.app',
  });

  const handleCopyARShareCaption = useCallback(async () => {
    const fullCopy = `${activeSharePayload.shareText}\n${activeSharePayload.shareUrl}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(fullCopy);
      }
    } catch {
      // Fallback if clipboard blocked in iframe
    }
    setShareCopied(true);
    setShareStatusMessage('Discovery caption & 3D AR link copied to clipboard!');
  }, [activeSharePayload]);

  const handleDownloadARViewSnapshot = useCallback(() => {
    const dataUri = capturedViewDataUrl || selectedLandmark.heroImage;
    const link = document.createElement('a');
    link.href = dataUri;
    link.download = `clevetour-3d-${selectedLandmark.slug}-ar-view.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShareStatusMessage('3D AR view snapshot saved to your device!');
  }, [capturedViewDataUrl, selectedLandmark]);

  // Audio narration helper
  const toggleNarration = useCallback((landmark: LandmarkBlueprint, fact: ARHistoricalFact | null) => {
    if (!('speechSynthesis' in window)) return;
    if (audioSpeaking) {
      window.speechSynthesis.cancel();
      setAudioSpeaking(false);
      return;
    }
    window.speechSynthesis.cancel();
    const text = fact
      ? `${landmark.shortTitle}, ${fact.eraLabel}. ${fact.title}. ${fact.narrative}`
      : `${landmark.shortTitle}, completed in ${landmark.yearCompleted}. ${landmark.summary}`;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.02;
    utterance.onend = () => setAudioSpeaking(false);
    utterance.onerror = () => setAudioSpeaking(false);
    setAudioSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }, [audioSpeaking]);

  // Camera stream toggle for live AR pass-through
  const toggleLiveCameraStream = useCallback(async () => {
    if (cameraFeedActive) {
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((t) => t.stop());
        videoRef.current.srcObject = null;
      }
      setCameraFeedActive(false);
      return;
    }
    setCameraError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Simulated AR backdrop active (hardware camera unavailable in this browser).');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraFeedActive(true);
      }
    } catch {
      setCameraError('Simulated AR street-level backdrop active (camera permission declined or unavailable).');
    }
  }, [cameraFeedActive]);

  // Update camera transition when selectedLandmark changes
  useEffect(() => {
    const [lx, ly, lz] = selectedLandmark.scenePosition3D;
    const offset = arLensActive
      ? new THREE.Vector3(lx + 13.5, ly + 11.5, lz + 18.5)
      : new THREE.Vector3(lx + 16.0, ly + 13.5, lz + 21.0);
    const look = new THREE.Vector3(lx, ly + 5.2, lz);
    cameraTargetRef.current = {
      pos: offset,
      lookAt: look,
      active: true,
    };
    requestRenderRef.current();
  }, [selectedLandmark, arLensActive]);

  useEffect(() => {
    requestRenderRef.current();
  }, [eraMaxYear, factCategory]);

  useEffect(() => {
    applyFinishModeRef.current(finishMode);
    requestRenderRef.current();
  }, [finishMode]);

  // Keyboard shortcut 'h' to collapse/expand bottom dock
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }
      if (e.key.toLowerCase() === 'h') {
        setDockCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // Initialize WebGLRenderer & Cleveland 3D Scene once
  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const width = mount.clientWidth || 960;
    const height = mount.clientHeight || 600;

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    mount.innerHTML = '';
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const skyColor = new THREE.Color(0x0c1526);
    scene.background = skyColor;
    scene.fog = new THREE.FogExp2(0x0c1526, 0.0085);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(46, width / height, 0.5, 260);
    camera.position.set(14, 16, 22);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 6.5, 0);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.minDistance = 6;
    controls.maxDistance = 85;

    // Studio Warm/Cool 3-Point Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x1e293b, 0.85);
    hemiLight.position.set(0, 50, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffedd5, 2.2);
    keyLight.position.set(35, 52, 28);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.left = -48;
      keyLight.shadow.camera.right = 48;
      keyLight.shadow.camera.top = 48;
      keyLight.shadow.camera.bottom = -48;
      keyLight.shadow.camera.near = 5;
      keyLight.shadow.camera.far = 130;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.9);
    rimLight.position.set(-32, 24, -30);
    scene.add(rimLight);

    // Textures & Shared PBR Materials
    const bumpTex = createProceduralBumpTexture(renderer);
    const clockTex = createClockFaceTexture(renderer);
    const textureLoader = new THREE.TextureLoader();
    const sandstoneTex = textureLoader.load(
      SANDSTONE_TEXTURE_PATH,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(3, 3);
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        requestRender();
      },
      undefined,
      () => {
        // Fallback if offline or texture still loading
      }
    );

    const sandstoneMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: sandstoneTex,
      bumpMap: bumpTex,
      bumpScale: 0.04,
      roughness: 0.72,
      metalness: 0.08,
    });

    const limestoneMat = new THREE.MeshStandardMaterial({
      color: 0xe2dacb,
      bumpMap: bumpTex,
      bumpScale: 0.025,
      roughness: 0.62,
      metalness: 0.12,
    });

    const brickMat = new THREE.MeshStandardMaterial({
      color: 0xc26a4a,
      bumpMap: bumpTex,
      bumpScale: 0.035,
      roughness: 0.78,
      metalness: 0.06,
    });

    const copperPatinaMat = new THREE.MeshStandardMaterial({
      color: 0x34d399,
      roughness: 0.35,
      metalness: 0.65,
    });

    const brushedSteelMat = new THREE.MeshPhysicalMaterial({
      color: 0xf1f5f9,
      roughness: 0.22,
      metalness: 0.88,
      clearcoat: 0.6,
    });

    const gildedBrassMat = new THREE.MeshPhysicalMaterial({
      color: 0xfbbf24,
      roughness: 0.2,
      metalness: 0.92,
    });

    const crystalGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0x7dd3fc,
      roughness: 0.08,
      metalness: 0.1,
      transmission: isSoftwareGl ? 0 : 0.85,
      transparent: true,
      opacity: isSoftwareGl ? 0.42 : 0.92,
      ior: 1.52,
      depthWrite: false,
    });

    const allMaterials: THREE.MeshStandardMaterial[] = [
      sandstoneMat,
      limestoneMat,
      brickMat,
      copperPatinaMat,
      brushedSteelMat,
      gildedBrassMat,
    ];

    // Store original colors for material finish switcher
    const origColors = allMaterials.map((m) => ({
      color: m.color.clone(),
      map: m.map,
      wireframe: m.wireframe,
      roughness: m.roughness,
      metalness: m.metalness,
    }));

    applyFinishModeRef.current = (mode) => {
      allMaterials.forEach((mat, idx) => {
        const orig = origColors[idx];
        if (mode === 'REALISTIC') {
          mat.color.copy(orig.color);
          mat.map = orig.map;
          mat.wireframe = false;
          mat.roughness = orig.roughness;
          mat.metalness = orig.metalness;
        } else if (mode === 'ARCHITECTURAL_CLAY') {
          mat.color.setHex(0xe5e0d8);
          mat.map = null;
          mat.wireframe = false;
          mat.roughness = 0.82;
          mat.metalness = 0.05;
        } else if (mode === 'BLUEPRINT') {
          mat.color.setHex(0x38bdf8);
          mat.map = null;
          mat.wireframe = true;
        }
        mat.needsUpdate = true;
      });
    };

    // Ground Terrain, Cuyahoga River Channel & Lake Erie Waterfront
    const worldGroup = new THREE.Group();
    scene.add(worldGroup);

    const groundGeo = new THREE.CylinderGeometry(88, 92, 1.2, 48);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x162032,
      roughness: 0.9,
      metalness: 0.05,
    });
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.position.set(0, -0.6, -5);
    groundMesh.receiveShadow = true;
    worldGroup.add(groundMesh);

    // Lake Erie North Basin (North = -Z)
    const lakeGeo = new THREE.PlaneGeometry(165, 58);
    const lakeMat = new THREE.MeshStandardMaterial({
      color: 0x0369a1,
      roughness: 0.18,
      metalness: 0.65,
    });
    const lakeMesh = new THREE.Mesh(lakeGeo, lakeMat);
    lakeMesh.rotation.x = -Math.PI / 2;
    lakeMesh.position.set(0, 0.03, -48);
    worldGroup.add(lakeMesh);

    // Winding Cuyahoga River Ribbon
    const riverCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-12, 0.04, -22),
      new THREE.Vector3(-14, 0.04, -6),
      new THREE.Vector3(-18, 0.04, 14),
      new THREE.Vector3(-8, 0.04, 32),
    ]);
    const riverGeo = new THREE.TubeGeometry(riverCurve, 36, 3.6, 8, false);
    const riverMesh = new THREE.Mesh(riverGeo, lakeMat);
    riverMesh.scale.set(1, 0.03, 1);
    worldGroup.add(riverMesh);

    // Illuminated Walking Path Ribbon connecting the 6 Cleveland Landmarks
    const trailPoints = CLEVELAND_LANDMARKS.map(
      (lm) => new THREE.Vector3(lm.scenePosition3D[0], 0.12, lm.scenePosition3D[2])
    );
    const trailCurve = new THREE.CatmullRomCurve3(trailPoints);
    const trailGeo = new THREE.TubeGeometry(trailCurve, 64, 0.28, 8, false);
    const trailMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xd97706,
      emissiveIntensity: 0.55,
      roughness: 0.3,
    });
    const trailMesh = new THREE.Mesh(trailGeo, trailMat);
    worldGroup.add(trailMesh);

    // Contact shadow helper
    const shadowDiscGeo = new THREE.CircleGeometry(6.5, 24);
    const shadowDiscMat = new THREE.MeshBasicMaterial({
      color: 0x020617,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });

    const addContactDisc = (x: number, z: number, radiusScale = 1) => {
      const disc = new THREE.Mesh(shadowDiscGeo, shadowDiscMat);
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(x, 0.02, z);
      disc.scale.setScalar(radiusScale);
      worldGroup.add(disc);
    };

    const interactableGroups: THREE.Object3D[] = [];

    // -------------------------------------------------------------------------
    // 1. TERMINAL TOWER & PUBLIC SQUARE (Composite 9-Part Group)
    // -------------------------------------------------------------------------
    const ttGroup = new THREE.Group();
    ttGroup.position.set(...CLEVELAND_LANDMARKS[0].scenePosition3D);
    ttGroup.userData = { landmarkId: 'terminal-tower' };
    addContactDisc(0, 0, 1.25);

    // Part 1: Union Terminal Podium Base
    const ttPodium = new THREE.Mesh(new THREE.BoxGeometry(7.2, 2.8, 5.6), sandstoneMat);
    ttPodium.position.set(0, 1.4, 0);
    ttPodium.castShadow = true;
    ttPodium.receiveShadow = true;
    ttGroup.add(ttPodium);

    // Part 2 & 3: Flanking Beaux-Arts Wings
    [-2.8, 2.8].forEach((wx) => {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(1.8, 4.2, 4.4), limestoneMat);
      wing.position.set(wx, 2.1, 0.2);
      wing.castShadow = true;
      ttGroup.add(wing);
    });

    // Part 4: Main 52-Story Shaft
    const ttShaft1 = new THREE.Mesh(new THREE.BoxGeometry(3.4, 7.6, 3.4), limestoneMat);
    ttShaft1.position.set(0, 6.6, 0);
    ttShaft1.castShadow = true;
    ttGroup.add(ttShaft1);

    // Part 5: Middle Setback Tier
    const ttShaft2 = new THREE.Mesh(new THREE.BoxGeometry(2.5, 3.2, 2.5), limestoneMat);
    ttShaft2.position.set(0, 12.0, 0);
    ttShaft2.castShadow = true;
    ttGroup.add(ttShaft2);

    // Part 6: Octagonal Observation Colonnade
    const ttOctagon = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.2, 2.2, 8), sandstoneMat);
    ttOctagon.position.set(0, 14.7, 0);
    ttOctagon.castShadow = true;
    ttGroup.add(ttOctagon);

    // Part 7: Tapered Beaux-Arts Crown Spire
    const ttSpire = new THREE.Mesh(new THREE.ConeGeometry(0.95, 2.6, 8), copperPatinaMat);
    ttSpire.position.set(0, 17.1, 0);
    ttGroup.add(ttSpire);

    // Part 8: Maritime Strobe Lantern
    const ttBeacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 12, 12),
      new THREE.MeshStandardMaterial({
        color: 0xfef08a,
        emissive: 0xf59e0b,
        emissiveIntensity: 1.5,
      })
    );
    ttBeacon.position.set(0, 18.55, 0);
    ttGroup.add(ttBeacon);

    // Part 9: Soldiers' and Sailors' Monument on Public Square Plaza
    const monumentBase = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 2.2), sandstoneMat);
    monumentBase.position.set(4.5, 0.55, 4.0);
    ttGroup.add(monumentBase);
    const monumentCol = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 3.4, 12), brushedSteelMat);
    monumentCol.position.set(4.5, 2.8, 4.0);
    ttGroup.add(monumentCol);

    worldGroup.add(ttGroup);
    interactableGroups.push(ttGroup);

    // -------------------------------------------------------------------------
    // 2. THE ARCADE CLEVELAND (Composite 7-Part Group)
    // -------------------------------------------------------------------------
    const arcGroup = new THREE.Group();
    arcGroup.position.set(...CLEVELAND_LANDMARKS[1].scenePosition3D);
    arcGroup.userData = { landmarkId: 'the-arcade' };
    addContactDisc(24, -10, 1.15);

    // Part 1 & 2: Flanking Romanesque Masonry Walls
    [-2.4, 2.4].forEach((ax) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(1.1, 5.4, 8.2), brickMat);
      wall.position.set(ax, 2.7, 0);
      wall.castShadow = true;
      arcGroup.add(wall);
    });

    // Part 3: Euclid Headhouse Tower
    const euclidTower = new THREE.Mesh(new THREE.BoxGeometry(5.8, 7.2, 1.8), sandstoneMat);
    euclidTower.position.set(0, 3.6, 4.2);
    euclidTower.castShadow = true;
    arcGroup.add(euclidTower);

    // Part 4: Crystalline Barrel-Vault Glass Skylight Roof
    const skylightVault = new THREE.Mesh(
      new THREE.CylinderGeometry(2.1, 2.1, 7.8, 16, 1, false, 0, Math.PI),
      crystalGlassMat
    );
    skylightVault.rotation.z = Math.PI / 2;
    skylightVault.rotation.y = Math.PI / 2;
    skylightVault.position.set(0, 5.4, -0.2);
    skylightVault.renderOrder = 2;
    arcGroup.add(skylightVault);

    // Part 5, 6, 7: Gilded Brass Structural Arch Ribs
    [-2.5, 0, 2.5].forEach((rz) => {
      const rib = new THREE.Mesh(
        new THREE.TorusGeometry(2.12, 0.09, 8, 24, Math.PI),
        gildedBrassMat
      );
      rib.position.set(0, 5.4, rz);
      arcGroup.add(rib);
    });

    worldGroup.add(arcGroup);
    interactableGroups.push(arcGroup);

    // -------------------------------------------------------------------------
    // 3. ROCK & ROLL HALL OF FAME (Composite 7-Part Group)
    // -------------------------------------------------------------------------
    const rhGroup = new THREE.Group();
    rhGroup.position.set(...CLEVELAND_LANDMARKS[2].scenePosition3D);
    rhGroup.userData = { landmarkId: 'rock-hall' };
    addContactDisc(14, -34, 1.3);

    // Part 1: Harbor Plaza Plinth
    const rhPlinth = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.6, 8.2), limestoneMat);
    rhPlinth.position.set(0, 0.3, 0);
    rhPlinth.receiveShadow = true;
    rhGroup.add(rhPlinth);

    // Part 2: I.M. Pei 162-ft Cylindrical White Metal Tower
    const rhTower = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, 11.2, 24), brushedSteelMat);
    rhTower.position.set(0, 5.9, -1.8);
    rhTower.castShadow = true;
    rhGroup.add(rhTower);

    // Part 3: Primary Glass Pyramid Tent
    const pyramidGeo = new THREE.ConeGeometry(4.6, 8.4, 4);
    const rhPyramid = new THREE.Mesh(pyramidGeo, crystalGlassMat);
    rhPyramid.rotation.y = Math.PI / 4;
    rhPyramid.position.set(0, 4.5, 0.9);
    rhPyramid.renderOrder = 3;
    rhGroup.add(rhPyramid);

    // Part 4: Triangulated Space-Frame Steel Struts
    const pyramidEdges = new THREE.EdgesGeometry(pyramidGeo);
    const pyramidWire = new THREE.LineSegments(
      pyramidEdges,
      new THREE.LineBasicMaterial({ color: 0xe2e8f0 })
    );
    pyramidWire.rotation.y = Math.PI / 4;
    pyramidWire.position.copy(rhPyramid.position);
    rhGroup.add(pyramidWire);

    // Part 5: Cantilevered Performance Drum Box
    const rhDrum = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.2, 2.2, 20), brushedSteelMat);
    rhDrum.rotation.z = Math.PI / 6;
    rhDrum.position.set(2.9, 4.2, -0.5);
    rhDrum.castShadow = true;
    rhGroup.add(rhDrum);

    // Part 6: Crimson Plaza Arch Accent
    const rhAccent = new THREE.Mesh(
      new THREE.BoxGeometry(3.6, 0.45, 0.45),
      new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.3, metalness: 0.5 })
    );
    rhAccent.position.set(-1.8, 1.1, 3.2);
    rhGroup.add(rhAccent);

    worldGroup.add(rhGroup);
    interactableGroups.push(rhGroup);

    // -------------------------------------------------------------------------
    // 4. HARBOR PIERHEAD LIGHTHOUSE & LAKEFRONT SCRIPT (Composite 7-Part Group)
    // -------------------------------------------------------------------------
    const hlGroup = new THREE.Group();
    hlGroup.position.set(...CLEVELAND_LANDMARKS[3].scenePosition3D);
    hlGroup.userData = { landmarkId: 'harbor-lighthouse' };
    addContactDisc(-16, -32, 1.0);

    // Part 1: Concrete Breakwall Pier
    const pierBase = new THREE.Mesh(new THREE.BoxGeometry(7.6, 1.1, 4.4), sandstoneMat);
    pierBase.position.set(0, 0.55, 0);
    hlGroup.add(pierBase);

    // Part 2: Cylindrical Fog-Signal Base
    const lightBase = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.45, 2.4, 20), brushedSteelMat);
    lightBase.position.set(1.6, 2.3, 0);
    lightBase.castShadow = true;
    hlGroup.add(lightBase);

    // Part 3: Conical Cast-Iron Tower
    const lightShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.15, 4.2, 20), brushedSteelMat);
    lightShaft.position.set(1.6, 5.6, 0);
    lightShaft.castShadow = true;
    hlGroup.add(lightShaft);

    // Part 4: Crimson Watch Gallery Deck
    const lightGallery = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.1, 0.45, 20),
      new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.4 })
    );
    lightGallery.position.set(1.6, 7.9, 0);
    hlGroup.add(lightGallery);

    // Part 5: Fresnel Lantern Room
    const fresnelGlass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.68, 0.68, 1.1, 16),
      new THREE.MeshStandardMaterial({
        color: 0xbae6fd,
        emissive: 0x38bdf8,
        emissiveIntensity: 1.2,
      })
    );
    fresnelGlass.position.set(1.6, 8.65, 0);
    hlGroup.add(fresnelGlass);

    // Part 6: Conical Cupola Roof
    const cupola = new THREE.Mesh(
      new THREE.ConeGeometry(0.8, 0.9, 16),
      new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.5 })
    );
    cupola.position.set(1.6, 9.65, 0);
    hlGroup.add(cupola);

    // Part 7: Sculptural Cleveland Script Frame
    const scriptPlinth = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 1.2, 0.45),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 })
    );
    scriptPlinth.position.set(-1.9, 1.7, 0.6);
    hlGroup.add(scriptPlinth);

    worldGroup.add(hlGroup);
    interactableGroups.push(hlGroup);

    // -------------------------------------------------------------------------
    // 5. GUARDIANS OF TRAFFIC — HOPE MEMORIAL BRIDGE (Composite 8-Part Group)
    // -------------------------------------------------------------------------
    const gotGroup = new THREE.Group();
    gotGroup.position.set(...CLEVELAND_LANDMARKS[4].scenePosition3D);
    gotGroup.userData = { landmarkId: 'guardians-of-traffic' };
    addContactDisc(-18, 14, 1.3);

    // Part 1: Bridge Roadway Deck
    const bridgeDeck = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.7, 4.8), limestoneMat);
    bridgeDeck.position.set(0, 3.6, 0);
    bridgeDeck.castShadow = true;
    gotGroup.add(bridgeDeck);

    // Part 2 & 3: Steel Deck Truss Arches Underneath
    [-1.8, 1.8].forEach((tz) => {
      const arch = new THREE.Mesh(
        new THREE.TorusGeometry(4.2, 0.24, 8, 24, Math.PI),
        copperPatinaMat
      );
      arch.position.set(0, 0.2, tz);
      gotGroup.add(arch);
    });

    // Part 4 & 5: Twin Berea Sandstone Art Deco Pylons
    [-2.4, 2.4].forEach((pz) => {
      const pylonCore = new THREE.Mesh(new THREE.BoxGeometry(2.1, 10.6, 1.6), sandstoneMat);
      pylonCore.position.set(0, 5.3, pz);
      pylonCore.castShadow = true;
      gotGroup.add(pylonCore);

      // Stepped Art Deco Wing Reliefs & Crown
      const guardianTorso = new THREE.Mesh(new THREE.BoxGeometry(1.2, 4.2, 1.95), limestoneMat);
      guardianTorso.position.set(0, 7.6, pz);
      gotGroup.add(guardianTorso);

      const wingedHelmet = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.6, 4), gildedBrassMat);
      wingedHelmet.rotation.y = Math.PI / 4;
      wingedHelmet.position.set(0, 11.3, pz);
      gotGroup.add(wingedHelmet);
    });

    worldGroup.add(gotGroup);
    interactableGroups.push(gotGroup);

    // -------------------------------------------------------------------------
    // 6. WEST SIDE MARKET (Composite 8-Part Group)
    // -------------------------------------------------------------------------
    const wsmGroup = new THREE.Group();
    wsmGroup.position.set(...CLEVELAND_LANDMARKS[5].scenePosition3D);
    wsmGroup.userData = { landmarkId: 'west-side-market' };
    addContactDisc(18, 18, 1.3);

    // Part 1: Main Market Concourse Brick Hall
    const marketHall = new THREE.Mesh(new THREE.BoxGeometry(7.4, 4.0, 5.2), brickMat);
    marketHall.position.set(0.8, 2.0, 0);
    marketHall.castShadow = true;
    wsmGroup.add(marketHall);

    // Part 2: Guastavino Vaulted Terracotta Roof
    const marketRoof = new THREE.Mesh(
      new THREE.CylinderGeometry(2.6, 2.6, 7.5, 16, 1, false, 0, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.65 })
    );
    marketRoof.rotation.z = Math.PI / 2;
    marketRoof.position.set(0.8, 4.0, 0);
    wsmGroup.add(marketRoof);

    // Part 3: Outdoor Covered Arcade Wing
    const arcadeWing = new THREE.Mesh(new THREE.BoxGeometry(6.8, 2.4, 2.0), sandstoneMat);
    arcadeWing.position.set(0.8, 1.2, 3.4);
    wsmGroup.add(arcadeWing);

    // Part 4: 137-Foot Neo-Byzantine Clock Tower Shaft
    const clockShaft = new THREE.Mesh(new THREE.BoxGeometry(1.9, 10.4, 1.9), brickMat);
    clockShaft.position.set(-3.4, 5.2, 2.2);
    clockShaft.castShadow = true;
    wsmGroup.add(clockShaft);

    // Part 5: Illuminated Clock Dial Band
    const clockBand = new THREE.Mesh(
      new THREE.BoxGeometry(2.05, 1.5, 2.05),
      new THREE.MeshStandardMaterial({ map: clockTex, roughness: 0.3 })
    );
    clockBand.position.set(-3.4, 8.6, 2.2);
    wsmGroup.add(clockBand);

    // Part 6: Belfry Loggia & Byzantine Dome
    const belfry = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 1.4, 12), sandstoneMat);
    belfry.position.set(-3.4, 11.1, 2.2);
    wsmGroup.add(belfry);

    const byzDome = new THREE.Mesh(
      new THREE.SphereGeometry(0.85, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      copperPatinaMat
    );
    byzDome.position.set(-3.4, 11.8, 2.2);
    wsmGroup.add(byzDome);

    worldGroup.add(wsmGroup);
    interactableGroups.push(wsmGroup);

    // -------------------------------------------------------------------------
    // Instanced Urban Context Trees & City Blocks (Single Draw Call)
    // -------------------------------------------------------------------------
    const treeCount = 36;
    const canopyGeo = new THREE.ConeGeometry(0.75, 2.1, 7);
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.8 });
    const treeInstanced = new THREE.InstancedMesh(canopyGeo, canopyMat, treeCount);
    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();

    for (let i = 0; i < treeCount; i++) {
      const angle = (i / treeCount) * Math.PI * 2;
      const rad = 29 + (i % 3) * 6;
      dummy.position.set(Math.cos(angle) * rad, 1.05, Math.sin(angle) * rad - 4);
      const s = 0.85 + (i % 4) * 0.1;
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      treeInstanced.setMatrixAt(i, dummy.matrix);
      tint.setHSL(0.42 + (i % 5) * 0.015, 0.55, 0.28 + (i % 3) * 0.04);
      treeInstanced.setColorAt(i, tint);
    }
    treeInstanced.instanceMatrix.needsUpdate = true;
    if (treeInstanced.instanceColor) treeInstanced.instanceColor.needsUpdate = true;
    treeInstanced.computeBoundingSphere();
    worldGroup.add(treeInstanced);

    // -------------------------------------------------------------------------
    // 3D AR Historical Fact Anchor Spheres & Vertical Leader Lines
    // -------------------------------------------------------------------------
    const arAnchorsGroup = new THREE.Group();
    scene.add(arAnchorsGroup);

    const pinSphereGeo = new THREE.OctahedronGeometry(0.45, 0);
    const pinMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.1,
      roughness: 0.2,
    });

    CLEVELAND_LANDMARKS.forEach((lm) => {
      lm.arFacts.forEach((fact) => {
        const pinMesh = new THREE.Mesh(pinSphereGeo, pinMat);
        pinMesh.position.set(...fact.arOffset3D);
        pinMesh.userData = { landmarkId: lm.id, factId: fact.id };
        arAnchorsGroup.add(pinMesh);

        // Vertical leader line down to landmark roof/plaza
        const linePts = [
          new THREE.Vector3(fact.arOffset3D[0], fact.arOffset3D[1], fact.arOffset3D[2]),
          new THREE.Vector3(fact.arOffset3D[0], Math.max(1.5, fact.arOffset3D[1] - 3.5), fact.arOffset3D[2]),
        ];
        const lineGeo = new THREE.BufferGeometry().setFromPoints(linePts);
        const line = new THREE.Line(
          lineGeo,
          new THREE.LineBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.65 })
        );
        arAnchorsGroup.add(line);
      });
    });

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Pre-allocated scratch vectors for zero GC in loop
    const _projVec = new THREE.Vector3();
    const _camDir = new THREE.Vector3();
    const _toPin = new THREE.Vector3();
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    // Project active landmark's AR fact nodes into 2D screen coordinates
    const updateProjectedFactOverlay = () => {
      const activeLm = selectedLandmarkRef.current;
      const visibleFacts = filterARFactsByEra(
        activeLm.arFacts,
        eraMaxYearRef.current,
        factCategoryRef.current
      );

      const cWidth = renderer.domElement.clientWidth || width;
      const cHeight = renderer.domElement.clientHeight || height;
      camera.getWorldDirection(_camDir);

      const nextNodes: ProjectedFactNode[] = visibleFacts.map((fact) => {
        _projVec.set(fact.arOffset3D[0], fact.arOffset3D[1], fact.arOffset3D[2]);
        _toPin.copy(_projVec).sub(camera.position).normalize();
        const inFront = _camDir.dot(_toPin) > 0.15;
        _projVec.project(camera);

        const sx = (_projVec.x * 0.5 + 0.5) * cWidth;
        const sy = (-(_projVec.y * 0.5) + 0.5) * cHeight;
        const insideBounds = sx > 20 && sx < cWidth - 20 && sy > 20 && sy < cHeight - 20;

        return {
          fact,
          x: Math.round(sx),
          y: Math.round(sy),
          visible: inFront && insideBounds,
        };
      });

      setProjectedNodes(nextNodes);
    };

    // On-demand render & software-WebGL safe pacing
    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let lastTimestamp = performance.now();

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (gl && typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (state === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      } else {
        frameId = window.setTimeout(cb, 80);
      }
    }

    function requestRender() {
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame((now) => {
        renderDirty = false;
        const dt = Math.min(0.1, Math.max(0.016, (now - lastTimestamp) / 1000));
        lastTimestamp = now;

        // Smooth exponential damping for camera transitions (instant frame on software WebGL)
        const camTarget = cameraTargetRef.current;
        if (camTarget.active) {
          if (isSoftwareGl) {
            camera.position.copy(camTarget.pos);
            controls.target.copy(camTarget.lookAt);
            camTarget.active = false;
          } else {
            const alpha = 1 - Math.exp(-7.5 * dt);
            camera.position.lerp(camTarget.pos, alpha);
            controls.target.lerp(camTarget.lookAt, alpha);

            if (
              camera.position.distanceToSquared(camTarget.pos) < 0.08 &&
              controls.target.distanceToSquared(camTarget.lookAt) < 0.08
            ) {
              camera.position.copy(camTarget.pos);
              controls.target.copy(camTarget.lookAt);
              camTarget.active = false;
            } else {
              renderDirty = true;
            }
          }
        }

        controls.update();

        // Transparent background when live camera feed is active
        if (videoRef.current?.srcObject) {
          scene.background = null;
          renderer.setClearColor(0x000000, 0);
        } else {
          scene.background = skyColor;
        }

        renderer.render(scene, camera);
        updateProjectedFactOverlay();

        const done = () => {
          renderBusy = false;
          if (renderDirty) requestRender();
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    }

    requestRenderRef.current = requestRender;
    captureViewportSnapshotRef.current = () => {
      try {
        renderer.render(scene, camera);
        return renderer.domElement.toDataURL('image/png');
      } catch {
        return null;
      }
    };

    const handleControlStart = () => {
      cameraTargetRef.current.active = false;
    };
    const handleControlChange = () => {
      requestRender();
      // Couple 3D camera orbit azimuth back to the 3D compass needle when user drags viewport
      const now = performance.now();
      if (!hasHardwareGyroRef.current && now - lastOrbitGyroSyncRef.current > 65) {
        lastOrbitGyroSyncRef.current = now;
        const dx = camera.position.x - controls.target.x;
        const dz = camera.position.z - controls.target.z;
        const dy = camera.position.y - controls.target.y;
        const horizDist = Math.max(0.1, Math.hypot(dx, dz));
        const orbitRad = Math.atan2(dx, dz);
        const canonicalRad = Math.atan2(16.0, 21.0);
        const activeSight = computeLandmarkSightlineBearing(
          selectedLandmarkRef.current
        ).targetBearingDeg;
        const derivedHeading =
          ((activeSight + ((orbitRad - canonicalRad) * 180) / Math.PI) % 360 +
            360) %
          360;
        const derivedBeta = Math.round(
          Math.max(25, Math.min(82, 75 - (Math.atan2(dy, horizDist) * 180) / Math.PI))
        );
        setGyroOrientation({
          alpha: (360 - derivedHeading) % 360,
          beta: derivedBeta,
          gamma: 0,
          webkitCompassHeading: null,
        });
      }
    };
    controls.addEventListener('start', handleControlStart);
    controls.addEventListener('change', handleControlChange);

    // Click raycasting on 3D landmarks & AR pins
    let pointerDownPos = { x: 0, y: 0 };
    const handlePointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };
    const handlePointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y) > 6) {
        return;
      }
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      const pinHits = raycaster.intersectObjects(arAnchorsGroup.children, false);
      if (pinHits.length > 0) {
        const { landmarkId, factId } = pinHits[0].object.userData;
        if (landmarkId && factId) {
          const lm = CLEVELAND_LANDMARKS.find((l) => l.id === landmarkId);
          if (lm) {
            onSelectLandmarkRef.current(lm);
            const f = lm.arFacts.find((af) => af.id === factId);
            if (f) onSelectFactRef.current(f);
            return;
          }
        }
      }

      const meshHits = raycaster.intersectObjects(interactableGroups, true);
      if (meshHits.length > 0) {
        let obj: THREE.Object3D | null = meshHits[0].object;
        while (obj && !obj.userData?.landmarkId) {
          obj = obj.parent;
        }
        if (obj?.userData?.landmarkId) {
          const lm = CLEVELAND_LANDMARKS.find((l) => l.id === obj!.userData.landmarkId);
          if (lm) {
            onSelectLandmarkRef.current(lm);
          }
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);

    const handleResize = () => {
      if (!mount) return;
      const w = mount.clientWidth || 960;
      const h = mount.clientHeight || 600;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    };
    window.addEventListener('resize', handleResize);

    // Initial render
    requestRender();

    return () => {
      window.removeEventListener('resize', handleResize);
      controls.removeEventListener('start', handleControlStart);
      controls.removeEventListener('change', handleControlChange);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      controls.dispose();
      renderer.dispose();
    };
  }, []);

  const filteredArFacts = filterARFactsByEra(
    selectedLandmark.arFacts,
    eraMaxYear,
    factCategory
  );
  const visibleFactsCount = filteredArFacts.length;

  return (
    <div className="space-y-3 md:space-y-0">
      <div
        className="relative w-full h-[520px] sm:h-[560px] lg:h-[640px] bg-[#0c1526] rounded-2xl overflow-hidden border border-slate-800 select-none"
        data-testid="cleveland-3d-viewport"
      >
        {/* Optional Live WebRTC Camera Backdrop for ViroReact / WebXR AR Passthrough */}
        <video
          ref={videoRef}
          playsInline
          muted
          className={`absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-200 ${
            cameraFeedActive ? 'opacity-85' : 'opacity-0'
          }`}
        />

        {/* Isolated Three.js Architectural 3D & ViroReact AR Canvas Container */}
        <div
          ref={canvasMountRef}
          className={`w-full h-full cursor-grab active:cursor-grabbing ${
            viewportEngine === 'GOOGLE_EARTH_3D' ? 'opacity-35 pointer-events-none' : ''
          }`}
        />

        {/* Actual Google Maps 3D / Google Earth Photorealistic 3D Tiles Layer (<gmp-map-3d>) */}
        {viewportEngine === 'GOOGLE_EARTH_3D' &&
          hasGoogleMapsApiKey &&
          !offlineMode && (
            <div
              className="absolute inset-0 z-[5] w-full h-full"
              data-testid="google-earth-3d-viewport-layer"
            >
              <Map3D
                ref={map3DRef}
                id="cleveland-photorealistic-3d-map"
                mode={
                  google3DMapMode === 'HYBRID'
                    ? MapMode.HYBRID
                    : MapMode.SATELLITE
                }
                defaultCenter={google3DCameraPose.center}
                defaultRange={google3DCameraPose.range}
                defaultTilt={google3DCameraPose.tilt}
                defaultHeading={google3DCameraPose.heading}
                defaultRoll={0}
                onCameraChanged={handleGoogle3DCameraChanged}
                internalUsageAttributionIds={[
                  'gmp_mcp_codeassist_v1_aistudio',
                ]}
                style={{ width: '100%', height: '100%' }}
              >
                {/* 3D Elevated Walking Corridor Polyline across Cleveland Landmarks */}
                <Polyline3D
                  path={google3DCorridorCoords}
                  altitudeMode={AltitudeMode.RELATIVE_TO_GROUND}
                  strokeColor="#f59e0b"
                  outerColor="#0f172a"
                  strokeWidth={8}
                  outerWidth={0.25}
                  extruded
                />

                {/* 3D Extruded Pins for all 6 Iconic Cleveland Landmarks */}
                {landmarks.map((lm) => {
                  const liveLoc = liveLocationsById?.[lm.id];
                  const isCurrent = lm.id === selectedLandmark.id;
                  return (
                    <Marker3D
                      key={`g3d-lm-${lm.id}`}
                      position={{
                        lat: liveLoc?.lat ?? lm.tourAnchor.lat,
                        lng: liveLoc?.lng ?? lm.tourAnchor.lng,
                        altitude: isCurrent ? 78 : 45,
                      }}
                      altitudeMode={AltitudeMode.RELATIVE_TO_GROUND}
                      extruded
                      label={`0${lm.walkingOrder}. ${lm.shortTitle} (${lm.yearCompleted})`}
                      title={`${lm.shortTitle} — ${lm.architecturalStyle}`}
                      onClick={() => {
                        onSelectLandmark(lm);
                        onSelectFact(lm.arFacts[0] || null);
                      }}
                    />
                  );
                })}

                {/* 3D Spatial AR Historical Fact Markers Projected at Real Altitude around Active Landmark */}
                {arLensActive &&
                  filteredArFacts.map((fact) => {
                    const geoPin = computeARFactGeoAltitudePoint(
                      selectedLandmark,
                      fact,
                      liveLocationsById?.[selectedLandmark.id] || null
                    );
                    return (
                      <Marker3D
                        key={`g3d-fact-${fact.id}`}
                        position={{
                          lat: geoPin.lat,
                          lng: geoPin.lng,
                          altitude: geoPin.altitudeMeters,
                        }}
                        altitudeMode={AltitudeMode.RELATIVE_TO_GROUND}
                        extruded
                        label={`[AR ${fact.year}] ${fact.title}`}
                        title={`${fact.eraLabel}: ${fact.title}`}
                        onClick={() => onSelectFact(fact)}
                      />
                    );
                  })}
              </Map3D>
            </div>
          )}

        {/* Top-Left Minimal Spec Header */}
        <div className="absolute top-3 left-3 right-3 md:right-auto md:top-4 md:left-4 z-10 pointer-events-auto md:max-w-md bg-[#0f172ae6] border border-slate-700/80 rounded-xl px-3.5 py-2.5 md:px-4 md:py-3 shadow-lg">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-mono text-amber-400 truncate">
              <span>Stop 0{selectedLandmark.walkingOrder}</span>
              <span aria-hidden="true" className="mx-1.5 text-slate-500">·</span>
              <span>{selectedLandmark.yearCompleted}</span>
              <span aria-hidden="true" className="mx-1.5 text-slate-500">·</span>
              <span>{selectedLandmark.districtName}</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => onToggleFavorite(selectedLandmark.id)}
                aria-label={
                  isFavorite
                    ? `Remove ${selectedLandmark.shortTitle} from favorites`
                    : `Save ${selectedLandmark.shortTitle} to favorites`
                }
                className={`p-1.5 rounded-lg border transition-colors ${
                  isFavorite
                    ? 'bg-rose-500/20 border-rose-500/50 text-rose-400'
                    : 'bg-slate-800/90 border-slate-700 text-slate-300 hover:text-white'
                }`}
              >
                <Heart className="w-4 h-4" fill={isFavorite ? 'currentColor' : 'none'} />
              </button>
              <button
                type="button"
                onClick={() => onOpenShareModal(selectedLandmark, selectedFact)}
                aria-label={`Share ${selectedLandmark.shortTitle} discovery`}
                className="p-1.5 rounded-lg bg-slate-800/90 border border-slate-700 text-slate-300 hover:text-white transition-colors"
              >
                <Share2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          <h2 className="text-base md:text-lg font-bold text-white mt-0.5 tracking-tight">
            {selectedLandmark.shortTitle}
          </h2>
          <p className="hidden sm:block text-xs text-slate-300 mt-0.5 line-clamp-2">
            {selectedLandmark.architecturalStyle} — {selectedLandmark.architect}
          </p>

          <div className="hidden sm:flex flex-wrap items-center gap-2 mt-2.5 pt-2 border-t border-slate-800 text-[11px] font-mono text-slate-400">
            <span>
              {google3DCameraPose.center.lat.toFixed(4)}°N,{' '}
              {Math.abs(google3DCameraPose.center.lng).toFixed(4)}°W
            </span>
            <span aria-hidden="true">·</span>
            <span className="text-sky-300">
              {viewportEngine === 'GOOGLE_EARTH_3D'
                ? `Google 3D Tiles (${google3DMapMode}) · Alt ${google3DCameraPose.center.altitude}m · Tilt ${google3DCameraPose.tilt}°`
                : `${visibleFactsCount} AR Nodes Active`}
            </span>
            <span aria-hidden="true">·</span>
            <a
              href={google3DCameraPose.googleEarthUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="open-google-earth-web-link"
              className="text-amber-300 hover:underline inline-flex items-center gap-1"
            >
              <span>Google Earth 3D</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* Compact Mobile Action Row inside Header Card (< md) */}
          <div className="flex md:hidden items-center gap-2 mt-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() =>
                setViewportEngine((prev) =>
                  prev === 'GOOGLE_EARTH_3D'
                    ? 'ARCHITECTURAL_3D_AR'
                    : 'GOOGLE_EARTH_3D'
                )
              }
              className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40 whitespace-nowrap"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>
                {viewportEngine === 'GOOGLE_EARTH_3D'
                  ? 'Google 3D Tiles'
                  : '3D AR Mesh'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => toggleNarration(selectedLandmark, selectedFact)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
                audioSpeaking
                  ? 'bg-amber-500 text-slate-950 border-amber-400'
                  : 'bg-slate-800/90 text-slate-200 border-slate-700'
              }`}
            >
              {audioSpeaking ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              <span>{audioSpeaking ? 'Stop Audio' : 'Audio Guide'}</span>
            </button>
          </div>
        </div>

        {/* Top-Right 3D Engine Switcher (Google Earth 3D Tiles vs Architectural 3D AR), Audio & ViroReact Controls (Desktop md+) */}
        <div className="hidden md:flex absolute top-4 right-4 z-10 items-center gap-2 pointer-events-auto">
          <div
            className="flex items-center bg-[#0f172ae6] p-1 rounded-xl border border-slate-700 shadow-lg"
            role="group"
            aria-label="3D Viewport Data Source Switcher"
          >
            <button
              type="button"
              onClick={() => setViewportEngine('GOOGLE_EARTH_3D')}
              data-testid="engine-google-earth-3d-btn"
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                viewportEngine === 'GOOGLE_EARTH_3D'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Google Earth 3D Tiles</span>
            </button>
            <button
              type="button"
              onClick={() => setViewportEngine('ARCHITECTURAL_3D_AR')}
              data-testid="engine-architectural-3d-btn"
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                viewportEngine === 'ARCHITECTURAL_3D_AR'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Architectural 3D Mesh</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => toggleNarration(selectedLandmark, selectedFact)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
              audioSpeaking
                ? 'bg-amber-500 text-slate-950 border-amber-400'
                : 'bg-[#0f172ae6] text-slate-200 border-slate-700 hover:border-slate-500'
            }`}
          >
            {audioSpeaking ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            <span>{audioSpeaking ? 'Stop Audio Guide' : 'Play Audio Guide'}</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenViroExport(selectedLandmark)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-[#0f172ae6] text-sky-300 border border-sky-500/40 hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>ViroReact AR Code</span>
          </button>
        </div>

        {/* Projected 3D Spatial AR Fact Overlays (Semantic DOM Nodes with Direct Share Action) */}
        {arLensActive && (
          <div className="absolute inset-0 pointer-events-none z-10">
            {/* Subtle ViroReact & Google Maps 3D Spatial Calibration Reticle + Direct Share AR View Button */}
            <div className="hidden md:flex items-center gap-2 absolute top-20 right-4 bg-[#0f172ae6] border border-amber-500/40 rounded-lg px-3 py-1.5 text-[11px] font-mono text-amber-300 pointer-events-auto">
              <span>
                {viewportEngine === 'GOOGLE_EARTH_3D'
                  ? `Google Maps 3D (<gmp-map-3d>) · Range ${google3DCameraPose.range}m · Era ≤ ${eraMaxYear}`
                  : `ViroARScene · World Tracking Normal · Era ≤ ${eraMaxYear}`}
              </span>
              {viewportEngine === 'GOOGLE_EARTH_3D' && (
                <button
                  type="button"
                  onClick={handleToggleGoogle3DOrbit}
                  data-testid="google-3d-orbit-btn"
                  className={`px-2 py-0.5 rounded border text-[10px] font-semibold transition-colors cursor-pointer ${
                    google3DOrbiting
                      ? 'bg-emerald-500 text-slate-950 border-emerald-300'
                      : 'bg-sky-500/20 hover:bg-sky-500 text-sky-300 hover:text-slate-950 border-sky-500/50'
                  }`}
                >
                  {google3DOrbiting ? 'Stop 360° Fly-Around' : '360° Fly-Around'}
                </button>
              )}
              <button
                type="button"
                onClick={() => handleOpenDirectARShare(selectedFact)}
                data-testid="ar-reticle-share-btn"
                aria-label="Share current AR view and discovery fact"
                className="ml-1 px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-500/50 text-[10px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Share2 className="w-3 h-3" />
                <span>Share</span>
              </button>
            </div>

            {projectedNodes.map(({ fact, x, y, visible }) =>
              visible ? (
                <div
                  key={fact.id}
                  data-testid={`ar-overlay-node-${fact.id}`}
                  style={{
                    transform: `translate3d(${x}px, ${y}px, 0) translate(-50%, -100%)`,
                  }}
                  className={`pointer-events-auto absolute top-0 left-0 flex items-stretch rounded-xl border transition-transform duration-150 shadow-xl overflow-hidden ${
                    selectedFact?.id === fact.id
                      ? 'bg-amber-500 text-slate-950 border-amber-300 scale-105'
                      : 'bg-[#0f172af2] text-slate-100 border-amber-500/50 hover:border-amber-400'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectFact(fact)}
                    className="text-left max-w-[180px] sm:max-w-[205px] px-2.5 py-1.5 sm:px-3 sm:py-2 cursor-pointer"
                  >
                    <div
                      className={`text-[10px] font-mono ${
                        selectedFact?.id === fact.id
                          ? 'text-slate-900 font-semibold'
                          : 'text-amber-400'
                      }`}
                    >
                      {fact.eraLabel} · {fact.category}
                    </div>
                    <div className="text-xs font-bold leading-snug mt-0.5 truncate">
                      {fact.title}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenDirectARShare(fact);
                    }}
                    data-testid={`ar-node-share-btn-${fact.id}`}
                    aria-label={`Share ${fact.title} AR discovery`}
                    title="Share this 3D AR view & discovery fact"
                    className={`px-2 flex items-center justify-center border-l transition-colors cursor-pointer ${
                      selectedFact?.id === fact.id
                        ? 'border-amber-600/30 hover:bg-amber-600/20 text-slate-950'
                        : 'border-slate-800 hover:bg-slate-800 text-amber-300'
                    }`}
                  >
                    <Share2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : null
            )}
          </div>
        )}

        {/* Selected AR Historical Fact Detail Card (Desktop Floating Overlay md+) */}
        {selectedFact && (
          <div
            className="hidden md:block absolute bottom-28 right-4 z-20 w-[330px] max-w-[90vw] bg-[#0f172af5] border border-amber-500/50 rounded-2xl p-4 shadow-2xl pointer-events-auto"
            role="dialog"
            aria-label={`Historical fact: ${selectedFact.title}`}
          >
            <div className="flex items-center justify-between gap-2 text-xs font-mono text-amber-400">
              <span>
                {selectedFact.eraLabel} · {selectedFact.category}
              </span>
              <button
                type="button"
                onClick={() => onSelectFact(null)}
                className="text-slate-400 hover:text-white px-1.5 py-0.5 rounded text-xs"
              >
                Close
              </button>
            </div>
            <h3 className="text-base font-bold text-white mt-1">
              {selectedFact.title}
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed mt-1.5">
              {selectedFact.narrative}
            </p>
            <div className="mt-3 pt-2.5 border-t border-slate-800 text-[11px] font-mono text-sky-300">
              {selectedFact.architecturalSpec}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => toggleNarration(selectedLandmark, selectedFact)}
                className="flex-1 py-1.5 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors whitespace-nowrap cursor-pointer"
              >
                {audioSpeaking ? 'Stop Narration' : 'Narrate Fact'}
              </button>
              <button
                type="button"
                onClick={() => handleOpenDirectARShare(selectedFact)}
                data-testid="ar-overlay-share-btn"
                aria-label={`Share ${selectedFact.title} view and discovery fact`}
                className="py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-white font-semibold text-xs border border-amber-500/40 flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Share</span>
              </button>
            </div>
          </div>
        )}

        {/* Direct AR View & Historical Discovery Social Media Share Modal (Inside 3D Viewer) */}
        {arShareOverlayOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Share 3D AR View and Discovery Fact to Social Media"
            data-testid="ar-direct-share-modal"
            className="absolute inset-0 z-30 bg-slate-950/80 flex items-center justify-center p-3 sm:p-5 pointer-events-auto"
          >
            <div className="w-full max-w-lg bg-[#0f172a] border border-amber-500/60 rounded-2xl p-4 sm:p-5 shadow-2xl space-y-4 max-h-full overflow-y-auto">
              {/* Modal Header */}
              <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-800">
                <div>
                  <div className="text-[11px] font-mono text-amber-400 flex items-center gap-1.5">
                    <Share2 className="w-3.5 h-3.5" />
                    <span>
                      3D AR View & Historical Discovery Social Share · Stop 0
                      {selectedLandmark.walkingOrder}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-white mt-0.5">
                    Share {activeSharePayload.landmarkTitle} —{' '}
                    {activeSharePayload.factTitle}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setArShareOverlayOpen(false)}
                  data-testid="close-ar-direct-share-btn"
                  aria-label="Close AR social share modal"
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Captured 3D Viewport Snapshot + AR Fact Telemetry Stamp */}
              <div className="relative h-40 sm:h-44 rounded-xl overflow-hidden border border-slate-700 bg-slate-950">
                <img
                  src={capturedViewDataUrl || selectedLandmark.heroImage}
                  alt={`3D AR View of ${activeSharePayload.landmarkTitle}`}
                  data-testid="ar-share-view-snapshot"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/35 to-transparent" />
                <div className="absolute top-2.5 left-2.5 bg-slate-950/90 border border-amber-500/40 rounded-lg px-2.5 py-1 text-[10px] font-mono text-amber-300">
                  Live 3D AR View · Sightline {activeSharePayload.cameraHeadingDeg}°{' '}
                  {activeSharePayload.cameraCardinal} · GPS{' '}
                  {activeSharePayload.coordinatesLabel}
                </div>
                <div className="absolute bottom-2.5 left-2.5 right-2.5">
                  <div className="text-[10px] font-mono text-sky-300">
                    {activeSharePayload.factEraLabel} ·{' '}
                    {activeSharePayload.factCategory}
                  </div>
                  <div className="text-sm font-bold text-white truncate">
                    {activeSharePayload.landmarkTitle}:{' '}
                    {activeSharePayload.factTitle}
                  </div>
                </div>
              </div>

              {/* Formatted Discovery Fact Social Caption */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <span>Ready-to-Post Discovery Caption</span>
                  <span className="text-amber-400">
                    #{activeSharePayload.hashtags.join(' #')}
                  </span>
                </div>
                <p
                  data-testid="ar-share-caption-text"
                  className="text-xs text-slate-200 leading-relaxed select-all"
                >
                  {activeSharePayload.shareText}
                </p>
              </div>

              {/* Direct Social Media Platform Intent Links */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-mono text-slate-400">
                  Share Directly to Social Media Platforms:
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <a
                    href={activeSharePayload.platformUrls.X_TWITTER}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="ar-share-platform-x"
                    onClick={() =>
                      setShareStatusMessage('Opened X (Twitter) share composer!')
                    }
                    className="py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <span>X / Twitter</span>
                    <ExternalLink className="w-3 h-3 text-amber-400" />
                  </a>
                  <a
                    href={activeSharePayload.platformUrls.FACEBOOK}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="ar-share-platform-facebook"
                    onClick={() =>
                      setShareStatusMessage('Opened Facebook share dialog!')
                    }
                    className="py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <span>Facebook</span>
                    <ExternalLink className="w-3 h-3 text-sky-400" />
                  </a>
                  <a
                    href={activeSharePayload.platformUrls.LINKEDIN}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="ar-share-platform-linkedin"
                    onClick={() =>
                      setShareStatusMessage('Opened LinkedIn share composer!')
                    }
                    className="py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <span>LinkedIn</span>
                    <ExternalLink className="w-3 h-3 text-sky-300" />
                  </a>
                  <a
                    href={activeSharePayload.platformUrls.REDDIT}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="ar-share-platform-reddit"
                    onClick={() =>
                      setShareStatusMessage('Opened Reddit post composer!')
                    }
                    className="py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <span>Reddit</span>
                    <ExternalLink className="w-3 h-3 text-amber-400" />
                  </a>
                </div>
              </div>

              {/* Instant Copy, Snapshot Download & Community Postcard Studio Actions */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCopyARShareCaption}
                  data-testid="ar-share-copy-btn"
                  className="flex-1 py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                >
                  {shareCopied ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Copied to Clipboard!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Share Text & Link</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleDownloadARViewSnapshot}
                  data-testid="ar-share-download-snapshot-btn"
                  className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5 text-sky-400" />
                  <span>Save 3D Snapshot</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setArShareOverlayOpen(false);
                    onOpenShareModal(
                      selectedLandmark,
                      arShareTargetFact || selectedFact
                    );
                  }}
                  data-testid="ar-share-open-passport-btn"
                  className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 font-medium text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Postcard Studio</span>
                </button>
              </div>

              {shareStatusMessage && (
                <div
                  role="status"
                  data-testid="ar-share-status-banner"
                  className="text-xs font-mono text-emerald-300 bg-emerald-500/15 border border-emerald-500/40 rounded-xl px-3 py-2"
                >
                  {shareStatusMessage}
                </div>
              )}
            </div>
          </div>
        )}

        {cameraError && (
          <div className="absolute top-20 left-4 z-20 max-w-xs bg-[#0f172af0] border border-amber-500/40 text-amber-200 px-3 py-2 rounded-lg text-xs">
            {cameraError}
          </div>
        )}

        {/* 3D Gyroscope Compass Needle & Historical Sightline Alignment Overlay */}
        <div
          role="region"
          aria-label="3D Gyroscope Compass Needle and Historical Sightline Overlay"
          data-testid="gyro-compass-overlay"
          className="hidden sm:block absolute bottom-28 left-4 z-20 w-[268px] bg-[#0f172af2] border border-slate-700/90 rounded-2xl p-3 shadow-2xl pointer-events-auto"
        >
          {/* Header: Gyro Sensor Mode & Sightline Lock Status */}
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800">
            <div className="flex items-center gap-1.5 text-[11px] font-mono text-amber-400 font-semibold">
              <Navigation className="w-3.5 h-3.5 text-amber-400" />
              <span>
                {gyroSource === 'DEVICE_GYRO'
                  ? '3D Gyro Sensor Live'
                  : '3D Gyro Compass'}
              </span>
            </div>
            <span
              data-testid="gyro-alignment-status"
              className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold border ${
                compassAlignment.isAligned
                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                  : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
              }`}
            >
              {compassAlignment.isAligned
                ? 'SIGHTLINE LOCKED'
                : `${compassAlignment.relativeNeedleAngleDeg > 0 ? '+' : ''}${
                    compassAlignment.relativeNeedleAngleDeg
                  }° DELTA`}
            </span>
          </div>

          {/* Middle Row: 3D Perspective Tilted Compass Dial & Needle + Telemetry */}
          <div className="flex items-center gap-3 py-2.5">
            {/* 3D Perspective Gimbal Housing */}
            <div
              className="relative w-20 h-20 shrink-0 flex items-center justify-center"
              style={{ perspective: '340px' }}
            >
              <div
                data-testid="gyro-compass-needle-3d"
                data-heading-deg={compassAlignment.deviceHeadingDeg}
                data-relative-angle-deg={compassAlignment.relativeNeedleAngleDeg}
                data-aligned={String(compassAlignment.isAligned)}
                className={`relative w-[76px] h-[76px] rounded-full border-2 transition-transform duration-150 ease-out flex items-center justify-center shadow-inner ${
                  compassAlignment.isAligned
                    ? 'bg-slate-950 border-emerald-400/80 shadow-emerald-500/20'
                    : 'bg-slate-950 border-amber-500/60'
                }`}
                style={{
                  transform: `rotateX(${compassAlignment.pitchTiltDeg}deg) rotateY(${compassAlignment.rollTiltDeg}deg)`,
                  transformStyle: 'preserve-3d',
                }}
              >
                {/* Rotating 360° Cardinal Azimuth Ring (North relative to phone) */}
                <div
                  data-testid="gyro-cardinal-ring"
                  className="absolute inset-0 transition-transform duration-150 ease-out"
                  style={{
                    transform: `rotateZ(${compassAlignment.northNeedleAngleDeg}deg)`,
                  }}
                >
                  <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[9px] font-mono font-extrabold text-rose-400">
                    N
                  </span>
                  <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] font-mono font-bold text-slate-400">
                    E
                  </span>
                  <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[8px] font-mono font-bold text-slate-400">
                    S
                  </span>
                  <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[8px] font-mono font-bold text-slate-400">
                    W
                  </span>
                </div>

                {/* Inner Elevation Concentric Reticle Ring */}
                <div className="w-11 h-11 rounded-full border border-dashed border-slate-700/90" />

                {/* 3D Faceted Historical Sightline Pointer Needle */}
                <div
                  data-testid="gyro-sightline-needle"
                  className="absolute inset-0 flex items-center justify-center transition-transform duration-150 ease-out"
                  style={{
                    transform: `rotateZ(${compassAlignment.relativeNeedleAngleDeg}deg) translateZ(6px)`,
                  }}
                >
                  <svg
                    viewBox="0 0 64 64"
                    className="w-14 h-14 overflow-visible"
                    aria-hidden="true"
                  >
                    {/* North/Sightline Forward Faceted Spear (Emerald when aligned, Amber when seeking) */}
                    <polygon
                      points="32,6 26,32 32,28"
                      fill={compassAlignment.isAligned ? '#34d399' : '#fbbf24'}
                    />
                    <polygon
                      points="32,6 38,32 32,28"
                      fill={compassAlignment.isAligned ? '#10b981' : '#d97706'}
                    />
                    {/* Tail Counterweight Faceted Fin */}
                    <polygon points="32,56 27,32 32,35" fill="#475569" />
                    <polygon points="32,56 37,32 32,35" fill="#334155" />
                    {/* Center Brass Gimbal Pivot */}
                    <circle
                      cx="32"
                      cy="32"
                      r="3.8"
                      fill="#f8fafc"
                      stroke="#0f172a"
                      strokeWidth="1.5"
                    />
                  </svg>
                </div>
              </div>
            </div>

            {/* Right Column: Live Azimuth & Sightline Guidance */}
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] font-mono text-slate-400">
                  Phone Heading
                </span>
                <span
                  data-testid="gyro-device-heading"
                  className="text-sm font-mono font-bold text-white"
                >
                  {compassAlignment.deviceHeadingDeg}° {compassAlignment.deviceCardinal}
                </span>
              </div>

              <div className="flex items-baseline justify-between">
                <span className="text-[10px] font-mono text-slate-400">
                  Sight Bearing
                </span>
                <span
                  data-testid="gyro-target-bearing"
                  className="text-xs font-mono font-semibold text-amber-300"
                >
                  {compassAlignment.targetBearingDeg}° {compassAlignment.targetCardinal}
                </span>
              </div>

              <div
                data-testid="gyro-tilt-telemetry"
                className="text-[10px] font-mono text-sky-300 truncate"
              >
                Tilt β {compassAlignment.pitchTiltDeg}° · Roll γ{' '}
                {compassAlignment.rollTiltDeg}°
              </div>

              <p
                data-testid="gyro-alignment-instruction"
                className="text-[10px] text-slate-300 leading-snug line-clamp-2 pt-0.5"
              >
                {compassAlignment.alignmentInstruction}
              </p>
            </div>
          </div>

          {/* Bottom Controls: Gyro Heading Scrubber & Snap-to-Sightline Button */}
          <div className="pt-2 border-t border-slate-800 space-y-2">
            <div className="flex items-center gap-2">
              <label
                htmlFor="gyro-heading-slider"
                className="text-[10px] font-mono text-slate-400 whitespace-nowrap"
              >
                Gyro Yaw:
              </label>
              <input
                id="gyro-heading-slider"
                data-testid="gyro-heading-slider"
                type="range"
                min={0}
                max={359}
                step={1}
                value={compassAlignment.deviceHeadingDeg}
                onChange={(e) =>
                  handleManualGyroHeadingChange(Number(e.target.value))
                }
                aria-label="Simulate device gyroscope compass heading"
                className="w-full accent-amber-500 cursor-pointer h-1.5"
              />
            </div>

            <button
              type="button"
              onClick={handleAlignCompassToSight}
              data-testid="align-compass-to-sight-btn"
              className={`w-full py-1.5 px-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                compassAlignment.isAligned
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>
                {compassAlignment.isAligned
                  ? `Aligned with ${selectedLandmark.shortTitle}`
                  : `Align Phone with ${selectedLandmark.shortTitle}`}
              </span>
            </button>
          </div>
        </div>

      {/* Unified Collapsible Bottom Control Dock (Zero Viewport Occlusion) */}
      <div
        className="absolute bottom-3 left-3 right-3 mx-auto z-20 max-w-[920px] pointer-events-auto transition-transform duration-200"
        style={{
          transform: dockCollapsed
            ? 'translateY(calc(100% - 34px))'
            : 'translateY(0)',
        }}
      >
        <div className="flex justify-center mb-1">
          <button
            type="button"
            onClick={() => setDockCollapsed((prev) => !prev)}
            className="flex items-center gap-1.5 px-3.5 py-1 rounded-t-lg bg-[#0f172af2] border border-b-0 border-slate-700 text-xs font-medium text-slate-300 hover:text-white whitespace-nowrap shrink-0"
          >
            {dockCollapsed ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                <span>Show 3D & AR Controls (H)</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                <span>Hide Controls (H)</span>
              </>
            )}
          </button>
        </div>

        <div className="bg-[#0f172af5] border border-slate-700/90 rounded-2xl p-3 shadow-2xl">
          {/* Row 1: 6 Cleveland Landmark Camera Presets */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-slate-800">
            <span className="text-[11px] font-mono text-slate-400 mr-1 whitespace-nowrap shrink-0">
              <Compass className="w-3.5 h-3.5 inline mr-1 text-amber-400" />
              3D Stops:
            </span>
            {landmarks.map((lm) => {
              const active = lm.id === selectedLandmark.id;
              return (
                <button
                  key={lm.id}
                  type="button"
                  onClick={() => {
                    onSelectLandmark(lm);
                    onSelectFact(lm.arFacts[0] || null);
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-amber-500 text-slate-950 font-semibold'
                      : 'bg-slate-800/90 text-slate-300 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  0{lm.walkingOrder}. {lm.shortTitle}
                </button>
              );
            })}
          </div>

          {/* Row 2: AR Lens Toggle, Era Time-Slider, Material Finish & Camera Reset */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onToggleArLens}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  arLensActive
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                    : 'bg-slate-800 text-slate-300 border border-slate-700'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{arLensActive ? 'AR Overlays: ON' : 'AR Overlays: OFF'}</span>
              </button>

              <button
                type="button"
                onClick={toggleLiveCameraStream}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                  cameraFeedActive
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span>{cameraFeedActive ? 'Stop Camera' : 'AR Camera Feed'}</span>
              </button>
            </div>

            {/* Historical Era Filter Slider */}
            <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-xs">
              <label
                htmlFor="ar-era-slider"
                className="text-[11px] font-mono text-slate-300 whitespace-nowrap shrink-0"
              >
                Era ≤ {eraMaxYear}
              </label>
              <input
                id="ar-era-slider"
                type="range"
                min={1890}
                max={2026}
                step={1}
                value={eraMaxYear}
                onChange={(e) => onChangeEraMaxYear(Number(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>

            {/* Category & 3D Material Finish */}
            <div className="flex items-center gap-2">
              <select
                aria-label="Filter AR facts by category"
                value={factCategory}
                onChange={(e) => onChangeFactCategory(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5"
              >
                <option value="ALL">All Fact Types</option>
                <option value="Architecture">Architecture</option>
                <option value="Engineering">Engineering</option>
                <option value="Civic History">Civic History</option>
                <option value="Cultural Milestone">Cultural Milestone</option>
              </select>

              {viewportEngine === 'GOOGLE_EARTH_3D' ? (
                <button
                  type="button"
                  onClick={() =>
                    setGoogle3DMapMode((m) =>
                      m === 'HYBRID' ? 'SATELLITE' : 'HYBRID'
                    )
                  }
                  data-testid="toggle-google-3d-map-mode-btn"
                  aria-label="Toggle Google 3D Photorealistic Map Mode (Hybrid or Satellite)"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 hover:text-white text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Globe className="w-3.5 h-3.5 text-amber-400" />
                  <span>
                    {google3DMapMode === 'HYBRID'
                      ? '3D Hybrid Labels'
                      : '3D Satellite Mesh'}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    setFinishMode((m) =>
                      m === 'REALISTIC'
                        ? 'ARCHITECTURAL_CLAY'
                        : m === 'ARCHITECTURAL_CLAY'
                        ? 'BLUEPRINT'
                        : 'REALISTIC'
                    )
                  }
                  aria-label="Cycle 3D surface rendering style"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 hover:text-white text-xs font-medium whitespace-nowrap shrink-0"
                >
                  <Layers className="w-3.5 h-3.5 text-sky-400" />
                  <span>
                    {finishMode === 'REALISTIC'
                      ? 'PBR Stone'
                      : finishMode === 'ARCHITECTURAL_CLAY'
                      ? 'Clay Model'
                      : 'Wireframe'}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  const [lx, ly, lz] = selectedLandmark.scenePosition3D;
                  cameraTargetRef.current = {
                    pos: new THREE.Vector3(lx + 12.5, ly + 11.5, lz + 15.5),
                    lookAt: new THREE.Vector3(lx, ly + 6.5, lz),
                    active: true,
                  };
                  requestRenderRef.current();
                  setGoogle3DOrbiting(false);
                  if (map3DRef.current?.map3d) {
                    try {
                      map3DRef.current.flyCameraTo({
                        endCamera: {
                          center: google3DCameraPose.center,
                          range: google3DCameraPose.range,
                          tilt: google3DCameraPose.tilt,
                          heading: google3DCameraPose.heading,
                          roll: 0,
                        },
                        durationMillis: 1200,
                      });
                    } catch {
                      // Ignore
                    }
                  }
                }}
                aria-label="Reset 3D camera view"
                className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* Selected AR Historical Fact Detail Card (Stacked cleanly below 3D canvas on Mobile < md) */}
      {selectedFact && (
        <div
          className="md:hidden bg-[#0f172af5] border border-amber-500/50 rounded-2xl p-4 shadow-xl"
          role="region"
          aria-label={`Mobile historical fact: ${selectedFact.title}`}
        >
          <div className="flex items-center justify-between gap-2 text-xs font-mono text-amber-400">
            <span>
              {selectedFact.eraLabel} · {selectedFact.category}
            </span>
            <button
              type="button"
              onClick={() => onSelectFact(null)}
              className="text-slate-400 hover:text-white px-1.5 py-0.5 rounded text-xs"
            >
              Close
            </button>
          </div>
          <h3 className="text-base font-bold text-white mt-1">
            {selectedFact.title}
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed mt-1.5">
            {selectedFact.narrative}
          </p>
          <div className="mt-3 pt-2.5 border-t border-slate-800 text-[11px] font-mono text-sky-300">
            {selectedFact.architecturalSpec}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => toggleNarration(selectedLandmark, selectedFact)}
              className="flex-1 py-2 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors whitespace-nowrap"
            >
              {audioSpeaking ? 'Stop Narration' : 'Narrate Fact'}
            </button>
            <button
              type="button"
              onClick={() => handleOpenDirectARShare(selectedFact)}
              data-testid="ar-overlay-mobile-share-btn"
              className="py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 font-semibold text-xs border border-amber-500/40 flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Share</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
