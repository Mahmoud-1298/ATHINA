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
}

const FlyToTarget = ({ target }: WorldMapProps) => {
  const map = useMap();

  useEffect(() => {
    if (target) {
      map.flyTo([target.lat, target.lng], 13, { duration: 1.1 });
    }
  }, [map, target]);

  return null;
};

const markerIcon = L.divIcon({
  className: "athina-map-marker",
  html: '<span class="athina-map-marker-pulse"></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const WorldMap = ({ target }: WorldMapProps) => {
  const center = useMemo<[number, number]>(
    () => (target ? [target.lat, target.lng] : [25.2048, 55.2708]),
    [target]
  );

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg border border-emerald-400/20 bg-slate-950 shadow-2xl shadow-black/60">
      <MapContainer center={center} zoom={target ? 13 : 3} className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FlyToTarget target={target} />
        {target && (
          <Marker position={[target.lat, target.lng]} icon={markerIcon}>
            <Popup>
              <strong>{target.query || "Located target"}</strong>
              <br />
              {target.name}
            </Popup>
          </Marker>
        )}
      </MapContainer>
      <div className="pointer-events-none absolute left-3 top-3 rounded bg-slate-950/85 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-300">
        Map
      </div>
    </div>
  );
};

export default WorldMap;
