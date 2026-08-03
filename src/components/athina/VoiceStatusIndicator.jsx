import React from 'react';
import { AudioLines, Brain, Ear, Radio } from 'lucide-react';

function Waveform({ bars = 5, tone = 'violet', active = true }) {
  const colorClass = tone === 'cyan' ? 'bg-cyan-300' : 'bg-violet-300';

  return (
    <div className="flex h-3 items-center gap-[2px]" aria-hidden="true">
      {Array.from({ length: bars }).map((_, index) => (
        <span
          key={index}
          className={`w-[2px] rounded-full ${colorClass} ${
            active ? 'animate-voice-bar' : 'opacity-30'
          }`}
          style={{
            height: active ? `${30 + ((index * 37) % 70)}%` : '30%',
            animationDelay: `${index * 0.12}s`,
          }}
        />
      ))}
    </div>
  );
}

export default function VoiceStatusIndicator({ state, interimText = '' }) {
  if (state === 'idle') return null;

  const configs = {
    wake: {
      icon: Radio,
      label: 'Say “ATHINA”',
      container: 'border-violet-400/20 bg-violet-500/10',
      iconColor: 'text-violet-300',
      labelColor: 'text-violet-100/85',
      ringClass: 'ring-violet-400/30',
      pulseColor: 'bg-violet-400/15',
      waveformTone: 'violet',
    },
    listening: {
      icon: Ear,
      label: 'Listening',
      container: 'border-cyan-300/20 bg-cyan-400/10',
      iconColor: 'text-cyan-300',
      labelColor: 'text-cyan-100/90',
      ringClass: 'ring-cyan-300/35',
      pulseColor: 'bg-cyan-300/15',
      waveformTone: 'cyan',
    },
    speaking: {
      icon: AudioLines,
      label: 'Speaking',
      container: 'border-violet-300/20 bg-violet-400/10',
      iconColor: 'text-violet-200',
      labelColor: 'text-violet-100/90',
      ringClass: 'ring-violet-300/35',
      pulseColor: 'bg-violet-300/15',
      waveformTone: 'violet',
    },
    thinking: {
      icon: Brain,
      label: 'Thinking',
      container: 'border-violet-400/20 bg-violet-500/10',
      iconColor: 'text-violet-300',
      labelColor: 'text-violet-100/85',
      ringClass: 'ring-violet-400/30',
      pulseColor: 'bg-violet-400/15',
      waveformTone: 'violet',
    },
  };

  const config = configs[state];
  if (!config) return null;

  const Icon = config.icon;
  const isListening = state === 'listening';
  const isSpeaking = state === 'speaking';
  const isWake = state === 'wake';

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={`inline-flex max-w-full items-center gap-2.5 rounded-full border px-3 py-2 shadow-[0_12px_40px_rgba(0,0,0,0.28)] backdrop-blur-xl transition-all duration-300 ${config.container}`}
    >
      <div className="relative flex shrink-0 items-center justify-center">
        {isWake ? (
          <>
            <span
              className={`absolute h-6 w-6 rounded-full ${config.pulseColor} animate-ping-slow`}
            />
            <span
              className={`absolute h-5 w-5 rounded-full ${config.pulseColor} animate-ping-slow`}
              style={{ animationDelay: '0.5s' }}
            />
          </>
        ) : null}

        {isListening ? (
          <span
            className={`absolute h-5 w-5 rounded-full ${config.pulseColor} animate-ping`}
          />
        ) : null}

        <div
          className={`relative flex h-5 w-5 items-center justify-center rounded-full ring-1 ${config.ringClass} ${
            isWake || isListening ? 'animate-pulse-subtle' : ''
          }`}
        >
          <Icon className={`h-3 w-3 ${config.iconColor}`} />
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-1.5">
        <span className={`shrink-0 text-[11px] font-medium tracking-wide ${config.labelColor}`}>
          {config.label}
        </span>

        {isListening && interimText ? (
          <span className="max-w-[220px] truncate text-[11px] text-cyan-100/60 sm:max-w-[320px]">
            {interimText}
          </span>
        ) : null}
      </div>

      {isSpeaking || isListening ? (
        <div className="ml-1 shrink-0">
          <Waveform
            bars={isSpeaking ? 7 : 5}
            tone={config.waveformTone}
            active
          />
        </div>
      ) : null}

      {isWake ? (
        <div className="ml-1 flex shrink-0 gap-1" aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className="h-1 w-1 animate-pulse rounded-full bg-violet-300/60"
              style={{ animationDelay: `${index * 0.3}s` }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
