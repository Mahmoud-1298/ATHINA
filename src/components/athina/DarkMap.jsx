import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMap, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

function FlyTo({ center, zoom = 11 }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, zoom, { duration: 1.5 });
  }, [center, zoom, map]);
  return null;
}

function ClickHandler({ onClick }) {
  const map = useMap();
  useEffect(() => {
    if (!onClick) return;
    const handler = (e) => onClick({ lat: e.latlng.lat, lng: e.latlng.lng });
    map.on('click', handler);
    return () => map.off('click', handler);
  }, [map, onClick]);
  return null;
}

const markerIcon = L.divIcon({
  className: '',
  html: `
    <div style="position: relative; width: 24px; height: 24px;">
      <div style="position: absolute; inset: 0; border-radius: 50%; background: #00e5ff; opacity: 0.3; animation: athina-pulse-marker 1.5s infinite ease-out;"></div>
      <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 10px; height: 10px; border-radius: 50%; background: #00e5ff; box-shadow: 0 0 12px #00e5ff, 0 0 24px rgba(0,229,255,0.5);"></div>
    </div>
  `,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

export default function DarkMap({ markers = [], flyTo = null, route = null, onLocationSelect }) {
  return (
    <MapContainer
      center={[25.2048, 55.2708]}
      zoom={3}
      minZoom={2}
      className="h-full w-full"
      style={{ background: '#06080d' }}
      worldCopyJump={true}
      zoomControl={true}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; OpenStreetMap &copy; CARTO'
        maxZoom={19}
      />
      <FlyTo center={flyTo} />
      <ClickHandler onClick={onLocationSelect} />
      {markers.map((m, i) => (
        <Marker key={i} position={[m.lat, m.lng]} icon={markerIcon} />
      ))}
      {route && route.length > 0 && (
        <Polyline positions={route} pathOptions={{ color: '#00e5ff', weight: 3, opacity: 0.7 }} />
      )}
    </MapContainer>
  );
}