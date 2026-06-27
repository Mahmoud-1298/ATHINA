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
      map.flyTo([target.lat, target.lng], 12, { duration: 1.3 });
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

const WorldMap = ({ target }: WorldMapProps) => {
  const center = useMemo<[number, number]>(
    () => (target ? [target.lat, target.lng] : [25.2048, 55.2708]),
    [target]
  );

  return (
    <div className="relative h-full w-full overflow-hidden rounded-3xl border border-white/10 bg-slate-950 shadow-2xl shadow-black/80">
      <MapContainer center={center} zoom={target ? 12 : 3} className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png"
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
      <div className="pointer-events-none absolute left-4 top-4 rounded-full border border-white/10 bg-slate-950/85 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-200">
        Map
      </div>
    </div>
  );
};

export default WorldMap;
