import { Canvas, useFrame } from "@react-three/fiber";
import { useRef, useMemo, useState, useEffect } from "react";
import { SphereGeometry, BufferGeometry, Float32BufferAttribute, Texture } from "three";
import { OrbitControls } from "@react-three/drei";

const RotatingEarth = () => {
  const groupRef = useRef<any>(null);
  const [imageBitmap, setImageBitmap] = useState<ImageBitmap | null>(null);

  useEffect(() => {
    let mounted = true;
    const urls = [
      "/textures/earth_atmos_2048.jpg",
      "https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg",
    ];

    (async () => {
      for (const url of urls) {
        try {
          const res = await fetch(url, { mode: "cors" });
          if (!res.ok) throw new Error("fetch failed");
          const blob = await res.blob();
          const bitmap = await createImageBitmap(blob);
          if (!mounted) return;
          setImageBitmap(bitmap);
          return;
        } catch (e) {
          // try next url
        }
      }
      // no image loaded — leave imageBitmap null and fallback to procedural points
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // Create a full-color globe texture so the map is clear and easy to read.
  const earthTexture = useMemo(() => {
    if (!imageBitmap) return null;
    const w = imageBitmap.width || 2048;
    const h = imageBitmap.height || 1024;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(imageBitmap as any, 0, 0, w, h);

    const tex = new Texture(canvas as HTMLCanvasElement);
    tex.needsUpdate = true;
    return tex;
  }, [imageBitmap]);

  // Create a sparse points geometry sampled from the globe texture to give a dotted effect.
  const pointsGeometry = useMemo(() => {
    const sphere = new SphereGeometry(1.002, 72, 72);
    const pos = sphere.getAttribute("position");
    const uv = sphere.getAttribute("uv");

    const positions: number[] = [];
    const colors: number[] = [];

    if (earthTexture && earthTexture.image) {
      const img = earthTexture.image as HTMLCanvasElement;
      const w = img.width;
      const h = img.height;
      const tmpCanvas = document.createElement("canvas");
      tmpCanvas.width = w;
      tmpCanvas.height = h;
      const tmpCtx = tmpCanvas.getContext("2d")!;
      tmpCtx.drawImage(img, 0, 0);
      const imgData = tmpCtx.getImageData(0, 0, w, h).data;

      for (let i = 0; i < pos.count; i++) {
        if (i % 3 !== 0) continue;
        const ux = uv.getX(i);
        const uy = uv.getY(i);
        const x = Math.floor(ux * (w - 1));
        const y = Math.floor((1 - uy) * (h - 1));
        const idx = (y * w + x) * 4;
        const r = imgData[idx];
        const g = imgData[idx + 1];
        const b = imgData[idx + 2];
        const gray = (r + g + b) / 3 / 255;

        positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
        const c = 0.12 + 0.6 * gray;
        colors.push(c, c, c);
      }
    } else {
      // Fallback procedural dotted texture when the globe image isn't available.
      for (let i = 0; i < pos.count; i++) {
        if (i % 4 !== 0) continue;
        const y = pos.getY(i); // -1..1
        const latBias = 1 - Math.abs(y);
        if (Math.random() > 0.18 * latBias) continue;
        positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
        const c = 0.18 + Math.random() * 0.45;
        colors.push(c, c, c);
      }
    }

    const geom = new BufferGeometry();
    geom.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geom.setAttribute("color", new Float32BufferAttribute(colors, 3));
    return geom;
  }, [earthTexture]);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += (Math.PI * 2 * delta) / 50;
    }
  });

  return (
    <group ref={groupRef} rotation={[0.15, 0, 0]}>
      <mesh>
        <sphereGeometry args={[1, 128, 128]} />
        <meshStandardMaterial
          map={(earthTexture as Texture) || undefined}
          color="#0e0d0d00"
          metalness={0}
          roughness={0.8}
          emissive="#000000"
          emissiveIntensity={0}
        />
      </mesh>

      {pointsGeometry && (
        <points geometry={pointsGeometry}>
          <pointsMaterial size={0.012} sizeAttenuation vertexColors depthWrite={false} />
        </points>
      )}
    </group>
  );
};

const WorldMap = () => {
  return (
    <div
      role="img"
      aria-label="Interactive 3D globe map"
      className="relative w-full h-full rounded-full overflow-hidden bg-slate-950 shadow-2xl shadow-black/60"
    >
      <Canvas className="w-full h-full cursor-grab active:cursor-grabbing" camera={{ position: [0, 0, 3.2], fov: 35 }} gl={{ antialias: true, alpha: true }}>
        <ambientLight intensity={0.65} />
        <directionalLight position={[5, 3, 5]} intensity={1.0} color="#d3dce4" />
        <directionalLight position={[-5, -3, -5]} intensity={0.35} color="#9ca3af" />
        <RotatingEarth />
        <OrbitControls enablePan={true} enableZoom enableRotate zoomSpeed={0.6} minDistance={1.6} maxDistance={6} />
      </Canvas>
      <div className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.03),transparent_25%)] opacity-8" />
      <div className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.02),transparent_60%)] opacity-10" />
    </div>
  );
};

export default WorldMap;
