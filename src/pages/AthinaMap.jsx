import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import InteractiveMap from '@/components/athina/InteractiveMap';
import { Search, Loader2, ArrowLeft, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function AthinaMap() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [markers, setMarkers] = useState([]);
  const [flyTo, setFlyTo] = useState(null);
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);
  const [showResults, setShowResults] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke('geocode', { query });
      const found = (res.data && res.data.results) || [];
      if (found.length === 0) {
        setError('No locations found for "' + query + '"');
      } else {
        setResults(found);
        setShowResults(true);
        selectLocation(found[0]);
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const selectLocation = (loc) => {
    setMarkers([{ lat: loc.lat, lng: loc.lng, name: loc.name }]);
    setFlyTo([loc.lat, loc.lng]);
    setShowResults(false);
  };

  return (
    <div className="dark h-screen flex flex-col bg-background text-foreground">
      <div className="flex items-center gap-3 px-4 py-3 bg-card border-b border-border relative z-10">
        <Link to="/athina-repo" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-muted-foreground" />
          <h1 className="font-semibold text-lg">ATHINA Map</h1>
        </div>
        <form onSubmit={handleSearch} className="ml-auto relative">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search any location..."
            className="w-56 sm:w-80 bg-secondary text-foreground placeholder:text-muted-foreground px-4 py-2 pr-10 rounded-lg border border-border focus:border-ring focus:outline-none text-sm"
          />
          <button
            type="submit"
            disabled={loading}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
          </button>
          {showResults && results.length > 1 && (
            <div className="absolute top-full mt-2 right-0 w-72 bg-card border border-border rounded-lg shadow-xl max-h-64 overflow-y-auto">
              {results.map((r, i) => (
                <button
                  key={i}
                  onClick={() => selectLocation(r)}
                  className="w-full text-left px-3 py-2 border-b border-border last:border-0 hover:bg-secondary"
                >
                  <p className="text-sm line-clamp-2">{r.name}</p>
                </button>
              ))}
            </div>
          )}
        </form>
      </div>

      {error && (
        <div className="px-4 py-2 bg-destructive/10 border-b border-destructive/30">
          <p className="text-destructive text-sm text-center">{error}</p>
        </div>
      )}

      <div className="flex-1 relative">
        <InteractiveMap markers={markers} flyTo={flyTo} />
      </div>
    </div>
  );
}