import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

const markerIcon = L.divIcon({
  className: '',
  html: '<div style="width:16px;height:16px;background:#a3a3a3;border:2px solid #525252;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 8px rgba(0,0,0,0.7);"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 16],
  popupAnchor: [0, -16],
});

function FlyTo({ position, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (position) {
      map.flyTo(position, zoom, { duration: 1.5 });
    }
  }, [position, zoom]);
  return null;
}

export default function InteractiveMap({ markers = [], flyTo, zoom = 14 }) {
  return (
    <MapContainer
      center={[25.2048, 55.2708]}
      zoom={10}
      className="h-full w-full"
      zoomControl={true}
      scrollWheelZoom={true}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; OpenStreetMap &copy; CARTO'
        maxZoom={19}
      />
      {markers.map((m, i) => (
        <Marker key={i} position={[m.lat, m.lng]} icon={markerIcon}>
          <Popup>
            <p className="font-medium text-sm">{m.name}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {Number(m.lat).toFixed(4)}, {Number(m.lng).toFixed(4)}
            </p>
          </Popup>
        </Marker>
      ))}
      {flyTo && <FlyTo position={flyTo} zoom={zoom} />}
    </MapContainer>
  );
}