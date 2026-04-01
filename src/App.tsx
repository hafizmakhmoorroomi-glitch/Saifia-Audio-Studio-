/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Play, Download, Settings, Volume2, Music, Wind, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Audio Engine Helpers ---

const createReverb = (audioContext: AudioContext, duration: number, decay: number) => {
  const sampleRate = audioContext.sampleRate;
  const length = sampleRate * duration;
  const impulse = audioContext.createBuffer(2, length, sampleRate);
  for (let i = 0; i < 2; i++) {
    const channelData = impulse.getChannelData(i);
    for (let j = 0; j < length; j++) {
      channelData[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / length, decay);
    }
  }
  const convolver = audioContext.createConvolver();
  convolver.buffer = impulse;
  return convolver;
};

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<'naat' | 'zikr'>('naat');
  
  // Audio Effect States
  const [reverbLevel, setReverbLevel] = useState(0.5);
  const [echoLevel, setEchoLevel] = useState(0.3);
  const [bassLevel, setBassLevel] = useState(0.4);
  const [volume, setVolume] = useState(0.8);

  // Audio Context & Nodes
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Effect Nodes
  const nodesRef = useRef<{
    input?: MediaStreamAudioSourceNode;
    bass?: BiquadFilterNode;
    echo?: DelayNode;
    echoFeedback?: GainNode;
    echoLevel?: GainNode;
    reverb?: ConvolverNode;
    reverbLevel?: GainNode;
    compressor?: DynamicsCompressorNode;
    masterGain?: GainNode;
    destination?: MediaStreamAudioDestinationNode;
  }>({});

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }});
      streamRef.current = stream;

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;

      const input = audioContext.createMediaStreamAudioSource(stream);
      const destination = audioContext.createMediaStreamAudioDestination();
      
      // 1. Bass Filter (Low Shelf)
      const bass = audioContext.createBiquadFilter();
      bass.type = 'lowshelf';
      bass.frequency.value = 200;
      bass.gain.value = (bassLevel - 0.5) * 40; // -20dB to +20dB

      // 2. Echo (Delay)
      const echo = audioContext.createDelay(1.0);
      echo.delayTime.value = 0.4;
      const echoFeedback = audioContext.createGain();
      echoFeedback.gain.value = 0.4;
      const echoLevelNode = audioContext.createGain();
      echoLevelNode.gain.value = echoLevel;

      // 3. Reverb
      const reverb = createReverb(audioContext, 3, 2);
      const reverbLevelNode = audioContext.createGain();
      reverbLevelNode.gain.value = reverbLevel;

      // 4. Compressor (for clean vocals)
      const compressor = audioContext.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-24, audioContext.currentTime);
      compressor.knee.setValueAtTime(40, audioContext.currentTime);
      compressor.ratio.setValueAtTime(12, audioContext.currentTime);
      compressor.attack.setValueAtTime(0, audioContext.currentTime);
      compressor.release.setValueAtTime(0.25, audioContext.currentTime);

      // 5. Master Gain
      const masterGain = audioContext.createGain();
      masterGain.gain.value = volume;

      // 6. Analyzer for visualization
      const analyzer = audioContext.createAnalyser();
      analyzer.fftSize = 256;
      analyzerRef.current = analyzer;

      // --- Connections ---
      input.connect(bass);
      bass.connect(compressor);
      
      // Parallel Echo
      compressor.connect(echo);
      echo.connect(echoFeedback);
      echoFeedback.connect(echo);
      echo.connect(echoLevelNode);
      echoLevelNode.connect(masterGain);

      // Parallel Reverb
      compressor.connect(reverb);
      reverb.connect(reverbLevelNode);
      reverbLevelNode.connect(masterGain);

      // Direct signal
      compressor.connect(masterGain);

      // Final Output
      masterGain.connect(analyzer);
      masterGain.connect(destination);
      masterGain.connect(audioContext.destination);

      nodesRef.current = { input, bass, echo, echoFeedback, echoLevel: echoLevelNode, reverb, reverbLevel: reverbLevelNode, compressor, masterGain, destination };

      const mediaRecorder = new MediaRecorder(destination.stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setRecordedBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
      };

      mediaRecorder.start();
      setIsRecording(true);
      drawWaveform();
    } catch (err) {
      console.error('Microphone access denied:', err);
      alert('مائیکروفون تک رسائی کی اجازت نہیں ملی۔');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    }
  };

  const drawWaveform = () => {
    if (!canvasRef.current || !analyzerRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyzerRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const render = () => {
      animationFrameRef.current = requestAnimationFrame(render);
      analyzerRef.current!.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barWidth = (canvas.width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = dataArray[i] / 2;
        ctx.fillStyle = `rgb(50, ${barHeight + 100}, 200)`;
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
      }
    };
    render();
  };

  // Update effect nodes when sliders change
  useEffect(() => {
    if (nodesRef.current.reverbLevel) nodesRef.current.reverbLevel.gain.value = reverbLevel;
  }, [reverbLevel]);

  useEffect(() => {
    if (nodesRef.current.echoLevel) nodesRef.current.echoLevel.gain.value = echoLevel;
  }, [echoLevel]);

  useEffect(() => {
    if (nodesRef.current.bass) nodesRef.current.bass.gain.value = (bassLevel - 0.5) * 40;
  }, [bassLevel]);

  useEffect(() => {
    if (nodesRef.current.masterGain) nodesRef.current.masterGain.gain.value = volume;
  }, [volume]);

  const applyPreset = (p: 'naat' | 'zikr') => {
    setMode(p);
    if (p === 'naat') {
      setReverbLevel(0.7);
      setEchoLevel(0.4);
      setBassLevel(0.4);
    } else {
      setReverbLevel(0.3);
      setEchoLevel(0.2);
      setBassLevel(0.8);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-white font-sans selection:bg-blue-500/30 p-4 md:p-8 flex flex-col items-center justify-center overflow-hidden" dir="rtl">
      {/* Background Glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-600/10 blur-[120px] rounded-full" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-4xl bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 md:p-10 shadow-2xl relative z-10"
      >
        {/* Header */}
        <div className="flex flex-col md:flex-row items-center justify-between mb-10 gap-6">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-l from-blue-400 to-emerald-400 bg-clip-text text-transparent mb-2">
              سیفیہ آڈیو سٹوڈیو
            </h1>
            <p className="text-slate-400 text-lg">نعت اور ذکر کی بہترین ریکارڈنگ کے لیے</p>
          </div>
          
          <div className="flex bg-slate-800/50 p-1 rounded-2xl border border-slate-700">
            <button 
              onClick={() => applyPreset('naat')}
              className={`px-6 py-2 rounded-xl transition-all flex items-center gap-2 ${mode === 'naat' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
            >
              <Music size={18} />
              نعت موڈ
            </button>
            <button 
              onClick={() => applyPreset('zikr')}
              className={`px-6 py-2 rounded-xl transition-all flex items-center gap-2 ${mode === 'zikr' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
            >
              <Wind size={18} />
              ذکر موڈ
            </button>
          </div>
        </div>

        {/* Visualizer */}
        <div className="relative w-full h-48 bg-black/40 rounded-2xl mb-8 border border-slate-800 overflow-hidden group">
          <canvas 
            ref={canvasRef} 
            width={800} 
            height={200} 
            className="w-full h-full"
          />
          {!isRecording && !audioUrl && (
            <div className="absolute inset-0 flex items-center justify-center text-slate-500">
              <p>ریکارڈنگ شروع کرنے کے لیے بٹن دبائیں</p>
            </div>
          )}
          {isRecording && (
            <div className="absolute top-4 right-4 flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
              <span className="text-xs font-mono text-red-400 uppercase tracking-widest">Recording</span>
            </div>
          )}
        </div>

        {/* Controls Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
          {/* Effects Sliders */}
          <div className="space-y-6 bg-slate-800/30 p-6 rounded-2xl border border-slate-800/50">
            <div className="flex items-center gap-4">
              <Settings className="text-blue-400" size={20} />
              <h3 className="font-semibold text-slate-200">آڈیو ایفیکٹس</h3>
            </div>
            
            <EffectSlider 
              label="ریورب (گونج)" 
              value={reverbLevel} 
              onChange={setReverbLevel} 
              color="blue" 
            />
            <EffectSlider 
              label="ایکو (بازگشت)" 
              value={echoLevel} 
              onChange={setEchoLevel} 
              color="emerald" 
            />
            <EffectSlider 
              label="بیس (بھاری آواز)" 
              value={bassLevel} 
              onChange={setBassLevel} 
              color="indigo" 
            />
            <EffectSlider 
              label="ماسٹر والیم" 
              value={volume} 
              onChange={setVolume} 
              color="slate" 
              icon={<Volume2 size={16} />}
            />
          </div>

          {/* Recording & Playback */}
          <div className="flex flex-col justify-center items-center gap-6 bg-slate-800/30 p-6 rounded-2xl border border-slate-800/50">
            <div className="flex gap-4">
              {!isRecording ? (
                <button 
                  onClick={startRecording}
                  className="w-20 h-20 bg-red-600 hover:bg-red-500 rounded-full flex items-center justify-center shadow-lg shadow-red-900/20 transition-all hover:scale-105 active:scale-95 group"
                >
                  <Mic size={32} className="group-hover:animate-pulse" />
                </button>
              ) : (
                <button 
                  onClick={stopRecording}
                  className="w-20 h-20 bg-slate-200 hover:bg-white text-black rounded-full flex items-center justify-center shadow-lg transition-all hover:scale-105 active:scale-95"
                >
                  <Square size={32} fill="currentColor" />
                </button>
              )}
            </div>
            
            <p className="text-slate-400 font-medium">
              {isRecording ? "ریکارڈنگ ہو رہی ہے..." : "ریکارڈنگ شروع کریں"}
            </p>

            <AnimatePresence>
              {audioUrl && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="w-full space-y-4 pt-4 border-t border-slate-700/50"
                >
                  <audio src={audioUrl} controls className="w-full h-10 rounded-lg" />
                  <div className="flex gap-3">
                    <a 
                      href={audioUrl} 
                      download={`Saifia_Studio_${mode}_${new Date().getTime()}.webm`}
                      className="flex-1 bg-blue-600 hover:bg-blue-500 py-3 rounded-xl flex items-center justify-center gap-2 font-semibold transition-colors"
                    >
                      <Download size={18} />
                      محفوظ کریں (Save)
                    </a>
                    <button 
                      onClick={() => { setAudioUrl(null); setRecordedBlob(null); }}
                      className="p-3 bg-slate-700 hover:bg-red-900/40 hover:text-red-400 rounded-xl transition-all"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Footer Info */}
        <div className="text-center text-slate-500 text-sm">
          <p>© 2026 سیفیہ آڈیو سٹوڈیو - بہترین آواز، بہترین معیار</p>
        </div>
      </motion.div>
    </div>
  );
}

function EffectSlider({ label, value, onChange, color, icon }: { label: string, value: number, onChange: (v: number) => void, color: string, icon?: React.ReactNode }) {
  const colors: Record<string, string> = {
    blue: "bg-blue-500",
    emerald: "bg-emerald-500",
    indigo: "bg-indigo-500",
    slate: "bg-slate-400"
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs font-medium text-slate-400">
        <span className="flex items-center gap-1">{icon}{label}</span>
        <span>{Math.round(value * 100)}%</span>
      </div>
      <div className="relative h-2 bg-slate-700 rounded-full overflow-hidden cursor-pointer group">
        <input 
          type="range" 
          min="0" 
          max="1" 
          step="0.01" 
          value={value} 
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        />
        <div 
          className={`h-full ${colors[color]} transition-all duration-150 group-hover:brightness-110`} 
          style={{ width: `${value * 100}%` }} 
        />
      </div>
    </div>
  );
}
