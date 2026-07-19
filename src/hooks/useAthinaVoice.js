import { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

const AGENT_ID = 'agent_3301kt6djmwmet7tp8n2jjs9f3f5';

export function useAthinaVoice({ onUserTranscript, onAgentResponse, voiceEnabled = true }) {
  const [connected, setConnected] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [wakeMode, setWakeMode] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [voiceSupported] = useState(() => {
    if (typeof window === 'undefined') return false;
    return !!window.WebSocket && !!navigator.mediaDevices?.getUserMedia;
  });

  const wsRef = useRef(null);
  const micStreamRef = useRef(null);
  const micCtxRef = useRef(null);
  const micProcessorRef = useRef(null);
  const playbackCtxRef = useRef(null);
  const audioQueueRef = useRef([]);
  const isPlayingRef = useRef(false);
  const currentSourceRef = useRef(null);
  const sampleRateRef = useRef(16000);
  const wakeModeRef = useRef(false);
  const onUserTranscriptRef = useRef(onUserTranscript);
  const onAgentResponseRef = useRef(onAgentResponse);

  useEffect(() => { onUserTranscriptRef.current = onUserTranscript; });
  useEffect(() => { onAgentResponseRef.current = onAgentResponse; });

  // === Audio playback (agent → user) ===
  const ensurePlaybackCtx = () => {
    if (!playbackCtxRef.current) {
      playbackCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (playbackCtxRef.current.state === 'suspended') {
      playbackCtxRef.current.resume();
    }
    return playbackCtxRef.current;
  };

  const stopPlayback = () => {
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.onended = null;
        currentSourceRef.current.stop();
      } catch (e) {}
      currentSourceRef.current = null;
    }
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    setSpeaking(false);
  };

  // Play an MP3 audio (base64-encoded) returned by voiceSynthesis
  const playMp3Base64 = async (base64Audio) => {
    try {
      const ctx = ensurePlaybackCtx();
      const binary = atob(base64Audio);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const audioBuffer = await ctx.decodeAudioData(bytes.buffer);
      audioQueueRef.current.push(audioBuffer);
      if (!isPlayingRef.current) playNextAudio();
    } catch (e) {
      console.warn('MP3 playback error:', e);
    }
  };

  // Speak clean text via voiceSynthesis (bypasses ElevenLabs' LLM entirely)
  const speakText = async (text) => {
    if (!text || !text.trim()) return;
    setSpeaking(true);
    try {
      const res = await base44.functions.invoke('voiceSynthesis', { text });
      if (res.data?.audio) {
        await playMp3Base64(res.data.audio);
      } else {
        setSpeaking(false);
      }
    } catch (e) {
      console.warn('speakText error:', e);
      setSpeaking(false);
    }
  };

  const playNextAudio = () => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      setSpeaking(false);
      return;
    }
    const ctx = ensurePlaybackCtx();
    const buffer = audioQueueRef.current.shift();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    currentSourceRef.current = source;
    isPlayingRef.current = true;
    setSpeaking(true);
    source.onended = () => {
      currentSourceRef.current = null;
      playNextAudio();
    };
    source.start();
  };

  // === Microphone streaming (user → agent) ===
  const startMicStreaming = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      micStreamRef.current = stream;

      let ctx;
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      } catch (e) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
      }
      micCtxRef.current = ctx;
      if (ctx.state === 'suspended') await ctx.resume();

      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (e) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        const input = e.inputBuffer.getChannelData(0);
        const actualRate = ctx.sampleRate;
        const targetRate = 16000;

        let pcm16;
        if (actualRate === targetRate) {
          pcm16 = new Int16Array(input.length);
          for (let i = 0; i < input.length; i++) {
            const s = Math.max(-1, Math.min(1, input[i]));
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }
        } else {
          const ratio = actualRate / targetRate;
          const targetLength = Math.floor(input.length / ratio);
          pcm16 = new Int16Array(targetLength);
          for (let i = 0; i < targetLength; i++) {
            const sourceIndex = Math.floor(i * ratio);
            const s = Math.max(-1, Math.min(1, input[sourceIndex]));
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }
        }

        const bytes = new Uint8Array(pcm16.buffer);
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
          binary += String.fromCharCode.apply(null, chunk);
        }
        const base64 = btoa(binary);
        try {
          wsRef.current.send(JSON.stringify({ user_audio_chunk: base64 }));
        } catch (err) {}
      };

      source.connect(processor);
      processor.connect(ctx.destination);
      micProcessorRef.current = processor;
      setListening(true);
    } catch (e) {
      console.error('Mic streaming failed:', e);
    }
  };

  const stopMicStreaming = () => {
    if (micProcessorRef.current) {
      try { micProcessorRef.current.disconnect(); } catch (e) {}
      micProcessorRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (micCtxRef.current) {
      try { micCtxRef.current.close(); } catch (e) {}
      micCtxRef.current = null;
    }
    setListening(false);
  };

  // === WebSocket connection ===
  const connect = async () => {
    try {
      let wsUrl = null;

      // Try signed URL first (for private agents with auth enabled)
      try {
        const res = await base44.functions.invoke('elevenLabsSignedUrl', {});
        wsUrl = res.data?.signed_url;
      } catch (e) {
        console.warn('Signed URL failed, trying direct connection');
      }

      // Fallback: direct connection for public agents
      if (!wsUrl) {
        wsUrl = `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${AGENT_ID}`;
      }

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setWakeMode(true);
        wakeModeRef.current = true;
        ws.send(JSON.stringify({ type: 'conversation_initiation_client_data' }));
        startMicStreaming();
      };

      ws.onmessage = (event) => {
        let data;
        try {
          data = JSON.parse(event.data);
        } catch (e) {
          return;
        }

        switch (data.type) {
          case 'conversation_initiation_metadata': {
            const meta = data.conversation_initiation_metadata_event;
            const format = meta?.agent_output_audio_format;
            if (format) {
              const match = format.match(/(\d+)/);
              if (match) sampleRateRef.current = parseInt(match[1]);
            } else if (meta?.output_sample_rate) {
              sampleRateRef.current = meta.output_sample_rate;
            }
            break;
          }

          case 'user_transcript': {
            const transcript = data.user_transcription_event?.user_transcript;
            if (transcript) onUserTranscriptRef.current?.(transcript);
            break;
          }

          // agent_response and audio events from ElevenLabs are intentionally ignored.
          // ElevenLabs' LLM (Gemma) leaks reasoning into its text/audio.
          // We use athinaAgent (clean reply) + voiceSynthesis (TTS) instead.

          case 'interruption': {
            // ElevenLabs detected user speech — stop agent audio immediately
            stopPlayback();
            break;
          }

          case 'ping': {
            const pingEvent = data.ping_event;
            if (pingEvent) {
              setTimeout(() => {
                if (wsRef.current?.readyState === WebSocket.OPEN) {
                  try {
                    wsRef.current.send(
                      JSON.stringify({ type: 'pong', event_id: pingEvent.event_id })
                    );
                  } catch (e) {}
                }
              }, pingEvent.ping_ms || 0);
            }
            break;
          }
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        setConnected(false);
        setWakeMode(false);
        wakeModeRef.current = false;
        stopMicStreaming();
        stopPlayback();
      };

      ws.onerror = () => {
        console.error('WebSocket error');
      };
    } catch (e) {
      console.error('Connection failed:', e);
      setWakeMode(false);
      wakeModeRef.current = false;
    }
  };

  const disconnect = () => {
    if (wsRef.current) {
      try { wsRef.current.close(); } catch (e) {}
      wsRef.current = null;
    }
    stopMicStreaming();
    stopPlayback();
    setConnected(false);
    setWakeMode(false);
    wakeModeRef.current = false;
    setSpeaking(false);
    setListening(false);
  };

  const toggleWakeMode = () => {
    if (wakeModeRef.current) {
      disconnect();
    } else {
      connect();
    }
  };

  const stopVoice = () => {
    stopPlayback();
  };

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  return {
    listening,
    wakeMode,
    speaking,
    interimText,
    voiceSupported,
    startListening: toggleWakeMode,
    resumeListening: () => {},
    stopListening: () => {},
    toggleWakeMode,
    playVoice: () => {},
    stopVoice,
    speakText,
  };
}