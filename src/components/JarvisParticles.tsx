import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

const PARTICLE_COUNT = 900;
const CONNECTION_DISTANCE = 1.1;

const GREEN_PRIMARY = "#7AB928";
const GREEN_DARK = "#5A8A1E";

interface Props {
  isSpeaking: boolean;
  isActive: boolean;
}

/* ================= PARTICLES (BRAIN STRUCTURE) ================= */
const ParticleField = ({ isSpeaking }: Props) => {
  const ref = useRef<THREE.Points>(null);
  const basePositions = useRef<Float32Array>();
  const time = useRef(0);
  const scatter = useRef(0);

  const geometry = useMemo(() => {
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const sizes = new Float32Array(PARTICLE_COUNT);

    basePositions.current = new Float32Array(PARTICLE_COUNT * 3);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const side = i % 2 === 0 ? -1 : 1;

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;

      const r = 3 * (0.4 + Math.random() * 0.6);

      // 🧠 Brain-like shaping (left/right hemispheres)
      const x = side * (Math.sin(phi) * Math.cos(theta) * r * 1.2);
      const y = Math.sin(theta) * r * 0.6;
      const z = Math.cos(phi) * r;

      positions.set([x, y, z], i * 3);
      basePositions.current.set([x, y, z], i * 3);

      sizes[i] = Math.random() * 2 + 1;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

    return geo;
  }, []);

  useFrame((_, delta) => {
    if (!ref.current || !basePositions.current) return;

    time.current += delta;
    scatter.current += (isSpeaking ? 1 : 0 - scatter.current) * delta * 3;

    const pos = ref.current.geometry.attributes.position.array as Float32Array;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;

      const bx = basePositions.current[i3];
      const by = basePositions.current[i3 + 1];
      const bz = basePositions.current[i3 + 2];

      const len = Math.sqrt(bx * bx + by * by + bz * bz) || 1;

      const nx = bx / len;
      const ny = by / len;
      const nz = bz / len;

      const t = time.current;

      // idle movement
      const move =
        Math.sin(t * 0.6 + i) * 0.08 +
        Math.cos(t * 0.4 + i * 0.3) * 0.08;

      // speaking expansion
      const expand =
        scatter.current *
        (2.5 + Math.sin(t * 8 + i) * 1.5);

      const jitter = scatter.current * 0.4;

      pos[i3] =
        bx + nx * expand + move + (Math.random() - 0.5) * jitter;

      pos[i3 + 1] =
        by + ny * expand + move + (Math.random() - 0.5) * jitter;

      pos[i3 + 2] =
        bz + nz * expand + move + (Math.random() - 0.5) * jitter;
    }

    ref.current.geometry.attributes.position.needsUpdate = true;
    ref.current.rotation.y = time.current * 0.08;
  });

  const material = new THREE.ShaderMaterial({
    uniforms: {
      color1: { value: new THREE.Color(GREEN_PRIMARY) },
      color2: { value: new THREE.Color(GREEN_DARK) },
    },
    vertexShader: `
      attribute float size;
      varying float vAlpha;

      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (200.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
        vAlpha = smoothstep(15.0, 3.0, -mvPosition.z);
      }
    `,
    fragmentShader: `
      uniform vec3 color1;
      uniform vec3 color2;
      varying float vAlpha;

      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;

        float glow = exp(-d * 6.0);
        float core = exp(-d * 16.0);

        vec3 color = mix(color2, color1, core);
        vec3 bright = color + vec3(1.0, 1.5, 0.5) * core;

        gl_FragColor = vec4(bright, (glow + core) * vAlpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  return <points ref={ref} geometry={geometry} material={material} />;
};

/* ================= CONNECTIONS (REALISTIC NEURAL LINKS) ================= */
const Connections = ({ isSpeaking }: Props) => {
  const ref = useRef<THREE.LineSegments>(null);

  useFrame(() => {
    if (!ref.current) return;

    const particles = (ref.current.parent?.children[0] as any)
      ?.geometry?.attributes.position.array;

    if (!particles) return;

    const lines: number[] = [];
    const colors: number[] = [];

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      for (let j = i + 1; j < PARTICLE_COUNT; j++) {
        const dx = particles[i * 3] - particles[j * 3];
        const dy = particles[i * 3 + 1] - particles[j * 3 + 1];
        const dz = particles[i * 3 + 2] - particles[j * 3 + 2];

        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist < CONNECTION_DISTANCE) {
          const strength = 1 - dist;

          lines.push(
            particles[i * 3],
            particles[i * 3 + 1],
            particles[i * 3 + 2],
            particles[j * 3],
            particles[j * 3 + 1],
            particles[j * 3 + 2]
          );

          const glow = isSpeaking ? 1.0 : 0.3;

          colors.push(
            strength * glow,
            strength * 1.2 * glow,
            strength * 0.4 * glow,
            strength * glow,
            strength * 1.2 * glow,
            strength * 0.4 * glow
          );
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(lines, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

    ref.current.geometry.dispose();
    ref.current.geometry = geo;
  });

  return (
    <lineSegments ref={ref}>
      <lineBasicMaterial vertexColors transparent opacity={isSpeaking ? 0.6 : 0.15} />
    </lineSegments>
  );
};

/* ================= CORE ENERGY ================= */
const Core = ({ isSpeaking }: { isSpeaking: boolean }) => {
  const ref = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (!ref.current) return;

    const scale = isSpeaking ? 1.6 : 1;
    ref.current.scale.lerp(new THREE.Vector3(scale, scale, scale), delta * 3);
  });

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.5, 32, 32]} />
      <meshBasicMaterial color={GREEN_PRIMARY} transparent opacity={0.25} />
    </mesh>
  );
};

/* ================= MAIN ================= */
const JarvisParticles = ({ isSpeaking, isActive }: Props) => {
  return (
    <div className="fixed inset-0 z-0">
      <Canvas camera={{ position: [0, 0, 10], fov: 60 }}>
        <ParticleField isSpeaking={isSpeaking} isActive={isActive} />
        <Connections isSpeaking={isSpeaking} isActive={isActive} />
        <Core isSpeaking={isSpeaking} />
      </Canvas>
    </div>
  );
};

export default JarvisParticles;
