import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import ThreeGlobe from "three-globe";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { feature } from "topojson-client";

export interface MapTarget {
  name: string;
  lat: number;
  lng: number;
  query?: string;
}

interface GlobeMapProps {
  target?: MapTarget | null;
  className?: string;
  onSelectLocation?: (target: MapTarget) => void;
}

interface CountryFeature {
  properties?: {
    name?: string;
    NAME?: string;
    ADMIN?: string;
  };
}

interface WorldAtlasData {
  objects: {
    countries: object;
  };
}

const formatCoord = (value: number) => value.toFixed(3);

const normalizeLng = (lng: number) => {
  let out = lng;
  while (out > 180) out -= 360;
  while (out < -180) out += 360;
  return out;
};

const GlobeMap = ({ target, className, onSelectLocation }: GlobeMapProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<any>(null);
  const targetRef = useRef<MapTarget | null>(target);
  const [hoverInfo, setHoverInfo] = useState<{
    lat: number;
    lng: number;
    country?: string;
  } | null>(null);
  const [hoverCountry, setHoverCountry] = useState<string | null>(null);

  useEffect(() => {
    targetRef.current = target;
  }, [target]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let width = container.clientWidth;
    let height = container.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 1000);
    camera.position.set(0, 0, 280);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.minDistance = 160;
    controls.maxDistance = 420;
    controls.rotateSpeed = 0.55;
    controls.zoomSpeed = 0.7;

    scene.add(new THREE.AmbientLight(0x777777, 0.75));
    const dirA = new THREE.DirectionalLight(0xffffff, 1.1);
    dirA.position.set(150, 110, 220);
    scene.add(dirA);

    const dirB = new THREE.DirectionalLight(0x9ca3af, 0.45);
    dirB.position.set(-220, -60, -140);
    scene.add(dirB);

    const globe = new ThreeGlobe()
      .globeImageUrl("https://unpkg.com/three-globe/example/img/earth-dark.jpg")
      .bumpImageUrl("https://unpkg.com/three-globe/example/img/earth-topology.png")
      .showAtmosphere(true)
      .atmosphereColor("#d4d4d8")
      .atmosphereAltitude(0.15)
      .polygonCapColor(() => "rgba(156,163,175,0.18)")
      .polygonSideColor(() => "rgba(39,39,42,0.28)")
      .polygonStrokeColor(() => "rgba(229,231,235,0.55)")
      .polygonAltitude(0.006)
      .pointColor(() => "#f4f4f5")
      .pointAltitude(0.03)
      .pointRadius(0.42)
      .pointResolution(14)
      .labelColor(() => "#f4f4f5")
      .labelSize(0.72)
      .labelDotRadius(0.12)
      .labelResolution(3)
      .labelText("text")
      .labelsTransitionDuration(220);

    globeRef.current = globe;
    scene.add(globe as unknown as THREE.Object3D);

    const setTargetPoint = (mapTarget: MapTarget | null) => {
      if (!globeRef.current) return;
      if (!mapTarget) {
        globeRef.current.pointsData([]);
        globeRef.current.labelsData([]);
        return;
      }

      globeRef.current
        .pointsData([
          {
            lat: mapTarget.lat,
            lng: mapTarget.lng,
            size: 0.5,
            color: "#f8fafc",
          },
        ])
        .labelsData([
          {
            lat: mapTarget.lat,
            lng: mapTarget.lng,
            text: mapTarget.name || mapTarget.query || "Selected location",
          },
        ]);

      globeRef.current.pointRadius("size");
      globeRef.current.pointColor("color");
      globeRef.current.pointAltitude(0.035);

      const distance = camera.position.length();
      globeRef.current.pointOfView(
        {
          lat: mapTarget.lat,
          lng: mapTarget.lng,
          altitude: Math.max(1.7, distance / 120),
        },
        950
      );
    };

    const loadCountries = async () => {
      try {
        const response = await fetch("https://unpkg.com/world-atlas@2/countries-110m.json");
        const world = (await response.json()) as WorldAtlasData;
        const countries = feature(world, world.objects.countries) as unknown as { features: CountryFeature[] };
        const features = countries.features;

        globe
          .polygonsData(features)
          .polygonLabel((d: CountryFeature) => d.properties?.name || d.properties?.NAME || d.properties?.ADMIN || "Country")
          .onPolygonHover((d: CountryFeature | null) => {
            setHoverCountry(d ? (d.properties?.name || d.properties?.NAME || d.properties?.ADMIN || null) : null);
          });
      } catch (error) {
        console.error("Failed to load country polygons:", error);
      }
    };

    loadCountries();
    setTargetPoint(targetRef.current);

    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;

    const handleDown = (event: PointerEvent) => {
      isDragging = true;
      dragStartX = event.clientX;
      dragStartY = event.clientY;
    };

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const handleMove = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);

      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObject(globe as unknown as THREE.Object3D, true);
      if (hits.length === 0) {
        setHoverInfo(null);
        return;
      }

      const info = globe.toGeoCoords(hits[0].point);
      if (!info) return;
      setHoverInfo(() => ({
        lat: info.lat,
        lng: normalizeLng(info.lng),
        country: hoverCountry || undefined,
      }));
    };

    const handleLeave = () => {
      setHoverInfo(null);
    };

    const handleUp = (event: PointerEvent) => {
      if (!isDragging) return;
      isDragging = false;

      const moved = Math.hypot(event.clientX - dragStartX, event.clientY - dragStartY);
      if (moved > 6) return;

      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);

      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObject(globe as unknown as THREE.Object3D, true);
      if (hits.length === 0) return;

      const info = globe.toGeoCoords(hits[0].point);
      if (!info || !onSelectLocation) return;

      const lat = info.lat;
      const lng = normalizeLng(info.lng);
      const selected: MapTarget = {
        name: `Selected ${formatCoord(lat)}, ${formatCoord(lng)}`,
        lat,
        lng,
        query: "Map selection",
      };
      onSelectLocation(selected);
      setTargetPoint(selected);
    };

    renderer.domElement.addEventListener("pointerdown", handleDown);
    renderer.domElement.addEventListener("pointermove", handleMove);
    renderer.domElement.addEventListener("pointerleave", handleLeave);
    renderer.domElement.addEventListener("pointerup", handleUp);

    const animate = () => {
      if (!globeRef.current) return;
      controls.update();
      if (!targetRef.current) {
        (globeRef.current as THREE.Object3D).rotation.y += 0.0014;
      }
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };

    let frameId = requestAnimationFrame(animate);

    const handleResize = () => {
      width = container.clientWidth;
      height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", handleDown);
      renderer.domElement.removeEventListener("pointermove", handleMove);
      renderer.domElement.removeEventListener("pointerleave", handleLeave);
      renderer.domElement.removeEventListener("pointerup", handleUp);
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [hoverCountry, onSelectLocation]);

  useEffect(() => {
    if (!globeRef.current) return;
    if (!target) {
      globeRef.current.pointsData([]);
      globeRef.current.labelsData([]);
      return;
    }

    globeRef.current
      .pointsData([
        {
          lat: target.lat,
          lng: target.lng,
          size: 0.5,
          color: "#f8fafc",
        },
      ])
      .labelsData([
        {
          lat: target.lat,
          lng: target.lng,
          text: target.name || target.query || "Selected location",
        },
      ]);

    globeRef.current.pointRadius("size");
    globeRef.current.pointColor("color");
    globeRef.current.pointAltitude(0.035);
    globeRef.current.pointOfView(
      {
        lat: target.lat,
        lng: target.lng,
        altitude: 1.9,
      },
      900
    );
  }, [target]);

  const infoText = useMemo(() => {
    if (target) {
      return `${formatCoord(target.lat)}, ${formatCoord(target.lng)}`;
    }
    if (!hoverInfo) {
      return "drag, zoom, hover, and click to explore";
    }

    const base = `${formatCoord(hoverInfo.lat)}, ${formatCoord(hoverInfo.lng)}`;
    return hoverInfo.country ? `${hoverInfo.country} | ${base}` : base;
  }, [hoverInfo, target]);

  return (
    <div
      className={`relative overflow-hidden rounded-full border border-white/10 bg-gradient-to-br from-black via-zinc-950 to-zinc-800 shadow-[0_0_60px_rgba(0,0,0,0.6)] ${className || ""}`}
    >
      <div ref={containerRef} className="h-full w-full" />
      <div className="pointer-events-none absolute left-4 top-4 rounded-full border border-white/15 bg-black/70 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-zinc-200/85">
        Interactive globe
      </div>
      <div className="pointer-events-none absolute bottom-4 left-4 right-4 rounded-2xl border border-white/10 bg-black/60 px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-zinc-200/75 backdrop-blur-md">
        {infoText}
      </div>
    </div>
  );
};

export default GlobeMap;
