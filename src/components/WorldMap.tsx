import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface MapTarget {
  name: string;
  lat: number;
  lng: number;
  query?: string;
}

interface WorldMapProps {
  target?: MapTarget | null;
  className?: string;
  isBackground?: boolean;
}

const FlyToTarget = ({ target }: WorldMapProps) => {
  const map = useMap();

  useEffect(() => {
    if (target) {
      map.flyTo([target.lat, target.lng], 6.5, { duration: 1.4 });
    }
  }, [map, target]);

  return null;
};

const markerIcon = L.divIcon({
  className: "athina-map-marker",
  html: '<span class="athina-map-marker-pulse"></span>',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

const WorldMap = ({ target, className, isBackground = false }: WorldMapProps) => {
  const center = useMemo<[number, number]>(
    () => (target ? [target.lat, target.lng] : [25.2048, 55.2708]),
    [target]
  );

  return (
    <div
      className={`athina-worldmap relative h-full w-full overflow-hidden bg-slate-950 ${
        isBackground ? "rounded-none border-0" : "rounded-3xl border border-white/10 shadow-2xl shadow-black/80"
      } ${className || ""}`}
    >
      <MapContainer
        center={center}
        zoom={target ? 6.5 : 2.6}
        className="h-full w-full"
        zoomControl={false}
        attributionControl={false}
        dragging
        scrollWheelZoom
        doubleClickZoom
        touchZoom
        boxZoom
        keyboard
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png"
        />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}@2x.png"
          opacity={0.16}
        />
        <FlyToTarget target={target} />
        {target && (
          <Marker position={[target.lat, target.lng]} icon={markerIcon}>
            <Popup className="bg-slate-950 text-slate-50">
              <div className="space-y-1">
                <p className="font-semibold text-slate-100">{target.query || "Located target"}</p>
                <p className="text-[13px] text-slate-300">{target.name}</p>
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>

      <div className="athina-worldmap-grain" />
      <div className="athina-worldmap-vignette" />
      <div className="athina-worldmap-dotmask" />

      {!isBackground && (
        <div className="pointer-events-none absolute left-4 top-4 rounded-full border border-white/10 bg-slate-950/85 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-200">
          Map
        </div>
      )}
    </div>
  );
};

export default WorldMap;
