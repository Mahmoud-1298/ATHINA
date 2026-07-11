import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const MARKER_RADIUS = 1.01;

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
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const rendererRef = useRef(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const onSelectRef = useRef(onLocationSelect);
  const flyAnimRef = useRef(null);
  const [hoverInfo, setHoverInfo] = useState(null);

  useEffect(() => { onSelectRef.current = onLocationSelect; }, [onLocationSelect]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth || 320;
    const height = mount.clientHeight || 320;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 0, 3.5);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const RADIUS = 1;

    // Dark globe sphere
    const globeGeo = new THREE.SphereGeometry(RADIUS, 64, 64);
    const globeMat = new THREE.MeshPhongMaterial({
      color: 0x18181b,
      shininess: 6,
      transparent: true,
      opacity: 0.95,
    });
    const globe = new THREE.Mesh(globeGeo, globeMat);
    scene.add(globe);
    globeRef.current = globe;

    // Wireframe overlay
    const wireGeo = new THREE.SphereGeometry(RADIUS * 1.001, 36, 18);
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x3f3f46,
      wireframe: true,
      transparent: true,
      opacity: 0.25,
    });
    scene.add(new THREE.Mesh(wireGeo, wireMat));

    // Fibonacci dot grid
    const dotCount = 600;
    const dotPos = new Float32Array(dotCount * 3);
    const golden = (1 + Math.sqrt(5)) / 2;
    const angleInc = Math.PI * 2 * golden;
    for (let i = 0; i < dotCount; i++) {
      const t = i / dotCount;
      const incl = Math.acos(1 - 2 * t);
      const az = angleInc * i;
      const r = RADIUS * 1.004;
      dotPos[i * 3] = r * Math.sin(incl) * Math.cos(az);
      dotPos[i * 3 + 1] = r * Math.cos(incl);
      dotPos[i * 3 + 2] = r * Math.sin(incl) * Math.sin(az);
    }
    const dotGeo = new THREE.BufferGeometry();
    dotGeo.setAttribute('position', new THREE.BufferAttribute(dotPos, 3));
    scene.add(new THREE.Points(dotGeo, new THREE.PointsMaterial({
      color: 0x52525b, size: 0.013, transparent: true, opacity: 0.55,
    })));

    // Atmosphere glow
    const atmGeo = new THREE.SphereGeometry(RADIUS * 1.18, 64, 64);
    const atmMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying vec3 vNormal;
        void main() {
          float intensity = pow(0.6 - dot(vNormal, vec3(0, 0, 1.0)), 2.5);
          gl_FragColor = vec4(0.35, 0.35, 0.38, 1.0) * intensity;
        }`,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
    });
    scene.add(new THREE.Mesh(atmGeo, atmMat));

    // Markers group
    const markersGroup = new THREE.Group();
    scene.add(markersGroup);
    markersGroupRef.current = markersGroup;

    // Lights
    scene.add(new THREE.AmbientLight(0x333333, 1.6));
    const dir = new THREE.DirectionalLight(0x808080, 0.9);
    dir.position.set(2, 1, 2);
    scene.add(dir);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.5;
    controls.enablePan = false;
    controls.minDistance = 1.6;
    controls.maxDistance = 6;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.4;
    controlsRef.current = controls;

    renderer.domElement.style.cursor = 'grab';

    // Interaction
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
      idleTimer = setTimeout(() => { if (!isInteracting) controls.autoRotate = true; }, 3000);
    };

    const getPoint = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycasterRef.current.setFromCamera(mouseRef.current, camera);
      return raycasterRef.current.intersectObject(globe);
    };

    const onMove = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const hits = getPoint(event);
      if (hits.length > 0) {
        const local = globe.worldToLocal(hits[0].point.clone());
        const { lat, lng } = vector3ToLatLng(local, RADIUS);
        setHoverInfo({
          lat, lng,
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        });
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
      if (moved > 5) return; // was a drag, not a click
      const hits = getPoint(event);
      if (hits.length > 0) {
        const local = globe.worldToLocal(hits[0].point.clone());
        const { lat, lng } = vector3ToLatLng(local, RADIUS);
        onSelectRef.current?.({ lat, lng });
      }
    };

    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerdown', onDownRecord);
    renderer.domElement.addEventListener('pointerup', onUp);
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('click', onClick);

    // Animation
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

    // Resize
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
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
          else obj.material.dispose();
        }
      });
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []);

  // Update markers
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

      // Glow halo
      const glowGeo = new THREE.SphereGeometry(0.04, 16, 16);
      const glowMat = new THREE.MeshBasicMaterial({
        color: 0x8a8a8a, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending,
      });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.position.copy(pos);
      glow.userData.pulse = true;
      glow.userData.offset = i * 0.6;
      group.add(glow);

      // Core dot
      const dotGeo = new THREE.SphereGeometry(0.016, 16, 16);
      const dotMat = new THREE.MeshBasicMaterial({ color: 0xd4d4d8 });
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.position.copy(pos);
      group.add(dot);
    });
  }, [markers]);

  // Fly to location
  useEffect(() => {
    if (!flyTo || !cameraRef.current || !controlsRef.current) return;
    if (flyAnimRef.current) cancelAnimationFrame(flyAnimRef.current);

    const [lat, lng] = flyTo;
    const targetPos = latLngToVector3(lat, lng, 3);
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
        setTimeout(() => { if (controlsRef.current) controlsRef.current.autoRotate = true; }, 5000);
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
          className="absolute pointer-events-none z-20 px-2 py-1 rounded bg-black/85 text-zinc-300 text-[10px] font-mono backdrop-blur-sm border border-zinc-700/60 whitespace-nowrap"
          style={{ left: hoverInfo.x + 14, top: hoverInfo.y + 14 }}
        >
          {hoverInfo.lat.toFixed(3)}°, {hoverInfo.lng.toFixed(3)}°
        </div>
      )}
    </div>
  );
}