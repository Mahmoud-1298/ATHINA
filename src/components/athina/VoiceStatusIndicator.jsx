import React from 'react';
import { Radio, Ear, AudioLines, Brain } from 'lucide-react';

function Waveform({ bars = 5, color = 'bg-cyan-400', active = true }) {
  return (
    <div className="flex items-center gap-[2px] h-3">
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          className={`w-[2px] rounded-full ${color} ${active ? 'animate-voice-bar' : 'opacity-30'}`}
          style={{
            height: active ? `${30 + ((i * 37) % 70)}%` : '30%',
            animationDelay: `${i * 0.12}s`,
          }}
        />
      ))}
    </div>
  );
}

export default function VoiceStatusIndicator({ state, interimText }) {
  // state: 'idle' | 'wake' | 'listening' | 'speaking' | 'thinking'
  if (state === 'idle') return null;

  const configs = {
    wake: {
      icon: Radio,
      label: 'Listening for "Hi ATHINA"',
      color: 'cyan',
      bg: 'bg-cyan-500/5',
      border: 'border-cyan-500/20',
      iconColor: 'text-cyan-400',
      labelColor: 'text-cyan-400/80',
      ringClass: 'ring-cyan-400/30',
    },
    listening: {
      icon: Ear,
      label: 'Listening',
      color: 'cyan',
      bg: 'bg-cyan-500/8',
      border: 'border-cyan-500/25',
      iconColor: 'text-cyan-300',
      labelColor: 'text-cyan-300/90',
      ringClass: 'ring-cyan-300/40',
    },
    speaking: {
      icon: AudioLines,
      label: 'ATHINA speaking',
      color: 'cyan',
      bg: 'bg-cyan-500/8',
      border: 'border-cyan-500/25',
      iconColor: 'text-cyan-300',
      labelColor: 'text-cyan-300/90',
      ringClass: 'ring-cyan-300/40',
    },
    thinking: {
      icon: Brain,
      label: 'Thinking',
      color: 'cyan',
      bg: 'bg-slate-800/30',
      border: 'border-slate-600/20',
      iconColor: 'text-slate-400',
      labelColor: 'text-slate-400/80',
      ringClass: 'ring-slate-400/20',
    },
  };

  const cfg = configs[state];
  if (!cfg) return null;
  const Icon = cfg.icon;

  return (
    <div className={`px-3 py-2 border-b border-slate-700/30 ${cfg.bg} shrink-0 transition-all duration-300 ${
      state === 'listening' || state === 'wake' ? 'shadow-[inset_0_0_30px_-10px_rgba(0,229,255,0.3)]' : ''
    }`}>
      <div className="flex items-center gap-2.5">
        {/* Animated icon with pulse ring */}
        <div className="relative flex items-center justify-center">
          {state === 'wake' && (
            <>
              <span className="absolute w-6 h-6 rounded-full bg-cyan-400/10 animate-ping-slow" />
              <span className="absolute w-5 h-5 rounded-full bg-cyan-400/15 animate-ping-slow" style={{ animationDelay: '0.5s' }} />
            </>
          )}
          {state === 'listening' && (
            <span className="absolute w-5 h-5 rounded-full bg-cyan-300/15 animate-ping" />
          )}
          <div className={`relative w-5 h-5 flex items-center justify-center rounded-full ring-1 ${cfg.ringClass} ${state === 'wake' || state === 'listening' ? 'animate-pulse-subtle' : ''}`}>
            <Icon className={`w-3 h-3 ${cfg.iconColor}`} />
          </div>
        </div>

        {/* Label */}
        <span className={`text-[10px] font-mono tracking-wider uppercase ${cfg.labelColor}`}>
          {cfg.label}
          {state === 'listening' && interimText ? ' — ' : ''}
          {state === 'listening' && interimText && (
            <span className="text-cyan-200/60 normal-case tracking-normal lowercase">{interimText}</span>
          )}
        </span>

        {/* Waveform for speaking/listening */}
        {(state === 'speaking' || state === 'listening') && (
          <div className="ml-auto">
            <Waveform bars={state === 'speaking' ? 7 : 5} active />
          </div>
        )}

        {/* Wake mode: subtle scanning dots */}
        {state === 'wake' && (
          <div className="ml-auto flex gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-1 h-1 rounded-full bg-cyan-400/50 animate-pulse"
                style={{ animationDelay: `${i * 0.3}s` }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}