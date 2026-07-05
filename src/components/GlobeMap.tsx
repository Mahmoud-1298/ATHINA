import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export interface MapTarget {
  name: string;
  lat: number;
  lng: number;
  query?: string;
}

interface GlobeMapProps {
  target?: MapTarget | null;
  className?: string;
  onSelectLocation?: (target: MapTarget) => void;
}

const latLngToVector3 = (lat: number, lng: number, radius: number): THREE.Vector3 => {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
};

const vector3ToLatLng = (vector: THREE.Vector3) => {
  const radius = vector.length() || 1;
  const lat = 90 - (Math.acos(THREE.MathUtils.clamp(vector.y / radius, -1, 1)) * 180) / Math.PI;
  const lng = (Math.atan2(vector.z, -vector.x) * 180) / Math.PI - 180;
  return { lat, lng };
};

const formatCoord = (value: number) => value.toFixed(3);

const GlobeMap = ({ target, className, onSelectLocation }: GlobeMapProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<MapTarget | null>(target);
  const [hoverTarget, setHoverTarget] = useState<{ lat: number; lng: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => { targetRef.current = target; }, [target]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let width = container.clientWidth;
    let height = container.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.z = 3;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const group = new THREE.Group();
    scene.add(group);

    const RADIUS = 1;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2(999, 999);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 2.15;
    controls.maxDistance = 5.2;
    controls.rotateSpeed = 0.55;
    controls.zoomSpeed = 0.7;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.28;

    // Graphite sphere
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS, 64, 64),
      new THREE.MeshPhongMaterial({
        color: 0x181818,
        emissive: 0x0f0f0f,
        specular: 0x8a8a8a,
        shininess: 18,
        transparent: true,
        opacity: 0.96,
      })
    );
    group.add(sphere);

    // Grey wireframe graticule
    const wire = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS * 1.003, 36, 18),
      new THREE.MeshBasicMaterial({ color: 0x8b8b8b, wireframe: true, transparent: true, opacity: 0.12 })
    );
    group.add(wire);

    // Soft atmosphere glow
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS * 1.18, 64, 64),
      new THREE.ShaderMaterial({
        transparent: true,
        side: THREE.BackSide,
        vertexShader: [
          "varying vec3 vNormal;",
          "void main() {",
          "  vNormal = normalize(normalMatrix * normal);",
          "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
          "}",
        ].join("\n"),
        fragmentShader: [
          "varying vec3 vNormal;",
          "void main() {",
          "  float intensity = pow(0.72 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.2);",
          "  gl_FragColor = vec4(0.86, 0.86, 0.86, 1.0) * intensity;",
          "}",
        ].join("\n"),
      })
    );
    group.add(atmo);

    // Marker dot
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.028, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xf4f4f5 })
    );
    marker.visible = false;
    group.add(marker);

    // Marker pulse ring
    const pulse = new THREE.Mesh(
      new THREE.RingGeometry(0.038, 0.065, 32),
      new THREE.MeshBasicMaterial({ color: 0xe5e7eb, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
    );
    pulse.visible = false;
    group.add(pulse);

    // Lights
    scene.add(new THREE.AmbientLight(0xa3a3a3, 0.35));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(5, 3, 5);
    scene.add(dir);

    const targetQuat = new THREE.Quaternion();
    let frameId: number;
    const hoverPlane = new THREE.Plane();
    const hoverPoint = new THREE.Vector3();

    const updateHover = () => {
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObject(sphere, false);
      if (hits.length === 0) {
        setHoverTarget(null);
        return;
      }
      const hit = hits[0].point.clone().normalize().multiplyScalar(RADIUS);
      hoverPlane.setFromNormalAndCoplanarPoint(hit.clone().normalize(), hit);
      raycaster.ray.intersectPlane(hoverPlane, hoverPoint);
      setHoverTarget(vector3ToLatLng(hit));
    };

    const handlePointerMove = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
      updateHover();
    };

    const handlePointerLeave = () => {
      pointer.set(999, 999);
      setHoverTarget(null);
    };

    const handlePointerDown = () => {
      setIsDragging(true);
      controls.autoRotate = false;
    };

    const handlePointerUp = (event: PointerEvent) => {
      setIsDragging(false);
      controls.autoRotate = true;

      if (!onSelectLocation) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObject(sphere, false);
      if (hits.length === 0) return;

      const hit = hits[0].point.clone().normalize().multiplyScalar(RADIUS);
      const latLng = vector3ToLatLng(hit);
      onSelectLocation({
        name: `Selected point ${formatCoord(latLng.lat)}, ${formatCoord(latLng.lng)}`,
        lat: latLng.lat,
        lng: latLng.lng,
        query: "Map selection",
      });
    };

    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerleave", handlePointerLeave);
    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);

    const animate = () => {
      frameId = requestAnimationFrame(animate);

      const t = targetRef.current;
      if (t) {
        const pos = latLngToVector3(t.lat, t.lng, RADIUS);
        marker.position.copy(pos);
        marker.visible = true;
        pulse.position.copy(latLngToVector3(t.lat, t.lng, RADIUS * 1.01));
        pulse.lookAt(new THREE.Vector3(0, 0, 0));
        pulse.visible = true;

        const dir2 = pos.clone().normalize();
        targetQuat.setFromUnitVectors(dir2, new THREE.Vector3(0, 0, 1));
      }

      if (targetRef.current) {
        group.quaternion.slerp(targetQuat, 0.04);
      } else {
        group.rotation.y += controls.autoRotate ? 0.0012 : 0;
      }

      controls.update();

      if (pulse.visible) {
        const s = 1 + Math.sin(Date.now() * 0.003) * 0.3;
        pulse.scale.set(s, s, 1);
      }

      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      width = container.clientWidth;
      height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    const ro = new ResizeObserver(handleResize);
    ro.observe(container);

    return () => {
      cancelAnimationFrame(frameId);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerleave", handlePointerLeave);
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  const infoText = useMemo(() => {
    if (target) {
      return `${formatCoord(target.lat)}, ${formatCoord(target.lng)}`;
    }
    if (hoverTarget) {
      return `hover ${formatCoord(hoverTarget.lat)}, ${formatCoord(hoverTarget.lng)}`;
    }
    return isDragging ? "exploring" : "drag or hover to explore";
  }, [hoverTarget, isDragging, target]);

  return (
    <div className={`relative overflow-hidden rounded-full border border-white/10 bg-gradient-to-br from-black via-zinc-950 to-zinc-800 shadow-[0_0_60px_rgba(0,0,0,0.6)] ${className || ""}`}>
      <div ref={containerRef} className="h-full w-full" />
      <div className="pointer-events-none absolute left-4 top-4 rounded-full border border-white/10 bg-black/70 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-zinc-200/70">
        Map sphere
      </div>
      <div className="pointer-events-none absolute bottom-4 left-4 right-4 rounded-2xl border border-white/10 bg-black/60 px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-zinc-200/75 backdrop-blur-md">
        {infoText}
      </div>
    </div>
  );
};

export default GlobeMap;
