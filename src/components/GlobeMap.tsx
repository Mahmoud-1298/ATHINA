import { useEffect, useRef } from "react";
import * as THREE from "three";

export interface MapTarget {
  name: string;
  lat: number;
  lng: number;
  query?: string;
}

interface GlobeMapProps {
  target?: MapTarget | null;
  className?: string;
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

const GlobeMap = ({ target, className }: GlobeMapProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<MapTarget | null>(target);

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

    // Dark navy sphere
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS, 64, 64),
      new THREE.MeshPhongMaterial({
        color: 0x0a0f1e,
        emissive: 0x0a1929,
        shininess: 8,
        transparent: true,
        opacity: 0.92,
      })
    );
    group.add(sphere);

    // Cyan wireframe graticule
    const wire = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS * 1.003, 36, 18),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee, wireframe: true, transparent: true, opacity: 0.14 })
    );
    group.add(wire);

    // Atmosphere glow
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
          "  float intensity = pow(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);",
          "  gl_FragColor = vec4(0.13, 0.83, 0.96, 1.0) * intensity;",
          "}",
        ].join("\n"),
      })
    );
    group.add(atmo);

    // Marker dot
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.028, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x67e8f9 })
    );
    marker.visible = false;
    group.add(marker);

    // Marker pulse ring
    const pulse = new THREE.Mesh(
      new THREE.RingGeometry(0.038, 0.065, 32),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
    );
    pulse.visible = false;
    group.add(pulse);

    // Lights
    scene.add(new THREE.AmbientLight(0x3b82f6, 0.5));
    const dir = new THREE.DirectionalLight(0x22d3ee, 0.9);
    dir.position.set(5, 3, 5);
    scene.add(dir);

    const targetQuat = new THREE.Quaternion();
    let autoRotate = true;
    let frameId: number;

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
        autoRotate = false;
      }

      if (autoRotate) {
        group.rotateY(0.0015);
      } else {
        group.quaternion.slerp(targetQuat, 0.04);
      }

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
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className={`relative overflow-hidden rounded-full border border-cyan-300/20 bg-slate-950 shadow-2xl shadow-cyan-500/10 ${className || ""}`}>
      <div ref={containerRef} className="h-full w-full" />
      <div className="pointer-events-none absolute left-4 top-4 rounded-full border border-white/10 bg-slate-950/85 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-cyan-200/70">
        Globe
      </div>
    </div>
  );
};

export default GlobeMap;
