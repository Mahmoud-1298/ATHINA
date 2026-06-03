import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { TextureLoader } from "three/src/loaders/TextureLoader";
import { useRef, useMemo } from "react";
import { SphereGeometry, BufferGeometry, Float32BufferAttribute, Texture } from "three";

const RotatingEarth = () => {
  const groupRef = useRef<any>(null);
  const earthTexture = useLoader(
    TextureLoader,
    "https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg"
  );

  // Create a desaturated, darkened grayscale texture to avoid color blackout
  const processedTexture = useMemo(() => {
    if (!earthTexture || !earthTexture.image) return null;
    const img = earthTexture.image as HTMLImageElement | HTMLCanvasElement;
    const w = img.width || 2048;
    const h = img.height || 1024;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, w, h);

    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const gray = 0.3 * r + 0.59 * g + 0.11 * b;
      // Desaturate and darken for monochrome aesthetic
      const out = Math.max(8, Math.floor(gray * 0.55));
      data[i] = data[i + 1] = data[i + 2] = out;
    }
    ctx.putImageData(imgData, 0, 0);

    const tex = new Texture(canvas as HTMLCanvasElement);
    tex.needsUpdate = true;
    tex.encoding = earthTexture.encoding;
    return tex;
  }, [earthTexture]);

  // Create a sparse points geometry sampled from the processed texture to give a dotted effect
  const pointsGeometry = useMemo(() => {
    if (!processedTexture || !processedTexture.image) return null;

    const img = processedTexture.image as HTMLCanvasElement;
    const w = img.width;
    const h = img.height;
    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width = w;
    tmpCanvas.height = h;
    const tmpCtx = tmpCanvas.getContext("2d")!;
    tmpCtx.drawImage(img, 0, 0);
    const imgData = tmpCtx.getImageData(0, 0, w, h).data;

    const sphere = new SphereGeometry(1.002, 72, 72);
    const pos = sphere.getAttribute("position");
    const uv = sphere.getAttribute("uv");

    const positions: number[] = [];
    const colors: number[] = [];

    for (let i = 0; i < pos.count; i++) {
      // reduce density for a dotted look
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

      // map gray to a dark gray palette (lighter where texture is brighter)
      const c = 0.12 + 0.6 * gray; // 0.12..0.72
      colors.push(c, c, c);
    }

    const geom = new BufferGeometry();
    geom.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geom.setAttribute("color", new Float32BufferAttribute(colors, 3));
    return geom;
  }, [processedTexture]);

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
          map={(processedTexture as Texture) || undefined}
          color="#ffffff"
          metalness={0}
          roughness={1}
          emissive="#000000"
          emissiveIntensity={0}
        />
      </mesh>

      {pointsGeometry && (
        <points geometry={pointsGeometry}>
          <pointsMaterial size={0.008} vertexColors depthWrite={false} />
        </points>
      )}
    </group>
  );
};

const WorldMap = () => {
  return (
    <div className="relative w-full h-full rounded-full overflow-hidden bg-gradient-to-b from-slate-900 via-slate-950 to-black shadow-2xl shadow-black/60">
      <Canvas
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
