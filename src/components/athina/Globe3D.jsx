import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const MARKER_RADIUS = 1.01;

const CITIES = [
  { lat: 25.2048, lng: 55.2708, name: 'Dubai' },
  { lat: 51.5074, lng: -0.1278, name: 'London' },
  { lat: 40.7128, lng: -74.006, name: 'New York' },
  { lat: 35.6762, lng: 139.6503, name: 'Tokyo' },
  { lat: 48.8566, lng: 2.3522, name: 'Paris' },
  { lat: -33.8688, lng: 151.2093, name: 'Sydney' },
  { lat: 1.3521, lng: 103.8198, name: 'Singapore' },
  { lat: 55.7558, lng: 37.6173, name: 'Moscow' },
  { lat: 52.52, lng: 13.405, name: 'Berlin' },
  { lat: 19.4326, lng: -99.1332, name: 'Mexico City' },
  { lat: -23.5505, lng: -46.6333, name: 'São Paulo' },
  { lat: 28.6139, lng: 77.209, name: 'New Delhi' },
  { lat: 39.9042, lng: 116.4074, name: 'Beijing' },
  { lat: -1.2921, lng: 36.8219, name: 'Nairobi' },
  { lat: 34.0522, lng: -118.2437, name: 'Los Angeles' },
  { lat: 37.7749, lng: -122.4194, name: 'San Francisco' },
  { lat: 41.9028, lng: 12.4964, name: 'Rome' },
  { lat: 52.374, lng: 4.8897, name: 'Amsterdam' },
  { lat: 59.3293, lng: 18.0686, name: 'Stockholm' },
  { lat: 41.0082, lng: 28.9784, name: 'Istanbul' },
];

const latLngToVector3 = (lat, lng, radius = 1) => {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
};

const vector3ToLatLng = (vec, radius = 1) => {
  const lat = 90 - (Math.acos(Math.max(-1, Math.min(1, vec.y / radius))) * 180 / Math.PI);
  let lng = (Math.atan2(vec.z, -vec.x) * 180 / Math.PI) - 180;
  while (lng < -180) lng += 360;
  while (lng > 180) lng -= 360;
  return { lat, lng };
};

export default function Globe3D({ markers = [], flyTo, onLocationSelect }) {
  const mountRef = useRef(null);
  const globeRef = useRef(null);
  const markersGroupRef = useRef(null);
  const citiesGroupRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const rendererRef = useRef(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const onSelectRef = useRef(onLocationSelect);
  const flyAnimRef = useRef(null);
  const sceneRef = useRef(null);
  const landDotsRef = useRef(null);
  const [hoverInfo, setHoverInfo] = useState(null);

  useEffect(() => { onSelectRef.current = onLocationSelect; }, [onLocationSelect]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth || 400;
    const height = mount.clientHeight || 400;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 0, 3.2);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const RADIUS = 1;

    // Globe sphere
    const globeGeo = new THREE.SphereGeometry(RADIUS, 64, 64);
    const globeMat = new THREE.MeshPhongMaterial({
      color: 0x06080d, shininess: 5,
    });
    const globe = new THREE.Mesh(globeGeo, globeMat);
    scene.add(globe);
    globeRef.current = globe;
    sceneRef.current = scene;

    // Wireframe
    const wireGeo = new THREE.SphereGeometry(RADIUS * 1.001, 36, 18);
    scene.add(new THREE.Mesh(wireGeo, new THREE.MeshBasicMaterial({
      color: 0x004060, wireframe: true, transparent: true, opacity: 0.15,
    })));

    // Land dots loaded in separate useEffect (dotted blue continents)

    // Atmosphere
    const atmGeo = new THREE.SphereGeometry(RADIUS * 1.15, 64, 64);
    scene.add(new THREE.Mesh(atmGeo, new THREE.ShaderMaterial({
      vertexShader: `varying vec3 vNormal; void main() { vNormal = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying vec3 vNormal; void main() { float intensity = pow(0.65 - dot(vNormal, vec3(0, 0, 1.0)), 2.5); gl_FragColor = vec4(0.1, 0.4, 0.8, 1.0) * intensity; }`,
      blending: THREE.AdditiveBlending, side: THREE.BackSide, transparent: true,
    })));

    // City markers (always visible)
    const citiesGroup = new THREE.Group();
    scene.add(citiesGroup);
    citiesGroupRef.current = citiesGroup;

    CITIES.forEach((city) => {
      const pos = latLngToVector3(city.lat, city.lng, RADIUS * 1.002);
      const dotGeo = new THREE.SphereGeometry(0.006, 8, 8);
      const dotMat = new THREE.MeshBasicMaterial({       color: 0x00bfff, transparent: true, opacity: 0.8 });
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.position.copy(pos);
      dot.userData = { city: city.name, lat: city.lat, lng: city.lng };
      citiesGroup.add(dot);
    });

    // Active markers group
    const markersGroup = new THREE.Group();
    scene.add(markersGroup);
    markersGroupRef.current = markersGroup;

    // Lights
    scene.add(new THREE.AmbientLight(0x1a1a2e, 1.5));
    const dir = new THREE.DirectionalLight(0x4a7faa, 0.7);
    dir.position.set(2, 1, 2);
    scene.add(dir);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.5;
    controls.enablePan = false;
    controls.minDistance = 1.5;
    controls.maxDistance = 5;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.3;
    controlsRef.current = controls;

    renderer.domElement.style.cursor = 'grab';

    let isInteracting = false;
    let idleTimer = null;

    const onDown = () => {
      isInteracting = true;
      controls.autoRotate = false;
      clearTimeout(idleTimer);
      renderer.domElement.style.cursor = 'grabbing';
    };
    const onUp = () => {
      isInteracting = false;
      renderer.domElement.style.cursor = 'grab';
      idleTimer = setTimeout(() => { if (!isInteracting) controls.autoRotate = true; }, 4000);
    };

    const getIntersections = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycasterRef.current.setFromCamera(mouseRef.current, camera);
      return {
        globe: raycasterRef.current.intersectObject(globe),
        cities: raycasterRef.current.intersectObjects(citiesGroup.children),
        rect,
      };
    };

    const onMove = (event) => {
      const { globe: globeHits, cities: cityHits, rect } = getIntersections(event);
      if (cityHits.length > 0) {
        const data = cityHits[0].object.userData;
        setHoverInfo({ ...data, x: event.clientX - rect.left, y: event.clientY - rect.top, isCity: true });
        renderer.domElement.style.cursor = 'pointer';
      } else if (globeHits.length > 0) {
        const local = globe.worldToLocal(globeHits[0].point.clone());
        const { lat, lng } = vector3ToLatLng(local, RADIUS);
        setHoverInfo({ lat, lng, x: event.clientX - rect.left, y: event.clientY - rect.top, isCity: false });
        if (!isInteracting) renderer.domElement.style.cursor = 'crosshair';
      } else {
        setHoverInfo(null);
        if (!isInteracting) renderer.domElement.style.cursor = 'grab';
      }
    };

    let downPos = null;
    const onDownRecord = (e) => { downPos = { x: e.clientX, y: e.clientY }; };
    const onClick = (event) => {
      if (!downPos) return;
      const moved = Math.abs(event.clientX - downPos.x) + Math.abs(event.clientY - downPos.y);
      if (moved > 5) return;
      const { globe: globeHits, cities: cityHits } = getIntersections(event);
      if (cityHits.length > 0) {
        const data = cityHits[0].object.userData;
        onSelectRef.current?.({ lat: data.lat, lng: data.lng, name: data.city });
      } else if (globeHits.length > 0) {
        const local = globe.worldToLocal(globeHits[0].point.clone());
        const { lat, lng } = vector3ToLatLng(local, RADIUS);
        onSelectRef.current?.({ lat, lng });
      }
    };

    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerdown', onDownRecord);
    renderer.domElement.addEventListener('pointerup', onUp);
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('click', onClick);

    let frameId;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      controls.update();
      const t = Date.now() * 0.003;
      markersGroup.children.forEach((child) => {
        if (child.userData.pulse) {
          child.scale.setScalar(1 + Math.sin(t + child.userData.offset) * 0.25);
        }
      });
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!mount) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(mount);

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(idleTimer);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerdown', onDownRecord);
      renderer.domElement.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('click', onClick);
      controls.dispose();
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []);

  // Land dots (dotted blue continents)
  useEffect(() => {
    let cancelled = false;
    const loadLand = async () => {
      try {
        const response = await fetch('https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master/110m/physical/ne_110m_land.json');
        if (!response.ok) return;
        const data = await response.json();
        if (cancelled || !sceneRef.current) return;

        const canvas = document.createElement('canvas');
        canvas.width = 360;
        canvas.height = 180;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';

        const drawRing = (ring) => {
          ctx.beginPath();
          ring.forEach(([lng, lat], i) => {
            const x = ((lng + 180) / 360) * 360;
            const y = ((90 - lat) / 180) * 180;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
          ctx.closePath();
          ctx.fill();
        };

        (data.features || []).forEach((feature) => {
          if (!feature.geometry) return;
          if (feature.geometry.type === 'Polygon') {
            feature.geometry.coordinates.forEach(drawRing);
          } else if (feature.geometry.type === 'MultiPolygon') {
            feature.geometry.coordinates.forEach((poly) => poly.forEach(drawRing));
          }
        });

        const imageData = ctx.getImageData(0, 0, 360, 180);
        const positions = [];
        const step = 2;
        for (let y = 0; y < 180; y += step) {
          for (let x = 0; x < 360; x += step) {
            const idx = (y * 360 + x) * 4;
            if (imageData.data[idx + 3] > 0) {
              const lng = (x / 360) * 360 - 180;
              const lat = 90 - (y / 180) * 180;
              const pos = latLngToVector3(lat, lng, 1.004);
              positions.push(pos.x, pos.y, pos.z);
            }
          }
        }

        if (cancelled || !sceneRef.current) return;

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        const material = new THREE.PointsMaterial({
          color: 0x00bfff, size: 0.018, transparent: true, opacity: 0.9, depthWrite: false,
        });
        const landDots = new THREE.Points(geometry, material);
        landDots.renderOrder = 1;
        sceneRef.current.add(landDots);
        landDotsRef.current = landDots;
      } catch (e) {
        console.warn('Failed to load land dots:', e);
      }
    };
    loadLand();
    return () => {
      cancelled = true;
      if (landDotsRef.current && sceneRef.current) {
        sceneRef.current.remove(landDotsRef.current);
        landDotsRef.current.geometry.dispose();
        landDotsRef.current.material.dispose();
        landDotsRef.current = null;
      }
    };
  }, []);

  // Update active markers
  useEffect(() => {
    const group = markersGroupRef.current;
    if (!group) return;
    while (group.children.length > 0) {
      const c = group.children[0];
      group.remove(c);
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    }

    markers.forEach((m, i) => {
      const pos = latLngToVector3(m.lat, m.lng, MARKER_RADIUS);

      // Pulse ring
      const ringGeo = new THREE.RingGeometry(0.03, 0.05, 32);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.copy(pos);
      ring.lookAt(0, 0, 0);
      ring.userData.pulse = true;
      ring.userData.offset = i * 0.6;
      group.add(ring);

      // Glow
      const glowGeo = new THREE.SphereGeometry(0.025, 16, 16);
      const glowMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.position.copy(pos);
      group.add(glow);

      // Core
      const dotGeo = new THREE.SphereGeometry(0.014, 16, 16);
      const dotMat = new THREE.MeshBasicMaterial({ color: 0x7df9ff });
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.position.copy(pos);
      group.add(dot);
    });
  }, [markers]);

  // Fly to
  useEffect(() => {
    if (!flyTo || !cameraRef.current || !controlsRef.current) return;
    if (flyAnimRef.current) cancelAnimationFrame(flyAnimRef.current);

    const [lat, lng] = flyTo;
    const targetPos = latLngToVector3(lat, lng, 2.8);
    const startPos = cameraRef.current.position.clone();
    const startTime = Date.now();
    const duration = 1500;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      cameraRef.current.position.lerpVectors(startPos, targetPos, ease);
      cameraRef.current.lookAt(0, 0, 0);
      controlsRef.current.autoRotate = false;
      if (t < 1) {
        flyAnimRef.current = requestAnimationFrame(animate);
      } else {
        flyAnimRef.current = null;
        setTimeout(() => { if (controlsRef.current) controlsRef.current.autoRotate = true; }, 6000);
      }
    };
    animate();

    return () => { if (flyAnimRef.current) cancelAnimationFrame(flyAnimRef.current); };
  }, [flyTo]);

  return (
    <div className="relative w-full h-full">
      <div ref={mountRef} className="w-full h-full" />
      {hoverInfo && (
        <div
          className="absolute pointer-events-none z-20 px-2.5 py-1.5 rounded bg-black/90 text-cyan-200/90 text-[11px] font-mono backdrop-blur-sm border border-cyan-500/20 whitespace-nowrap"
          style={{ left: hoverInfo.x + 14, top: hoverInfo.y + 14 }}
        >
          {hoverInfo.isCity ? (
            <span className="text-cyan-300">{hoverInfo.city}</span>
          ) : (
            <span>{hoverInfo.lat.toFixed(3)}°, {hoverInfo.lng.toFixed(3)}°</span>
          )}
        </div>
      )}
    </div>
  );
}