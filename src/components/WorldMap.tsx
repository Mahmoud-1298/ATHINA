import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const RLMapContainer = MapContainer as any;
const RLTileLayer = TileLayer as any;
const RLMarker = Marker as any;
const RLPopup = Popup as any;

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
  onSelectLocation?: (target: MapTarget) => void;
}

const FlyToTarget = ({ target }: WorldMapProps) => {
  const map = useMap();

  useEffect(() => {
    if (target) {
      map.flyTo([target.lat, target.lng], 4.8, { duration: 1.6 });
    }
  }, [map, target]);

  return null;
};

const MapInteraction = ({
  onHover,
  onSelectLocation,
}: {
  onHover: (lat: number, lng: number) => void;
  onSelectLocation?: (target: MapTarget) => void;
}) => {
  useMapEvents({
    mousemove: (event) => {
      onHover(event.latlng.lat, event.latlng.lng);
    },
    click: (event) => {
      if (!onSelectLocation) return;
      onSelectLocation({
        name: `Selected point ${event.latlng.lat.toFixed(4)}, ${event.latlng.lng.toFixed(4)}`,
        lat: event.latlng.lat,
        lng: event.latlng.lng,
        query: "Map selection",
      });
    },
  });

  return null;
};

const markerIcon = L.divIcon({
  className: "athina-map-marker",
  html: '<span class="athina-map-marker-pulse"></span>',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

const WorldMap = ({ target, className, isBackground = false, onSelectLocation }: WorldMapProps) => {
  const center = useMemo<[number, number]>(
    () => (target ? [target.lat, target.lng] : [25.2048, 55.2708]),
    [target]
  );
  const [hoverCoords, setHoverCoords] = useState<{ lat: number; lng: number } | null>(null);

  return (
    <div
      className={`athina-worldmap relative h-full w-full overflow-hidden bg-slate-950 ${
        isBackground ? "rounded-none border-0" : "rounded-3xl border border-white/10 shadow-2xl shadow-black/80"
      } ${className || ""}`}
    >
      <RLMapContainer
        center={center}
        zoom={target ? 4.8 : 2.4}
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
        <RLTileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; CARTO'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png"
        />
        <FlyToTarget target={target} />
        <MapInteraction onHover={(lat, lng) => setHoverCoords({ lat, lng })} onSelectLocation={onSelectLocation} />
        {target && (
          <RLMarker position={[target.lat, target.lng]} icon={markerIcon}>
            <RLPopup className="bg-slate-950 text-slate-50">
              <div className="space-y-1">
                <p className="font-semibold text-slate-100">{target.query || "Located target"}</p>
                <p className="text-[13px] text-slate-300">{target.name}</p>
              </div>
            </RLPopup>
          </RLMarker>
        )}
      </RLMapContainer>

      <div className="athina-worldmap-grain" />
      <div className="athina-worldmap-vignette" />
      <div className="athina-worldmap-dotmask" />

      {!isBackground && (
        <>
          <div className="pointer-events-none absolute left-4 top-4 rounded-full border border-white/80 bg-slate-950/85 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-200">
            2D Map
          </div>
          <div className="pointer-events-none absolute bottom-4 left-4 right-4 rounded-xl border border-white/90 bg-black/65 px-3 py-2 text-[10px] uppercase tracking-[0.16em] text-zinc-200/80 backdrop-blur-sm">
            {hoverCoords
              ? `hover ${hoverCoords.lat.toFixed(3)}, ${hoverCoords.lng.toFixed(3)}`
              : target
                ? `selected ${target.lat.toFixed(3)}, ${target.lng.toFixed(3)}`
                : "hover to inspect, click to select"}
          </div>
        </>
      )}
    </div>
  );
};

export default WorldMap;
