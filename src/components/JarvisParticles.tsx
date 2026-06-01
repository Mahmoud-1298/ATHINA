import { useRef, useMemo, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

const PARTICLE_COUNT = 1200;
const SPHERE_RADIUS = 4;

const GREEN_PRIMARY = "#7AB928";
const GREEN_DARK = "#5A8A1E";

interface ParticleFieldProps {
  isSpeaking: boolean;
  isActive: boolean;
}

const ParticleField = ({ isSpeaking }: ParticleFieldProps) => {
  const meshRef = useRef<THREE.Points>(null);
  const targetScatter = useRef(0);
  const currentScatter = useRef(0);
  const timeRef = useRef(0);

  const { positions, basePositions, sizes, opacities } = useMemo(() => {
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const basePositions = new Float32Array(PARTICLE_COUNT * 3);
    const sizes = new Float32Array(PARTICLE_COUNT);
    const opacities = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = SPHERE_RADIUS * (0.4 + Math.random() * 0.6);

      // ✅ Brain-like shaping
      const x = r * Math.sin(phi) * Math.cos(theta) * 1.4;
      const y = r * Math.sin(phi) * Math.sin(theta) * 0.7;
      const z = r * Math.cos(phi) * 1.0;

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      basePositions[i * 3] = x;
      basePositions[i * 3 + 1] = y;
      basePositions[i * 3 + 2] = z;

      sizes[i] = Math.random() * 2 + 0.8;
      opacities[i] = Math.random() * 0.7 + 0.3;
    }

    return { positions, basePositions, sizes, opacities };
  }, []);

  useEffect(() => {
    targetScatter.current = isSpeaking ? 1 : 0;
  }, [isSpeaking]);

  useFrame((_, delta) => {
    if (!meshRef.current) return;

    timeRef.current += delta;
    const time = timeRef.current;

    currentScatter.current += (targetScatter.current - currentScatter.current) * delta * 3;
    const scatter = currentScatter.current;

    const posArray = meshRef.current.geometry.attributes.position.array as Float32Array;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;

      const bx = basePositions[i3];
      const by = basePositions[i3 + 1];
      const bz = basePositions[i3 + 2];

      // Base motion (alive idle brain)
      const ox = Math.sin(time * 0.5 + i * 0.01) * 0.15;
      const oy = Math.cos(time * 0.4 + i * 0.015) * 0.15;
      const oz = Math.sin(time * 0.3 + i * 0.02) * 0.1;

      // Scatter outward (thinking effect)
      const dist = Math.sqrt(bx * bx + by * by + bz * bz) || 1;
      const nx = bx / dist;
      const ny = by / dist;
      const nz = bz / dist;

      const scatterForce =
        scatter *
        (2.0 + Math.sin(time * 10 + i * 0.3) * 1.2);

      const wave = scatter * Math.sin(time * 8 + dist * 2) * 0.4;

      // Jitter (neural firing)
      const jitter = scatter * 0.3;

      posArray[i3] =
        bx + ox + nx * scatterForce + nx * wave + (Math.random() - 0.5) * jitter;

      posArray[i3 + 1] =
        by + oy + ny * scatterForce + ny * wave + (Math.random() - 0.5) * jitter;

      posArray[i3 + 2] =
        bz + oz + nz * scatterForce + nz * wave + (Math.random() - 0.5) * jitter;
    }

    meshRef.current.geometry.attributes.position.needsUpdate = true;
    meshRef.current.rotation.y = time * 0.05;
  });

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uColor1: { value: new THREE.Color(GREEN_PRIMARY) },
        uColor2: { value: new THREE.Color(GREEN_DARK) },
      },
      vertexShader: `
        attribute float size;
        attribute float opacity;
        varying float vAlpha;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (180.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
          vAlpha = opacity * smoothstep(18.0, 3.0, -mvPosition.z);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor1;
        uniform vec3 uColor2;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;

          float glow = exp(-d * 6.0);
          float core = exp(-d * 16.0);

          vec3 color = mix(uColor2, uColor1, core);

          // ✅ stronger neural glow
          vec3 bright = color + vec3(0.8, 1.2, 0.4) * core * 0.7;

          gl_FragColor = vec4(bright, (glow * 0.4 + core * 0.6) * vAlpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }, []);

  return (
    <points ref={meshRef} material={material}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={PARTICLE_COUNT} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-size" count={PARTICLE_COUNT} array={sizes} itemSize={1} />
        <bufferAttribute attach="attributes-opacity" count={PARTICLE_COUNT} array={opacities} itemSize={1} />
      </bufferGeometry>
    </points>
  );
};

// ✅ Neuron connections (synapses)
const NeuronConnections = ({ positions, isSpeaking }: any) => {
  const ref = useRef<THREE.LineSegments>(null);

  const geometry = useMemo(() => {
    const lines: number[] = [];
    const threshold = 1.2;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      for (let j = i + 1; j < PARTICLE_COUNT; j++) {
        const dx = positions[i * 3] - positions[j * 3];
        const dy = positions[i * 3 + 1] - positions[j * 3 + 1];
        const dz = positions[i * 3 + 2] - positions[j * 3 + 2];

        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist < threshold) {
          lines.push(
            positions[i * 3],
            positions[i * 3 + 1],
            positions[i * 3 + 2],
            positions[j * 3],
            positions[j * 3 + 1],
            positions[j * 3 + 2]
          );
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(lines, 3));
    return geo;
  }, [positions]);

  useFrame(() => {
    if (!ref.current) return;
    const mat = ref.current.material as THREE.LineBasicMaterial;

    mat.opacity = isSpeaking
      ? 0.3 + Math.sin(Date.now() * 0.01) * 0.2
      : 0.08;
  });

  return (
    <lineSegments ref={ref} geometry={geometry}>
      <lineBasicMaterial color={GREEN_PRIMARY} transparent opacity={0.08} />
    </lineSegments>
  );
};

const JarvisParticles = ({ isSpeaking, isActive }: ParticleFieldProps) => {
  const { positions } = useMemo(() => {
    const arr = new Float32Array(PARTICLE_COUNT * 3);
    return { positions: arr };
  }, []);

  return (
    <div className="fixed inset-0 z-0">
      <Canvas
        camera={{ position: [0, 0, 10], fov: 60 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
      >
        <ParticleField isSpeaking={isSpeaking} isActive={isActive} />
        <NeuronConnections positions={positions} isSpeaking={isSpeaking} />
      </Canvas>
    </div>
  );
};

export default JarvisParticles;
