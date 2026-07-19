import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import DarkMap from '@/components/athina/DarkMap';
import AthinaAvatar from '@/components/athina/AthinaAvatar';
import AgentConsole from '@/components/athina/AgentConsole';
import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';

export default function CommandCenter() {
  const [mapMarkers, setMapMarkers] = useState([]);
  const [mapFlyTo, setMapFlyTo] = useState(null);
  const [clock, setClock] = useState(new Date());
  const [userName, setUserName] = useState('');
  const [activeLocation, setActiveLocation] = useState(null);
  const [avatarState, setAvatarState] = useState('idle');

  useEffect(() => {
    const interval = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    base44.auth.me().then((user) => {
      if (user?.full_name) setUserName(user.full_name);
      else if (user?.email) setUserName(user.email.split('@')[0]);
    }).catch(() => {});
  }, []);

  const handleActions = (actions) => {
    const loc = actions.find((a) => ['geocode', 'locate'].includes(a.type) && !a.error);
    const weather = actions.find((a) => a.type === 'get_weather' && !a.error);
    const target = loc || weather;
    if (target && target.lat && target.lng) {
      setMapMarkers([{ lat: target.lat, lng: target.lng, name: target.name || target.location || '' }]);
      setMapFlyTo([target.lat, target.lng]);
      setActiveLocation(target);
    }
  };

  const timeStr = clock.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

  return (
    <div className="fixed inset-0 bg-[#06080d] text-white overflow-hidden">
      <DarkMap markers={mapMarkers} flyTo={mapFlyTo} />

      <div className="absolute top-0 left-0 right-0 z-[1200] h-12 flex items-center justify-between px-4 sm:px-6 border-b border-slate-700/20 bg-[#0a0e14]/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-2 h-2 rounded-full bg-cyan-400" />
            <div className="absolute inset-0 w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          </div>
          <h1 className="font-bold text-cyan-300 tracking-[0.15em] text-base sm:text-lg" style={{ fontFamily: 'Orbitron, sans-serif', textShadow: '0 0 12px rgba(0, 229, 255, 0.4)' }}>
            ATHINA
          </h1>
          <span className="text-[9px] text-slate-500 font-mono hidden sm:inline tracking-widest uppercase">Autonomous Intelligence</span>
        </div>
        <div className="flex items-center gap-4">
          {userName && (
            <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">{userName}</span>
          )}
          <Link to="/map" className="text-slate-500 hover:text-cyan-300/70 transition-colors" title="2D Map">
            <MapPin className="w-4 h-4" />
          </Link>
          <span className="text-xs font-mono text-cyan-300/60">{timeStr}</span>
        </div>
      </div>

      <div className="absolute top-14 left-2 z-[800] pointer-events-none">
        <AthinaAvatar state={avatarState} size={280} />
      </div>

      {activeLocation && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-[1000] px-3 py-2 rounded-lg bg-[#0a0e14]/85 backdrop-blur-md border border-slate-700/30 max-w-[280px]">
          <p className="text-[9px] text-slate-500 font-mono uppercase tracking-wider">Active Location</p>
          <p className="text-sm text-slate-200 truncate">{activeLocation.name || activeLocation.location || 'Selected point'}</p>
          <p className="text-[10px] text-slate-500 font-mono mt-0.5">
            {activeLocation.lat?.toFixed(4)}°, {activeLocation.lng?.toFixed(4)}°
          </p>
          {activeLocation.temperature && (
            <p className="text-[10px] text-cyan-300/70 font-mono mt-1">
              {activeLocation.temperature}°C · {activeLocation.condition}
            </p>
          )}
        </div>
      )}

      <div className="absolute bottom-4 right-4 z-[1200] w-[360px] h-[55vh] max-h-[520px] rounded-xl overflow-hidden border border-slate-700/30 shadow-2xl shadow-black/50">
        <AgentConsole onActions={handleActions} onAvatarState={setAvatarState} />
      </div>
    </div>
  );
}
