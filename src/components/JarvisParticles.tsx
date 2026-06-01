import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

const PARTICLE_COUNT = 700;
const CONNECTION_DISTANCE = 0.6;

const GREEN_PRIMARY = "#7AB928";

interface Props {
  isSpeaking: boolean;
  isActive: boolean;
}

/* ================= CLEAN BRAIN STRUCTURE ================= */
const BrainPoints = () => {
  const ref = useRef<THREE.Points>(null);

  const geometry = useMemo(() => {
    const positions = new Float32Array(PARTICLE_COUNT * 3);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const t = Math.random() * Math.PI * 2;
      const p = Math.random() * Math.PI;

      // 🧠 Better brain silhouette (compressed + shaped)
      const r = 2.8 + Math.sin(p) * 0.5;

      const x = Math.cos(t) * Math.sin(p) * r * 1.6;
      const y = Math.sin(t) * Math.sin(p) * r * 1.0;
      const z = Math.cos(p) * r * 0.8;

      // flatten bottom → brain base
      const finalY = y * (y > 0 ? 1 : 0.5);

      positions.set([x, finalY, z], i * 3);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geo;
  }, []);

  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial
        color={GREEN_PRIMARY}
        size={0.015}
        transparent
        opacity={0.35}
        depthWrite={false}
      />
    </points>
  );
};

/* ================= NEURAL CONNECTIONS ================= */
const BrainConnections = () => {
  const ref = useRef<THREE.LineSegments>(null);

  useFrame(() => {
    if (!ref.current) return;

    const particles = (ref.current.parent?.children[0] as any)
      ?.geometry?.attributes.position.array;

    if (!particles) return;

    const lines: number[] = [];

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      for (let j = i + 1; j < PARTICLE_COUNT; j++) {
        const dx = particles[i * 3] - particles[j * 3];
        const dy = particles[i * 3 + 1] - particles[j * 3 + 1];
        const dz = particles[i * 3 + 2] - particles[j * 3 + 2];

        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        // ✅ tighter connections = cleaner structure
        if (dist < CONNECTION_DISTANCE) {
          lines.push(
            particles[i * 3],
            particles[i * 3 + 1],
            particles[i * 3 + 2],
            particles[j * 3],
            particles[j * 3 + 1],
            particles[j * 3 + 2]
          );
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(lines, 3));

    ref.current.geometry.dispose();
    ref.current.geometry = geo;
  });

  return (
    <lineSegments ref={ref}>
      <lineBasicMaterial
        color={GREEN_PRIMARY}
        transparent
        opacity={0.25} // ✅ reduced brightness
      />
    </lineSegments>
  );
};

/* ================= SUBTLE SIGNALS ================= */
const SignalFlow = () => {
  const ref = useRef<THREE.Points>(null);
  const time = useRef(0);

  const geometry = useMemo(() => {
    const positions = new Float32Array(200 * 3);
    return new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3)
    );
  }, []);

  useFrame((_, delta) => {
    if (!ref.current) return;
    time.current += delta;

    const pos = ref.current.geometry.attributes.position.array as Float32Array;

    for (let i = 0; i < pos.length; i += 3) {
      pos[i] = Math.sin(time.current * 2 + i) * 1.5;
      pos[i + 1] = Math.cos(time.current * 1.5 + i) * 1.0;
      pos[i + 2] = Math.sin(time.current * 1.2 + i) * 1.2;
    }

    ref.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial
        color="#D9FF9A"
        size={0.02}
        transparent
        opacity={0.15} // ✅ very subtle
      />
    </points>
  );
};

/* ================= MAIN ================= */
const JarvisParticles = ({ isSpeaking, isActive }: Props) => {
  return (
    <div className="fixed inset-0 z-0">
      <Canvas camera={{ position: [0, 0, 8], fov: 60 }}>
        <BrainPoints />
        <BrainConnections />
        <SignalFlow />
      </Canvas>
    </div>
  );
};

export default JarvisParticles;
``
