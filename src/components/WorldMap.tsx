import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { TextureLoader } from "three";
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
          color="#ffffff"
          metalness={0}
          roughness={0.9}
          emissive="#000000"
          emissiveIntensity={0.05}
          transparent={false}
        />
      </mesh>
    </>
  );
};

const WorldMap = () => {
  return (
    <div className="relative w-full h-full rounded-full overflow-hidden bg-gradient-to-b from-slate-900 via-slate-950 to-black shadow-2xl shadow-black/60">
      <Canvas
        className="w-full h-full"
        camera={{ position: [0, 0, 3.2], fov: 35 }}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.3} />
        <directionalLight position={[5, 3, 5]} intensity={0.8} color="#bfc7d1" />
        <directionalLight position={[-5, -3, -5]} intensity={0.25} color="#6b7280" />
        <RotatingEarth />
      </Canvas>
      <div className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.03),transparent_25%)] opacity-12" />
      <div className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.02),transparent_60%)] opacity-18" />
    </div>
  );
};

export default WorldMap;
