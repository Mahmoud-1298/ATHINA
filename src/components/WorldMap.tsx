import { MapContainer, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const WorldMap = () => {
  return (
    <div className="relative w-full h-full rounded-2xl overflow-hidden bg-slate-950/90 ring-1 ring-white/10 border border-white/5 shadow-inner">
      <MapContainer
        center={[20, 0]}
        zoom={2}
        className="w-full h-full"
        zoomControl={false}
        attributionControl={false}
        scrollWheelZoom={true}
        doubleClickZoom={false}
      >
        <TileLayer
          attribution=""
          url="https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png"
        />
      </MapContainer>

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.06),transparent_35%)]" />

      <div className="pointer-events-none absolute bottom-4 left-4 right-4 rounded-3xl border border-white/10 bg-slate-950/70 p-3 text-xs text-slate-300 shadow-2xl shadow-black/30 backdrop-blur-sm">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[0.3em] text-slate-400">ATHINA Grid</span>
          <span className="text-[10px] uppercase tracking-[0.3em] text-emerald-300">LIVE</span>
        </div>
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Data stream</span>
            <span className="text-white">Active</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Sentinel</span>
            <span className="text-slate-400">Dark mode</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorldMap;
