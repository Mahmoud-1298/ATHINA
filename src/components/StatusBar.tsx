import { motion } from "framer-motion";

const G = "84 65% 44%";


const StatusBar = ({ status, isSpeaking }: { status: string; isSpeaking: boolean }) => {
  const getStatusText = () => {
    if (status === "connected" && isSpeaking) return "Agent speaking...";
    if (status === "connected") return "Listening...";
    return "Ready";
  };

  return (
    <motion.div
      className="flex items-center gap-2 px-5 py-2 rounded-full border border-border/40 bg-card/20 backdrop-blur-md"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <motion.div
        className="w-1.5 h-1.5 rounded-full"
        style={{
          backgroundColor: status === "connected" ? `hsl(${G})` : "hsl(0 0% 30%)",
        }}
        animate={
          status === "connected"
            ? {
                boxShadow: [
                  "0 0 4px hsl(35 90% 52% / 0.4)",
                  "0 0 10px hsl(35 90% 52% / 0.6)",
                  "0 0 4px hsl(35 90% 52% / 0.4)",
                ],
              }
            : {}
        }
        transition={{ duration: 1.5, repeat: Infinity }}
      />
      <span className="text-[10px] font-mono text-muted-foreground tracking-[0.2em] uppercase">
        {getStatusText()}
      </span>
    </motion.div>
  );
};

export default StatusBar;
