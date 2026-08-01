import { useEffect, useRef, useState } from 'react';
import { invokeFunction } from '@/lib/functionApi';

const WAKE_WORD_PATTERN = /\b(hey|hi|hello)?\s*athina\b/i;
const END_OF_SPEECH_MS = 700;
const WAKE_HOLD_MS = 6000;

const getSpeechRecognitionCtor = () =>
  window.SpeechRecognition || window.webkitSpeechRecognition || null;

export function useAthinaVoice({ onUserTranscript, onAgentResponse, voiceEnabled = true }) {
  const [wakeMode, setWakeMode] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [voiceSupported] = useState(() => {
    if (typeof window === 'undefined') return false;
    return Boolean(getSpeechRecognitionCtor()) && Boolean(window.AudioContext || window.webkitAudioContext);
  });

  const recognitionRef = useRef(null);
  const shouldKeepListeningRef = useRef(false);
  const utteranceStartedRef = useRef(false);
  const utteranceBufferRef = useRef('');
  const silenceTimerRef = useRef(null);
  const wakeHoldTimerRef = useRef(null);
  const ignoreInputRef = useRef(false);

  const playbackCtxRef = useRef(null);
  const audioQueueRef = useRef([]);
  const isPlayingRef = useRef(false);
  const currentSourceRef = useRef(null);

  const onUserTranscriptRef = useRef(onUserTranscript);
  const onAgentResponseRef = useRef(onAgentResponse);

  useEffect(() => {
    onUserTranscriptRef.current = onUserTranscript;
  }, [onUserTranscript]);

  useEffect(() => {
    onAgentResponseRef.current = onAgentResponse;
  }, [onAgentResponse]);

  const clearSilenceTimer = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  };

  const clearWakeHoldTimer = () => {
    if (wakeHoldTimerRef.current) {
      clearTimeout(wakeHoldTimerRef.current);
      wakeHoldTimerRef.current = null;
    }
  };

  const resetUtterance = () => {
    utteranceStartedRef.current = false;
    utteranceBufferRef.current = '';
    setInterimText('');
    clearSilenceTimer();
    clearWakeHoldTimer();
  };

  const ensurePlaybackCtx = () => {
    if (!playbackCtxRef.current) {
      playbackCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (playbackCtxRef.current.state === 'suspended') {
      playbackCtxRef.current.resume();
    }
    return playbackCtxRef.current;
  };

  const startRecognition = () => {
    if (!voiceEnabled || !voiceSupported || !shouldKeepListeningRef.current) return;
    if (ignoreInputRef.current) return;
    if (recognitionRef.current) return;

    const RecognitionCtor = getSpeechRecognitionCtor();
    if (!RecognitionCtor) return;

    const recognition = new RecognitionCtor();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onresult = (event) => {
      if (!shouldKeepListeningRef.current || ignoreInputRef.current) return;

      let finalText = '';
      let latestInterim = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = String(result?.[0]?.transcript || '').trim();
        if (!transcript) continue;

        if (result.isFinal) {
          finalText += ` ${transcript}`;
        } else {
          latestInterim = transcript;
        }
      }

      const combinedText = `${utteranceBufferRef.current} ${finalText} ${latestInterim}`.trim();
      if (!combinedText) return;

      if (!utteranceStartedRef.current) {
        const wakeMatch = combinedText.match(WAKE_WORD_PATTERN);
        if (!wakeMatch) {
          setInterimText('');
          return;
        }

        utteranceStartedRef.current = true;
        setListening(true);

        const afterWake = combinedText.slice(wakeMatch.index + wakeMatch[0].length).trim();
        utteranceBufferRef.current = afterWake;
        setInterimText(afterWake);

        if (!afterWake) {
          onAgentResponseRef.current?.('Listening.');
          clearWakeHoldTimer();
          wakeHoldTimerRef.current = setTimeout(() => {
            if (!utteranceBufferRef.current.trim()) {
              resetUtterance();
              setListening(false);
            }
          }, WAKE_HOLD_MS);
          return;
        }
      } else {
        const updatedText = `${utteranceBufferRef.current} ${finalText} ${latestInterim}`.trim();
        utteranceBufferRef.current = updatedText;
        setInterimText(updatedText);
      }

      clearWakeHoldTimer();
      clearSilenceTimer();
      silenceTimerRef.current = setTimeout(async () => {
        const transcript = utteranceBufferRef.current.trim();
        resetUtterance();

        if (!transcript || ignoreInputRef.current || !shouldKeepListeningRef.current) {
          setListening(false);
          return;
        }

        ignoreInputRef.current = true;
        setListening(false);

        try {
          await Promise.resolve(onUserTranscriptRef.current?.(transcript));
        } finally {
          ignoreInputRef.current = false;
          if (shouldKeepListeningRef.current && !speaking) {
            startRecognition();
          }
        }
      }, END_OF_SPEECH_MS);
    };

    recognition.onerror = () => {
      recognitionRef.current = null;
      setListening(false);
      if (shouldKeepListeningRef.current && !ignoreInputRef.current) {
        setTimeout(startRecognition, 250);
      }
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
      if (shouldKeepListeningRef.current && !ignoreInputRef.current) {
        setTimeout(startRecognition, 120);
      }
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setListening(false);
    }
  };

  const stopRecognition = () => {
    clearSilenceTimer();
    clearWakeHoldTimer();
    resetUtterance();

    if (recognitionRef.current) {
      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.abort?.();
        recognition.stop();
      } catch {
        // no-op
      }
    }

    setListening(false);
    setInterimText('');
  };

  const stopPlayback = () => {
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.onended = null;
        currentSourceRef.current.stop();
      } catch {
        // no-op
      }
      currentSourceRef.current = null;
    }

    audioQueueRef.current = [];
    isPlayingRef.current = false;
    setSpeaking(false);

    if (shouldKeepListeningRef.current) {
      startRecognition();
    }
  };

  const playNextAudio = () => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      setSpeaking(false);
      if (shouldKeepListeningRef.current) {
        startRecognition();
      }
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

  const playMp3Base64 = async (base64Audio) => {
    try {
      stopRecognition();
      const ctx = ensurePlaybackCtx();
      const binary = atob(base64Audio);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const decoded = await ctx.decodeAudioData(bytes.buffer.slice(0));
      audioQueueRef.current.push(decoded);

      if (!isPlayingRef.current) {
        playNextAudio();
      }
    } catch (error) {
      setSpeaking(false);
      if (shouldKeepListeningRef.current) {
        startRecognition();
      }
      console.warn('ATHINA voice playback failed:', error);
    }
  };

  const speakText = async (text) => {
    if (!String(text || '').trim()) return;

    try {
      const res = await invokeFunction('voiceSynthesis', { text });
      if (res.data?.audio) {
        await playMp3Base64(res.data.audio);
      }
    } catch (error) {
      console.warn('ATHINA TTS failed:', error);
      if (shouldKeepListeningRef.current) {
        startRecognition();
      }
    }
  };

  const connect = () => {
    if (!voiceEnabled || !voiceSupported) return;
    shouldKeepListeningRef.current = true;
    setWakeMode(true);
    onAgentResponseRef.current?.('Wake mode enabled. Say "Hi Athina" to start.');
    startRecognition();
  };

  const disconnect = () => {
    shouldKeepListeningRef.current = false;
    setWakeMode(false);
    stopRecognition();
    stopPlayback();
    onAgentResponseRef.current?.('Wake mode disabled.');
  };

  const toggleWakeMode = () => {
    if (wakeMode) {
      disconnect();
    } else {
      connect();
    }
  };

  useEffect(() => {
    return () => {
      disconnect();
      if (playbackCtxRef.current) {
        playbackCtxRef.current.close().catch(() => {});
        playbackCtxRef.current = null;
      }
    };
  }, []);

  return {
    listening,
    wakeMode,
    speaking,
    interimText,
    voiceSupported,
    startListening: toggleWakeMode,
    resumeListening: () => {
      if (wakeMode) startRecognition();
    },
    stopListening: () => {
      stopRecognition();
    },
    toggleWakeMode,
    playVoice: () => {},
    playAudioBase64: playMp3Base64,
    stopVoice: stopPlayback,
    speakText,
  };
}
