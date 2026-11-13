import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Crosshair, Home, LocateFixed, Map as MapIcon, Minus, Plus } from "lucide-react";
import globeMeta from "../data/globeMeta.json";
import { CURATED_SITES } from "../data/lunarSites";
import { latLonToUnit, makeSite, unitToLatLon } from "../lib/geo";

const ORANGE = new THREE.Color("#ff8c2b");
const CYAN = new THREE.Color("#7dd3fc");
const SKY_BLUE = new THREE.Color("#38bdf8");

const MIN_DIST = 1.12;
const MAX_DIST = 8;
const HOME = { r: 3.4, lat: -32, lon: 12 };
const POLE_VIEW = { r: 1.32, phi: Math.PI - 0.0025, theta: Math.PI / 2 };
const EARTH_POS = { lat: 1.8, lon: -2.2, dist: 26 };

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function vec(lat, lon, r = 1) {
  const [x, y, z] = latLonToUnit(lat, lon);
  return new THREE.Vector3(x * r, y * r, z * r);
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

function buildStarfield(count = 7000, radius = 200) {
  const pos = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const phase = new Float32Array(count);
  const color = new Float32Array(count * 3);
  const tints = [
    [0.75, 0.83, 1.0],
    [0.9, 0.93, 1.0],
    [1.0, 1.0, 1.0],
    [1.0, 0.95, 0.85],
    [1.0, 0.86, 0.7],
  ];
  for (let i = 0; i < count; i++) {
    const u = Math.random() * 2 - 1;
    const t = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    pos.set([s * Math.cos(t) * radius, u * radius, s * Math.sin(t) * radius], i * 3);
    size[i] = 0.7 + Math.pow(Math.random(), 7) * 3.6;
    phase[i] = Math.random();
    const tint = tints[Math.floor(Math.random() * tints.length)];
    const b = 0.45 + Math.random() * 0.55;
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

export default function MoonGlobe3D({ active, selectedSite, onSelectSite, onInspect2D, focusRequest }) {
  const mountRef = useRef(null);
  const apiRef = useRef(null);
  const activeRef = useRef(active);
  const selectedRef = useRef(selectedSite);
  const callbacksRef = useRef({ onSelectSite, onInspect2D });
  callbacksRef.current = { onSelectSite, onInspect2D };

  const readoutLatRef = useRef(null);
  const readoutLonRef = useRef(null);
  const readoutHintRef = useRef(null);
  const fpsRef = useRef(null);
  const earthArrowRef = useRef(null);
  const earthLabelRef = useRef(null);
  const sunLabelRef = useRef(null);
  const labelRefs = useRef([]);

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

    // ---------- Starfield ----------
    const stars = buildStarfield();
    track(stars.geometry);
    track(stars.material);
    stars.material.uniforms.uPixelRatio.value = renderer.getPixelRatio();
    scene.add(stars);

    // ---------- Sun + corona + lights ----------
    const sunDir = vec(globeMeta.sunLat, globeMeta.sunLon).normalize();
    const sunLight = new THREE.DirectionalLight(0xfff3e2, 3.4);
    sunLight.position.copy(sunDir).multiplyScalar(10);
    scene.add(sunLight);
    scene.add(new THREE.HemisphereLight(0x8ea6ff, 0x0a0a12, 0.16));
    scene.add(new THREE.AmbientLight(0xffffff, 0.025));

    const sunGroup = new THREE.Group();
    sunGroup.position.copy(sunDir).multiplyScalar(90);
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

    // ---------- Tidally locked Earth orb + DTE line-of-sight vector ----------
    const earthDir = vec(EARTH_POS.lat, EARTH_POS.lon).normalize();
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
    scene.add(earthGroup);

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
    scene.add(dteLine);

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
    const shadow = loadTex(globeMeta.textures.shadow, false);

    const moonMat = track(
      new THREE.MeshStandardMaterial({
        map: albedo,
        normalMap: normal,
        normalScale: new THREE.Vector2(1, 1),
        roughness: 1,
        metalness: 0,
      })
    );
    moonMat.onBeforeCompile = (shader) => {
      shader.uniforms.uSunShadow = { value: shadow };
      shader.uniforms.uRimColor = { value: new THREE.Color(0x6f8cff) };
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          "#include <common>\nuniform sampler2D uSunShadow;\nuniform vec3 uRimColor;"
        )
        .replace(
          "#include <lights_fragment_end>",
          `#include <lights_fragment_end>
          float sunVis = texture2D(uSunShadow, vMapUv).r;
          reflectedLight.directDiffuse *= sunVis;
          reflectedLight.directSpecular *= sunVis;`
        )
        .replace(
          "#include <opaque_fragment>",
          `float rim = 1.0 - saturate(dot(normalize(vNormal), normalize(vViewPosition)));
          outgoingLight += uRimColor * pow(rim, 3.0) * 0.07;
          #include <opaque_fragment>`
        );
    };
    const moon = new THREE.Mesh(track(new THREE.SphereGeometry(1, 384, 192)), moonMat);
    scene.add(moon);
    const moonSphere = new THREE.Sphere(new THREE.Vector3(), 1);

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
      m.group.position.copy(normalV).multiplyScalar(1.0008);
      m.group.lookAt(normalV.clone().multiplyScalar(2));
      scene.add(m.group);
      return { site, ...m, normal: normalV, index: i, screen: new THREE.Vector2(), onScreen: false };
    });

    const customMarker = makeMarker(SKY_BLUE, glowTexBlue);
    customMarker.group.visible = false;
    scene.add(customMarker.group);

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
    scene.add(hover);

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
      downPos = { x: e.clientX, y: e.clientY, button: e.button };
    };
    const onPointerUp = (e) => {
      if (!downPos || downPos.button !== 0) return;
      const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
      downPos = null;
      if (moved > 5) return;
      onPointerMove(e);
      updateHover();
      if (hoveredPin) {
        const site = makeSite({ lat: hoveredPin.site.lat, lon: hoveredPin.site.lon, curated: hoveredPin.site });
        callbacksRef.current.onInspect2D(site);
      } else if (hoverHit) {
        callbacksRef.current.onSelectSite(makeSite({ lat: hoverHit.lat, lon: hoverHit.lon }));
      }
    };
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerleave", onPointerLeave);
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointerup", onPointerUp);

    controls.addEventListener("start", () => {
      tween = null;
    });

    // ---------- Helpers ----------
    const tmpV = new THREE.Vector3();
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
      // Pins: screen-space proximity test
      let best = 14;
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
        const { lat, lon } = unitToLatLon(hit.x, hit.y, hit.z);
        hoverHit = { lat, lon, point: hit.clone() };
        hover.visible = !hoveredPin;
        hover.position.copy(hit).multiplyScalar(1.0006);
        hover.lookAt(tmpV.copy(hit).multiplyScalar(2));
        setReadout(lat, lon, hoveredPin ? hoveredPin.site.name : "");
      } else {
        hover.visible = false;
        setReadout(null, null, "");
      }
      el.style.cursor = hoveredPin ? "pointer" : hit ? "crosshair" : "grab";
    }

    const currentSpherical = () => new THREE.Spherical().setFromVector3(camera.position);

    function startTween(to, duration = 1600, onDone) {
      // Flush any residual damping so the tween starts from rest.
      controls.enableDamping = false;
      controls.update();
      controls.enableDamping = true;
      const from = currentSpherical();
      let dTheta = to.theta - from.theta;
      dTheta = ((dTheta + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
      tween = {
        from: { r: from.radius, phi: from.phi, theta: from.theta },
        to: { r: to.r, phi: to.phi, theta: from.theta + dTheta },
        start: performance.now(),
        duration,
        onDone,
      };
    }

    function sphericalForLatLon(lat, lon, r) {
      const s = new THREE.Spherical().setFromVector3(vec(lat, lon));
      return { r, phi: Math.min(s.phi, Math.PI - 0.0025), theta: s.theta };
    }

    const api = {
      centerSouthPole() {
        highlight = true;
        setPoleMode(true);
        startTween(POLE_VIEW, 1800);
      },
      resetView() {
        highlight = false;
        setPoleMode(false);
        startTween(sphericalForLatLon(HOME.lat, HOME.lon, HOME.r), 1500);
      },
      frameEarth() {
        highlight = false;
        setPoleMode(false);
        startTween(sphericalForLatLon(-10, -154, 4.8), 1500);
      },
      zoomBy(f) {
        const s = currentSpherical();
        const r = THREE.MathUtils.clamp(1 + (s.radius - 1) * f, MIN_DIST, MAX_DIST);
        startTween({ r, phi: s.phi, theta: s.theta }, 450);
      },
      flyTo(lat, lon) {
        if (lat <= -80) {
          api.centerSouthPole();
          return;
        }
        startTween(sphericalForLatLon(lat, lon, 1.9), 1600);
      },
      syncSelection() {
        const sel = selectedRef.current;
        if (sel && sel.isCustom) {
          const n = vec(sel.lat, sel.lon);
          customMarker.group.position.copy(n).multiplyScalar(1.0008);
          customMarker.group.lookAt(n.clone().multiplyScalar(2));
          customMarker.group.visible = true;
        } else {
          customMarker.group.visible = false;
        }
      },
    };
    apiRef.current = api;
    api.syncSelection();

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
    const clock = new THREE.Clock();
    const lastCam = new THREE.Vector3();
    const tmpV2 = new THREE.Vector3();
    const tmpV3 = new THREE.Vector3();

    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!activeRef.current) return;
      const t = clock.getElapsedTime();
      const now = performance.now();

      if (tween) {
        const k = Math.min(1, (now - tween.start) / tween.duration);
        const e = easeInOutCubic(k);
        const s = new THREE.Spherical(
          THREE.MathUtils.lerp(tween.from.r, tween.to.r, e),
          THREE.MathUtils.lerp(tween.from.phi, tween.to.phi, e),
          THREE.MathUtils.lerp(tween.from.theta, tween.to.theta, e)
        );
        camera.position.setFromSpherical(s);
        camera.lookAt(0, 0, 0);
        if (k >= 1) {
          const done = tween.onDone;
          tween = null;
          controls.update();
          done?.();
        }
      } else {
        controls.update();
      }

      const d = camDist();
      controls.rotateSpeed = THREE.MathUtils.clamp(0.12 + (d - 1) * 0.16, 0.12, 0.6);
      stars.position.copy(camera.position);
      stars.material.uniforms.uTime.value = t;

      // Screen-constant marker sizing + horizon culling
      const w = el.clientWidth;
      const h = el.clientHeight;
      const sel = selectedRef.current;
      const labelsOn = highlight && d < 2.4;
      for (const pin of pins) {
        const facing = isFacing(pin.group.position);
        pin.group.visible = facing;
        const dist = camera.position.distanceTo(pin.group.position);
        const s = worldPerPixel(dist) * 11;
        pin.group.scale.setScalar(s);
        const isSel = sel && !sel.isCustom && sel.id === pin.site.id;
        const pulsing = facing && (isSel || highlight);
        pin.pulse.visible = pulsing;
        if (pulsing) {
          const ph = ((t * 0.65 + pin.index * 0.17) % 1);
          pin.pulse.scale.setScalar(0.8 + ph * (isSel ? 2.6 : 1.8));
          pin.pulseMat.opacity = (1 - ph) * (isSel ? 0.95 : 0.6);
        }
        tmpV.copy(pin.group.position).project(camera);
        pin.screen.set((tmpV.x * 0.5 + 0.5) * w, (-tmpV.y * 0.5 + 0.5) * h);
        pin.onScreen = facing && tmpV.z < 1;
        const label = labelRefs.current[pin.index];
        if (label) {
          const show = labelsOn && pin.onScreen;
          label.style.opacity = show ? "1" : "0";
          if (show) label.style.transform = `translate3d(${pin.screen.x + 12}px, ${pin.screen.y - 9}px, 0)`;
        }
      }
      if (customMarker.group.visible || (sel && sel.isCustom)) {
        const cp = customMarker.group.position;
        const facing = isFacing(cp);
        customMarker.group.children.forEach((c) => (c.visible = facing));
        customMarker.pulse.visible = facing;
        customMarker.group.scale.setScalar(worldPerPixel(camera.position.distanceTo(cp)) * 11);
        const ph = (t * 0.7) % 1;
        customMarker.pulse.scale.setScalar(0.8 + ph * 2.6);
        customMarker.pulseMat.opacity = (1 - ph) * 0.95;
      }

      if (hoverDirty || !lastCam.equals(camera.position)) {
        lastCam.copy(camera.position);
        updateHover();
      }
      if (hover.visible) {
        hover.scale.setScalar(worldPerPixel(camera.position.distanceTo(hover.position)) * 15);
        hoverMat.opacity = 0.75 + 0.25 * Math.sin(t * 5);
        tickMat.opacity = hoverMat.opacity * 0.8;
      }

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
