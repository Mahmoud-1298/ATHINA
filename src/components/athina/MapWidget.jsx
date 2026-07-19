import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import Globe3D from './Globe3D';
import { Search, Loader2, Globe, ChevronDown, ChevronUp, Crosshair, Copy, Check } from 'lucide-react';

export default function MapWidget({ coords, onCoordinatesReady }) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [markers, setMarkers] = useState([]);
  const [flyTo, setFlyTo] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [expanded, setExpanded] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (coords) {
      setMarkers([{ lat: coords.lat, lng: coords.lng, name: coords.name || 'Located' }]);
      setFlyTo([coords.lat, coords.lng]);
      setSelected(coords);
    }
  }, [coords]);

  const announceCoords = (coords) => {
    setSelected(coords);
    if (onCoordinatesReady) onCoordinatesReady(coords);
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke('geocode', { query });
      const results = (res.data && res.data.results) || [];
      if (results.length === 0) {
        setError('No locations found for "' + query + '"');
        return;
      }
      const loc = results[0];
      setMarkers([{ lat: loc.lat, lng: loc.lng, name: loc.name }]);
      setFlyTo([loc.lat, loc.lng]);
      announceCoords({ lat: loc.lat, lng: loc.lng, name: loc.name, source: 'search' });
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGlobeClick = ({ lat, lng }) => {
    setMarkers([{ lat, lng, name: 'Selected point' }]);
    setFlyTo([lat, lng]);
    announceCoords({ lat, lng, name: lat.toFixed(4) + ', ' + lng.toFixed(4), source: 'globe' });
  };

  const copyCoords = () => {
    if (!selected) return;
    navigator.clipboard.writeText(selected.lat.toFixed(6) + ', ' + selected.lng.toFixed(6));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed top-4 right-4 z-40 w-[300px] sm:w-[360px]">
      {/* Header */}
      <div className="flex items-center justify-between bg-zinc-900/90 backdrop-blur-md border border-zinc-700/60 rounded-t-xl px-3 py-2 shadow-2xl">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-zinc-400" />
          <span className="text-xs font-semibold text-zinc-200 tracking-wide">ATHINA GLOBE</span>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {expanded && (
        <>
          {/* Search */}
          <div className="bg-zinc-900/90 backdrop-blur-md border-x border-zinc-700/60 px-3 py-2.5">
            <form onSubmit={handleSearch} className="relative">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search location..."
                className="w-full bg-zinc-800/80 text-zinc-200 placeholder:text-zinc-500 px-3 py-1.5 pr-9 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none text-sm transition-colors"
              />
              <button
                type="submit"
                disabled={loading}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </button>
            </form>
            {error && <p className="text-red-400 text-xs mt-1.5 px-0.5">{error}</p>}
            {selected && (
              <div className="mt-2 flex items-center gap-1.5 px-0.5">
                <Crosshair className="w-3 h-3 text-zinc-500 shrink-0" />
                <span className="text-xs text-zinc-400 font-mono truncate">
                  {selected.lat.toFixed(4)}, {selected.lng.toFixed(4)}
                </span>
                <button
                  onClick={copyCoords}
                  className="ml-auto text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
                  title="Copy coordinates"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            )}
          </div>

          {/* Globe */}
          <div className="bg-zinc-900/90 backdrop-blur-md border border-t-0 border-zinc-700/60 rounded-b-xl overflow-hidden shadow-2xl h-[300px] sm:h-[360px]">
            <Globe3D markers={markers} flyTo={flyTo} onLocationSelect={handleGlobeClick} />
          </div>

          {/* Hint */}
          <p className="text-[10px] text-zinc-600 text-center mt-1.5 select-none">
            Drag to rotate · Scroll to zoom · Click to pin
          </p>
        </>
      )}
    </div>
  );
}