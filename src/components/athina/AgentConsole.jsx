import React, { useState, useRef, useEffect } from 'react';
import { invokeFunction } from '@/lib/functionApi';
import { sendAgentMessage } from '@/lib/athinaApi.ts';
import { useAthinaVoice } from '@/hooks/useAthinaVoice';
import { Send, Loader2, Mic, MapPin, CloudSun, Clock, Search, Github, Square, Power } from 'lucide-react';

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

export default function AgentConsole({ onActions, onAvatarState, showHeader = true }) {
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

    // Handle URL open requests entirely client-side (the agent can't open browser tabs).
    // Deliberately strict: an email address or a keyword buried deep in a
    // long request (e.g. "places to visit") must never hijack unrelated
    // commands like sending an email.
    const trimmedText = text.trim();
    const hasEmailAddress = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(trimmedText);
    const openIntentLeading = /^(?:please\s+|can\s+you\s+|could\s+you\s+|would\s+you\s+)?(open|browse|visit|go to)\b/i.test(trimmedText);
    const urlMatch = !hasEmailAddress && openIntentLeading
      ? trimmedText.match(/\b(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+\.(?:com|net|org|io|ai|co|ae|gov|edu|info|biz|app|dev|me|xyz)(?:\/[^\s]*)?\b/i)
      : null;

    if (urlMatch) {
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
      const data = await sendAgentMessage(text, sessionId, 'text');
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
      // Keep reasoning on the session-aware agent endpoint and stream speech separately.
      voiceActionPromiseRef.current = sendAgentMessage(text, sessionId, 'voice')
        .then((data) => {
          if (onActions && data.actions) onActions(data.actions);
          if (data.reply) voice.streamText(data.reply);
          setMessages((prev) => [...prev, { role: 'assistant', content: data.reply, actions: data.actions || [] }]);
          return data;
        })
        .catch((error) => {
          setMessages((prev) => [...prev, { role: 'assistant', content: `Voice request failed: ${error?.message || 'unknown error'}` }]);
          return null;
        })
        .finally(() => setLoading(false));

      return voiceActionPromiseRef.current;
    },
    onAgentResponse: (text) => {
      if (!text || typeof text !== 'string') return;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && last?.content === text) return prev;
        return [...prev, { role: 'assistant', content: text }];
      });
    },
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

  ];

  return (
    <div id="app" className="athina-chat-app">
      {showHeader && (
        <header>
          <span className="brand-dot" />
          <span className="brand-name">ATHINA</span>
          <div className="ml-2 flex items-center gap-1.5">
            {voice.speaking && (
              <button
                onClick={voice.stopVoice}
                className="w-6 h-6 flex items-center justify-center rounded-md bg-red-500/15 border border-red-500/20 text-red-400 hover:bg-red-500/25 transition-colors animate-pulse"
                title="Stop voice"
              >
                <Square className="w-3 h-3" />
              </button>
            )}
            <button
              onClick={voice.toggleWakeMode}
              disabled={!voice.voiceSupported || loading}
              className={`w-6 h-6 flex items-center justify-center rounded-md border transition-all disabled:opacity-30 ${
                voice.wakeMode
                  ? 'bg-cyan-500/15 border-cyan-500/25 text-cyan-400 shadow-[0_0_14px_rgba(0,229,255,0.5)] animate-pulse-subtle'
                  : 'bg-slate-800/40 border-slate-700/30 text-slate-500 hover:text-slate-300'
              }`}
              title="Power ATHINA on/off"
            >
              <Power className="w-3 h-3" />
            </button>
          </div>
          <span className={`status ${loading || voice.speaking || voice.listening ? 'active' : ''}`}>
            {loading ? 'thinking' : voice.speaking ? 'speaking' : voice.listening ? 'listening' : voice.wakeMode ? 'wake mode' : 'online'}
          </span>
          {loading && <Loader2 className="w-3.5 h-3.5 text-cyan-500/50 animate-spin ml-1.5" />}
        </header>
      )}

      <div id="chatWindow" ref={scrollRef}>
        <div id="messages">
          {messages.length === 0 && (
            <div className="empty-state">
              <h1>What's on your mind?</h1>
              <p>Type below, or use the mic to talk to Athina directly.</p>
              {suggestions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 justify-center mt-3">
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
              )}
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`row ${msg.role === 'user' ? 'user' : 'assistant'}`}>
              {msg.role === 'assistant' && <div className="avatar-chip">A</div>}
              <div className="bubble">
                <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                {msg.actions?.map((a, idx) => <ActionCard key={idx} action={a} />)}
              </div>
            </div>
          ))}

          {loading && (
            <div className="row assistant">
              <div className="avatar-chip">A</div>
              <div className="bubble">
                <div className="typing-dots">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div id="composerWrap">
        <form id="composer" onSubmit={send}>
          <input
            id="chatInput"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={voice.wakeMode ? 'Type or speak to ATHINA...' : 'Message Athina…'}
            disabled={loading}
            autoComplete="off"
          />
          <button
            type="button"
            onClick={voice.toggleWakeMode}
            disabled={!voice.voiceSupported || loading}
            className={`icon-btn mic ${voice.wakeMode || voice.listening ? 'recording' : ''}`}
            title="Speak to Athina"
            aria-label="Voice input"
          >
            <Mic className="w-4 h-4" />
          </button>
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="icon-btn send"
            aria-label="Send message"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
}