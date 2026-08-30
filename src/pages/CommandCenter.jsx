import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarCheck2,
  FileCheck2,
  MapPin,
  Sparkles,
} from 'lucide-react';
import AthinaAvatar from '@/components/athina/AthinaAvatar';
import AgentConsole from '@/components/athina/AgentConsole';
import GoogleMapPopup from '@/components/athina/GoogleMapPopup';
import { BACKEND_BASE_URL } from '@/lib/functionApi';
import { getClientIdentity } from '@/lib/clientIdentity';

export default function CommandCenter() {
  const [clock, setClock] = useState(new Date());
  const [userName, setUserName] = useState('');
  const [mapPopup, setMapPopup] = useState(null);
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

  // The map only appears as a popup for navigation/traffic/location requests.
  const handleActions = (actions) => {
    const traffic = actions.find((action) => action.type === 'traffic' && !action.error && action.success);
    if (traffic) {
      const originName = traffic.from?.name || traffic.from?.query || 'Origin';
      const destName = traffic.to?.name || traffic.to?.query || 'Destination';
      setMapPopup({
        mode: 'directions',
        originQuery: traffic.from?.name || `${traffic.from?.lat},${traffic.from?.lng}`,
        destinationQuery: traffic.to?.name || `${traffic.to?.lat},${traffic.to?.lng}`,
        title: `${originName} → ${destName}`,
        subtitle: `${traffic.distanceKm} km · ~${traffic.durationMinutes} min drive`,
      });
      return;
    }

    const loc = actions.find(
      (action) => ['geocode', 'locate'].includes(action.type) && !action.error && action.lat && action.lng,
    );
    const weather = actions.find(
      (action) => action.type === 'get_weather' && !action.error && action.lat && action.lng,
    );
    const target = loc || weather;

    if (target) {
      const name = target.name || target.location || `${target.lat}, ${target.lng}`;
      setMapPopup({
        mode: 'place',
        query: name,
        title: name,
        subtitle: target.temperature
          ? `${target.temperature}°C · ${target.condition || ''}`
          : `${target.lat.toFixed(4)}°, ${target.lng.toFixed(4)}°`,
      });
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
      {/* Ambient visual layers create a distinctive ATHINA identity. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(124,58,237,0.14)_0%,transparent_55%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[36%] bg-gradient-to-t from-[#070816]/90 via-[#070816]/45 to-transparent" />

      {/* Map appears only when ATHINA answers a navigation/traffic/location question. */}
      <GoogleMapPopup data={mapPopup} onClose={() => setMapPopup(null)} />

      {/* Minimal floating navigation. Every interactive item has a real destination. */}
      <header className="absolute left-1/2 top-4 z-[1200] flex w-[calc(100%-1.5rem)] max-w-6xl -translate-x-1/2 items-center justify-between rounded-2xl border border-white/10 bg-[#0b0d1d]/70 px-3 py-2.5 shadow-2xl shadow-black/30 backdrop-blur-2xl sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-cyan-400 shadow-lg shadow-black/20">
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
          <div className="relative origin-center scale-[0.78] sm:scale-[0.96] lg:scale-110">
            <AthinaAvatar state={avatarState} size={360} />
          </div>
          <div className="relative -mt-16 text-center sm:-mt-10">
            <p className="text-xs font-medium uppercase tracking-[0.28em] text-violet-200/70">
              ATHINA
            </p>
          </div>
        </div>
      </section>

      {/*
        Centered conversation surface.
        No card/box wrapper: messages and composer float directly over the
        ambient background, matching the Copilot/GPT/Claude chat style.
      */}
      <main className="absolute inset-x-0 top-24 bottom-4 z-[1200] mx-auto flex w-[calc(100%-1.25rem)] max-w-3xl flex-col sm:bottom-6 sm:w-[calc(100%-3rem)]">
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
        <div id="athina-chat-shell" className="min-h-0 flex-1">
          <AgentConsole
            showHeader={false}
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
