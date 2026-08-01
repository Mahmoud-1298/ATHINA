import { useState, useCallback, useRef, useEffect, FormEvent } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, ExternalLink, Send, X } from "lucide-react";
import { Link } from "react-router-dom";
import VoiceOrb from "../components/VoiceOrb.tsx";
import StatusBar from "../components/StatusBar.tsx";
import JarvisParticles from "../components/JarvisParticles.tsx";
import WorldMap, { MapTarget } from "../components/WorldMap.tsx";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AgentAction,
  AgentBrowseAction,
  AgentResponse,
  BACKEND_BASE_URL,
  MapLocationContext,
  loadConversationHistory,
  sendAgentMessage,
  sendVoiceMessage,
  speakText,
} from "../lib/athinaApi.ts";
import { getClientSessionId } from "../lib/clientIdentity";

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
  fetchedAt?: string;
}

const SESSION_ID = getClientSessionId();

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
  const [selectedMapLocation, setSelectedMapLocation] = useState<MapLocationContext | null>(null);
  const [showBrowserPreview, setShowBrowserPreview] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const voiceSessionOpenRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const voiceCaptureTimerRef = useRef<number | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const isSpeakingRef = useRef(false);
  const isProcessingRef = useRef(false);

  const isActive = isVoiceSessionOpen || isRecording || isProcessing || isSpeaking;

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.onended = () => {
        setIsSpeaking(false);
        isSpeakingRef.current = false;
        setVoiceStatus(voiceSessionOpenRef.current ? "listening" : "ready");
        if (voiceSessionOpenRef.current && !isProcessingRef.current) {
          startVoiceRecording();
        }
      };
    }
  }, []);

  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  useEffect(() => {
    isProcessingRef.current = isProcessing;
  }, [isProcessing]);

  useEffect(() => {
    let cancelled = false;

    const loadHistory = async () => {
      try {
        const history = await loadConversationHistory(SESSION_ID);
        if (cancelled) return;
        setMessages(
          history.messages
            .filter((message) => message.role === "user" || message.role === "assistant")
            .map((message) => ({
              id: `${message.role}-${Math.random().toString(16).slice(2)}`,
              role: message.role === "assistant" ? "agent" : "user",
              text: message.content,
            }))
        );
      } catch (error) {
        console.error("Failed to load conversation history:", error);
      }
    };

    loadHistory();

    return () => {
      cancelled = true;
    };
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
    isSpeakingRef.current = false;
    setVoiceStatus(voiceSessionOpenRef.current ? "listening" : "ready");
    if (!silent) {
      addMessage("agent", "Speech interrupted. Standing by.");
    }
  }, [addMessage]);

  const applyActions = useCallback((actions: AgentAction[]) => {
    actions.forEach((action) => {
      if (action.type === "locate" && action.success && action.lat && action.lng) {
        const locatedTarget = {
          name: action.name || action.query,
          lat: action.lat,
          lng: action.lng,
          query: action.query,
        };
        setMapTarget(locatedTarget);
        setSelectedMapLocation({
          name: locatedTarget.name,
          lat: locatedTarget.lat,
          lng: locatedTarget.lng,
          source: "agent-locate",
          query: locatedTarget.query,
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
          fetchedAt: browseAction.fetchedAt,
        });
        setShowBrowserPreview(!browseAction.embedBlocked);
      }
    });
  }, []);

  const handleSelectLocation = useCallback((target: MapTarget) => {
    setMapTarget(target);
    setSelectedMapLocation({
      name: target.name,
      lat: target.lat,
      lng: target.lng,
      source: "map",
      query: target.query,
    });
  }, []);

  const runAgent = useCallback(
    async (text: string, mode: "text" | "voice" = "text") => {
      setIsProcessing(true);
      try {
        const result = await sendAgentMessage(text, SESSION_ID, mode, selectedMapLocation);
        addMessage("agent", result.reply);
        applyActions(result.actions || []);
        return result;
      } catch (error) {
        console.error("Agent backend error:", error);
        const message = error instanceof Error
          ? error.message.includes("Failed to fetch")
            ? "ATHINA backend unreachable. Check backend deployment or your VITE_BACKEND_URL."
            : error.message
          : "ATHINA backend failed. Please try again.";
        addMessage("agent", message);
        return {
          success: false,
          reply: message,
          actions: [],
          sessionId: SESSION_ID,
          timestamp: new Date().toISOString(),
          audioBase64: null,
        } satisfies AgentResponse;
      } finally {
        setIsProcessing(false);
      }
    },
    [addMessage, applyActions, selectedMapLocation]
  );

  const speakReply = useCallback(async (text: string, audioBase64: string | null = null) => {
    try {
      stopRecognition();
      const resolvedAudio = audioBase64 || (await speakText(text)).audioBase64;
      if (resolvedAudio && audioRef.current) {
        audioRef.current.src = `data:audio/mpeg;base64,${resolvedAudio}`;
        setIsSpeaking(true);
        isSpeakingRef.current = true;
        await audioRef.current.play();
        setVoiceStatus("speaking");
      } else {
        setVoiceStatus(voiceSessionOpenRef.current ? "listening" : "ready");
        if (voiceSessionOpenRef.current && !isProcessingRef.current) {
          startVoiceRecording();
        }
      }
    } catch (error) {
      console.error("Speech synthesis error:", error);
      setVoiceStatus(voiceSessionOpenRef.current ? "listening" : "ready");
      if (voiceSessionOpenRef.current && !isProcessingRef.current) {
        startVoiceRecording();
      }
    }
  }, []);

  const stopRecognition = useCallback(() => {
    if (voiceCaptureTimerRef.current) {
      window.clearTimeout(voiceCaptureTimerRef.current);
      voiceCaptureTimerRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
    setIsRecording(false);
  }, []);

  const startVoiceRecording = useCallback(async () => {
    if (!voiceSessionOpenRef.current) return;
    if (isSpeaking) {
      stopSpeechPlayback(true);
    }

    if (mediaRecorderRef.current || mediaStreamRef.current) {
      return;
    }

    setIsConnecting(true);
    setVoiceStatus("listening");

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microphone access is not supported in this browser.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        audioChunksRef.current = [];

        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((track) => track.stop());
          mediaStreamRef.current = null;
        }

        mediaRecorderRef.current = null;
        setIsRecording(false);

        if (!voiceSessionOpenRef.current) return;

        try {
          setIsProcessing(true);
          setVoiceStatus("processing");

          const audioBase64 = await sendVoiceMessage(audioBlob, SESSION_ID, selectedMapLocation);
          const transcript = audioBase64.transcript?.trim() || "";

          if (transcript) {
            addMessage("user", transcript);
          }

          if (audioBase64.reply) {
            addMessage("agent", audioBase64.reply);
            applyActions(audioBase64.actions || []);
            await speakReply(audioBase64.reply, audioBase64.audioBase64 || null);
          } else {
            addMessage("agent", "I couldn't listen to that audio clip. Please try again.");
            setVoiceStatus(voiceSessionOpenRef.current ? "listening" : "ready");
          }
        } catch (error) {
          console.error("Voice recording error:", error);
          addMessage("agent", "I couldn't process that voice request. Please try again or use text.");
          setVoiceStatus(voiceSessionOpenRef.current ? "listening" : "ready");
        } finally {
          setIsProcessing(false);
          if (voiceSessionOpenRef.current && !isSpeakingRef.current && !isProcessingRef.current) {
            setVoiceStatus("listening");
            setTimeout(() => {
              if (voiceSessionOpenRef.current && !isProcessingRef.current && !isSpeakingRef.current) {
                startVoiceRecording();
              }
            }, 500);
          }
        }
      };

      recorder.start();
      setIsRecording(true);
      setIsConnecting(false);

      voiceCaptureTimerRef.current = window.setTimeout(() => {
        if (recorder.state === "recording") {
          recorder.stop();
        }
      }, 6000);
    } catch (error) {
      console.error("Voice recording error:", error);
      setIsConnecting(false);
      setIsRecording(false);
      setVoiceStatus("ready");
      addMessage("agent", "Microphone access failed. Please check browser permissions.");
    }
  }, [addMessage, applyActions, isSpeaking, selectedMapLocation, speakReply, stopSpeechPlayback]);

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

    const stopIntent = /\b(stop|pause|silence|be quiet|cancel|shut up|enough)\b/i.test(userMessage);
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
      <div className="fixed right-4 top-4 z-20 h-[min(17.6rem,calc(100vh-2rem))] w-[min(27.2rem,calc(100vw-2rem))] sm:h-[min(19.2rem,calc(100vh-2rem))] sm:w-[min(28.8rem,calc(100vw-2rem))] md:h-[min(20.8rem,calc(100vh-2rem))] md:w-[min(32rem,calc(100vw-2rem))]">
        <WorldMap target={mapTarget} onSelectLocation={handleSelectLocation} className="h-full w-full" />
      </div>

      <JarvisParticles isSpeaking={isSpeaking} isActive={isActive} />

      <motion.header className="fixed left-0 right-0 top-0 z-20 flex items-center justify-between px-6 py-4">
        <span className="font-mono text-[10px] tracking-[0.4em] text-cyan-300/70">ATHINA v2</span>
        <div className="flex items-center gap-3">
          <Link
            to="/proposal-validator"
            className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.22em] text-emerald-200 transition hover:bg-emerald-400/20"
          >
            Proposal Validator
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/35">
            {isConnecting ? "connecting" : isProcessing ? "processing" : isVoiceSessionOpen ? "voice session live" : "online"}
          </span>
        </div>
      </motion.header>

      <div className="relative z-30 flex w-full max-w-4xl flex-col items-center gap-6 px-4">
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
                onClick={() => setBrowserTarget(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-red-300/20 bg-red-500/10 text-red-200 transition hover:bg-red-500/20"
                title="Close browser panel"
              >
                <X className="h-4 w-4" />
              </button>
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
