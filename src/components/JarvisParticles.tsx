import { useRef, useMemo, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

const PARTICLE_COUNT = 2000;
const SPHERE_RADIUS = 4;

const GREEN_PRIMARY = "#7AB928";
const GREEN_DARK = "#5A8A1E";


interface ParticleFieldProps {
  isSpeaking: boolean;
  isActive: boolean;
}

const ParticleField = ({ isSpeaking, isActive }: ParticleFieldProps) => {
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
      const r = SPHERE_RADIUS * (0.3 + Math.random() * 0.7);

      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      basePositions[i * 3] = x;
      basePositions[i * 3 + 1] = y;
      basePositions[i * 3 + 2] = z;

      sizes[i] = Math.random() * 2.5 + 0.5;
      opacities[i] = Math.random() * 0.6 + 0.2;
    }

    return { positions, basePositions, sizes, opacities };
  }, []);

  useEffect(() => {
    targetScatter.current = isSpeaking ? 1 : 0;
  }, [isSpeaking]);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    timeRef.current += delta;

    currentScatter.current += (targetScatter.current - currentScatter.current) * delta * 3;
    const scatter = currentScatter.current;
    const time = timeRef.current;

    const posArray = meshRef.current.geometry.attributes.position.array as Float32Array;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;
      const bx = basePositions[i3];
      const by = basePositions[i3 + 1];
      const bz = basePositions[i3 + 2];

      // Gentle orbit
      const speed = 0.1 + (i % 5) * 0.02;
      const ox = Math.sin(time * speed + i * 0.008) * 0.2;
      const oy = Math.cos(time * speed * 0.6 + i * 0.012) * 0.2;
      const oz = Math.sin(time * speed * 0.4 + i * 0.016) * 0.15;

      // Scatter outward
      const dist = Math.sqrt(bx * bx + by * by + bz * bz) || 1;
      const nx = bx / dist;
      const ny = by / dist;
      const nz = bz / dist;

      const scatterForce = scatter * (1.5 + Math.sin(time * 6 + i * 0.5) * 0.8);
      const wave = scatter * Math.sin(time * 10 + dist * 3) * 0.3;

      posArray[i3] = bx + ox + nx * scatterForce + nx * wave;
      posArray[i3 + 1] = by + oy + ny * scatterForce + ny * wave;
      posArray[i3 + 2] = bz + oz + nz * scatterForce + nz * wave;
    }

    meshRef.current.geometry.attributes.position.needsUpdate = true;
    meshRef.current.rotation.y = time * 0.04;
    meshRef.current.rotation.x = Math.sin(time * 0.025) * 0.08;
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
        varying float vDepth;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (180.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
          vAlpha = opacity * smoothstep(18.0, 3.0, -mvPosition.z);
          vDepth = -mvPosition.z;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor1;
        uniform vec3 uColor2;
        varying float vAlpha;
        varying float vDepth;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          float glow = exp(-d * 6.0);
          float core = exp(-d * 16.0);
          vec3 color = mix(uColor2, uColor1, core);
          vec3 bright = color + vec3(0.6, 0.9, 0.3) * core * 0.5;
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

// Orbital ring with warm glow
const OrbitalRing = ({ radius, speed, tilt, opacity, isSpeaking }: { radius: number; speed: number; tilt: number; opacity: number; isSpeaking: boolean }) => {
  const ref = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (!ref.current) return;
    ref.current.rotation.z += delta * speed;
    const s = isSpeaking ? 1.25 : 1;
    ref.current.scale.lerp(new THREE.Vector3(s, s, s), delta * 2);
  });

  return (
    <mesh ref={ref} rotation={[Math.PI / 2 + tilt, tilt * 0.5, 0]}>
      <torusGeometry args={[radius, 0.015, 16, 120]} />
      <meshBasicMaterial color={GREEN_PRIMARY} transparent opacity={opacity} />
    </mesh>
  );
};

// Fine connecting lines/arcs
const ArcLines = ({ isSpeaking }: { isSpeaking: boolean }) => {
  const ref = useRef<THREE.LineSegments>(null);
  const time = useRef(0);

  const geometry = useMemo(() => {
    const points: number[] = [];
    const count = 40;
    for (let i = 0; i < count; i++) {
      const theta1 = Math.random() * Math.PI * 2;
      const phi1 = Math.acos(2 * Math.random() - 1);
      const theta2 = theta1 + (Math.random() - 0.5) * 0.8;
      const phi2 = phi1 + (Math.random() - 0.5) * 0.8;
      const r = 3.5;

      points.push(
        r * Math.sin(phi1) * Math.cos(theta1),
        r * Math.sin(phi1) * Math.sin(theta1),
        r * Math.cos(phi1),
        r * Math.sin(phi2) * Math.cos(theta2),
        r * Math.sin(phi2) * Math.sin(theta2),
        r * Math.cos(phi2)
      );
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    return geo;
  }, []);

  useFrame((_, delta) => {
    if (!ref.current) return;
    time.current += delta;
    ref.current.rotation.y = time.current * 0.03;
    ref.current.rotation.x = Math.sin(time.current * 0.02) * 0.05;
    const mat = ref.current.material as THREE.LineBasicMaterial;
    mat.opacity = isSpeaking ? 0.15 : 0.06;
  });

  return (
    <lineSegments ref={ref} geometry={geometry}>
      <lineBasicMaterial color={GREEN_PRIMARY} transparent opacity={0.06} />
    </lineSegments>
  );
};

const JarvisParticles = ({ isSpeaking, isActive }: ParticleFieldProps) => {
  return (
    <div className="fixed inset-0 z-0">
      <Canvas
        camera={{ position: [0, 0, 10], fov: 60 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
      >
        <ParticleField isSpeaking={isSpeaking} isActive={isActive} />
        <OrbitalRing radius={3.0} speed={0.25} tilt={0} opacity={0.2} isSpeaking={isSpeaking} />
        <OrbitalRing radius={3.6} speed={-0.15} tilt={0.4} opacity={0.1} isSpeaking={isSpeaking} />
        <OrbitalRing radius={4.2} speed={0.1} tilt={-0.3} opacity={0.06} isSpeaking={isSpeaking} />
        <ArcLines isSpeaking={isSpeaking} />
      </Canvas>
    </div>
  );
};

export default JarvisParticles;
