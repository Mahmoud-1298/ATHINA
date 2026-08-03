import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarCheck2,
  FileCheck2,
  MapPin,
  Sparkles,
} from 'lucide-react';
import DarkMap from '@/components/athina/DarkMap';
import AthinaAvatar from '@/components/athina/AthinaAvatar';
import AgentConsole from '@/components/athina/AgentConsole';
import { BACKEND_BASE_URL } from '@/lib/functionApi';
import { getClientIdentity } from '@/lib/clientIdentity';

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
    try {
      const storedUser = localStorage.getItem('athina_user');
      if (storedUser) {
        const user = JSON.parse(storedUser);
        if (user?.full_name) setUserName(user.full_name);
        else if (user?.email) setUserName(String(user.email).split('@')[0]);
        return;
      }
    } catch {
      // Ignore local storage parsing issues and use the fallback name.
    }
    setUserName('Operator');
  }, []);

  const handleActions = (actions) => {
    const loc = actions.find(
      (action) => ['geocode', 'locate'].includes(action.type) && !action.error,
    );
    const weather = actions.find(
      (action) => action.type === 'get_weather' && !action.error,
    );
    const target = loc || weather;

    if (target && target.lat && target.lng) {
      setMapMarkers([
        {
          lat: target.lat,
          lng: target.lng,
          name: target.name || target.location || '',
        },
      ]);
      setMapFlyTo([target.lat, target.lng]);
      setActiveLocation(target);
    }
  };

  const timeStr = clock.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const identity = getClientIdentity();
  const googleConnectHref = `${BACKEND_BASE_URL}/api/google/oauth?sessionId=${encodeURIComponent(
    identity.sessionId || 'default',
  )}${identity.userId ? `&userId=${encodeURIComponent(identity.userId)}` : ''}`;

  const firstName = userName ? String(userName).trim().split(/\s+/)[0] : 'there';

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#070816] text-white">
      {/* Contextual map canvas. It stays fully functional but visually recedes behind ATHINA. */}
      <div className="absolute inset-0 opacity-80">
        <DarkMap markers={mapMarkers} flyTo={mapFlyTo} />
      </div>

      {/* Ambient visual layers create a distinctive ATHINA identity without blocking the map. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(139,92,246,0.22),transparent_28%),radial-gradient(circle_at_80%_55%,rgba(34,211,238,0.10),transparent_30%),linear-gradient(180deg,rgba(7,8,22,0.42)_0%,rgba(7,8,22,0.12)_38%,rgba(7,8,22,0.88)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[48%] bg-gradient-to-t from-[#070816] via-[#070816]/80 to-transparent" />

      {/* Minimal floating navigation. Every interactive item has a real destination. */}
      <header className="absolute left-1/2 top-4 z-[1200] flex w-[calc(100%-1.5rem)] max-w-6xl -translate-x-1/2 items-center justify-between rounded-2xl border border-white/10 bg-[#0b0d1d]/70 px-3 py-2.5 shadow-2xl shadow-black/30 backdrop-blur-2xl sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-cyan-400 shadow-lg shadow-violet-500/20">
            <Sparkles className="h-4 w-4 text-white" />
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0b0d1d] bg-emerald-400" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold tracking-[0.2em] text-white sm:text-base">
              ATHINA
            </h1>
            <p className="hidden text-[10px] tracking-wide text-slate-400 sm:block">
              Intelligent, aware, and ready
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <Link
            to="/proposal-validator"
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-2.5 text-xs font-medium text-slate-200 transition hover:border-violet-400/35 hover:bg-violet-500/15 hover:text-white sm:px-3"
            title="Open Proposal Validator"
          >
            <FileCheck2 className="h-4 w-4 text-violet-300" />
            <span className="hidden md:inline">Proposal Validator</span>
          </Link>

          <a
            href={googleConnectHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-2.5 text-xs font-medium text-slate-200 transition hover:border-blue-400/35 hover:bg-blue-500/15 hover:text-white sm:px-3"
            title="Connect Google Calendar and Gmail"
          >
            <CalendarCheck2 className="h-4 w-4 text-blue-300" />
            <span className="hidden md:inline">Connect Google</span>
          </a>

          <Link
            to="/map"
            className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/[0.06] text-slate-300 transition hover:border-cyan-400/35 hover:bg-cyan-500/15 hover:text-cyan-200"
            title="Open full map"
          >
            <MapPin className="h-4 w-4" />
          </Link>

          <div className="hidden h-9 items-center border-l border-white/10 pl-3 sm:flex">
            <div className="text-right">
              <p className="max-w-24 truncate text-[10px] font-medium text-slate-300">{userName}</p>
              <p className="font-mono text-[10px] text-slate-500">{timeStr}</p>
            </div>
          </div>
        </div>
      </header>

      {/* ATHINA presence on the right, leaving the center open for conversation. */}
      <section className="pointer-events-none absolute -right-16 top-[11%] z-[700] w-[340px] sm:-right-4 sm:top-[10%] lg:right-[3%] lg:top-[12%]">
        <div className="relative flex flex-col items-center">
          <div className="absolute top-12 h-64 w-64 rounded-full bg-violet-500/15 blur-3xl sm:h-80 sm:w-80" />
          <div className="relative origin-center scale-[0.78] sm:scale-[0.96] lg:scale-110">
            <AthinaAvatar state={avatarState} size={340} />
          </div>
          <div className="relative -mt-16 text-center sm:-mt-10">
            <p className="text-xs font-medium uppercase tracking-[0.28em] text-violet-200/70">
              ATHINA
            </p>
          </div>
        </div>
      </section>

      {/* Location appears as contextual information, not a command-center widget. */}
      {activeLocation ? (
        <div className="absolute left-1/2 top-[48%] z-[1000] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 sm:top-[51%]">
          <div className="flex items-center gap-3 rounded-2xl border border-cyan-300/15 bg-[#0b1021]/75 px-4 py-3 shadow-xl shadow-black/25 backdrop-blur-xl">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300">
              <MapPin className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-100">
                {activeLocation.name || activeLocation.location || 'Selected point'}
              </p>
              <p className="mt-0.5 font-mono text-[10px] text-slate-400">
                {activeLocation.lat?.toFixed(4)}°, {activeLocation.lng?.toFixed(4)}°
                {activeLocation.temperature
                  ? `  ·  ${activeLocation.temperature}°C  ·  ${activeLocation.condition || ''}`
                  : ''}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {/*
        Centered conversation surface.
        AgentConsole remains unchanged, so all of its existing API and composer behavior is preserved.
        Placing the component here moves its input to the familiar centered-bottom AI layout.
      */}
      <main className="absolute inset-x-0 bottom-4 z-[1200] mx-auto w-[calc(100%-1.25rem)] max-w-3xl sm:bottom-6 sm:w-[calc(100%-2rem)]">
        <h2 className="mb-4 text-center text-xl font-semibold tracking-tight text-white drop-shadow-[0_4px_18px_rgba(0,0,0,0.55)] sm:text-2xl">
          How can I help you Mahmoud?
        </h2>

        <style>{`
          /* Hide optional starter prompts without changing AgentConsole APIs. */
          #athina-chat-shell [data-suggestions],
          #athina-chat-shell [data-suggestion],
          #athina-chat-shell [data-quick-actions],
          #athina-chat-shell [class*="suggestion" i],
          #athina-chat-shell [class*="quick-prompt" i],
          #athina-chat-shell [class*="starter" i] {
            display: none !important;
          }

          /* Match every scrollable area inside the expanded chat to its dark surface. */
          #athina-chat-shell,
          #athina-chat-shell * {
            scrollbar-width: thin;
            scrollbar-color: rgba(139, 92, 246, 0.42) #0b0d1d;
          }

          #athina-chat-shell::-webkit-scrollbar,
          #athina-chat-shell *::-webkit-scrollbar {
            width: 8px;
            height: 8px;
          }

          #athina-chat-shell::-webkit-scrollbar-track,
          #athina-chat-shell *::-webkit-scrollbar-track {
            background: #0b0d1d;
            border-radius: 999px;
          }

          #athina-chat-shell::-webkit-scrollbar-thumb,
          #athina-chat-shell *::-webkit-scrollbar-thumb {
            background: rgba(139, 92, 246, 0.42);
            border: 2px solid #0b0d1d;
            border-radius: 999px;
          }

          #athina-chat-shell::-webkit-scrollbar-thumb:hover,
          #athina-chat-shell *::-webkit-scrollbar-thumb:hover {
            background: rgba(167, 139, 250, 0.68);
          }

          #athina-chat-shell::-webkit-scrollbar-corner,
          #athina-chat-shell *::-webkit-scrollbar-corner {
            background: #0b0d1d;
          }
        `}</style>
        <div
          id="athina-chat-shell"
          className="h-[156px] overflow-hidden rounded-[28px] border border-white/15 bg-[#0b0d1d]/88 shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-2xl sm:h-[168px]"
        >
          <AgentConsole
            onActions={handleActions}
            onAvatarState={setAvatarState}
          />
        </div>
        <p className="mt-2 text-center text-[10px] text-slate-500/80">
          ATHINA may use connected services and location tools to assist you.
        </p>
      </main>
    </div>
  );
}
