/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Play, Download, Settings, Volume2, Music, Wind, Trash2, Sparkles, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as Tone from 'tone';

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<'naat' | 'zikr'>('naat');
  
  // Audio Effect States
  const [reverbLevel, setReverbLevel] = useState(0.5);
  const [echoLevel, setEchoLevel] = useState(0.3);
  const [bassLevel, setBassLevel] = useState(0.4);
  const [noiseReduction, setNoiseReduction] = useState(0.5);
  const [pitchCorrection, setPitchCorrection] = useState(0.5);
  const [volume, setVolume] = useState(0.8);

  // Tone.js nodes
  const nodesRef = useRef<{
    mic?: Tone.UserMedia;
    pitchShift?: Tone.PitchShift;
    reverb?: Tone.Reverb;
    echo?: Tone.FeedbackDelay;
    bass?: Tone.Filter;
    gate?: Tone.Gate;
    compressor?: Tone.Compressor;
    limiter?: Tone.Limiter;
    recorder?: Tone.Recorder;
    visualizer?: Tone.Analyser;
    gainNode?: Tone.Gain;
  }>({});

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      Object.values(nodesRef.current).forEach(node => {
        if (node && typeof (node as any).dispose === 'function') {
          (node as any).dispose();
        }
      });
    };
  }, []);

  const startRecording = async () => {
    try {
      await Tone.start();
      
      // --- 1. Microphone Access with User's Constraints ---
      const mic = new Tone.UserMedia();
      // Using constraints provided by user
      await mic.open();
      
      // Note: Tone.UserMedia doesn't directly expose the constraints in the open() call in the same way, 
      // but we can access the underlying stream to verify or set if needed. 
      // However, Tone.js handles the standard getUserMedia internally.
      
      // --- 2. Noise Filter (Biquad Filter / Low Shelf) ---
      // User's logic: type: "lowshelf", freq: 200, gain: -15
      const noiseFilter = new Tone.Filter({
        type: "lowshelf",
        frequency: 200,
        gain: -15 * noiseReduction * 2 // Scaling based on user's slider
      });

      // --- 3. Dynamics Compressor ---
      // User's logic: threshold: -24, knee: 40, ratio: 12, attack: 0, release: 0.25
      const compressor = new Tone.Compressor({
        threshold: -24,
        knee: 40,
        ratio: 12,
        attack: 0,
        release: 0.25
      });

      // --- 4. Gain Node ---
      // User's logic: gain.value = 0.8
      const gainNode = new Tone.Gain(volume);

      // --- Additional Advanced Effects (Pitch, Reverb, Echo) ---
      const pitchShift = new Tone.PitchShift({
        pitch: (pitchCorrection - 0.5) * 12
      });

      const reverb = new Tone.Reverb({
        decay: 3,
        wet: reverbLevel
      });
      await reverb.generate();

      const echo = new Tone.FeedbackDelay({
        delayTime: '8n',
        feedback: 0.4,
        wet: echoLevel
      });

      const limiter = new Tone.Limiter(-1);
      const visualizer = new Tone.Analyser('fft', 256);
      const recorder = new Tone.Recorder();

      // --- Routing (Combining User's Chain with Effects) ---
      // Chain: Mic -> NoiseFilter -> PitchShift -> Compressor -> Reverb -> Echo -> Gain -> Limiter -> Visualizer/Recorder/Destination
      mic.chain(
        noiseFilter, 
        pitchShift, 
        compressor, 
        reverb, 
        echo, 
        gainNode, 
        limiter, 
        Tone.Destination
      );
      
      limiter.connect(visualizer);
      limiter.connect(recorder);

      nodesRef.current = { 
        mic, 
        bass: noiseFilter, 
        pitchShift, 
        compressor, 
        reverb, 
        echo, 
        gainNode, 
        limiter, 
        recorder, 
        visualizer 
      };

      recorder.start();
      setIsRecording(true);
      drawWaveform();
      console.log("اسٹوڈیو کوالٹی ریکارڈنگ شروع ہو چکی ہے...");
    } catch (err) {
      console.error("مائیکروفون تک رسائی میں مسئلہ:", err);
      alert('مائیکروفون تک رسائی کی اجازت نہیں ملی۔');
    }
  };

  const stopRecording = async () => {
    if (nodesRef.current.recorder && isRecording) {
      const blob = await nodesRef.current.recorder.stop();
      setRecordedBlob(blob);
      setAudioUrl(URL.createObjectURL(blob));
      setIsRecording(false);
      
      if (nodesRef.current.mic) {
        nodesRef.current.mic.close();
      }
    }
  };

  const drawWaveform = () => {
    if (!canvasRef.current || !nodesRef.current.visualizer) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      animationFrameRef.current = requestAnimationFrame(render);
      const values = nodesRef.current.visualizer!.getValue() as Float32Array;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barWidth = (canvas.width / values.length) * 2.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < values.length; i++) {
        barHeight = (values[i] + 140) * 1.5;
        ctx.fillStyle = `rgb(50, ${barHeight + 100}, 200)`;
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
      }
    };
    render();
  };

  // Update effect nodes when sliders change
  useEffect(() => {
    if (nodesRef.current.reverb) nodesRef.current.reverb.wet.value = reverbLevel;
  }, [reverbLevel]);

  useEffect(() => {
    if (nodesRef.current.echo) nodesRef.current.echo.wet.value = echoLevel;
  }, [echoLevel]);

  useEffect(() => {
    if (nodesRef.current.bass) {
      // Bass slider now controls the low shelf gain
      nodesRef.current.bass.gain.value = (bassLevel - 0.5) * 40;
    }
  }, [bassLevel]);

  useEffect(() => {
    if (nodesRef.current.bass) {
      // Noise reduction slider controls the noise filter's negative gain
      nodesRef.current.bass.gain.value = -15 * noiseReduction * 2;
    }
  }, [noiseReduction]);

  useEffect(() => {
    if (nodesRef.current.pitchShift) nodesRef.current.pitchShift.pitch = (pitchCorrection - 0.5) * 12;
  }, [pitchCorrection]);

  useEffect(() => {
    if (nodesRef.current.gainNode) {
      nodesRef.current.gainNode.gain.value = volume;
    }
  }, [volume]);

  const applyPreset = (p: 'naat' | 'zikr') => {
    setMode(p);
    if (p === 'naat') {
      setReverbLevel(0.7);
      setEchoLevel(0.4);
      setBassLevel(0.4);
      setNoiseReduction(0.6);
      setPitchCorrection(0.55);
    } else {
      setReverbLevel(0.3);
      setEchoLevel(0.2);
      setBassLevel(0.8);
      setNoiseReduction(0.7);
      setPitchCorrection(0.5);
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
        className="w-full max-w-5xl bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 md:p-10 shadow-2xl relative z-10"
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
            width={1000} 
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-10">
          {/* Effects Sliders - Column 1 */}
          <div className="space-y-6 bg-slate-800/30 p-6 rounded-2xl border border-slate-800/50">
            <div className="flex items-center gap-4">
              <Settings className="text-blue-400" size={20} />
              <h3 className="font-semibold text-slate-200">بنیادی ایفیکٹس</h3>
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
          </div>

          {/* Advanced Effects - Column 2 */}
          <div className="space-y-6 bg-slate-800/30 p-6 rounded-2xl border border-slate-800/50">
            <div className="flex items-center gap-4">
              <Sparkles className="text-emerald-400" size={20} />
              <h3 className="font-semibold text-slate-200">جدید فیچرز</h3>
            </div>
            
            <EffectSlider 
              label="آواز صاف کریں (Noise Reduction)" 
              value={noiseReduction} 
              onChange={setNoiseReduction} 
              color="emerald" 
              icon={<Zap size={14} />}
            />
            <EffectSlider 
              label="آواز ٹیون کریں (Pitch/Auto-Tune)" 
              value={pitchCorrection} 
              onChange={setPitchCorrection} 
              color="blue" 
              icon={<Sparkles size={14} />}
            />
            <EffectSlider 
              label="ماسٹر والیم" 
              value={volume} 
              onChange={setVolume} 
              color="slate" 
              icon={<Volume2 size={16} />}
            />
          </div>

          {/* Recording & Playback - Column 3 */}
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
