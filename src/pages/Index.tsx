import { useState, useCallback, useRef, useEffect, FormEvent } from "react";
import { motion } from "framer-motion";
import { ExternalLink, Send } from "lucide-react";
import VoiceOrb from "../components/VoiceOrb.tsx";
import StatusBar from "../components/StatusBar.tsx";
import JarvisParticles from "../components/JarvisParticles.tsx";
import WorldMap, { MapTarget } from "../components/WorldMap.tsx";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AgentAction,
  AgentBrowseAction,
  BACKEND_BASE_URL,
  sendAgentMessage,
  speakText,
} from "../lib/athinaApi.ts";

interface Message {
  id: string;
  role: "user" | "agent";
  text: string;
}

interface BrowserTarget {
  url: string;
  title: string;
  summary?: string;
  sources?: Array<{
    title: string;
    url: string;
    snippet?: string;
  }>;
  embedBlocked?: boolean;
}

const SESSION_ID = "ui-session";

type SpeechRecognitionConstructor = new () => SpeechRecognition;

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort?: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEvent {
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
      isFinal: boolean;
    };
    length: number;
  };
}

const Index = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<"ready" | "listening" | "recording" | "processing" | "speaking">("ready");
  const [isVoiceSessionOpen, setIsVoiceSessionOpen] = useState(false);
  const [mapTarget, setMapTarget] = useState<MapTarget | null>(null);
  const [browserTarget, setBrowserTarget] = useState<BrowserTarget | null>(null);
  const [showBrowserPreview, setShowBrowserPreview] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const voiceSessionOpenRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const isActive = isVoiceSessionOpen || isRecording || isProcessing || isSpeaking;

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.onended = () => {
        setIsSpeaking(false);
        setVoiceStatus(voiceSessionOpenRef.current ? "listening" : "ready");
      };
    }
  }, []);

  const addMessage = useCallback((role: Message["role"], text: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        role,
        text,
      },
    ]);
  }, []);

  const stopSpeechPlayback = useCallback((silent = false) => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    setIsSpeaking(false);
    setVoiceStatus(voiceSessionOpenRef.current ? "listening" : "ready");
    if (!silent) {
      addMessage("agent", "Speech interrupted. Standing by.");
    }
  }, [addMessage]);

  const applyActions = useCallback((actions: AgentAction[]) => {
    actions.forEach((action) => {
      if (action.type === "locate" && action.success && action.lat && action.lng) {
        setMapTarget({
          name: action.name || action.query,
          lat: action.lat,
          lng: action.lng,
          query: action.query,
        });
      }

      if (action.type === "browse" && action.success && action.url) {
        const browseAction = action as AgentBrowseAction;
        setBrowserTarget({
          url: browseAction.url,
          title: browseAction.title || browseAction.query || browseAction.url,
          summary: browseAction.summary,
          sources: browseAction.sources,
          embedBlocked: browseAction.embedBlocked,
        });
        setShowBrowserPreview(!browseAction.embedBlocked);
      }
    });
  }, []);

  const runAgent = useCallback(
    async (text: string, mode: "text" | "voice" = "text") => {
      setIsProcessing(true);
      try {
        const result = await sendAgentMessage(text, SESSION_ID, mode);
        addMessage("agent", result.reply);
        applyActions(result.actions || []);
        return result.reply;
      } catch (error) {
        console.error("Agent backend error:", error);
        const message = error instanceof Error
          ? error.message.includes("Failed to fetch")
            ? "ATHINA backend unreachable. Check backend deployment or your VITE_BACKEND_URL."
            : error.message
          : "ATHINA backend failed. Please try again.";
        addMessage("agent", message);
        return message;
      } finally {
        setIsProcessing(false);
      }
    },
    [addMessage, applyActions]
  );

  const speakReply = useCallback(async (text: string) => {
    try {
      const data = await speakText(text);
      if (data.audioBase64 && audioRef.current) {
        audioRef.current.src = `data:audio/mpeg;base64,${data.audioBase64}`;
        await audioRef.current.play();
        setVoiceStatus("speaking");
        setIsSpeaking(true);
      } else {
        setVoiceStatus(voiceSessionOpenRef.current ? "listening" : "ready");
      }
    } catch (error) {
      console.error("Speech synthesis error:", error);
      setVoiceStatus(voiceSessionOpenRef.current ? "listening" : "ready");
    }
  }, []);

  const stopRecognition = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.onresult = null;
      recognitionRef.current.onend = null;
      recognitionRef.current.onerror = null;
      recognitionRef.current.abort?.();
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);
  }, []);

  const startVoiceRecording = useCallback(async () => {
    if (isSpeaking) {
      stopSpeechPlayback(true);
    }
    setIsConnecting(true);
    setVoiceStatus("listening");
    try {
      const Recognition =
        ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) as
          | SpeechRecognitionConstructor
          | undefined;

      if (!Recognition) {
        addMessage("agent", "Speech recognition is not available in this browser. Please use the text box.");
        setIsConnecting(false);
        setIsVoiceSessionOpen(false);
        setVoiceStatus("ready");
        voiceSessionOpenRef.current = false;
        return;
      }

      const recognition = new Recognition();
      recognitionRef.current = recognition;
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "en-US";

      recognition.onresult = async (event) => {
        const transcript = Array.from({ length: event.results.length })
          .map((_, index) => event.results[index][0].transcript)
          .join(" ")
          .trim();

        if (!transcript) return;

        const stopIntent = /^(stop|pause|silence|be quiet|cancel|shut up|enough)$/i.test(transcript);
        if (stopIntent) {
          addMessage("user", transcript);
          stopSpeechPlayback();
          setIsRecording(false);
          return;
        }

        addMessage("user", transcript);
        setIsRecording(false);
        setIsProcessing(true);
        setVoiceStatus("processing");

        const reply = await runAgent(transcript, "voice");
        await speakReply(reply);
      };

      recognition.onerror = () => {
        addMessage("agent", "I could not capture your voice request. Please try again or use text.");
        setIsRecording(false);
        setIsConnecting(false);
        setVoiceStatus(voiceSessionOpenRef.current ? "listening" : "ready");
      };

      recognition.onend = () => {
        setIsRecording(false);
        setIsConnecting(false);
        if (voiceSessionOpenRef.current) {
          setVoiceStatus("listening");
          setTimeout(() => {
            if (voiceSessionOpenRef.current && !isProcessing) {
              startVoiceRecording();
            }
          }, 500);
        }
      };

      recognition.start();
      setIsRecording(true);
      setIsConnecting(false);
    } catch (error) {
      console.error("Voice recording error:", error);
      setIsConnecting(false);
      setIsRecording(false);
      setVoiceStatus("ready");
      addMessage("agent", "Microphone access failed. Please check browser permissions.");
    }
  }, [addMessage, isProcessing, isSpeaking, runAgent, speakReply, stopSpeechPlayback]);

  const openVoiceSession = useCallback(() => {
    if (voiceSessionOpenRef.current) return;
    voiceSessionOpenRef.current = true;
    setIsVoiceSessionOpen(true);
    setVoiceStatus("listening");
    addMessage("agent", "ATHINA voice session opened. Speak anytime.");
    startVoiceRecording();
  }, [addMessage, startVoiceRecording]);

  const closeVoiceSession = useCallback(() => {
    stopSpeechPlayback(true);
    voiceSessionOpenRef.current = false;
    setIsVoiceSessionOpen(false);
    setVoiceStatus("ready");
    stopRecognition();
    addMessage("agent", "ATHINA voice session closed.");
  }, [addMessage, stopRecognition, stopSpeechPlayback]);

  const handleOrbClick = () => {
    if (isVoiceSessionOpen) {
      closeVoiceSession();
    } else {
      openVoiceSession();
    }
  };

  const handleTextSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const userMessage = inputText.trim();
    if (!userMessage) return;

    const stopIntent = /^(stop|pause|silence|be quiet|cancel|shut up|enough)$/i.test(userMessage);
    if (stopIntent) {
      addMessage("user", userMessage);
      setInputText("");
      stopSpeechPlayback();
      return;
    }

    addMessage("user", userMessage);
    setInputText("");
    await runAgent(userMessage);
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background">
      <JarvisParticles isSpeaking={isSpeaking} isActive={isActive} />

      <motion.header className="fixed left-0 right-0 top-0 z-20 flex items-center justify-between px-6 py-4">
        <span className="font-mono text-[10px] tracking-[0.4em] text-cyan-300/70">ATHINA v2</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/35">
          {isConnecting ? "connecting" : isProcessing ? "processing" : isVoiceSessionOpen ? "voice session live" : "online"}
        </span>
      </motion.header>

      <div className="relative z-10 flex w-full max-w-4xl flex-col items-center gap-6 px-4">
        <motion.div
          className="space-y-1 text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <h1 className="bg-gradient-to-r from-blue-400 via-cyan-300 to-blue-500 bg-clip-text text-transparent drop-shadow-[0_0_12px_rgba(59,130,246,0.6)]">
            ATHINA
          </h1>
        </motion.div>

        <VoiceOrb isActive={isActive} isSpeaking={isSpeaking} onClick={handleOrbClick} />
        <StatusBar status={voiceStatus} isSpeaking={isSpeaking} />
      </div>

      <div className="absolute right-6 top-20 z-40 h-[19rem] w-[min(34rem,calc(100%-3rem))] overflow-hidden rounded-lg shadow-2xl shadow-black/40">
        <WorldMap target={mapTarget} />
      </div>

      {browserTarget && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute left-6 top-20 z-40 h-[min(36rem,calc(100vh-10rem))] w-[min(46rem,calc(100%-3rem))] overflow-hidden rounded-3xl border border-cyan-300/20 bg-slate-950/95 shadow-2xl shadow-black/70 backdrop-blur-xl"
        >
          <div className="flex items-center justify-between gap-3 border-b border-cyan-300/15 px-4 py-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-cyan-100">{browserTarget.title}</div>
              <div className="truncate font-mono text-[10px] text-cyan-300/60">{browserTarget.url}</div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowBrowserPreview((prev) => !prev)}
                className="rounded-full border border-cyan-300/20 bg-cyan-400/5 px-3 py-2 text-[11px] uppercase tracking-[0.2em] text-cyan-100 transition hover:bg-cyan-400/10"
              >
                {showBrowserPreview ? "Summary" : "Preview"}
              </button>
              <a
                className="inline-flex h-9 items-center justify-center rounded-full border border-cyan-300/20 bg-cyan-500/10 px-3 text-[11px] uppercase tracking-[0.2em] text-cyan-100 transition hover:bg-cyan-500/15"
                href={browserTarget.url}
                target="_blank"
                rel="noreferrer"
              >
                Open page
              </a>
            </div>
          </div>

          <div className="grid h-[calc(100%-3.25rem)] grid-cols-1 gap-3 p-4 md:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-3xl border border-cyan-300/10 bg-slate-950/90 p-4 text-sm leading-6 text-slate-100 shadow-inner shadow-cyan-500/5">
              <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.25em] text-cyan-300/70">
                <span className="inline-flex h-2 w-2 rounded-full bg-cyan-400" />
                Internet briefing
              </div>
              {browserTarget.embedBlocked && (
                <p className="mb-3 rounded-xl border border-amber-300/30 bg-amber-200/10 px-3 py-2 text-xs text-amber-200">
                  This site blocks in-app embed preview. ATHINA is showing the extracted result and sources directly in the UI.
                </p>
              )}
              {browserTarget.summary ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{browserTarget.summary}</ReactMarkdown>
              ) : (
                <p className="text-slate-400">
                  ATHINA has found the page and is presenting the information directly in the UI. If the target site cannot be rendered safely in the preview, use the open button.
                </p>
              )}

              {browserTarget.sources && browserTarget.sources.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-cyan-300/70">Sources</p>
                  {browserTarget.sources.slice(0, 4).map((source, index) => (
                    <a
                      key={`${source.url}-${index}`}
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-xl border border-cyan-300/10 bg-slate-900/80 px-3 py-2 transition hover:border-cyan-300/35 hover:bg-slate-900"
                    >
                      <p className="line-clamp-1 text-xs font-semibold text-cyan-100">{source.title || source.url}</p>
                      <p className="line-clamp-1 text-[11px] text-cyan-300/70">{source.url}</p>
                      {source.snippet && <p className="mt-1 line-clamp-2 text-xs text-slate-300">{source.snippet}</p>}
                    </a>
                  ))}
                </div>
              )}
            </div>

            <div className="overflow-hidden rounded-3xl border border-cyan-300/10 bg-slate-900/90 shadow-inner shadow-cyan-500/5">
              {showBrowserPreview ? (
                <iframe
                  className="h-full w-full bg-slate-950"
                  src={`${BACKEND_BASE_URL}/api/preview?url=${encodeURIComponent(browserTarget.url)}`}
                  title={browserTarget.title}
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-slate-400">
                  <span className="text-sm font-semibold text-slate-100">Preview paused</span>
                  <p className="max-w-sm text-[13px] leading-6">
                    ATHINA is still holding the browse session open. Switch back to preview to render the page inside the application.
                  </p>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}

      <div className="absolute bottom-6 right-6 z-40 w-[min(430px,calc(100%-3rem))] rounded-lg border border-white/10 bg-slate-950/95 shadow-2xl shadow-black/40 backdrop-blur-xl">
        <div ref={scrollRef} className="max-h-[320px] space-y-3 overflow-y-auto px-4 py-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`text-sm ${msg.role === "user" ? "text-right text-white/80" : "text-left text-emerald-300"}`}
            >
              <div className="inline-block max-w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3">
                {msg.role === "agent" ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
                ) : (
                  msg.text
                )}
              </div>
            </div>
          ))}

          {isProcessing && (
            <div className="text-left font-mono text-xs text-emerald-400/60">ATHINA is executing...</div>
          )}
        </div>

        <form onSubmit={handleTextSubmit} className="flex items-center gap-3 border-t border-emerald-400/20 px-4 py-3">
          <input
            type="text"
            value={inputText}
            onChange={(event) => setInputText(event.target.value)}
            placeholder="Ask ATHINA to locate, browse, or answer..."
            className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/50"
          />
          <button
            type="submit"
            disabled={isProcessing}
            className="inline-flex h-9 w-9 items-center justify-center rounded border border-emerald-300/30 bg-emerald-400 text-black disabled:cursor-not-allowed disabled:opacity-50"
            title="Send"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
};

export default Index;
