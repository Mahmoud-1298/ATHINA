import { useState, useCallback, useRef, useEffect, FormEvent } from "react";
import { useConversation } from "@elevenlabs/react";
import { motion } from "framer-motion";
import { supabase } from "../integrations/supabase/client.ts";
import VoiceOrb from "../components/VoiceOrb.tsx";
import StatusBar from "../components/StatusBar.tsx";
import JarvisParticles from "../components/JarvisParticles.tsx";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Message {
  id: string;
  role: "user" | "agent";
  text: string;
}

const BACKEND_CHAT_URL =
  "https://athina-backend.onrender.com/api/chat";

const Index = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [partialText, setPartialText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  /* ============================
     VOICE (UNCHANGED)
     ============================ */
  const conversation = useConversation({
    onMessage: (message: any) => {
      if (message.type === "agent_response") {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            role: "agent",
            text: message.agent_response_event?.agent_response || "",
          },
        ]);
      } else if (message.type === "user_transcript") {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            role: "user",
            text:
              message.user_transcription_event?.user_transcript || "",
          },
        ]);
      }
    },
    onError: (error) => {
      console.error("Voice error:", error);
    },
  });

  const startConversation = useCallback(async () => {
    if (conversation.status === "connected") return;

    setIsConnecting(true);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });

      const { data } = await supabase.functions.invoke(
        "elevenlabs-signed-url"
      );

      await conversation.startSession({
        signedUrl: data?.signed_url,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setIsConnecting(false);
    }
  }, [conversation]);

  const stopConversation = useCallback(async () => {
    await conversation.endSession();
  }, [conversation]);

  const isActive = conversation.status === "connected";

  const handleOrbClick = () => {
    if (isActive) stopConversation();
    else startConversation();
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
        isSpeaking={conversation.isSpeaking}
        isActive={isActive}
      />

      {/* Header */}
      <motion.header className="fixed top-0 left-0 right-0 z-20 px-6 py-4">
        <span className="font-mono text-[10px] tracking-[0.4em] text-white/60">
          MOROHUB • ATHINA
        </span>
      </motion.header>

      <div className="relative z-10 flex flex-col items-center gap-6 px-4 w-full max-w-4xl">

        <VoiceOrb
          isActive={isActive}
          isSpeaking={conversation.isSpeaking}
          onClick={handleOrbClick}
        />

        <StatusBar
          status={conversation.status}
          isSpeaking={conversation.isSpeaking}
        />

        {/* Chat Panel */}
        <div className="w-full max-w-3xl mt-6 rounded-xl border border-cyan-400/20 bg-black/50 backdrop-blur-xl">

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
                    : "text-left text-cyan-300"
                }`}
              >
                <div className="inline-block px-4 py-3 rounded-xl bg-white/5 border border-white/10 max-w-full">
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
              <div className="text-left text-cyan-300 text-sm">
                <div className="inline-block px-4 py-3 rounded-xl bg-white/5 border border-white/10">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {partialText}
                  </ReactMarkdown>
                </div>
              </div>
            )}

            {isTyping && !partialText && (
              <div className="text-left text-cyan-400/60 text-xs font-mono">
                ATHINA is thinking…
              </div>
            )}
          </div>

          {/* Input */}
          <form
            onSubmit={handleTextSubmit}
            className="flex items-center gap-3 border-t border-cyan-400/20 px-4 py-3"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type to ATHINA…"
              className="flex-1 bg-transparent text-sm text-white"
            />
            <button
              type="submit"
              className="px-4 py-1.5 rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 text-black text-xs"
            >
              SEND
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Index;
``