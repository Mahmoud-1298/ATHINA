import React from 'react';
import { X, MapPin, Navigation2 } from 'lucide-react';

const MAPS_EMBED_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

// Floating "new tab" style map popup, shown only for navigation/traffic/location requests.
export default function GoogleMapPopup({ data, onClose }) {
  if (!data) return null;

  const src =
    data.mode === 'directions'
      ? `https://www.google.com/maps/embed/v1/directions?key=${encodeURIComponent(MAPS_EMBED_KEY)}&origin=${encodeURIComponent(data.originQuery)}&destination=${encodeURIComponent(data.destinationQuery)}&avoid=tolls`
      : `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(MAPS_EMBED_KEY)}&q=${encodeURIComponent(data.query)}`;

  return (
    <div className="fixed left-4 top-20 z-[1300] w-[340px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-white/15 bg-[#0b0d1d]/95 shadow-2xl shadow-black/50 backdrop-blur-xl sm:w-[380px]">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2 text-slate-100">
          {data.mode === 'directions' ? (
            <Navigation2 className="h-4 w-4 shrink-0 text-cyan-300" />
          ) : (
            <MapPin className="h-4 w-4 shrink-0 text-cyan-300" />
          )}
          <span className="truncate text-xs font-semibold">{data.title}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-white"
          aria-label="Close map"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {MAPS_EMBED_KEY ? (
        <iframe
          title="ATHINA map"
          className="h-[260px] w-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          src={src}
        />
      ) : (
        <div className="flex h-[180px] flex-col items-center justify-center gap-2 px-4 text-center text-xs text-slate-400">
          <p>Google Maps is not configured.</p>
          <p className="text-slate-500">Set VITE_GOOGLE_MAPS_API_KEY to enable the live map preview.</p>
        </div>
      )}

      {data.subtitle && (
        <p className="border-t border-white/10 px-3 py-2 text-[11px] text-slate-400">{data.subtitle}</p>
      )}
    </div>
  );
}
