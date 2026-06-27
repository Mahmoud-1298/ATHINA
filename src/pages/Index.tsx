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
}

const SESSION_ID = "ui-session";

type SpeechRecognitionConstructor = new () => SpeechRecognition;

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
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
  const [voiceStatus, setVoiceStatus] = useState<"ready" | "recording" | "processing" | "speaking">("ready");
  const [mapTarget, setMapTarget] = useState<MapTarget | null>(null);
  const [browserTarget, setBrowserTarget] = useState<BrowserTarget | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const isActive = isRecording || isProcessing || isSpeaking;

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.onended = () => {
        setVoiceStatus("ready");
        setIsSpeaking(false);
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
        });
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
        const message = error instanceof Error ? error.message : "ATHINA backend failed. Please try again.";
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
        setVoiceStatus("ready");
      }
    } catch (error) {
      console.error("Speech synthesis error:", error);
      setVoiceStatus("ready");
    }
  }, []);

  const startVoiceRecording = useCallback(async () => {
    setIsConnecting(true);
    setVoiceStatus("recording");
    try {
      const Recognition =
        ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) as
          | SpeechRecognitionConstructor
          | undefined;

      if (!Recognition) {
        addMessage("agent", "Speech recognition is not available in this browser. Please use the text box.");
        setIsConnecting(false);
        setVoiceStatus("ready");
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
        setVoiceStatus("ready");
      };

      recognition.onend = () => {
        setIsRecording(false);
        setIsConnecting(false);
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
  }, [addMessage, runAgent, speakReply]);

  const stopVoiceRecording = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsRecording(false);
    setVoiceStatus("ready");
  }, []);

  const handleOrbClick = () => {
    if (isRecording) {
      stopVoiceRecording();
    } else if (!isProcessing && !isSpeaking) {
      startVoiceRecording();
    }
  };

  const handleTextSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const userMessage = inputText.trim();
    if (!userMessage) return;

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
        <span className="font-mono text-[10px] tracking-[0.4em] text-green-400/60">ATHINA v2</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/35">
          {isConnecting ? "connecting" : isProcessing ? "processing" : "online"}
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
        <div className="absolute left-6 top-20 z-40 h-[min(34rem,calc(100vh-11rem))] w-[min(42rem,calc(100%-3rem))] overflow-hidden rounded-lg border border-cyan-300/20 bg-slate-950/95 shadow-2xl shadow-black/50 backdrop-blur-xl">
          <div className="flex h-11 items-center justify-between border-b border-cyan-300/15 px-3">
            <div className="min-w-0">
              <div className="truncate text-sm text-cyan-100">{browserTarget.title}</div>
              <div className="truncate font-mono text-[10px] text-cyan-300/50">{browserTarget.url}</div>
            </div>
            <a
              className="ml-3 inline-flex h-8 w-8 items-center justify-center rounded border border-cyan-300/20 text-cyan-200 hover:bg-cyan-300/10"
              href={browserTarget.url}
              target="_blank"
              rel="noreferrer"
              title="Open page"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
          <iframe className="h-[calc(100%-2.75rem)] w-full bg-white" src={browserTarget.url} title={browserTarget.title} />
        </div>
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
