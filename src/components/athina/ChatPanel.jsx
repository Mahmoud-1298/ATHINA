import React, { useState, useRef, useEffect } from 'react';
import { invokeFunction } from '@/lib/functionApi';
import { Send, Loader2, Bot, User, MapPin, Search, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';

export default function ChatPanel({ onLocate }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const send = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    const userMsg = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMsg]);
    const currentInput = input;
    setInput('');
    setLoading(true);
    try {
      const res = await invokeFunction('athinaAgent', { message: currentInput });
      const data = res.data;
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply, actions: data.actions || [] }]);
      const locateAction = (data.actions || []).find((a) => a.type === 'locate' && a.success);
      if (locateAction && onLocate) {
        onLocate({ lat: locateAction.lat, lng: locateAction.lng, name: locateAction.name, source: 'agent' });
      }
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Failed to get response';
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Error: ' + errorMsg }]);
    } finally {
      setLoading(false);
    }
  };

  const renderAction = (action, idx) => {
    if (action.type === 'locate' && action.success) {
      return (
        <div key={idx} className="flex items-center gap-1.5 mt-1.5 px-2 py-1 rounded-md bg-zinc-800/60 border border-zinc-700/50 text-xs">
          <MapPin className="w-3 h-3 text-zinc-400 shrink-0" />
          <span className="text-zinc-300 truncate">{action.name}</span>
          <span className="text-zinc-500 font-mono ml-auto whitespace-nowrap">{action.lat.toFixed(3)}, {action.lng.toFixed(3)}</span>
        </div>
      );
    }
    if (action.type === 'web_search' && action.success) {
      return (
        <div key={idx} className="flex items-center gap-1.5 mt-1.5 px-2 py-1 rounded-md bg-zinc-800/60 border border-zinc-700/50 text-xs">
          <Search className="w-3 h-3 text-zinc-400 shrink-0" />
          <span className="text-zinc-300 truncate">{action.query}</span>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="fixed bottom-4 left-4 z-40 w-[300px] sm:w-[380px]">
      <div className="flex items-center justify-between bg-zinc-900/90 backdrop-blur-md border border-zinc-700/60 rounded-t-xl px-3 py-2 shadow-2xl">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-zinc-400" />
          <span className="text-xs font-semibold text-zinc-200 tracking-wide">ATHINA</span>
          {loading && <Loader2 className="w-3 h-3 text-zinc-500 animate-spin" />}
        </div>
        <button onClick={() => setExpanded(!expanded)} className="text-zinc-400 hover:text-zinc-200 transition-colors">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>

      {expanded && (
        <>
          <div ref={scrollRef} className="bg-zinc-900/90 backdrop-blur-md border-x border-zinc-700/60 h-[280px] overflow-y-auto px-3 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center gap-2">
                <Bot className="w-8 h-8 text-zinc-700" />
                <p className="text-zinc-500 text-sm">Ask me to find a location, search the web, or complete a task.</p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className="max-w-[85%]">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {msg.role === 'user' ? <User className="w-3 h-3 text-zinc-500" /> : <Bot className="w-3 h-3 text-zinc-500" />}
                    <span className="text-[10px] text-zinc-500 uppercase tracking-wide">{msg.role}</span>
                  </div>
                  <div className={msg.role === 'user'
                    ? 'bg-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200'
                    : 'bg-zinc-800/50 rounded-lg px-3 py-2 text-sm text-zinc-300 border border-zinc-700/40'}>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    {msg.actions && msg.actions.map(renderAction)}
                  </div>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1.5">
                  <Bot className="w-3 h-3 text-zinc-500" />
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 animate-pulse" />
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 animate-pulse" style={{ animationDelay: '0.2s' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 animate-pulse" style={{ animationDelay: '0.4s' }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          <form onSubmit={send} className="bg-zinc-900/90 backdrop-blur-md border border-t-0 border-zinc-700/60 rounded-b-xl px-3 py-2.5 flex items-center gap-2 shadow-2xl">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask ATHINA..."
              disabled={loading}
              className="flex-1 bg-zinc-800/80 text-zinc-200 placeholder:text-zinc-500 px-3 py-1.5 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none text-sm disabled:opacity-50"
            />
            <button type="submit" disabled={loading || !input.trim()} className="text-zinc-400 hover:text-zinc-200 disabled:opacity-30 transition-colors">
              <Send className="w-4 h-4" />
            </button>
          </form>
        </>
      )}
    </div>
  );
}