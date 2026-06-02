import { useState, useCallback } from "react";
import { useConversation } from "@elevenlabs/react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import VoiceOrb from "@/components/VoiceOrb";
import StatusBar from "@/components/StatusBar";
import JarvisParticles from "@/components/JarvisParticles";

interface Message {
  id: string;
  role: "user" | "agent";
  text: string;
}

const Index = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [partialText, setPartialText] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);

  const conversation = useConversation({
    onMessage: (message: any) => {
      if (message.type === "agent_response") {
        setPartialText("");
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
            text: message.user_transcription_event?.user_transcript || "",
          },
        ]);
      }
    },
    onError: (error) => {
      console.error("Conversation error:", error);
    },
  });

  const startConversation = useCallback(async () => {
    setIsConnecting(true);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });

      const { data, error } = await supabase.functions.invoke("elevenlabs-signed-url");

      if (error || !data?.signed_url) {
        throw new Error(error?.message || "No signed URL received");
      }

      await conversation.startSession({
        signedUrl: data.signed_url,
      });
    } catch (err) {
      console.error("Failed to start:", err);
    } finally {
      setIsConnecting(false);
    }
  }, [conversation]);

  const stopConversation = useCallback(async () => {
    await conversation.endSession();
  }, [conversation]);

  const isActive = conversation.status === "connected";

  const handleOrbClick = () => {
    if (isActive) {
      stopConversation();
    } else {
      startConversation();
    }
  };

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen bg-background overflow-hidden">
      {/* Jarvis particle system */}
      <JarvisParticles isSpeaking={conversation.isSpeaking} isActive={isActive} />

      {/* Subtle vignette overlay */}
      <div
        className="fixed inset-0 z-[1] pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 40%, hsl(0 0% 2% / 0.85) 100%)",
        }}
      />

      {/* Header */}
      <motion.header
        className="fixed top-0 left-0 right-0 z-20 flex items-center justify-between px-6 py-4"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md border border-primary/20 flex items-center justify-center">
            <div className="w-2 h-2 rounded-sm bg-primary/80" />
          </div>
          <span className="font-mono text-[11px] font-semibold tracking-[0.3em] text-foreground/80">
            v.0.1
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-1.5 rounded-full bg-primary/30" />
          <span className="text-[10px] font-mono text-muted-foreground/60 tracking-wider">
            ATHINA
          </span>
        </div>
      </motion.header>

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center gap-6 px-4 w-full max-w-4xl">
        <motion.div
          className="text-center space-y-1"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <h1 className="font-orbitron text-4xl md:text-5xl font-bold tracking-[0.18em] uppercase text-white/80">
            ATHINA{" "} 
            <span className="bg-gradient-to-r from-blue-400 via-cyan-300 to-blue-500 bg-clip-text text-transparent drop-shadow-[0_0_12px_rgba(59,130,246,0.6)]"> AI
            </span>

          </h1>
          <p className="font-orbitron text-xs tracking-[0.4em] text-white/40 mt-2">
            ATHINA  
          </p>

        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5, type: "spring" }}
        >
          <VoiceOrb
            isActive={isActive}
            isSpeaking={conversation.isSpeaking}
            onClick={handleOrbClick}
          />
        </motion.div>

        <StatusBar status={conversation.status} isSpeaking={conversation.isSpeaking} />

        <motion.p
          className="text-[10px] font-mono text-muted-foreground/40 tracking-wider"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
        >
          {isConnecting
            ? "Establishing connection..."
            : isActive
            ? "Tap to end session"
            : "Tap to initialize"}
        </motion.p>

        <motion.div
          className="w-full"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
        </motion.div>
      </div>

      {/* Bottom line */}
      <div className="fixed bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent z-20" />
    </div>
  );
};

export default Index;
