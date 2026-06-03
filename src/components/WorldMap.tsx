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
      earthRef.current.rotation.y += (Math.PI * 2 * delta) / 30;
    }
  });

  return (
    <mesh ref={earthRef} rotation={[0.14, 0, 0]}>
      <sphereGeometry args={[1, 64, 64]} />
      <meshStandardMaterial
        map={earthTexture}
        metalness={0.18}
        roughness={0.68}
        emissive="#091020"
        emissiveIntensity={0.2}
      />
    </mesh>
  );
};

const WorldMap = () => {
  return (
    <div className="relative w-full h-full rounded-full overflow-hidden bg-slate-950/90 ring-1 ring-white/10 border border-white/10 shadow-2xl shadow-black/50">
      <Canvas
        camera={{ position: [0, 0, 3.2], fov: 35 }}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.25} />
        <directionalLight position={[5, 2, 5]} intensity={1.25} color="#a5f3fc" />
        <directionalLight position={[-4, -2, -4]} intensity={0.45} color="#60a5fa" />
        <RotatingEarth />
      </Canvas>

      <div className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_20%)] opacity-30" />
      <div className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.05),transparent_50%)] opacity-70" />
      <div className="pointer-events-none absolute inset-0 rounded-full border border-white/10 opacity-20" />

      <div className="absolute top-4 left-4 flex flex-col gap-2 rounded-3xl border border-white/10 bg-slate-950/70 p-3 text-xs text-slate-300 shadow-2xl shadow-black/40 backdrop-blur-sm">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-slate-400">
          <span>ATHINA</span>
          <span className="text-emerald-300">LIVE</span>
        </div>
        <div className="grid gap-1">
          <div className="flex items-center justify-between text-[11px] text-slate-300">
            <span className="text-slate-400">Rotation</span>
            <span>1 rev / 30s</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-300">
            <span className="text-slate-400">Mode</span>
            <span>Dark</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorldMap;
