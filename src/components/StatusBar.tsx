import { motion } from "framer-motion";

const StatusBar = ({ status, isSpeaking }: { status: string; isSpeaking: boolean }) => {
  const getStatusText = () => {
    switch (status) {
      case "listening":
        return "ATHINA voice session live";
      case "processing":
        return "Processing your request";
      case "speaking":
        return "ATHINA is speaking";
      case "ready":
        return "Ready for your next command";
      default:
        return "Voice session closed";
    }
  };

  const isActive = status === "listening" || status === "processing" || status === "speaking";
  const dotColor = isActive ? "#3EE5FF" : "#6B7280";

  return (
    <motion.div
      className="flex items-center gap-3 rounded-full border border-white/10 bg-slate-950/80 px-4 py-2 text-white/80 shadow-lg shadow-cyan-500/10 backdrop-blur-xl"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <motion.span
        className="inline-flex h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: dotColor }}
        animate={isActive ? { scale: [1, 1.4, 1] } : { scale: 1 }}
        transition={{ duration: 1.5, repeat: Infinity }}
      />
      <span className="text-[11px] font-mono uppercase tracking-[0.24em]">
        {getStatusText()}
      </span>
    </motion.div>
  );
};

export default StatusBar;
