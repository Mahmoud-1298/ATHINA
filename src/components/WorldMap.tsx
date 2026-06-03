import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { TextureLoader } from "three/src/loaders/TextureLoader";
import { useRef } from "react";

const RotatingEarth = () => {
  const earthRef = useRef<any>(null);
  const earthTexture = useLoader(
    TextureLoader,
    "https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg"
  );

  useFrame((_, delta) => {
    if (earthRef.current) {
      earthRef.current.rotation.y += (Math.PI * 2 * delta) / 50;
    }
  });

  return (
    <>
      <mesh ref={earthRef} rotation={[0.15, 0, 0]}>
        <sphereGeometry args={[1, 128, 128]} />
        <meshStandardMaterial
          map={earthTexture}
          color="#9ca3af"
          metalness={0.2}
          roughness={0.55}
          emissive="#0b1726"
          emissiveIntensity={0.2}
        />
      </mesh>
      <mesh rotation={[0.15, 0, 0]}>
        <sphereGeometry args={[1.01, 64, 64]} />
        <meshBasicMaterial
          color="#94a3b8"
          wireframe
          transparent
          opacity={0.18}
        />
      </mesh>
    </>
  );
};

const WorldMap = () => {
  return (
    <div className="relative w-full h-full rounded-full overflow-hidden bg-slate-950/95 ring-1 ring-white/10 border border-white/10 shadow-2xl shadow-black/60">
      <Canvas
        camera={{ position: [0, 0, 3.2], fov: 35 }}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.3} />
        <directionalLight position={[5, 3, 5]} intensity={0.9} color="#cbd5e1" />
        <directionalLight position={[-5, -3, -5]} intensity={0.3} color="#475569" />
        <RotatingEarth />
      </Canvas>

      <div className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.05),transparent_20%)] opacity-20" />
      <div className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.03),transparent_55%)] opacity-40" />
      <div className="pointer-events-none absolute inset-0 rounded-full border border-white/10 opacity-15" />
    </div>
  );
};

export default WorldMap;
