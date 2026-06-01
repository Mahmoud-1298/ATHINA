import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";

const LAT = 25;
const LON = 25;
const RADIUS = 3;

const COLOR = "#7AB928";

interface Props {
  isSpeaking: boolean;
  isActive: boolean;
}

/* ================= STRUCTURED NODES ================= */
const Nodes = ({ positions }: any) => {
  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={positions} itemSize={3} count={positions.length / 3} />
      </bufferGeometry>
      <pointsMaterial size={0.03} color={COLOR} />
    </points>
  );
};

/* ================= BUILD GRID SPHERE ================= */
const useSphereNetwork = () => {
  return useMemo(() => {
    const points: number[] = [];
    const edges: number[] = [];

    const indexMap: number[][] = [];

    for (let i = 0; i <= LAT; i++) {
      indexMap[i] = [];
      const phi = (i / LAT) * Math.PI;

      for (let j = 0; j <= LON; j++) {
        const theta = (j / LON) * Math.PI * 2;

        const x = RADIUS * Math.sin(phi) * Math.cos(theta);
        const y = RADIUS * Math.cos(phi);
        const z = RADIUS * Math.sin(phi) * Math.sin(theta);

        const id = points.length / 3;

        indexMap[i][j] = id;

        points.push(x, y, z);

        // connect horizontally
        if (j > 0) {
          const prev = indexMap[i][j - 1];
          edges.push(
            ...[points[prev * 3], points[prev * 3 + 1], points[prev * 3 + 2]],
            x, y, z
          );
        }

        // connect vertically
        if (i > 0) {
          const top = indexMap[i - 1][j];
          edges.push(
            ...[points[top * 3], points[top * 3 + 1], points[top * 3 + 2]],
            x, y, z
          );
        }
      }
    }

    return {
      positions: new Float32Array(points),
      edges: new Float32Array(edges),
    };
  }, []);
};

/* ================= CONNECTIONS ================= */
const Connections = ({ edges, isSpeaking }: any) => {
  const ref = useRef<THREE.LineSegments>(null);

  return (
    <lineSegments ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={edges} itemSize={3} />
      </bufferGeometry>
      <lineBasicMaterial
        color={COLOR}
        transparent
        opacity={0.6}
      />
    </lineSegments>
  );
};

/* ================= SIGNAL FLOW ================= */
const Signals = ({ edges, isSpeaking }: any) => {
  const ref = useRef<THREE.Points>(null);
  const time = useRef(0);

  const count = edges.length / 6;

  const positions = useMemo(() => new Float32Array(count * 3), [count]);

  useFrame((_, delta) => {
    time.current += delta;

    const speed = isSpeaking ? 2 : 0.7;

    for (let i = 0; i < count; i++) {
      const i6 = i * 6;
      const t = (time.current * speed + i * 0.02) % 1;

      const x1 = edges[i6];
      const y1 = edges[i6 + 1];
      const z1 = edges[i6 + 2];

      const x2 = edges[i6 + 3];
      const y2 = edges[i6 + 4];
      const z2 = edges[i6 + 5];

      positions[i * 3] = x1 + (x2 - x1) * t;
      positions[i * 3 + 1] = y1 + (y2 - y1) * t;
      positions[i * 3 + 2] = z1 + (z2 - z1) * t;
    }

    ref.current!.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        color="#D4FF7A"
        size={0.05}
        opacity={isSpeaking ? 1 : 0.3}
        transparent
      />
    </points>
  );
};

/* ================= MAIN ================= */
const JarvisParticles = ({ isSpeaking }: Props) => {
  const { positions, edges } = useSphereNetwork();

  return (
    <div className="fixed inset-0">
      <Canvas camera={{ position: [0, 0, 10], fov: 60 }}>
        <Nodes positions={positions} />
        <Connections edges={edges} isSpeaking={isSpeaking} />
        <Signals edges={edges} isSpeaking={isSpeaking} />

        <EffectComposer>
          <Bloom intensity={isSpeaking ? 2 : 1} luminanceThreshold={0.4} />
        </EffectComposer>
      </Canvas>
    </div>
  );
};

export default JarvisParticles;
