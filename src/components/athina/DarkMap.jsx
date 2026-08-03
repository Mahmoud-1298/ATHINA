import React, { useEffect } from 'react';
import {
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

function FlyTo({ center, zoom = 11 }) {
  const map = useMap();

  useEffect(() => {
    if (!center) return;

    const lat = Number(center[0]);
    const lng = Number(center[1]);

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) {
      return;
    }

    map.flyTo(
      [lat, lng],
      zoom,
      {
        duration: 1.5,
      },
    );
  }, [center, zoom, map]);

  return null;
}

function ClickHandler({ onClick }) {
  const map = useMap();

  useEffect(() => {
    if (!onClick) return undefined;

    const handler = (event) => {
      onClick({
        lat: event.latlng.lat,
        lng: event.latlng.lng,
      });
    };

    map.on('click', handler);

    return () => {
      map.off('click', handler);
    };
  }, [map, onClick]);

  return null;
}

const markerIcon = L.divIcon({
  className: 'athina-map-marker',
  html: `
    <div class="athina-map-marker__container">
      <div class="athina-map-marker__pulse"></div>
      <div class="athina-map-marker__halo"></div>
      <div class="athina-map-marker__core"></div>
    </div>
  `,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  tooltipAnchor: [0, -18],
});

const isValidCoordinate = (value) =>
  typeof value === 'number' &&
  Number.isFinite(value);

const isValidMarker = (marker) =>
  marker &&
  isValidCoordinate(marker.lat) &&
  isValidCoordinate(marker.lng) &&
  marker.lat >= -90 &&
  marker.lat <= 90 &&
  marker.lng >= -180 &&
  marker.lng <= 180;

const getMarkerKey = (marker, index) =>
  [
    marker.lat,
    marker.lng,
    marker.name || marker.location || index,
  ].join('-');

export default function DarkMap({
  markers = [],
  flyTo = null,
  route = null,
  onLocationSelect,
}) {
  const safeMarkers = Array.isArray(markers)
    ? markers.filter(isValidMarker)
    : [];

  const safeRoute = Array.isArray(route)
    ? route.filter(
        (point) =>
          Array.isArray(point) &&
          point.length >= 2 &&
          isValidCoordinate(point[0]) &&
          isValidCoordinate(point[1]),
      )
    : [];

  return (
    <div className="athina-map relative h-full w-full overflow-hidden bg-[#070816]">
      <style>{`
        .athina-map .leaflet-container {
          background: #070816;
          font-family: inherit;
        }

        .athina-map .leaflet-tile-pane {
          filter:
            atesatur(0.78)
            contrast(1.06)
            brightness(0.82)
            hue-rotate(8deg);
        }

        .athina-map .leaflet-control-zoom {
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 14px;
          box-shadow:
            0 16px 42px rgba(0, 0, 0, 0.38);
        }

        .athina-map .leaflet-control-zoom a {
          display: grid;
          width: 34px;
          height: 34px;
          place-items: center;
          border: 0;
          border-bottom:
            1px solid rgba(255, 255, 255, 0.08);
          background: rgba(11, 13, 29, 0.9);
          color: #c4b5fd;
          font-family: inherit;
          font-size: 18px;
          line-height: 1;
          backdrop-filter: blur(16px);
          transition:
            background-color 180ms ease,
            color 180ms ease;
        }

        .athina-map .leaflet-control-zoom a:last-child {
          border-bottom: 0;
        }

        .athina-map .leaflet-control-zoom a:hover,
        .athina-map .leaflet-control-zoom a:focus {
          background: rgba(139, 92, 246, 0.24);
          color: #ffffff;
        }

        .athina-map .leaflet-control-zoom a.leaflet-disabled {
          background: rgba(11, 13, 29, 0.72);
          color: rgba(148, 163, 184, 0.35);
        }

        .athina-map .leaflet-control-attribution {
          margin: 0 8px 8px 0;
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 8px;
          background: rgba(7, 8, 22, 0.72);
          padding: 3px 7px;
          color: rgba(148, 163, 184, 0.68);
          font-size: 9px;
          backdrop-filter: blur(12px);
        }

        .athina-map .leaflet-control-attribution a {
          color: rgba(196, 181, 253, 0.78);
        }

        .athina-map .leaflet-tooltip {
          border: 1px solid rgba(167, 139, 250, 0.24);
          border-radius: 12px;
          background: rgba(11, 13, 29, 0.92);
          padding: 7px 10px;
          color: #f4f7fb;
          font-family: inherit;
          font-size: 11px;
          font-weight: 500;
          box-shadow:
            0 14px 36px rgba(0, 0, 0, 0.38);
          backdrop-filter: blur(16px);
        }

        .athina-map .leaflet-tooltip-top::before {
          border-top-color: rgba(11, 13, 29, 0.92);
        }

        .athina-map-marker {
          border: 0;
          background: transparent;
        }

        .athina-map-marker__container {
          position: relative;
          width: 32px;
          height: 32px;
        }

        .athina-map-marker__pulse {
          position: absolute;
          inset: 0;
          border: 1px solid rgba(34, 211, 238, 0.58);
          border-radius: 999px;
          background: rgba(34, 211, 238, 0.1);
          animation:
            athina-map-marker-pulse 1.8s infinite ease-out;
        }

        .athina-map-marker__halo {
          position: absolute;
          inset: 7px;
          border-radius: 999px;
          background: rgba(139, 92, 246, 0.34);
          box-shadow:
            0 0 18px rgba(139, 92, 246, 0.7),
            0 0 34px rgba(34, 211, 238, 0.28);
        }

        .athina-map-marker__core {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 9px;
          height: 9px;
          transform: translate(-50%, -50%);
          border: 2px solid rgba(245, 243, 255, 0.9);
          border-radius: 999px;
          background: #8b5cf6;
          box-shadow:
            0 0 12px rgba(139, 92, 246, 0.95),
            0 0 24px rgba(34, 211, 238, 0.42);
        }

        @keyframes athina-map-marker-pulse {
          0% {
            transform: scale(0.5);
            opacity: 0.95;
          }

          70% {
            transform: scale(1);
            opacity: 0.16;
          }

          100% {
            transform: scale(1.12);
            opacity: 0;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .athina-map-marker__pulse {
            animation: none;
            opacity: 0.32;
          }

          .athina-map .leaflet-fade-anim .leaflet-tile,
          .athina-map .leaflet-zoom-animated {
            transition: none !important;
          }
        }
      `}</style>

      <MapContainer
        center={[25.2048, 55.2708]}
        zoom={3}
        minZoom={2}
        maxZoom={19}
        className="h-full w-full"
        style={{
          background: '#070816',
        }}
        worldCopyJump
        zoomControl
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution="&copy; OpenStreetMap contributors &copy; CARTO"
          maxZoom={19}
        />

        <FlyTo center={flyTo} />

        <ClickHandler
          onClick={onLocationSelect}
        />

        {safeMarkers.map((marker, index) => {
          const markerLabel =
            marker.name ||
            marker.location ||
            '';

          return (
            <Marker
              key={getMarkerKey(marker, index)}
              position={[
                marker.lat,
                marker.lng,
              ]}
              icon={markerIcon}
            >
              {markerLabel ? (
                <Tooltip
                  direction="top"
                  offset={[0, -12]}
                  opacity={1}
                >
                  {markerLabel}
                </Tooltip>
              ) : null}
            </Marker>
          );
        })}

        {safeRoute.length > 0 ? (
          <Polyline
            positions={safeRoute}
            pathOptions={{
              color: '#8B5CF6',
              weight: 4,
              opacity: 0.82,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        ) : null}
      </MapContainer>

      <div className="pointer-events-none absolute inset-0 z-[400] bg-[radial-gradient(circle_at_center,transparent_48%,rgba(7,8,22,0.24)_100%)]" />
    </div>
  );
}