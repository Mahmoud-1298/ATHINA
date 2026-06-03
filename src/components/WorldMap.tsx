const WorldMap = () => {
  const globeBackground = {
    backgroundImage:
      "radial-gradient(circle at 30% 25%, rgba(148,163,184,0.22), transparent 15%), " +
      "radial-gradient(circle at 65% 40%, rgba(148,163,184,0.18), transparent 18%), " +
      "radial-gradient(circle at 40% 68%, rgba(148,163,184,0.16), transparent 20%), " +
      "radial-gradient(circle at 75% 75%, rgba(148,163,184,0.12), transparent 18%), " +
      "radial-gradient(circle at 18% 60%, rgba(148,163,184,0.12), transparent 18%), " +
      "linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px), " +
      "linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px)",
  };

  const globeGlow = {
    backgroundImage:
      "radial-gradient(circle at 25% 20%, rgba(148,163,184,0.18), transparent 22%), " +
      "radial-gradient(circle at 60% 35%, rgba(255,255,255,0.08), transparent 26%)",
  };

  return (
    <div className="relative w-full h-full rounded-full overflow-hidden bg-slate-950/95 ring-1 ring-white/10 border border-white/5 shadow-inner shadow-black/40">
      <div className="absolute inset-0 rounded-full bg-slate-950/90" />

      <div className="absolute inset-0 rounded-full overflow-hidden">
        <div className="absolute inset-0 animate-globeRotate" style={{ transformStyle: "preserve-3d" }}>
          <div className="absolute inset-0 rounded-full" style={globeBackground} />
        </div>
        <div className="absolute inset-0 rounded-full" style={globeGlow} />
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_40%_20%,rgba(255,255,255,0.08),transparent_22%)] opacity-20" />
      </div>

      <div className="absolute inset-0 rounded-full border border-white/10 opacity-20" />
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-transparent via-white/5 to-transparent opacity-10" />
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.08),transparent_55%)] opacity-10" />

      <div className="absolute top-4 left-4 flex flex-col gap-2 rounded-3xl border border-white/10 bg-slate-950/75 p-3 text-xs text-slate-300 shadow-2xl shadow-black/30 backdrop-blur-sm">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-slate-400">
          <span>ATHINA</span>
          <span className="text-emerald-300">LIVE</span>
        </div>
        <div className="grid gap-1">
          <div className="flex items-center justify-between text-[11px] text-slate-300">
            <span className="text-slate-400">Rotation</span>
            <span>0.03 rpm</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-300">
            <span className="text-slate-400">Horizon</span>
            <span>Dark mode</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorldMap;
