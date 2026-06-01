import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

const NODE_COUNT = 500;
const CONNECTION_DISTANCE = 1.4;

const COLOR = "#7AB928";

interface Props {
  isSpeaking: boolean;
  isActive: boolean;
}

/* ================= NODES ================= */
const Nodes = () => {
  const ref = useRef<THREE.Points>(null);

  const { positions } = useMemo(() => {
    const positions = new Float32Array(NODE_COUNT * 3);

    for (let i = 0; i < NODE_COUNT; i++) {
      const phi = Math.acos(2 * Math.random() - 1);
      const theta = Math.random() * Math.PI * 2;

      const r = 3.2;

      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);

      positions.set([x, y, z], i * 3);
    }

    return { positions };
  }, []);

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={positions} count={NODE_COUNT} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        color={COLOR}
        size={0.04}
        transparent
        opacity={0.7}
      />
    </points>
  );
};

/* ================= CONNECTIONS + SIGNALS ================= */
const Connections = ({ isSpeaking }: Props) => {
  const lineRef = useRef<THREE.LineSegments>(null);
  const signalRef = useRef<THREE.Points>(null);

  useFrame((state) => {
    if (!lineRef.current || !signalRef.current) return;

    const nodes = (lineRef.current.parent?.children[0] as any)
      ?.geometry?.attributes.position.array;

    if (!nodes) return;

    const lines: number[] = [];
    const signals: number[] = [];

    const t = state.clock.elapsedTime;

    for (let i = 0; i < NODE_COUNT; i++) {
      for (let j = i + 1; j < NODE_COUNT; j++) {
        const x1 = nodes[i * 3];
        const y1 = nodes[i * 3 + 1];
        const z1 = nodes[i * 3 + 2];

        const x2 = nodes[j * 3];
        const y2 = nodes[j * 3 + 1];
        const z2 = nodes[j * 3 + 2];

        const dx = x1 - x2;
        const dy = y1 - y2;
        const dz = z1 - z2;

        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist < CONNECTION_DISTANCE) {
          // ✅ connections
          lines.push(x1, y1, z1, x2, y2, z2);

          // ⚡ SIGNAL FLOW (ON THE LINE)
          const speed = isSpeaking ? 2.5 : 1;
          const p = ((t * speed + i * 0.1) % 1);

          const sx = x1 + (x2 - x1) * p;
          const sy = y1 + (y2 - y1) * p;
          const sz = z1 + (z2 - z1) * p;

          signals.push(sx, sy, sz);
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(lines, 3));

    lineRef.current.geometry.dispose();
    lineRef.current.geometry = geo;

    const sGeo = new THREE.BufferGeometry();
    sGeo.setAttribute("position", new THREE.Float32BufferAttribute(signals, 3));

    signalRef.current.geometry.dispose();
    signalRef.current.geometry = sGeo;
  });

  return (
    <>
      <lineSegments ref={lineRef}>
        <lineBasicMaterial
          color={COLOR}
          transparent
          opacity={isSpeaking ? 0.8 : 0.25}
        />
      </lineSegments>

      <points ref={signalRef}>
        <pointsMaterial
          color="#D4FF7A"
          size={0.06}
          transparent
          opacity={1}
        />
      </points>
    </>
  );
};

/* ================= CORE ================= */
const Core = ({ isSpeaking }: { isSpeaking: boolean }) => {
  const ref = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (!ref.current) return;

    const target = isSpeaking ? 1.8 : 1.2;
    ref.current.scale.lerp(new THREE.Vector3(target, target, target), delta * 2);
  });

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.6, 32, 32]} />
      <meshBasicMaterial
        color={COLOR}
        transparent
        opacity={0.25}
      />
    </mesh>
  );
};

/* ================= MAIN ================= */
const JarvisParticles = ({ isSpeaking, isActive }: Props) => {
  return (
    <div className="fixed inset-0 z-0">
      <Canvas camera={{ position: [0, 0, 9], fov: 60 }}>
        <Nodes />
        <Connections isSpeaking={isSpeaking} isActive={isActive} />
        <Core isSpeaking={isSpeaking} />
      </Canvas>
    </div>
  );
};

export default JarvisParticles;
``
