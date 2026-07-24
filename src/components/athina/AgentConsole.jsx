import React, { useState, useRef, useEffect } from 'react';
import { invokeFunction } from '@/lib/functionApi';
import { useAthinaVoice } from '@/hooks/useAthinaVoice';
import { Send, Loader2, Sparkles, MapPin, CloudSun, Clock, Search, Github, Square, Power } from 'lucide-react';

function ActionCard({ action }) {
  if (action.error) {
    return (
      <div className="mt-2 px-2.5 py-1.5 rounded-md bg-red-950/30 border border-red-500/15 text-xs text-red-300/70">
        {action.error}
      </div>
    );
  }

  if (action.type === 'geocode') {
    return (
      <div className="mt-2 px-2.5 py-2 rounded-md bg-slate-800/40 border border-slate-600/20 text-xs space-y-1">
        <div className="flex items-center gap-1.5">
          <MapPin className="w-3 h-3 text-cyan-400 shrink-0" />
          <span className="text-slate-300 truncate">{action.name}</span>
        </div>
        <p className="text-slate-500 font-mono ml-4">{action.lat.toFixed(4)}°, {action.lng.toFixed(4)}°</p>
      </div>
    );
  }

  if (action.type === 'get_weather') {
    return (
      <div className="mt-2 px-2.5 py-2 rounded-md bg-slate-800/40 border border-slate-600/20 text-xs space-y-1.5">
        <div className="flex items-center gap-1.5">
          <CloudSun className="w-3 h-3 text-cyan-400 shrink-0" />
          <span className="text-slate-300 truncate">{action.location}</span>
        </div>
        <div className="flex gap-2 ml-4 text-slate-400">
          <span className="text-slate-200 font-medium">{action.temperature}°C</span>
          <span>·</span>
          <span>{action.condition}</span>
        </div>
        <div className="flex gap-2 ml-4 text-slate-500 font-mono text-[10px]">
          <span>Feels {action.feels_like}°</span>
          <span>·</span>
          <span>{action.humidity}% hum</span>
          <span>·</span>
          <span>{action.wind_speed} km/h</span>
        </div>
      </div>
    );
  }

  if (action.type === 'get_time') {
    return (
      <div className="mt-2 px-2.5 py-2 rounded-md bg-slate-800/40 border border-slate-600/20 text-xs">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3 h-3 text-cyan-400 shrink-0" />
          <span className="text-slate-300 font-mono">{action.utc}</span>
        </div>
      </div>
    );
  }

  if (action.type === 'github_stats') {
    return (
      <div className="mt-2 px-2.5 py-2 rounded-md bg-slate-800/40 border border-slate-600/20 text-xs space-y-1">
        <div className="flex items-center gap-1.5">
          <Github className="w-3 h-3 text-cyan-400 shrink-0" />
          <span className="text-slate-300">{action.name}</span>
        </div>
        <div className="grid grid-cols-3 gap-x-2 ml-4 text-slate-400 font-mono text-[10px]">
          <span>★ {action.stars}</span>
          <span>⑂ {action.forks}</span>
          <span>○ {action.issues}</span>
        </div>
        <p className="text-slate-500 text-[10px] ml-4">{action.language}</p>
      </div>
    );
  }

  if (action.type === 'web_search') {
    return (
      <div className="mt-2 px-2.5 py-2 rounded-md bg-slate-800/40 border border-slate-600/20 text-xs">
        <div className="flex items-center gap-1.5">
          <Search className="w-3 h-3 text-cyan-400 shrink-0" />
          <span className="text-slate-300">Search: {action.query}</span>
        </div>
        {action.summary && <p className="text-slate-400 mt-1 ml-4 line-clamp-3">{action.summary}</p>}
        {action.sources?.length > 0 && (
          <div className="mt-1 ml-4 space-y-0.5">
            {action.sources.slice(0, 2).map((s, i) => (
              <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="block text-cyan-500/60 hover:text-cyan-400 truncate text-[10px]">
                ↗ {s.title}
              </a>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (action.type === 'browse') {
    return (
      <div className="mt-2 px-2.5 py-2 rounded-md bg-slate-800/40 border border-slate-600/20 text-xs">
        <div className="flex items-center gap-1.5">
          <Search className="w-3 h-3 text-cyan-400 shrink-0" />
          <span className="text-slate-300 truncate">Browsing: {action.query}</span>
        </div>
        {action.sources?.length > 0 && (
          <div className="mt-1 ml-4 space-y-0.5">
            {action.sources.slice(0, 3).map((s, i) => (
              <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="block text-cyan-500/60 hover:text-cyan-400 truncate text-[10px]">
                ↗ {s.title}
              </a>
            ))}
          </div>
        )}
      </div>
    );
  }

  return null;
}

export default function AgentConsole({ onActions, onAvatarState }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState('default');
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  useEffect(() => {
    const stored = localStorage.getItem('athina_session_id');
    if (stored) {
      setSessionId(stored);
      return;
    }
    const generated = crypto.randomUUID();
    localStorage.setItem('athina_session_id', generated);
    setSessionId(generated);
  }, []);

  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role === 'assistant' && lastMsg.actions) {
      lastMsg.actions.forEach((a) => {
        if (a.type === 'browse' && a.sources?.length > 0) {
          window.open(a.sources[0].url, '_blank', 'noopener,noreferrer');
        }
      });
    }
  }, [messages]);

  const sendMessage = async (text) => {
    if (!text || typeof text !== 'string' || !text.trim() || loading) return;
    // Handle URL open requests entirely client-side (the agent can't open browser tabs)
    const urlMatch = text.match(/(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+\.[a-z]{2,}(?:\/[^\s]*)?)/i);
    if (urlMatch && /\b(open|browse|visit|go to)\b/i.test(text)) {
      const url = urlMatch[0].startsWith('http') ? urlMatch[0] : 'https://' + urlMatch[0];
      window.open(url, '_blank', 'noopener,noreferrer');
      const userMsg = { role: 'user', content: text };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      const reply = `Opening ${urlMatch[0]} in a new tab.`;
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
      return;
    }
    const userMsg = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    try {
      const res = await invokeFunction('athinaAgent', { message: text, sessionId });
      const data = res.data;
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply, actions: data.actions || [] }]);
      if (onActions && data.actions) onActions(data.actions);

      // Client-side geocoding fallback: if agent didn't return location, try ourselves
      const hasLocationAction = (data.actions || []).some(
        (a) => ['geocode', 'get_weather', 'locate'].includes(a.type) && a.lat && a.lng
      );
      if (!hasLocationAction && /\b(show|locate|find|where|point|pin|mark|map|globe|location|place|city|country)\b/i.test(text)) {
        try {
          const locQuery = text
            .replace(/\b(show me|show|locate|find|where is|where's|point to|point me to|point|on the map|on the globe|on map|location of|place called|take me to|go to|the|a|an|in|at|near|of)\b/gi, ' ')
            .replace(/\?/g, '').replace(/\s+/g, ' ').trim();
          if (locQuery) {
            const geoRes = await invokeFunction('geocode', { query: locQuery });
            const results = geoRes.data?.results || [];
            if (results.length > 0 && onActions) {
              onActions([{ type: 'geocode', name: results[0].name, lat: results[0].lat, lng: results[0].lng }]);
            }
          }
        } catch (e) {
          // ignore geocode fallback failures; agent response is already shown
        }
      }

      // Voice responses are handled by ElevenLabs WebSocket.
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Failed to get response';
      setMessages((prev) => [...prev, { role: 'assistant', content: 'I encountered an error: ' + errorMsg }]);
    } finally {
      setLoading(false);
    }
  };

  const voiceActionPromiseRef = useRef(Promise.resolve(null));

  const voice = useAthinaVoice({
    onUserTranscript: (text) => {
      setMessages((prev) => [...prev, { role: 'user', content: text }]);
      setLoading(true);
      // Call athinaAgent to get clean reply + structured actions (map, directions, browse)
      voiceActionPromiseRef.current = invokeFunction('athinaAgent', { message: text, sessionId })
        .then((res) => {
          const data = res.data;
          if (onActions && data.actions) onActions(data.actions);
          // Speak ONLY the clean reply via our TTS (no reasoning leakage)
          if (data.reply) voice.speakText(data.reply);
          setMessages((prev) => [...prev, { role: 'assistant', content: data.reply, actions: data.actions || [] }]);
          return data;
        })
        .catch(() => null)
        .finally(() => setLoading(false));
    },
    // No onAgentResponse — ElevenLabs' LLM output is ignored entirely
    voiceEnabled: true,
  });

  const avatarState = loading ? 'thinking'
    : voice.speaking ? 'speaking'
    : voice.listening ? 'listening'
    : voice.wakeMode ? 'wake'
    : 'idle';

  useEffect(() => {
    onAvatarState?.(avatarState);
  }, [avatarState, onAvatarState]);

  const send = (e) => {
    e?.preventDefault();
    if (!input.trim() || loading) return;
    sendMessage(input);
  };

  const suggestions = [
    'Weather in Amsterdam',
    'Show me Tokyo',
    'GitHub stats',
    'What time is it?',
  ];

  return (
    <div className="h-full flex flex-col bg-[#0a0e14]/95 backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-700/30 shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400/80" />
          <span className="text-[11px] font-semibold text-slate-200/90 tracking-wider uppercase font-mono">ATHINA</span>
        </div>
        <div className="flex items-center gap-1.5">
          {voice.speaking && (
            <button
              onClick={voice.stopVoice}
              className="w-7 h-7 flex items-center justify-center rounded-md bg-red-500/15 border border-red-500/20 text-red-400 hover:bg-red-500/25 transition-colors animate-pulse"
              title="Stop voice"
            >
              <Square className="w-3 h-3" />
            </button>
          )}
          <button
            onClick={voice.toggleWakeMode}
            disabled={!voice.voiceSupported || loading}
            className={`w-7 h-7 flex items-center justify-center rounded-md border transition-all disabled:opacity-30 ${
              voice.wakeMode
                ? 'bg-cyan-500/15 border-cyan-500/25 text-cyan-400 shadow-[0_0_14px_rgba(0,229,255,0.5)] animate-pulse-subtle'
                : 'bg-slate-800/40 border-slate-700/30 text-slate-500 hover:text-slate-300'
            }`}
            title="Power ATHINA on/off"
          >
            <Power className="w-3.5 h-3.5" />
          </button>
          {loading && <Loader2 className="w-3.5 h-3.5 text-cyan-500/50 animate-spin" />}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3">
            <Sparkles className="w-6 h-6 text-cyan-500/30" />
            <p className="text-slate-400/60 text-xs max-w-[220px] leading-relaxed">
              I'm ATHINA. Click the power button to turn me on — voice and chat connected. Or type a message below for text-only chat.
            </p>
            <div className="flex flex-wrap gap-1.5 justify-center mt-1">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="px-2 py-0.5 rounded-full bg-slate-800/40 border border-slate-700/30 text-[10px] text-slate-400/70 hover:bg-slate-700/40 hover:text-slate-200 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div className="max-w-[90%]">
              {msg.role === 'assistant' && (
                <span className="text-[9px] text-cyan-500/40 uppercase tracking-widest font-mono ml-1">ATHINA</span>
              )}
              <div
                className={
                  msg.role === 'user'
                    ? 'bg-cyan-500/10 border border-cyan-500/15 rounded-lg px-3 py-2 text-sm text-slate-100/90'
                    : 'bg-slate-800/30 border border-slate-700/20 rounded-lg px-3 py-2 text-sm text-slate-200/80'
                }
              >
                <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                {msg.actions?.map((a, idx) => <ActionCard key={idx} action={a} />)}
              </div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 px-3 py-2">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500/50 animate-pulse" />
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500/50 animate-pulse" style={{ animationDelay: '0.2s' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500/50 animate-pulse" style={{ animationDelay: '0.4s' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={send} className="px-3 py-2.5 border-t border-slate-700/30 shrink-0 flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={voice.wakeMode ? 'Type or speak to ATHINA...' : 'Ask ATHINA...'}
          disabled={loading}
          className="flex-1 bg-slate-800/40 text-slate-200 placeholder:text-slate-500/50 px-3 py-1.5 rounded-lg border border-slate-700/30 focus:border-cyan-500/30 focus:outline-none text-sm disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-cyan-500/15 border border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/25 disabled:opacity-30 transition-colors shrink-0"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
}