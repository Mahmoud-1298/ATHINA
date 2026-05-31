import { motion } from "framer-motion";

interface VoiceOrbProps {
  isActive: boolean;
  isSpeaking: boolean;
  onClick: () => void;
}

const G = "84 65% 44%";

const VoiceOrb = ({ isActive, isSpeaking, onClick }: VoiceOrbProps) => {
  return (
    <div className="relative flex items-center justify-center">
      {isActive && (
        <>
          <motion.div
            className="absolute rounded-full"
            style={{ border: `1px solid hsl(${G} / 0.15)` }}
            initial={{ width: 180, height: 180, opacity: 0 }}
            animate={{ width: 300, height: 300, opacity: [0, 0.3, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeOut" }}
          />
          <motion.div
            className="absolute rounded-full"
            style={{ border: `1px solid hsl(${G} / 0.08)` }}
            initial={{ width: 180, height: 180, opacity: 0 }}
            animate={{ width: 260, height: 260, opacity: [0, 0.2, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeOut", delay: 0.8 }}
          />
        </>
      )}

      <motion.div
        className="absolute rounded-full"
        style={{
          width: 160,
          height: 160,
          background: `radial-gradient(circle, hsl(${G} / 0.08) 0%, transparent 70%)`,
          filter: "blur(20px)",
        }}
        animate={{
          scale: isSpeaking ? [1, 1.5, 1] : isActive ? [1, 1.15, 1] : 1,
          opacity: isSpeaking ? [0.3, 0.7, 0.3] : isActive ? [0.15, 0.3, 0.15] : 0.08,
        }}
        transition={{ duration: isSpeaking ? 0.6 : 2.5, repeat: Infinity }}
      />

      <motion.button
        onClick={onClick}
        className="relative w-36 h-36 rounded-full flex items-center justify-center cursor-pointer focus:outline-none"
        style={{
          background: isActive
            ? `radial-gradient(circle, hsl(${G} / 0.12) 0%, hsl(${G} / 0.03) 60%, transparent 100%)`
            : `radial-gradient(circle, hsl(${G} / 0.05) 0%, transparent 70%)`,
          border: `1.5px solid hsl(${G} / ${isActive ? 0.4 : 0.12})`,
          backdropFilter: "blur(10px)",
        }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        animate={
          isSpeaking
            ? {
                boxShadow: [
                  `0 0 25px hsl(${G} / 0.3), 0 0 60px hsl(${G} / 0.12), inset 0 0 20px hsl(${G} / 0.05)`,
                  `0 0 45px hsl(${G} / 0.5), 0 0 100px hsl(${G} / 0.2), inset 0 0 40px hsl(${G} / 0.1)`,
                  `0 0 25px hsl(${G} / 0.3), 0 0 60px hsl(${G} / 0.12), inset 0 0 20px hsl(${G} / 0.05)`,
                ],
              }
            : isActive
            ? {
                boxShadow: [
                  `0 0 15px hsl(${G} / 0.18), 0 0 40px hsl(${G} / 0.06)`,
                  `0 0 25px hsl(${G} / 0.3), 0 0 60px hsl(${G} / 0.12)`,
                  `0 0 15px hsl(${G} / 0.18), 0 0 40px hsl(${G} / 0.06)`,
                ],
              }
            : {}
        }
        transition={{ duration: isSpeaking ? 0.5 : 2, repeat: Infinity }}
      >
        <div className="relative w-16 h-16 flex items-center justify-center">
          {isActive && isSpeaking ? (
            <div className="flex items-center gap-[3px]">
              {[...Array(7)].map((_, i) => (
                <motion.div
                  key={i}
                  className="w-[2px] rounded-full bg-primary"
                  animate={{
                    height: [4, 20 + Math.random() * 24, 4],
                    opacity: [0.4, 0.9, 0.4],
                  }}
                  transition={{
                    duration: 0.3 + Math.random() * 0.3,
                    repeat: Infinity,
                    delay: i * 0.06,
                  }}
                />
              ))}
            </div>
          ) : isActive ? (
            <motion.div
              className="w-2.5 h-2.5 rounded-full bg-primary"
              animate={{ scale: [1, 1.8, 1], opacity: [0.4, 0.9, 0.4] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          ) : (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="hsl(35 90% 52% / 0.4)" strokeWidth="1.5">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
          )}
        </div>
      </motion.button>
    </div>
  );
};

export default VoiceOrb;
