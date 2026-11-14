import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Crosshair, Home, LocateFixed, Map as MapIcon, Minus, Plus } from "lucide-react";
import globeMeta from "../data/globeMeta.json";
import mapMeta from "../data/mapMeta.json";
import { CRATER_LABELS, CURATED_SITES } from "../data/lunarSites";
import { latLonToUnit, lonLatToXY, makeSite, unitToLatLon } from "../lib/geo";

const ORANGE = new THREE.Color("#ff8c2b");
const CYAN = new THREE.Color("#7dd3fc");
const SKY_BLUE = new THREE.Color("#38bdf8");
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const IDENTITY_QUAT = new THREE.Quaternion();

const MIN_DIST = 1.12;
const MAX_DIST = 8;
const HOME = { r: 3.4, lat: -32, lon: 12 };
const POLE_VIEW = { r: 1.56, phi: Math.PI - 0.0025, theta: Math.PI / 2 };
const EARTH_POS = { lat: 1.8, lon: -2.2, dist: 26 };

const SYNODIC_MONTH_DAYS = 29.530589;
const DRACONIC_MONTH_DAYS = 27.21222;
const SOLAR_OBLIQUITY_DEG = 1.5424;
const REF_EPOCH_MS = Date.UTC(2026, 10, 13, 0, 0, 0);

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

function vec(lat, lon, r = 1) {
  const [x, y, z] = latLonToUnit(lat, lon);
  return new THREE.Vector3(x * r, y * r, z * r);
}

/**
 * Compute Moon-centered 3D Sun direction unit vector strictly from the UTC timestamp (`atUtc`)
 * over the ~29.53-day synodic month so switching between pins at the same timestamp never
 * recalibrates or snaps the Moon's orientation.
 */
function computeSunDirection(sunState) {
  const tMs = sunState?.atUtc ? Date.parse(sunState.atUtc) : NaN;
  const dDays = Number.isFinite(tMs)
    ? (tMs - REF_EPOCH_MS) / 86400000
    : Number.isFinite(sunState?.offsetH)
      ? sunState.offsetH / 24
      : 0;
  const sunLon = globeMeta.sunLon - (dDays / SYNODIC_MONTH_DAYS) * 360.0;
  const sunLat = -SOLAR_OBLIQUITY_DEG * Math.cos((dDays / DRACONIC_MONTH_DAYS) * Math.PI * 2);
  return vec(sunLat, sunLon).normalize();
}

/**
 * Radial alphaMap texture for the South Pole Cap:
 * 1.0 inside 80°S–90°S (r <= 0.326), feathering smoothly to 0.0 at 65°S (r = 0.827).
 */
function makeCapAlphaTexture(size = 512) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  g.fillStyle = "#000000";
  g.fillRect(0, 0, size, size);
  const half = size / 2;
  const grad = g.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0.0, "#ffffff");
  grad.addColorStop(0.326, "#ffffff"); // 80°S
  grad.addColorStop(0.45, "#d8d8d8");
  grad.addColorStop(0.58, "#808080");
  grad.addColorStop(0.71, "#262626");
  grad.addColorStop(0.827, "#000000"); // 65°S
  grad.addColorStop(1.0, "#000000");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/**
 * High-resolution spherical South Pole cap (90°S to 60°S) UV-mapped directly
 * in South Polar Stereographic projection onto /south_pole.png (zero pinching).
 */
function buildSouthPoleCapGeometry(rings = 64, segs = 128, radius = 1.0008) {
  const { xmin, ymin, xmax, ymax } = mapMeta.bounds;
  const xSpan = xmax - xmin;
  const ySpan = ymax - ymin;
  const vertCount = (rings + 1) * (segs + 1);

  const positions = new Float32Array(vertCount * 3);
  const normals = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  const eqUvs = new Float32Array(vertCount * 2);
  const capAlphas = new Float32Array(vertCount);
  const capLats = new Float32Array(vertCount);

  let p3 = 0;
  let p2 = 0;
  let p1 = 0;
  for (let r = 0; r <= rings; r++) {
    const lat = -90 + (r / rings) * 30; // -90 -> -60
    const t = Math.max(0, Math.min(1, (-65 - lat) / 15)); // wide smooth feather 65S..80S
    const alpha = t * t * (3 - 2 * t);
    const eqV = (lat + 90) / 180;

    for (let s = 0; s <= segs; s++) {
      const lon = -180 + (s / segs) * 360;
      const [ux, uy, uz] = latLonToUnit(lat, lon);
      positions[p3] = ux * radius;
      positions[p3 + 1] = uy * radius;
      positions[p3 + 2] = uz * radius;
      normals[p3] = ux;
      normals[p3 + 1] = uy;
      normals[p3 + 2] = uz;

      const [sx, sy] = lonLatToXY(lon, lat);
      uvs[p2] = (sx - xmin) / xSpan;
      uvs[p2 + 1] = (sy - ymin) / ySpan;
      eqUvs[p2] = (lon + 180) / 360;
      eqUvs[p2 + 1] = eqV;

      capAlphas[p1] = alpha;
      capLats[p1] = lat;
      p3 += 3;
      p2 += 2;
      p1 += 1;
    }
  }

  const indices = [];
  const stride = segs + 1;
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segs; s++) {
      const a = r * stride + s;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute("aEqUv", new THREE.BufferAttribute(eqUvs, 2));
  geo.setAttribute("aCapAlpha", new THREE.BufferAttribute(capAlphas, 1));
  geo.setAttribute("aLat", new THREE.BufferAttribute(capLats, 1));
  geo.setIndex(indices);
  return geo;
}

function radialTexture(stops, size = 256) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) grad.addColorStop(o, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeEarthTexture() {
  const w = 256;
  const h = 128;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");

  // Deep ocean base
  const ocean = g.createLinearGradient(0, 0, 0, h);
  ocean.addColorStop(0, "#1d4e89");
  ocean.addColorStop(0.5, "#0d3b66");
  ocean.addColorStop(1, "#1d4e89");
  g.fillStyle = ocean;
  g.fillRect(0, 0, w, h);

  // Stylized landmasses
  const continents = [
    [54, 42, 22, 16, "#3a7d44"],
    [72, 74, 14, 22, "#4b8b4b"],
    [134, 40, 26, 15, "#5a8f49"],
    [138, 66, 16, 22, "#7c8c4c"],
    [175, 44, 34, 18, "#4c8549"],
    [204, 82, 16, 11, "#8d7b52"],
  ];
  for (const [cx, cy, rx, ry, col] of continents) {
    g.fillStyle = col;
    g.beginPath();
    g.ellipse(cx, cy, rx, ry, 0.25, 0, Math.PI * 2);
    g.fill();
  }

  // Polar ice caps
  g.fillStyle = "rgba(235, 245, 255, 0.85)";
  g.fillRect(0, 0, w, 9);
  g.fillRect(0, h - 9, w, 9);

  // Soft wispy clouds
  g.fillStyle = "rgba(255, 255, 255, 0.34)";
  for (let i = 0; i < 18; i++) {
    const cx = ((i * 47 + 19) % (w - 30)) + 15;
    const cy = ((i * 29 + 17) % (h - 28)) + 14;
    g.beginPath();
    g.ellipse(cx, cy, 18 + (i % 3) * 8, 3.2, (i % 5) * 0.15 - 0.3, 0, Math.PI * 2);
    g.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Tilted galactic basis (~60° inclination) shared by the Milky Way skydome and starfield
const GAL_AXIS_X = new THREE.Vector3(0.82, 0.48, -0.31).normalize();
const GAL_AXIS_Y = new THREE.Vector3(-0.42, 0.87, 0.25).normalize();
const GAL_AXIS_Z = new THREE.Vector3().crossVectors(GAL_AXIS_X, GAL_AXIS_Y).normalize();
GAL_AXIS_X.crossVectors(GAL_AXIS_Y, GAL_AXIS_Z).normalize();

function buildMilkyWaySkydome(renderer, track, radius = 180) {
  // Pre-bake the procedural 3D FBM Milky Way ONCE into an equirectangular GPU texture
  // so per-frame rendering is a single texture lookup (zero per-frame FBM cost -> 60 FPS).
  const rt = track(
    new THREE.WebGLRenderTarget(1536, 768, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
    })
  );

  const bakeGeo = new THREE.PlaneGeometry(2, 2);
  const bakeMat = new THREE.ShaderMaterial({
    uniforms: {
      uGalX: { value: GAL_AXIS_X },
      uGalY: { value: GAL_AXIS_Y },
      uGalZ: { value: GAL_AXIS_Z },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform vec3 uGalX;
      uniform vec3 uGalY;
      uniform vec3 uGalZ;

      float hash31(vec3 p) {
        p = fract(p * vec3(443.897, 441.423, 437.195));
        p += dot(p, p.yzx + 19.19);
        return fract((p.x + p.y) * p.z);
      }

      float noise3(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float n000 = hash31(i + vec3(0.0, 0.0, 0.0));
        float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
        float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
        float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
        float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
        float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
        float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
        float n111 = hash31(i + vec3(1.0, 1.0, 1.0));
        float nx00 = mix(n000, n100, f.x);
        float nx10 = mix(n010, n110, f.x);
        float nx01 = mix(n001, n101, f.x);
        float nx11 = mix(n011, n111, f.x);
        float nxy0 = mix(nx00, nx10, f.y);
        float nxy1 = mix(nx01, nx11, f.y);
        return mix(nxy0, nxy1, f.z);
      }

      const mat3 ROT = mat3(
         0.00,  0.80,  0.60,
        -0.80,  0.36, -0.48,
        -0.60, -0.48,  0.64
      );

      float fbm(vec3 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 5; i++) {
          v += a * noise3(p);
          p = ROT * p * 2.04 + vec3(13.7, -7.3, 5.1);
          a *= 0.5;
        }
        return v;
      }

      void main() {
        // Match THREE.SphereGeometry spherical UV mapping on unit sphere
        float phi = vUv.x * 6.28318530718;
        float theta = (1.0 - vUv.y) * 3.14159265359;
        vec3 d = vec3(-cos(phi) * sin(theta), cos(theta), sin(phi) * sin(theta));

        // Transform direction into tilted galactic coordinates (g.y = galactic latitude sin)
        vec3 g = vec3(dot(d, uGalX), dot(d, uGalY), dot(d, uGalZ));

        // Subtle organic warp along the galactic equator
        float warp = (fbm(g * 2.4) - 0.5) * 0.085;
        float b = g.y + warp;

        // Galactic core bulge bias toward +g.x
        float coreBias = smoothstep(-0.7, 0.95, g.x);
        float coreBulge = pow(max(0.0, g.x), 2.2) * exp(-b * b * 16.0);

        // Multi-scale galactic cloud structure
        float nLarge = fbm(g * 3.2 + vec3(1.4, -2.1, 0.8));
        float nDetail = fbm(g * 8.5 + vec3(-4.2, 3.7, 1.9));
        float clouds = smoothstep(0.26, 0.78, nLarge * 0.65 + nDetail * 0.35);

        // Broad cool stellar haze + narrower warm galactic band
        float outerBand = exp(-b * b * 10.5) * (0.45 + 0.55 * nLarge);
        float innerBand = exp(-b * b * 36.0) * clouds * (0.55 + 0.65 * coreBias);

        // Dark dust-rift lanes cutting through the center of the Milky Way
        float riftNoise = fbm(g * 6.8 + vec3(7.1, 2.3, -5.4));
        float riftFine = fbm(g * 16.0 - vec3(2.8, 9.1, 4.0));
        float riftMask = exp(-b * b * 95.0) * smoothstep(0.42, 0.74, riftNoise * 0.7 + riftFine * 0.3);

        // Subtle Google Earth-style palette:
        // Deep space #020306, cool stellar haze #111a2e, warm dust #2b1e16 / #3b2a1e
        vec3 deepSpace = vec3(0.005, 0.007, 0.014);
        vec3 coolHaze  = vec3(0.067, 0.102, 0.180);
        vec3 warmDust1 = vec3(0.169, 0.118, 0.086);
        vec3 warmDust2 = vec3(0.231, 0.165, 0.118);

        vec3 col = deepSpace;
        col += coolHaze * outerBand * 0.36;
        vec3 warmMix = mix(warmDust1, warmDust2, clamp(coreBias * 0.7 + nDetail * 0.3, 0.0, 1.0));
        col += warmMix * (innerBand * 0.42 + coreBulge * 0.22 * clouds);

        // Carve dark dust rifts into the galactic plane
        col = mix(col, deepSpace * 0.85, clamp(riftMask * 0.78, 0.0, 0.82));

        // Faint unresolved starlight dust speckle inside the band
        float dustStars = pow(hash31(floor(g * 420.0)), 18.0) * innerBand * (1.0 - riftMask * 0.7);
        col += vec3(0.22, 0.20, 0.18) * dustStars * 0.35;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
  });

  const bakeScene = new THREE.Scene();
  const bakeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  bakeScene.add(new THREE.Mesh(bakeGeo, bakeMat));

  const prevTarget = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  renderer.render(bakeScene, bakeCam);
  renderer.setRenderTarget(prevTarget);
  rt.texture.colorSpace = THREE.SRGBColorSpace;

  bakeGeo.dispose();
  bakeMat.dispose();

  const geo = new THREE.SphereGeometry(radius, 32, 20);
  const mat = new THREE.MeshBasicMaterial({
    map: rt.texture,
    color: new THREE.Color(0x4a4a4a),
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -20;
  mesh.frustumCulled = false;
  return mesh;
}

function buildStarfield(count = 7500, radius = 200) {
  const pos = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const phase = new Float32Array(count);
  const color = new Float32Array(count * 3);
  const tints = [
    [0.72, 0.83, 1.0],  // cool blue-white (O/B)
    [0.86, 0.92, 1.0],  // crisp blue-white (A)
    [1.0, 0.99, 0.97],  // pure stellar white (F)
    [1.0, 0.95, 0.86],  // subtle warm white (G)
    [1.0, 0.87, 0.72],  // soft amber-gold (K)
    [1.0, 0.78, 0.6],   // faint warm orange (M)
  ];
  for (let i = 0; i < count; i++) {
    let x;
    let y;
    let z;
    // Concentrate ~35% of stars gently along the tilted Milky Way plane
    if (i < count * 0.35) {
      const lon = Math.random() * Math.PI * 2;
      const gLat = (Math.random() + Math.random() + Math.random() - 1.5) * 0.26;
      const cosB = Math.cos(gLat);
      const sinB = Math.sin(gLat);
      const gx = cosB * Math.cos(lon);
      const gy = sinB;
      const gz = cosB * Math.sin(lon);
      x = (gx * GAL_AXIS_X.x + gy * GAL_AXIS_Y.x + gz * GAL_AXIS_Z.x) * radius;
      y = (gx * GAL_AXIS_X.y + gy * GAL_AXIS_Y.y + gz * GAL_AXIS_Z.y) * radius;
      z = (gx * GAL_AXIS_X.z + gy * GAL_AXIS_Y.z + gz * GAL_AXIS_Z.z) * radius;
    } else {
      const u = Math.random() * 2 - 1;
      const t = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      x = s * Math.cos(t) * radius;
      y = u * radius;
      z = s * Math.sin(t) * radius;
    }
    pos.set([x, y, z], i * 3);
    size[i] = 0.7 + Math.pow(Math.random(), 7) * 3.6;
    phase[i] = Math.random();
    const tint = tints[Math.floor(Math.random() * tints.length)];
    const b = 0.42 + Math.random() * 0.58;
    color.set([tint[0] * b, tint[1] * b, tint[2] * b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  geo.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
  geo.setAttribute("aColor", new THREE.BufferAttribute(color, 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float aSize; attribute float aPhase; attribute vec3 aColor;
      uniform float uTime; uniform float uPixelRatio;
      varying vec3 vColor; varying float vTw;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float speed = 0.5 + fract(aPhase * 7.13) * 1.9;
        vTw = 0.72 + 0.28 * sin(uTime * speed + aPhase * 6.2831);
        gl_PointSize = aSize * uPixelRatio * (0.85 + 0.3 * vTw);
        vColor = aColor;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor; varying float vTw;
      void main() {
        float r = length(gl_PointCoord - 0.5);
        float a = pow(smoothstep(0.5, 0.0, r), 1.6) * vTw;
        gl_FragColor = vec4(vColor * a, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.renderOrder = -10;
  points.frustumCulled = false;
  return points;
}

export default function MoonGlobe3D({
  active,
  selectedSite,
  nearbySpots = [],
  sunState = null,
  showSitePins = true,
  onSelectSite,
  onInspect2D,
  focusRequest,
}) {
  const mountRef = useRef(null);
  const apiRef = useRef(null);
  const activeRef = useRef(active);
  const selectedRef = useRef(selectedSite);
  const nearbyRef = useRef(nearbySpots);
  const sunStateRef = useRef(sunState);
  const showPinsRef = useRef(showSitePins);
  const callbacksRef = useRef({ onSelectSite, onInspect2D });
  callbacksRef.current = { onSelectSite, onInspect2D };

  const readoutLatRef = useRef(null);
  const readoutLonRef = useRef(null);
  const readoutHintRef = useRef(null);
  const fpsRef = useRef(null);
  const earthArrowRef = useRef(null);
  const earthLabelRef = useRef(null);
  const sunLabelRef = useRef(null);
  const coverageLabelRef = useRef(null);
  const labelRefs = useRef([]);
  const craterLabelRefs = useRef([]);

  const [loaded, setLoaded] = useState(false);
  const [poleMode, setPoleMode] = useState(false);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    selectedRef.current = selectedSite;
    apiRef.current?.syncSelection();
  }, [selectedSite]);

  useEffect(() => {
    nearbyRef.current = nearbySpots;
    apiRef.current?.syncNearby();
  }, [nearbySpots]);

  useEffect(() => {
    sunStateRef.current = sunState;
    apiRef.current?.updateSun(sunState);
  }, [sunState]);

  useEffect(() => {
    showPinsRef.current = showSitePins;
    apiRef.current?.syncPinsVisibility();
  }, [showSitePins]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // ---------- Renderer / scene / camera ----------
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setClearColor(0x000000, 1);
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, mount.clientWidth / mount.clientHeight, 0.005, 600);
    camera.position.copy(vec(HOME.lat, HOME.lon, HOME.r));

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.enablePan = false;
    controls.minDistance = MIN_DIST;
    controls.maxDistance = MAX_DIST;
    controls.zoomSpeed = 0.7;
    controls.rotateSpeed = 0.5;
    controls.target.set(0, 0, 0);
    controls.update();

    const disposables = [];
    const track = (o) => (disposables.push(o), o);

    // ---------- Milky Way Skydome + Starfield ----------
    const milkyWay = buildMilkyWaySkydome(renderer, track, 180);
    track(milkyWay.geometry);
    track(milkyWay.material);
    scene.add(milkyWay);

    const stars = buildStarfield();
    track(stars.geometry);
    track(stars.material);
    stars.material.uniforms.uPixelRatio.value = renderer.getPixelRatio();
    scene.add(stars);

    // ---------- Stationary Sun + corona + photorealistic PBR lights ----------
    const baseSunDir = vec(globeMeta.sunLat, globeMeta.sunLon).normalize();
    const baseSunLonRad = Math.atan2(-baseSunDir.z, baseSunDir.x);
    const toLightDir = (d) =>
      new THREE.Vector3(d.x, Math.min(d.y, -0.25), d.z).normalize();
    const sunLight = new THREE.DirectionalLight(0xfffaf0, 3.15);
    sunLight.position.copy(toLightDir(baseSunDir)).multiplyScalar(10);
    scene.add(sunLight);
    scene.add(new THREE.AmbientLight(0xd8dee9, 0.055));

    // Rotating Moon + tidally-locked Earth group centered at (0, 0, 0)
    const moonGroup = new THREE.Group();
    scene.add(moonGroup);

    // Subtle neutral Earthshine (rotates with tidally-locked Earth in moonGroup)
    const earthDir = vec(EARTH_POS.lat, EARTH_POS.lon).normalize();
    const earthshineLight = new THREE.DirectionalLight(0xcbd5e1, 0.065);
    earthshineLight.position.copy(earthDir).multiplyScalar(10);
    moonGroup.add(earthshineLight);

    const sunGroup = new THREE.Group();
    sunGroup.position.copy(baseSunDir).multiplyScalar(90);
    const sunCore = new THREE.Mesh(
      track(new THREE.SphereGeometry(1.15, 32, 16)),
      track(new THREE.MeshBasicMaterial({ color: 0xffcf70, toneMapped: false }))
    );
    const sunGlowTex = track(
      radialTexture([
        [0, "rgba(255,238,195,1)"],
        [0.18, "rgba(255,179,71,0.92)"],
        [0.48, "rgba(255,123,0,0.34)"],
        [1, "rgba(255,123,0,0)"],
      ])
    );
    const sunGlow = new THREE.Sprite(
      track(
        new THREE.SpriteMaterial({
          map: sunGlowTex,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          transparent: true,
          toneMapped: false,
        })
      )
    );
    sunGlow.scale.setScalar(20);
    const sunCorona = new THREE.Sprite(
      track(
        new THREE.SpriteMaterial({
          map: sunGlowTex,
          color: 0xff7b00,
          opacity: 0.36,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          transparent: true,
          toneMapped: false,
        })
      )
    );
    sunCorona.scale.setScalar(38);
    sunGroup.add(sunCore, sunGlow, sunCorona);
    scene.add(sunGroup);

    // ---------- Tidally locked Earth orb + DTE line-of-sight vector (in moonGroup) ----------
    const earthWorldPos = earthDir.clone().multiplyScalar(EARTH_POS.dist);
    const earthGroup = new THREE.Group();
    earthGroup.position.copy(earthWorldPos);

    const earthTex = track(makeEarthTexture());
    const earthOrb = new THREE.Mesh(
      track(new THREE.SphereGeometry(0.36, 32, 20)),
      track(
        new THREE.MeshStandardMaterial({
          map: earthTex,
          emissiveMap: earthTex,
          emissive: new THREE.Color(0x6bb6ff),
          emissiveIntensity: 0.45,
          roughness: 0.65,
          metalness: 0.05,
        })
      )
    );
    const earthAtmoTex = track(
      radialTexture([
        [0.52, "rgba(77,166,255,0)"],
        [0.72, "rgba(110,190,255,0.42)"],
        [0.88, "rgba(77,166,255,0.14)"],
        [1, "rgba(77,166,255,0)"],
      ])
    );
    const earthRim = new THREE.Sprite(
      track(
        new THREE.SpriteMaterial({
          map: earthAtmoTex,
          opacity: 0.65,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          transparent: true,
          toneMapped: false,
        })
      )
    );
    earthRim.scale.setScalar(1.06);
    earthGroup.add(earthOrb, earthRim);
    moonGroup.add(earthGroup);

    const dteGeo = track(
      new THREE.BufferGeometry().setFromPoints([
        earthDir.clone().multiplyScalar(1.005),
        earthDir.clone().multiplyScalar(EARTH_POS.dist - 0.44),
      ])
    );
    const dteLine = new THREE.Line(
      dteGeo,
      track(
        new THREE.LineDashedMaterial({
          color: 0x4da6ff,
          dashSize: 0.42,
          gapSize: 0.32,
          transparent: true,
          opacity: 0.36,
          depthWrite: false,
        })
      )
    );
    dteLine.computeLineDistances();
    moonGroup.add(dteLine);

    // ---------- Moon ----------
    const manager = new THREE.LoadingManager();
    manager.onLoad = () => setLoaded(true);
    const loader = new THREE.TextureLoader(manager);
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const loadTex = (url, srgb) => {
      const t = loader.load(url);
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = maxAniso;
      return track(t);
    };
    const albedo = loadTex(globeMeta.textures.albedo, true);
    const normal = loadTex(globeMeta.textures.normal, false);
    const southPoleTex = loadTex("/south_pole.png", true);
    southPoleTex.wrapS = THREE.ClampToEdgeWrapping;
    southPoleTex.wrapT = THREE.ClampToEdgeWrapping;
    const capAlphaTex = track(makeCapAlphaTexture(512));

    const moonMat = track(
      new THREE.MeshStandardMaterial({
        map: albedo,
        normalMap: normal,
        normalScale: new THREE.Vector2(1.0, 1.0),
        roughness: 0.95,
        metalness: 0.0,
      })
    );
    const moon = new THREE.Mesh(track(new THREE.SphereGeometry(1, 384, 192)), moonMat);
    moonGroup.add(moon);
    const moonSphere = new THREE.Sphere(new THREE.Vector3(), 1);

    // High-res stereographic South Pole Cap (60S..90S) with radial alphaMap feather (80S..65S)
    const capGeo = track(buildSouthPoleCapGeometry(64, 128, 1.0008));
    const capMat = track(
      new THREE.MeshStandardMaterial({
        map: southPoleTex,
        alphaMap: capAlphaTex,
        normalMap: normal,
        normalScale: new THREE.Vector2(1.0, 1.0),
        transparent: true,
        depthWrite: false,
        roughness: 0.95,
        metalness: 0.0,
      })
    );
    capMat.onBeforeCompile = (shader) => {
      shader.uniforms.uGlobalAlbedo = { value: albedo };
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nattribute vec2 aEqUv;\nattribute float aCapAlpha;\nattribute float aLat;\nvarying vec2 vEqUv;\nvarying float vCapAlpha;\nvarying float vCapLat;"
        )
        .replace(
          "#include <uv_vertex>",
          "#include <uv_vertex>\nvNormalMapUv = aEqUv;"
        )
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvEqUv = aEqUv;\nvCapAlpha = aCapAlpha;\nvCapLat = aLat;"
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          "#include <common>\nuniform sampler2D uGlobalAlbedo;\nvarying vec2 vEqUv;\nvarying float vCapAlpha;\nvarying float vCapLat;"
        )
        .replace(
          "#include <map_fragment>",
          `#include <map_fragment>
          vec3 eqAlbedo = texture2D(uGlobalAlbedo, vEqUv).rgb;
          float poleInner = smoothstep(-75.0, -85.0, vCapLat);
          vec3 baseCarrier = mix(eqAlbedo, max(eqAlbedo, vec3(0.175)), poleInner);
          float wacLum = dot(diffuseColor.rgb, vec3(0.3333));
          float contrastFactor = clamp(0.86 + (wacLum - 0.28) * 1.05, 0.18, 1.48);
          vec3 matchedCap = mix(baseCarrier * contrastFactor, diffuseColor.rgb * 0.92, poleInner * 0.55);
          diffuseColor.rgb = mix(eqAlbedo, matchedCap, vCapAlpha);`
        )
        .replace(
          "#include <alphamap_fragment>",
          `#include <alphamap_fragment>
          diffuseColor.a *= vCapAlpha;`
        )
        .replace(
          "#include <normal_fragment_maps>",
          `#include <normal_fragment_maps>
          float normKeep = 1.0 - smoothstep(-76.0, -86.0, vCapLat);
          normal = normalize(mix(nonPerturbedNormal, normal, normKeep));`
        );
    };
    const southPoleCap = new THREE.Mesh(capGeo, capMat);
    southPoleCap.renderOrder = 2;
    moonGroup.add(southPoleCap);

    // ---------- 80°S LOLA Full-Terrain Coverage Boundary Ring (always visible, r = 1.003) ----------
    const covSegs = 256;
    const covPts = [];
    for (let i = 0; i <= covSegs; i++) {
      const lon = -180 + (i / covSegs) * 360;
      covPts.push(vec(-80, lon, 1.003));
    }
    const covRingGeo = track(new THREE.BufferGeometry().setFromPoints(covPts));
    const covGlowMat = track(
      new THREE.LineBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.38,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    const covGlowLine = new THREE.Line(covRingGeo, covGlowMat);
    covGlowLine.renderOrder = 7;
    moonGroup.add(covGlowLine);

    const covRingMat = track(
      new THREE.LineDashedMaterial({
        color: 0x38bdf8,
        dashSize: 0.016,
        gapSize: 0.009,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      })
    );
    const covRingLine = new THREE.Line(covRingGeo, covRingMat);
    covRingLine.computeLineDistances();
    covRingLine.renderOrder = 8;
    moonGroup.add(covRingLine);

    // ---------- Shared marker resources ----------
    const glowTexOrange = track(
      radialTexture([
        [0, "rgba(255,180,110,1)"],
        [0.25, "rgba(255,140,43,0.75)"],
        [1, "rgba(255,140,43,0)"],
      ])
    );
    const glowTexBlue = track(
      radialTexture([
        [0, "rgba(186,230,253,1)"],
        [0.25, "rgba(56,189,248,0.75)"],
        [1, "rgba(56,189,248,0)"],
      ])
    );
    const glowTexGreen = track(
      radialTexture([
        [0, "rgba(167,243,208,1)"],
        [0.28, "rgba(52,211,153,0.8)"],
        [1, "rgba(52,211,153,0)"],
      ])
    );
    const pinCoreGeo = track(new THREE.CircleGeometry(1, 32));
    const ringGeo = track(new THREE.RingGeometry(0.82, 1, 64));

    const makeMarker = (color, glowTex) => {
      const g = new THREE.Group();
      const coreMat = track(
        new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, toneMapped: false })
      );
      const core = new THREE.Mesh(pinCoreGeo, coreMat);
      core.scale.setScalar(0.42);
      const rimMat = track(
        new THREE.MeshBasicMaterial({ color: 0xfff3e6, depthTest: false, transparent: true, toneMapped: false })
      );
      const rim = new THREE.Mesh(ringGeo, rimMat);
      rim.scale.setScalar(0.55);
      const glow = new THREE.Sprite(
        track(
          new THREE.SpriteMaterial({
            map: glowTex,
            blending: THREE.AdditiveBlending,
            depthTest: false,
            depthWrite: false,
            transparent: true,
            toneMapped: false,
          })
        )
      );
      glow.scale.setScalar(2.6);
      const pulseMat = track(
        new THREE.MeshBasicMaterial({
          color,
          depthTest: false,
          transparent: true,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
          side: THREE.DoubleSide,
        })
      );
      const pulse = new THREE.Mesh(ringGeo, pulseMat);
      pulse.visible = false;
      g.add(glow, rim, core, pulse);
      g.renderOrder = 20;
      g.traverse((o) => (o.renderOrder = 20));
      return { group: g, pulse, pulseMat };
    };

    const pins = CURATED_SITES.map((site, i) => {
      const m = makeMarker(ORANGE, glowTexOrange);
      const normalV = vec(site.lat, site.lon);
      m.group.position.copy(normalV).multiplyScalar(1.0022);
      m.group.quaternion.setFromUnitVectors(Z_AXIS, normalV);
      moonGroup.add(m.group);
      return { site, ...m, normal: normalV, index: i, screen: new THREE.Vector2(), onScreen: false };
    });

    const craters = CRATER_LABELS.map((c, i) => ({
      ...c,
      index: i,
      localPos: vec(c.lat, c.lon, 1.0022),
    }));

    const customMarker = makeMarker(SKY_BLUE, glowTexBlue);
    customMarker.group.visible = false;
    moonGroup.add(customMarker.group);

    // Pre-allocated pool of green #34d399 markers for /nearby better spots
    const nearbyPool = Array.from({ length: 6 }, () => {
      const m = makeMarker(0x34d399, glowTexGreen);
      m.group.visible = false;
      m.group.renderOrder = 22;
      moonGroup.add(m.group);
      return { ...m, spot: null, screen: new THREE.Vector2(), onScreen: false };
    });

    // ---------- Hover target ring ----------
    const hover = new THREE.Group();
    const hoverMat = track(
      new THREE.MeshBasicMaterial({
        color: CYAN,
        transparent: true,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        side: THREE.DoubleSide,
      })
    );
    const hoverRing = new THREE.Mesh(ringGeo, hoverMat);
    const tickGeo = track(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(1.25, 0, 0), new THREE.Vector3(1.75, 0, 0),
        new THREE.Vector3(-1.25, 0, 0), new THREE.Vector3(-1.75, 0, 0),
        new THREE.Vector3(0, 1.25, 0), new THREE.Vector3(0, 1.75, 0),
        new THREE.Vector3(0, -1.25, 0), new THREE.Vector3(0, -1.75, 0),
      ])
    );
    const tickMat = track(
      new THREE.LineBasicMaterial({ color: CYAN, transparent: true, depthTest: false, toneMapped: false })
    );
    const ticks = new THREE.LineSegments(tickGeo, tickMat);
    const dot = new THREE.Mesh(pinCoreGeo, hoverMat);
    dot.scale.setScalar(0.12);
    hover.add(hoverRing, ticks, dot);
    hover.traverse((o) => (o.renderOrder = 25));
    hover.visible = false;
    moonGroup.add(hover);

    // ---------- Interaction state ----------
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const mousePx = new THREE.Vector2();
    let pointerInside = false;
    let hoverDirty = false;
    let hoverHit = null; // {lat, lon, point}
    let hoveredPin = null;
    let downPos = null;
    let tween = null;
    let highlight = false;

    const setReadout = (lat, lon, hint) => {
      if (readoutLatRef.current) readoutLatRef.current.textContent = lat == null ? "—" : `${lat.toFixed(2)}°`;
      if (readoutLonRef.current) readoutLonRef.current.textContent = lon == null ? "—" : `${lon.toFixed(2)}°`;
      if (readoutHintRef.current) {
        readoutHintRef.current.textContent = hint || "";
        readoutHintRef.current.style.display = hint ? "inline" : "none";
      }
    };

    const el = renderer.domElement;
    const cancelTween = () => {
      if (tween) {
        tween = null;
        controls.enableDamping = true;
      }
    };
    const onPointerMove = (e) => {
      const rect = el.getBoundingClientRect();
      mousePx.set(e.clientX - rect.left, e.clientY - rect.top);
      ndc.set((mousePx.x / rect.width) * 2 - 1, -(mousePx.y / rect.height) * 2 + 1);
      pointerInside = true;
      hoverDirty = true;
    };
    const onPointerLeave = () => {
      pointerInside = false;
      hoverDirty = true;
    };
    const onPointerDown = (e) => {
      cancelTween();
      downPos = { x: e.clientX, y: e.clientY, button: e.button };
    };
    const onWheel = () => {
      cancelTween();
    };
    const onPointerUp = (e) => {
      if (!downPos || downPos.button !== 0) return;
      const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
      downPos = null;
      if (moved > 5) return;
      onPointerMove(e);
      updateHover();
      if (hoveredPin?.spot) {
        const site = makeSite({ lat: hoveredPin.spot.lat, lon: hoveredPin.spot.lon });
        callbacksRef.current.onSelectSite(site);
        api.flyTo(site.lat, site.lon, { pinSwitch: true });
      } else if (hoveredPin?.site) {
        const site = makeSite({ lat: hoveredPin.site.lat, lon: hoveredPin.site.lon, curated: hoveredPin.site });
        callbacksRef.current.onSelectSite(site);
        api.flyTo(site.lat, site.lon, { pinSwitch: true });
      } else if (hoverHit) {
        const site = makeSite({ lat: hoverHit.lat, lon: hoverHit.lon });
        callbacksRef.current.onSelectSite(site);
        if (highlight || camera.position.length() < 2.25) {
          api.flyTo(site.lat, site.lon, { pinSwitch: true });
        }
      }
    };
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerleave", onPointerLeave);
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("wheel", onWheel, { passive: true });

    controls.addEventListener("start", cancelTween);

    // ---------- Helpers ----------
    const tmpV = new THREE.Vector3();
    const tmpWorld = new THREE.Vector3();
    const qStep = new THREE.Quaternion();
    const camDist = () => camera.position.length();
    const worldPerPixel = (d) =>
      (2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / Math.max(1, el.clientHeight);

    const isFacing = (p) => p.dot(camera.position) > p.lengthSq() * 1.0005;

    function updateHover() {
      hoverDirty = false;
      hoveredPin = null;
      hoverHit = null;
      if (!pointerInside) {
        hover.visible = false;
        el.style.cursor = "grab";
        setReadout(null, null, "");
        return;
      }
      // Pins: screen-space proximity test (check nearby candidates first, then curated pins)
      let best = 14;
      for (const n of nearbyPool) {
        if (!n.spot || !n.onScreen) continue;
        const d = n.screen.distanceTo(mousePx);
        if (d < best) {
          best = d;
          hoveredPin = n;
        }
      }
      for (const pin of pins) {
        if (!pin.onScreen) continue;
        const d = pin.screen.distanceTo(mousePx);
        if (d < best) {
          best = d;
          hoveredPin = pin;
        }
      }
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.ray.intersectSphere(moonSphere, tmpV);
      if (hit) {
        moonGroup.updateMatrixWorld();
        const hitLocal = moonGroup.worldToLocal(hit.clone()).normalize();
        const { lat, lon } = unitToLatLon(hitLocal.x, hitLocal.y, hitLocal.z);
        hoverHit = { lat, lon, point: hitLocal };
        hover.visible = !hoveredPin;
        hover.position.copy(hitLocal).multiplyScalar(1.002);
        hover.quaternion.setFromUnitVectors(Z_AXIS, hitLocal);
        const hint = hoveredPin?.spot
          ? `Better spot (${hoveredPin.spot.distance_m} m)`
          : hoveredPin?.site
            ? hoveredPin.site.name
            : lat <= -80.0
              ? "80°S+ LOLA Full Metrics"
              : "Outside 80°S (Flat Horizon)";
        setReadout(lat, lon, hint);
      } else {
        hover.visible = false;
        setReadout(null, null, "");
      }
      el.style.cursor = hoveredPin ? "pointer" : hit ? "crosshair" : "grab";
    }

    /**
     * Smoothly slerp camera.position around the Moon and lerp controls.target
     * using cubic ease-out (~600 ms for pin switches), avoiding any pole gimbal twist.
     */
    function startCameraGlide(toCamPos, toTarget = new THREE.Vector3(0, 0, 0), duration = 600, ease = easeOutCubic, onDone) {
      controls.enableDamping = false;
      controls.update();
      const fromPos = camera.position.clone();
      const rFrom = Math.max(MIN_DIST, fromPos.length());
      const rTo = Math.max(MIN_DIST, toCamPos.length());
      const uFrom = fromPos.divideScalar(rFrom);
      const uTo = toCamPos.clone().divideScalar(rTo);
      const qDelta = new THREE.Quaternion().setFromUnitVectors(uFrom, uTo);
      tween = {
        uFrom,
        qDelta,
        rFrom,
        rTo,
        targetFrom: controls.target.clone(),
        targetTo: toTarget.clone(),
        start: performance.now(),
        duration,
        ease,
        onDone,
      };
    }

    let targetRotY = 0;
    let rotInitialized = false;

    const api = {
      centerSouthPole() {
        highlight = true;
        setPoleMode(true);
        const poleCam = new THREE.Vector3().setFromSphericalCoords(
          POLE_VIEW.r,
          POLE_VIEW.phi,
          POLE_VIEW.theta
        );
        startCameraGlide(poleCam, new THREE.Vector3(0, 0, 0), 900, easeOutCubic);
      },
      resetView() {
        highlight = false;
        setPoleMode(false);
        const homeCam = vec(HOME.lat, HOME.lon, HOME.r);
        startCameraGlide(homeCam, new THREE.Vector3(0, 0, 0), 950, easeOutCubic);
      },
      frameEarth() {
        highlight = false;
        setPoleMode(false);
        moonGroup.updateMatrixWorld();
        const camWorld = vec(-10, -154, 4.8).applyMatrix4(moonGroup.matrixWorld);
        startCameraGlide(camWorld, new THREE.Vector3(0, 0, 0), 950, easeOutCubic);
      },
      zoomBy(f) {
        const offset = camera.position.clone().sub(controls.target);
        const nextDist = THREE.MathUtils.clamp(1 + (offset.length() - 1) * f, MIN_DIST, MAX_DIST);
        const nextCam = controls.target.clone().add(offset.normalize().multiplyScalar(nextDist));
        startCameraGlide(nextCam, controls.target.clone(), 400, easeOutCubic);
      },
      flyTo(lat, lon) {
        moonGroup.updateMatrixWorld();
        const pinWorld = vec(lat, lon, 1.0).applyMatrix4(moonGroup.matrixWorld);
        if (lat <= -80) {
          const isAlreadyPole = highlight || camera.position.length() < 2.25;
          highlight = true;
          setPoleMode(true);
          const targetTo = new THREE.Vector3(
            pinWorld.x * 0.42,
            (pinWorld.y + 1) * 0.25,
            pinWorld.z * 0.42
          );
          if (isAlreadyPole) {
            const curOffset = camera.position.clone().sub(controls.target);
            const curDist = THREE.MathUtils.clamp(curOffset.length(), MIN_DIST, 1.58);
            const nextCam = targetTo.clone().add(curOffset.normalize().multiplyScalar(curDist));
            startCameraGlide(nextCam, targetTo, 600, easeOutCubic);
          } else {
            const poleCam = new THREE.Vector3()
              .setFromSphericalCoords(POLE_VIEW.r, POLE_VIEW.phi, POLE_VIEW.theta)
              .add(targetTo);
            startCameraGlide(poleCam, targetTo, 950, easeOutCubic);
          }
          return;
        }
        const targetTo = pinWorld.clone().multiplyScalar(0.18);
        const camWorld = pinWorld.clone().normalize().multiplyScalar(1.88);
        startCameraGlide(camWorld, targetTo, 650, easeOutCubic);
      },
      syncSelection() {
        const sel = selectedRef.current;
        if (sel && sel.isCustom) {
          const n = vec(sel.lat, sel.lon);
          customMarker.group.position.copy(n).multiplyScalar(1.0022);
          customMarker.group.quaternion.setFromUnitVectors(Z_AXIS, n);
          customMarker.group.visible = true;
        } else {
          customMarker.group.visible = false;
        }
        hoverDirty = true;
      },
      syncNearby() {
        const list = nearbyRef.current || [];
        nearbyPool.forEach((m, i) => {
          const sp = list[i] || null;
          m.spot = sp;
          if (sp) {
            const n = vec(sp.lat, sp.lon);
            m.group.position.copy(n).multiplyScalar(1.0022);
            m.group.quaternion.setFromUnitVectors(Z_AXIS, n);
            m.group.visible = true;
          } else {
            m.group.visible = false;
            m.onScreen = false;
          }
        });
        hoverDirty = true;
      },
      syncPinsVisibility() {
        hoverDirty = true;
      },
      updateSun(nextSunState) {
        const bodySunDir = computeSunDirection(nextSunState);
        const bodySunLonRad = Math.atan2(-bodySunDir.z, bodySunDir.x);
        targetRotY = baseSunLonRad - bodySunLonRad;
        if (!rotInitialized) {
          moonGroup.rotation.y = targetRotY;
          rotInitialized = true;
        }

        // Subtle ±7° lunar libration for tidally-locked Earth in Moon body frame
        const tMs = nextSunState?.atUtc ? Date.parse(nextSunState.atUtc) : NaN;
        const dDays = Number.isFinite(tMs)
          ? (tMs - REF_EPOCH_MS) / 86400000
          : (nextSunState?.offsetH || 0) / 24;
        const libLon = EARTH_POS.lon + 6.5 * Math.sin((dDays / 27.55455) * Math.PI * 2);
        const libLat = EARTH_POS.lat + 6.7 * Math.sin((dDays / DRACONIC_MONTH_DAYS) * Math.PI * 2);
        const nextEarthDir = vec(libLat, libLon).normalize();
        earthGroup.position.copy(nextEarthDir).multiplyScalar(EARTH_POS.dist);
        earthshineLight.position.copy(nextEarthDir).multiplyScalar(10);
        dteGeo.setFromPoints([
          nextEarthDir.clone().multiplyScalar(1.005),
          nextEarthDir.clone().multiplyScalar(EARTH_POS.dist - 0.44),
        ]);
        dteLine.computeLineDistances();

        moonGroup.updateMatrixWorld();
        hoverDirty = true;
      },
    };
    apiRef.current = api;
    api.syncSelection();
    api.syncNearby();
    api.updateSun(sunStateRef.current);

    // ---------- Resize ----------
    const ro = new ResizeObserver(() => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    ro.observe(mount);

    // ---------- Loop ----------
    let raf = 0;
    let frames = 0;
    let fpsT = performance.now();
    let prevTime = performance.now();
    const clock = new THREE.Clock();
    const lastCam = new THREE.Vector3();
    const tmpV2 = new THREE.Vector3();
    const tmpV3 = new THREE.Vector3();

    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!activeRef.current) return;
      const t = clock.getElapsedTime();
      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0.001, (now - prevTime) / 1000));
      prevTime = now;

      // Smoothly lerp moonGroup.rotation.y toward targetRotY (never snaps)
      let dRot = targetRotY - moonGroup.rotation.y;
      dRot = ((dRot + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
      if (Math.abs(dRot) > 1e-5) {
        moonGroup.rotation.y += dRot * Math.min(1, dt * 14);
        hoverDirty = true;
      } else if (dRot !== 0) {
        moonGroup.rotation.y = targetRotY;
      }

      if (tween) {
        const k = Math.min(1, (now - tween.start) / tween.duration);
        const e = (tween.ease || easeOutCubic)(k);
        controls.target.lerpVectors(tween.targetFrom, tween.targetTo, e);
        qStep.slerpQuaternions(IDENTITY_QUAT, tween.qDelta, e);
        const r = THREE.MathUtils.lerp(tween.rFrom, tween.rTo, e);
        camera.position.copy(tween.uFrom).applyQuaternion(qStep).multiplyScalar(r);
        controls.update();
        if (k >= 1) {
          const done = tween.onDone;
          tween = null;
          controls.enableDamping = true;
          controls.update();
          done?.();
        }
      } else {
        controls.update();
      }

      const d = camDist();
      controls.rotateSpeed = THREE.MathUtils.clamp(0.12 + (d - 1) * 0.16, 0.12, 0.6);
      milkyWay.position.copy(camera.position);
      stars.position.copy(camera.position);
      stars.material.uniforms.uTime.value = t;
      moonGroup.updateMatrixWorld();

      // Screen-constant marker sizing + horizon culling
      const w = el.clientWidth;
      const h = el.clientHeight;
      const sel = selectedRef.current;
      const labelsOn = highlight && d < 2.4;
      const pinsEnabled = showPinsRef.current;
      for (const pin of pins) {
        const isSel = sel && !sel.isCustom && sel.id === pin.site.id;
        const allowPin = pinsEnabled || isSel;
        tmpWorld.copy(pin.group.position).applyMatrix4(moonGroup.matrixWorld);
        const facing = allowPin && isFacing(tmpWorld);
        pin.group.visible = facing;
        if (facing) {
          const dist = camera.position.distanceTo(tmpWorld);
          const s = worldPerPixel(dist) * 11;
          pin.group.scale.setScalar(s);
          const pulsing = isSel;
          pin.pulse.visible = pulsing;
          if (pulsing) {
            const ph = (t * 0.65) % 1;
            pin.pulse.scale.setScalar(0.8 + ph * 2.6);
            pin.pulseMat.opacity = (1 - ph) * 0.95;
          }
          tmpV.copy(tmpWorld).project(camera);
          pin.screen.set((tmpV.x * 0.5 + 0.5) * w, (-tmpV.y * 0.5 + 0.5) * h);
          pin.onScreen = tmpV.z < 1;
        } else {
          pin.onScreen = false;
        }
        const label = labelRefs.current[pin.index];
        if (label) {
          const show = labelsOn && pin.onScreen;
          label.style.opacity = show ? "1" : "0";
          if (show) label.style.transform = `translate3d(${pin.screen.x + 12}px, ${pin.screen.y - 9}px, 0)`;
        }
      }
      for (const crater of craters) {
        const elLabel = craterLabelRefs.current[crater.index];
        if (!elLabel) continue;
        const maxDist = crater.minZoom <= -11 ? 2.25 : crater.minZoom <= -9.75 ? 1.88 : 1.7;
        if (!pinsEnabled || d >= maxDist) {
          elLabel.style.opacity = "0";
          continue;
        }
        tmpWorld.copy(crater.localPos).applyMatrix4(moonGroup.matrixWorld);
        if (!isFacing(tmpWorld)) {
          elLabel.style.opacity = "0";
          continue;
        }
        tmpV.copy(tmpWorld).project(camera);
        const inView = tmpV.z > -1 && tmpV.z < 1 && Math.abs(tmpV.x) <= 0.96 && Math.abs(tmpV.y) <= 0.94;
        elLabel.style.opacity = inView ? "1" : "0";
        if (inView) {
          const sx = (tmpV.x * 0.5 + 0.5) * w;
          const sy = (-tmpV.y * 0.5 + 0.5) * h;
          elLabel.style.transform = `translate3d(${sx}px, ${sy}px, 0) translate(-50%, -50%)`;
        }
      }
      if (customMarker.group.visible || (sel && sel.isCustom)) {
        tmpWorld.copy(customMarker.group.position).applyMatrix4(moonGroup.matrixWorld);
        const facing = isFacing(tmpWorld);
        customMarker.group.children.forEach((c) => (c.visible = facing));
        customMarker.pulse.visible = facing;
        customMarker.group.scale.setScalar(worldPerPixel(camera.position.distanceTo(tmpWorld)) * 11);
        const ph = (t * 0.7) % 1;
        customMarker.pulse.scale.setScalar(0.8 + ph * 2.6);
        customMarker.pulseMat.opacity = (1 - ph) * 0.95;
      }

      for (let i = 0; i < nearbyPool.length; i++) {
        const nm = nearbyPool[i];
        if (!nm.spot) continue;
        tmpWorld.copy(nm.group.position).applyMatrix4(moonGroup.matrixWorld);
        const facing = isFacing(tmpWorld);
        nm.group.visible = facing;
        if (facing) {
          nm.group.scale.setScalar(worldPerPixel(camera.position.distanceTo(tmpWorld)) * 9.5);
          nm.pulse.visible = true;
          const ph = ((t * 0.8 + i * 0.25) % 1);
          nm.pulse.scale.setScalar(0.8 + ph * 2.2);
          nm.pulseMat.opacity = (1 - ph) * 0.9;
          tmpV.copy(tmpWorld).project(camera);
          nm.screen.set((tmpV.x * 0.5 + 0.5) * w, (-tmpV.y * 0.5 + 0.5) * h);
          nm.onScreen = tmpV.z < 1;
        } else {
          nm.onScreen = false;
        }
      }

      if (hoverDirty || !lastCam.equals(camera.position)) {
        lastCam.copy(camera.position);
        updateHover();
      }
      if (hover.visible) {
        tmpWorld.copy(hover.position).applyMatrix4(moonGroup.matrixWorld);
        hover.scale.setScalar(worldPerPixel(camera.position.distanceTo(tmpWorld)) * 15);
        hoverMat.opacity = 0.75 + 0.25 * Math.sin(t * 5);
        tickMat.opacity = hoverMat.opacity * 0.8;
      }

      earthGroup.getWorldPosition(earthWorldPos);
      if (earthArrowRef.current) {
        tmpV.copy(earthWorldPos).applyMatrix4(camera.matrixWorldInverse);
        const angleDeg = (Math.atan2(tmpV.x, tmpV.y) * 180) / Math.PI;
        earthArrowRef.current.style.transform = `rotate(${angleDeg.toFixed(1)}deg)`;
      }

      const projectTag = (worldPos, labelEl, offsetY = -18) => {
        if (!labelEl) return;
        const toObj = tmpV2.copy(worldPos).sub(camera.position);
        const dist = toObj.length();
        const dir = toObj.divideScalar(dist || 1);
        const tClosest = -camera.position.dot(dir);
        const occluded =
          tClosest > 0 &&
          tClosest < dist &&
          tmpV3.copy(camera.position).addScaledVector(dir, tClosest).lengthSq() < 1.0;

        tmpV.copy(worldPos).project(camera);
        const inView =
          !occluded &&
          tmpV.z > -1 &&
          tmpV.z < 1 &&
          Math.abs(tmpV.x) <= 0.94 &&
          Math.abs(tmpV.y) <= 0.9;
        labelEl.style.opacity = inView ? "1" : "0";
        if (inView) {
          const sx = (tmpV.x * 0.5 + 0.5) * w;
          const sy = (-tmpV.y * 0.5 + 0.5) * h + offsetY;
          labelEl.style.transform = `translate3d(${sx}px, ${sy}px, 0) translate(-50%, -100%)`;
        }
      };
      projectTag(earthWorldPos, earthLabelRef.current, -14);
      projectTag(sunGroup.position, sunLabelRef.current, -22);
      if (coverageLabelRef.current) {
        const candidateLons = [140, 12, -35, -125, 65];
        let placed = false;
        for (const cLon of candidateLons) {
          const covAnchor = vec(-80, cLon, 1.0035);
          if (!isFacing(covAnchor)) continue;
          tmpV.copy(covAnchor).project(camera);
          if (tmpV.z > -1 && tmpV.z < 1 && tmpV.x >= -0.82 && tmpV.x <= 0.28 && Math.abs(tmpV.y) <= 0.86) {
            const sx = (tmpV.x * 0.5 + 0.5) * w;
            const sy = (-tmpV.y * 0.5 + 0.5) * h - 6;
            coverageLabelRef.current.style.opacity = "0.92";
            coverageLabelRef.current.style.transform = `translate3d(${sx}px, ${sy}px, 0) translate(-50%, -100%)`;
            placed = true;
            break;
          }
        }
        if (!placed) {
          coverageLabelRef.current.style.opacity = "0";
        }
      }

      renderer.render(scene, camera);

      frames++;
      if (now - fpsT >= 500) {
        if (fpsRef.current) fpsRef.current.textContent = `${Math.round((frames * 1000) / (now - fpsT))} FPS`;
        frames = 0;
        fpsT = now;
      }
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerleave", onPointerLeave);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("wheel", onWheel);
      controls.dispose();
      disposables.forEach((d) => d.dispose?.());
      renderer.dispose();
      renderer.forceContextLoss();
      if (el.parentNode === mount) mount.removeChild(el);
      apiRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!focusRequest || !apiRef.current) return;
    apiRef.current.flyTo(focusRequest.lat, focusRequest.lon);
  }, [focusRequest]);

  return (
    <div style={{ position: "absolute", inset: 0, background: "#000" }}>
      <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />

      {/* Projected site labels (shown in South Pole mode) & celestial tags */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
        {CRATER_LABELS.map((c, i) => (
          <div
            key={c.name}
            ref={(n) => {
              craterLabelRefs.current[i] = n;
            }}
            className="globe-crater-label"
          >
            {c.name}
          </div>
        ))}
        {CURATED_SITES.map((s, i) => (
          <div key={s.id} ref={(n) => {
              labelRefs.current[i] = n;
            }} className="globe-site-label">
            {s.name}
          </div>
        ))}
        <div ref={earthLabelRef} className="celestial-tag celestial-tag-earth">
          EARTH · DTE
        </div>
        <div ref={sunLabelRef} className="celestial-tag celestial-tag-sun">
          SUN
        </div>
        <div ref={coverageLabelRef} className="coverage-ring-label">
          80°S · LOLA TERRAIN COVERAGE
        </div>
      </div>

      {!loaded && (
        <div className="globe-loading">
          <div className="spinner" />
          Loading lunar textures…
        </div>
      )}

      <div className="hud-glass hud-title">
        <div className="hud-dot" />
        <div>
          <div className="hud-title-main">RIMLIGHT · 3D MOON GLOBE</div>
          <div className="hud-title-sub">
            LRO WAC + LOLA relief · Sun {globeMeta.sunElevationAtSouthPoleDeg}° above the South Pole horizon ·{" "}
            <span ref={fpsRef} className="mono">— FPS</span>
          </div>
        </div>
      </div>

      {/* Top-Right Earth Direction (DTE) Compass Pill */}
      <button
        type="button"
        className="hud-glass earth-dte-pill"
        onClick={() => apiRef.current?.frameEarth()}
        title="Tidally locked Earth hovers near (0°N, 0°E) ±7° libration. Click to frame Earth DTE vector."
      >
        <span className="earth-dte-dot" />
        <svg
          ref={earthArrowRef}
          width="14"
          height="14"
          viewBox="0 0 16 16"
          style={{ transition: "transform 0.06s linear", flexShrink: 0 }}
          aria-hidden="true"
        >
          <path d="M8 1.5L12.5 13L8 10.2L3.5 13Z" fill="#4da6ff" />
        </svg>
        <div style={{ textAlign: "left" }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "#e0f2fe" }}>
            EARTH (DTE)
          </div>
          <div className="mono" style={{ fontSize: 10, color: "rgba(186,230,253,0.72)" }}>
            ~0°N, 0°E (±7° lib)
          </div>
        </div>
      </button>

      <div className="hud-glass hud-bottom-left">
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button className="hud-btn" onClick={() => apiRef.current?.zoomBy(0.7)} title="Zoom in" aria-label="Zoom in">
            <Plus size={16} />
          </button>
          <button className="hud-btn" onClick={() => apiRef.current?.zoomBy(1.4)} title="Zoom out" aria-label="Zoom out">
            <Minus size={16} />
          </button>
          <button className="hud-btn" onClick={() => apiRef.current?.resetView()} title="Reset view" aria-label="Reset view">
            <Home size={15} />
          </button>
        </div>
        <div className="hud-divider" />
        <button
          className={`pill-btn ${poleMode ? "pill-btn-active" : ""}`}
          onClick={() => apiRef.current?.centerSouthPole()}
        >
          <LocateFixed size={14} />
          Center on South Pole
        </button>
        <button className="pill-btn" onClick={() => onInspect2D(null)}>
          <MapIcon size={14} />
          Inspect South Pole (2D)
        </button>
      </div>

      <div className="hud-glass hud-readout mono">
        <Crosshair size={14} color="#7dd3fc" />
        <span ref={readoutHintRef} className="readout-hint" style={{ display: "none" }} />
        <span className="readout-key">LAT</span>
        <span ref={readoutLatRef} className="readout-val" style={{ minWidth: 66 }}>—</span>
        <span style={{ color: "rgba(255,255,255,0.18)" }}>|</span>
        <span className="readout-key">LON</span>
        <span ref={readoutLonRef} className="readout-val" style={{ minWidth: 72 }}>—</span>
      </div>
    </div>
  );
}
