import { useState, useCallback, useRef, useEffect, FormEvent } from "react";
import { motion } from "framer-motion";
import VoiceOrb from "../components/VoiceOrb.tsx";
import StatusBar from "../components/StatusBar.tsx";
import JarvisParticles from "../components/JarvisParticles.tsx";
import WorldMap from "../components/WorldMap.tsx";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Message {
  id: string;
  role: "user" | "agent";
  text: string;
}

const BACKEND_BASE_URL =
  import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";
const BACKEND_CHAT_URL = `${BACKEND_BASE_URL}/api/chat`;
const BACKEND_VOICE_URL = `${BACKEND_BASE_URL}/api/voice`;

const Index = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [partialText, setPartialText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<"ready" | "recording" | "processing" | "speaking">("ready");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
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

  const sendVoiceToBackend = useCallback(async (blob: Blob) => {
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const base64 = btoa(
        String.fromCharCode(...new Uint8Array(arrayBuffer))
      );

      const res = await fetch(BACKEND_VOICE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          audioBase64: base64,
          sessionId: "ui-session",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Voice backend request failed");
      }

      const textResponse = data.text || "";
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "agent",
          text: textResponse,
        },
      ]);

      if (data.audioBase64) {
        const url = `data:audio/mpeg;base64,${data.audioBase64}`;
        setAudioUrl(url);

        if (audioRef.current) {
          audioRef.current.src = url;
          await audioRef.current.play();
          setVoiceStatus("speaking");
          setIsSpeaking(true);
        }
      }
    } catch (error) {
      console.error("Voice backend error:", error);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "agent",
          text: "Voice backend failed. Please try again.",
        },
      ]);
    }
  }, []);

  const startVoiceRecording = useCallback(async () => {
    setIsConnecting(true);
    setVoiceStatus("recording");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        setIsRecording(false);
        setIsProcessing(true);
        setVoiceStatus("processing");

        const voiceBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });

        await sendVoiceToBackend(voiceBlob);

        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
        setIsProcessing(false);
        setIsConnecting(false);
      };

      recorder.start();
      setIsRecording(true);
      setIsConnecting(false);
    } catch (error) {
      console.error("Voice recording error:", error);
      setIsConnecting(false);
      setIsRecording(false);
      setVoiceStatus("ready");
    }
  }, [sendVoiceToBackend]);

  const stopVoiceRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }, []);

  const handleOrbClick = () => {
    if (isRecording) {
      stopVoiceRecording();
    } else if (!isProcessing && !isSpeaking) {
      startVoiceRecording();
    }
  };

  /* ============================
     ✅ STREAMING TEXT CHAT
     ============================ */
  const sendTextToBackend = async (text: string) => {
    setIsTyping(true);
    setPartialText("");

    const res = await fetch(BACKEND_CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: text,
        sessionId: "ui-session",
      }),
    });

    const reader = res.body?.getReader();
    const decoder = new TextDecoder();

    let fullText = "";

    while (true) {
      const { done, value } = await reader!.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n").filter((l) => l.startsWith("data:"));

      for (const line of lines) {
        const data = line.replace("data:", "").trim();

        if (data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data);
          const token = parsed.token;

          if (token) {
            fullText += token;
            setPartialText(fullText); // live typing
          }
        } catch (e) {}
      }
    }

    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        role: "agent",
        text: fullText,
      },
    ]);

    setPartialText("");
    setIsTyping(false);
  };

  const handleTextSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!inputText.trim()) return;

    const userMessage = inputText;

    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        role: "user",
        text: userMessage,
      },
    ]);

    setInputText("");
    await sendTextToBackend(userMessage);
  };

  /* ============================
     AUTO-SCROLL
     ============================ */
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop =
        scrollRef.current.scrollHeight;
    }
  }, [messages, partialText]);

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen bg-background overflow-hidden">
      <JarvisParticles
        isSpeaking={isSpeaking}
        isActive={isActive}
      />

      {/* Header */}
      <motion.header className="fixed top-0 left-0 right-0 z-20 px-6 py-4">
        <span className="font-mono text-[10px] tracking-[0.4em] text-green-400/60">
          ATHINA v1
        </span>
      </motion.header>

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center gap-6 px-4 w-full max-w-4xl">
        <motion.div
          className="text-center space-y-1"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <h1 className="bg-gradient-to-r from-blue-400 via-cyan-300 to-blue-500 bg-clip-text text-transparent drop-shadow-[0_0_12px_rgba(59,130,246,0.6)]">
            ATHINA
          </h1>
        </motion.div>

        <VoiceOrb
          isActive={isActive}
          isSpeaking={isSpeaking}
          onClick={handleOrbClick}
        />

        <StatusBar
          status={voiceStatus}
          isSpeaking={isSpeaking}
        />
      </div>

      {/* World Map */}
      <div className="absolute top-20 right-6 z-40 w-[18rem] h-[18rem] rounded-full bg-transparent shadow-2xl shadow-black/40 overflow-hidden">
        <WorldMap />
      </div>

      {/* Chat Panel */}
      <div className="absolute bottom-6 right-6 z-40 w-[min(420px,calc(100%-3rem))] rounded-[2rem] border border-white/10 bg-slate-950/95 shadow-2xl shadow-black/40 backdrop-blur-xl">
        <div
          ref={scrollRef}
          className="max-h-[320px] overflow-y-auto px-4 py-4 space-y-3"
        >
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`text-sm ${
                msg.role === "user"
                  ? "text-right text-white/80"
                  : "text-left text-emerald-300"
              }`}
            >
              <div className="inline-block px-4 py-3 rounded-2xl bg-white/5 border border-white/10 max-w-full">
                {msg.role === "agent" ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {msg.text}
                  </ReactMarkdown>
                ) : (
                  msg.text
                )}
              </div>
            </div>
          ))}

          {/* ✅ STREAMING TEXT DISPLAY */}
          {partialText && (
            <div className="text-left text-emerald-300 text-sm">
              <div className="inline-block px-4 py-3 rounded-2xl bg-white/5 border border-white/10">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {partialText}
                </ReactMarkdown>
              </div>
            </div>
          )}

          {isTyping && !partialText && (
            <div className="text-left text-emerald-400/60 text-xs font-mono">
              ATHINA is thinking…
            </div>
          )}
        </div>

        <form
          onSubmit={handleTextSubmit}
          className="flex items-center gap-3 border-t border-emerald-400/20 px-4 py-3"
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="chat with ATHINA…"
            className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/50"
          />
          <button
            type="submit"
            className="px-4 py-1.5 rounded-full bg-gradient-to-r from-emerald-400 to-green-600 text-black text-xs font-semibold"
          >
            SEND
          </button>
        </form>
      </div>
    </div>
  );
};

export default Index;
