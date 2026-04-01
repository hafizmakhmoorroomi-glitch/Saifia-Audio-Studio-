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
  const [isPlaying, setIsPlaying] = useState(false);
  const [mode, setMode] = useState<'naat' | 'zikr' | 'studio' | 'clear' | 'dreamy'>('naat');
  
  // Audio Effect States
  const [reverbLevel, setReverbLevel] = useState(0.1); 
  const [echoLevel, setEchoLevel] = useState(0.05); 
  const [bassLevel, setBassLevel] = useState(0.5);
  const [presenceLevel, setPresenceLevel] = useState(0.5); 
  const [warmthLevel, setWarmthLevel] = useState(0.4); // New Warmth control
  const [noiseReduction, setNoiseReduction] = useState(0.4); 
  const [pitchCorrection, setPitchCorrection] = useState(0.5);
  const [volume, setVolume] = useState(0.5); 
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isNormalizing, setIsNormalizing] = useState(false);
  const [isMastered, setIsMastered] = useState(false);

  // Granular Controls
  const [reverbDecay, setReverbDecay] = useState(3);
  const [reverbPreDelay, setReverbPreDelay] = useState(0.02);
  const [echoDelay, setEchoDelay] = useState(0.4);
  const [echoFeedback, setEchoFeedback] = useState(0.3);
  const [compThreshold, setCompThreshold] = useState(-24);
  const [compRatio, setCompRatio] = useState(8); // Gentler compression
  const [compAttack, setCompAttack] = useState(0.01);
  const [compRelease, setCompRelease] = useState(0.25);

  // Tone.js nodes
  const nodesRef = useRef<{
    mic?: Tone.UserMedia;
    player?: Tone.Player;
    pitchShift?: Tone.PitchShift;
    reverb?: Tone.Reverb;
    echo?: Tone.FeedbackDelay;
    hpFilter?: Tone.Filter;
    lpFilter?: Tone.Filter;
    clarityFilter?: Tone.Filter;
    gate?: Tone.Gate;
    multiband?: Tone.MultibandCompressor;
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
      
      // --- 1. Microphone Access ---
      const mic = new Tone.UserMedia();
      await mic.open();
      
      // --- 2. Multi-Stage Noise Filtering (Crystal Clear Focus) ---
      // 1. High Pass: Removes low-end rumble/thumps
      const hpFilter = new Tone.Filter({
        type: "highpass",
        frequency: 120, // Higher cut to remove more rumble
        rolloff: -48
      });

      // 2. Low Pass: Removes high-frequency hiss/static
      const lpFilter = new Tone.Filter({
        type: "lowpass",
        frequency: 16000,
        rolloff: -48
      });

      // 3. Peaking: Enhances vocal clarity (Presence)
      const clarityFilter = new Tone.Filter({
        type: "peaking",
        frequency: 3200,
        Q: 1.5,
        gain: 4 
      });

      // Smoother Gate to prevent "tik-tik" chopping
      const gate = new Tone.Gate({
        threshold: -55, // More stable base
        smoothing: 0.5 // Much higher smoothing to prevent rapid snapping
      });

      // Multiband Compressor to target high-frequency hiss specifically
      const multiband = new Tone.MultibandCompressor({
        low: { threshold: -24, ratio: 2 },
        mid: { threshold: -24, ratio: 2 },
        high: { threshold: -30, ratio: 10 } // Aggressive on highs to squash hiss
      });

      // --- 3. Effects Chain (for Monitoring/Mixing) ---
      const pitchShift = new Tone.PitchShift({ pitch: (pitchCorrection - 0.5) * 12 });
      
      const compressor = new Tone.Compressor({
        threshold: -30,
        knee: 40,
        ratio: 3,
        attack: 0.02, // Slower attack to avoid "tik-tik" transients
        release: 0.5
      });
      
      const reverb = new Tone.Reverb({ decay: reverbDecay, preDelay: reverbPreDelay, wet: reverbLevel });
      await reverb.generate();
      const echo = new Tone.FeedbackDelay({ delayTime: echoDelay, feedback: echoFeedback, wet: echoLevel });
      const gainNode = new Tone.Gain(volume);
      const limiter = new Tone.Limiter(-12); // Even more headroom to prevent any digital clipping
      const visualizer = new Tone.Analyser('fft', 256);
      const recorder = new Tone.Recorder();

      // --- Routing ---
      // Mic -> HP -> LP -> Gate -> Multiband -> Clarity -> Recorder
      mic.chain(hpFilter, lpFilter, gate, multiband, clarityFilter);
      clarityFilter.connect(recorder);
      
      // Monitoring/Mixing Chain
      clarityFilter.chain(pitchShift, compressor, reverb, echo, gainNode, limiter);
      
      if (isMonitoring) {
        limiter.connect(Tone.Destination);
      }
      
      limiter.connect(visualizer);

      nodesRef.current = { 
        mic, gate, multiband, hpFilter, lpFilter, clarityFilter, pitchShift, compressor, reverb, echo, gainNode, limiter, recorder, visualizer 
      };

      recorder.start();
      setIsRecording(true);
      drawWaveform();
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

      // Auto-normalize after recording
      autoNormalize(blob);
    }
  };

  const autoNormalize = async (blob: Blob) => {
    setIsNormalizing(true);
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const arrayBuffer = await blob.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      let maxVal = 0;
      for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
        const data = audioBuffer.getChannelData(i);
        for (let j = 0; j < data.length; j++) {
          const abs = Math.abs(data[j]);
          if (abs > maxVal) maxVal = abs;
        }
      }
      
      if (maxVal > 0) {
        const target = 0.85; // Target peak
        const ratio = target / maxVal;
        // Adjust volume to reach target peak, but cap it at 1.0
        // We use 0.4 as the baseline 'clean' volume for Saifia style
        const newVolume = Math.min(1, ratio * 0.4);
        setVolume(newVolume);
        console.log(`آواز کو خودکار طور پر متوازن (Normalize) کر دیا گیا ہے۔ ریشیو: ${ratio.toFixed(2)}`);
      }
      await audioContext.close();
    } catch (e) {
      console.error("نارملائزیشن میں مسئلہ:", e);
    } finally {
      setIsNormalizing(false);
    }
  };

  const playMixedAudio = async () => {
    if (!recordedBlob) return;
    
    if (isPlaying) {
      nodesRef.current.player?.stop();
      setIsPlaying(false);
      return;
    }

    await Tone.start();
    if (Tone.context.state !== 'running') {
      await Tone.context.resume();
    }

    const url = URL.createObjectURL(recordedBlob);
    const player = new Tone.Player();
    
    try {
      await player.load(url);
    } catch (e) {
      console.error("آڈیو لوڈ کرنے میں مسئلہ:", e);
      return;
    }
    
    player.onstop = () => {
      setIsPlaying(false);
      player.dispose();
    };
    
    // Connect player to existing effects chain
    if (nodesRef.current.hpFilter && nodesRef.current.limiter) {
      // Ensure the chain leads to speakers
      nodesRef.current.limiter.toDestination();
      
      player.chain(
        nodesRef.current.hpFilter,
        nodesRef.current.lpFilter!,
        nodesRef.current.gate!,
        nodesRef.current.multiband!,
        nodesRef.current.clarityFilter!,
        nodesRef.current.pitchShift!,
        nodesRef.current.compressor!,
        nodesRef.current.reverb!,
        nodesRef.current.echo!,
        nodesRef.current.gainNode!,
        nodesRef.current.limiter!
      );
    } else {
      player.toDestination();
    }

    nodesRef.current.player = player;
    player.start();
    setIsPlaying(true);
  };

  const resetToDefaults = () => {
    setReverbLevel(0.1);
    setReverbDecay(3);
    setReverbPreDelay(0.02);
    setEchoLevel(0.05);
    setEchoDelay(0.4);
    setEchoFeedback(0.3);
    setBassLevel(0.5);
    setPresenceLevel(0.5);
    setWarmthLevel(0.4);
    setNoiseReduction(0.4);
    setPitchCorrection(0.5);
    setVolume(0.5);
    setCompThreshold(-30);
    setCompRatio(3);
    setCompAttack(0.01);
    setCompRelease(0.25);
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
    if (nodesRef.current.reverb) {
      nodesRef.current.reverb.wet.value = reverbLevel;
    }
  }, [reverbLevel]);

  useEffect(() => {
    if (nodesRef.current.reverb) {
      nodesRef.current.reverb.decay = reverbDecay;
      nodesRef.current.reverb.preDelay = reverbPreDelay;
      nodesRef.current.reverb.generate();
    }
  }, [reverbDecay, reverbPreDelay]);

  useEffect(() => {
    if (nodesRef.current.echo) {
      nodesRef.current.echo.wet.value = echoLevel;
    }
  }, [echoLevel]);

  useEffect(() => {
    if (nodesRef.current.echo) {
      nodesRef.current.echo.delayTime.value = echoDelay;
      nodesRef.current.echo.feedback.value = echoFeedback;
    }
  }, [echoDelay, echoFeedback]);

  useEffect(() => {
    if (nodesRef.current.compressor) {
      nodesRef.current.compressor.threshold.value = compThreshold;
      nodesRef.current.compressor.ratio.value = compRatio;
      nodesRef.current.compressor.attack.value = compAttack;
      nodesRef.current.compressor.release.value = compRelease;
    }
  }, [compThreshold, compRatio, compAttack, compRelease]);

  useEffect(() => {
    if (nodesRef.current.hpFilter) {
      nodesRef.current.hpFilter.frequency.value = 60 + (bassLevel * 120); 
    }
  }, [bassLevel]);

  useEffect(() => {
    if (nodesRef.current.clarityFilter) {
      nodesRef.current.clarityFilter.gain.value = (presenceLevel * 12); // Boost clarity
    }
  }, [presenceLevel]);

  useEffect(() => {
    if (nodesRef.current.compressor) {
      // Warmth through gentle saturation/compression
      nodesRef.current.compressor.knee = 40 - (warmthLevel * 30);
      nodesRef.current.compressor.ratio = 2 + (warmthLevel * 4);
    }
  }, [warmthLevel]);

  useEffect(() => {
    if (nodesRef.current.gate) {
      // Much smoother gate for natural voice
      nodesRef.current.gate.threshold = -65 + (noiseReduction * 40); 
      nodesRef.current.gate.smoothing = 0.8; // Very smooth to avoid "tik-tik"
    }
    if (nodesRef.current.multiband) {
      // Target high frequency hiss specifically
      nodesRef.current.multiband.high.threshold.value = -20 - (noiseReduction * 40);
      nodesRef.current.multiband.high.ratio.value = 1 + (noiseReduction * 20);
    }
    if (nodesRef.current.lpFilter) {
      // Gentler low pass to keep voice natural but cut extreme hiss
      nodesRef.current.lpFilter.frequency.value = 18000 - (noiseReduction * 12000);
    }
  }, [noiseReduction]);

  useEffect(() => {
    if (nodesRef.current.pitchShift) nodesRef.current.pitchShift.pitch = (pitchCorrection - 0.5) * 12;
  }, [pitchCorrection]);

  useEffect(() => {
    if (nodesRef.current.limiter) {
      nodesRef.current.limiter.threshold.value = isMastered ? -3 : -9;
    }
    if (nodesRef.current.gainNode) {
      nodesRef.current.gainNode.gain.value = isMastered ? volume * 1.5 : volume;
    }
  }, [isMastered, volume]);

  const applyPreset = (p: 'naat' | 'zikr' | 'studio' | 'clear' | 'dreamy') => {
    setMode(p);
    resetToDefaults(); // Start from clean slate
    
    switch(p) {
      case 'naat':
        setReverbLevel(0.4);
        setReverbDecay(4);
        setEchoLevel(0.2);
        setEchoDelay(0.5);
        setNoiseReduction(0.4);
        setPitchCorrection(0.55);
        break;
      case 'zikr':
        setReverbLevel(0.2);
        setReverbDecay(2);
        setBassLevel(0.8);
        setNoiseReduction(0.6);
        setCompRatio(10);
        break;
      case 'studio':
        setReverbLevel(0.08); 
        setReverbDecay(1.0);
        setPresenceLevel(0.9); 
        setWarmthLevel(0.6);
        setCompRatio(4);
        setCompThreshold(-18);
        setNoiseReduction(0.2); 
        setIsMastered(true);
        break;
      case 'clear':
        setReverbLevel(0.05);
        setNoiseReduction(0.5);
        setPitchCorrection(0.5);
        setCompRatio(2);
        setBassLevel(0.4);
        break;
      case 'dreamy':
        setReverbLevel(0.7);
        setReverbDecay(6);
        setEchoLevel(0.5);
        setEchoDelay(0.6);
        setEchoFeedback(0.6);
        break;
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
        <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-red-900/20">
              <Mic size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-black italic tracking-tighter text-white uppercase">
                BANDLAB <span className="text-red-500">PRO</span>
              </h1>
              <p className="text-slate-500 text-xs font-bold tracking-widest uppercase">Saifia Studio Edition</p>
            </div>
          </div>
          
          <div className="flex flex-wrap justify-center bg-slate-800/50 p-1 rounded-2xl border border-slate-700 gap-1">
            {[
              { id: 'naat', label: 'نعت', icon: <Music size={14} /> },
              { id: 'zikr', label: 'ذکر', icon: <Wind size={14} /> },
              { id: 'studio', label: 'سٹوڈیو', icon: <Sparkles size={14} /> },
              { id: 'clear', label: 'صاف', icon: <Zap size={14} /> },
              { id: 'dreamy', label: 'خوابناک', icon: <Sparkles size={14} /> }
            ].map((p) => (
              <button 
                key={p.id}
                onClick={() => applyPreset(p.id as any)}
                className={`px-4 py-1.5 rounded-xl transition-all text-xs font-bold flex items-center gap-2 ${mode === p.id ? 'bg-red-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
              >
                {p.icon}
                {p.label}
              </button>
            ))}
            <button 
              onClick={resetToDefaults}
              className="px-3 py-1.5 text-slate-500 hover:text-red-400 transition-colors border-r border-slate-700"
              title="Reset"
            >
              <Trash2 size={14} />
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
            <EffectSlider 
              label="آواز کی چمک (Presence)" 
              value={presenceLevel} 
              onChange={setPresenceLevel} 
              color="orange" 
              icon={<Sparkles size={14} />}
            />
            <EffectSlider 
              label="آواز میں گرمجوشی (Warmth)" 
              value={warmthLevel} 
              onChange={setWarmthLevel} 
              color="red" 
              icon={<Zap size={14} />}
            />

            <div className="pt-4 border-t border-slate-700/50 space-y-4">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">ایڈوانس سیٹنگز</h4>
              <EffectSlider 
                label="ریورب ٹائم (Decay)" 
                value={(reverbDecay - 1) / 9} 
                onChange={(v) => setReverbDecay(1 + v * 9)} 
                color="blue" 
              />
              <EffectSlider 
                label="ریورب پری ڈیلے (Pre-Delay)" 
                value={reverbPreDelay / 0.1} 
                onChange={(v) => setReverbPreDelay(v * 0.1)} 
                color="blue" 
              />
              <EffectSlider 
                label="ایکو ٹائم (Delay)" 
                value={(echoDelay - 0.1) / 0.9} 
                onChange={(v) => setEchoDelay(0.1 + v * 0.9)} 
                color="emerald" 
              />
              <EffectSlider 
                label="ایکو فیڈ بیک (Feedback)" 
                value={echoFeedback / 0.9} 
                onChange={(v) => setEchoFeedback(v * 0.9)} 
                color="emerald" 
              />
            </div>
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

            <div className="pt-4 border-t border-slate-700/50 space-y-4">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">کمپریسر سیٹنگز</h4>
              <EffectSlider 
                label="تھریش ہولڈ (Threshold)" 
                value={(compThreshold + 60) / 60} 
                onChange={(v) => setCompThreshold(-60 + v * 60)} 
                color="slate" 
              />
              <EffectSlider 
                label="ریشیو (Ratio)" 
                value={(compRatio - 1) / 19} 
                onChange={(v) => setCompRatio(1 + v * 19)} 
                color="slate" 
              />
              <div className="grid grid-cols-2 gap-4">
                <EffectSlider 
                  label="اٹیک (Attack)" 
                  value={compAttack / 0.1} 
                  onChange={(v) => setCompAttack(v * 0.1)} 
                  color="slate" 
                />
                <EffectSlider 
                  label="ریلیز (Release)" 
                  value={(compRelease - 0.1) / 0.9} 
                  onChange={(v) => setCompRelease(0.1 + v * 0.9)} 
                  color="slate" 
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-700/50">
              <label className="flex items-center justify-between cursor-pointer group">
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-red-400 uppercase tracking-tighter">Auto-Mastering</span>
                  <span className="text-[10px] text-slate-500">پروفیشنل فنشنگ اور والیم بوسٹ</span>
                </div>
                <div className="relative inline-flex items-center gap-2">
                  {isMastered && (
                    <motion.span 
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="text-[8px] bg-red-500 text-white px-1.5 py-0.5 rounded font-black uppercase tracking-tighter"
                    >
                      Active
                    </motion.span>
                  )}
                  <input 
                    type="checkbox" 
                    checked={isMastered} 
                    onChange={(e) => setIsMastered(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
                </div>
              </label>
            </div>

            <div className="pt-4 border-t border-slate-700/50">
              <label className="flex items-center justify-between cursor-pointer group">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-slate-200">لائیو مانیٹرنگ (سماعت)</span>
                  <span className="text-[10px] text-slate-500">صرف ہیڈ فون کے ساتھ استعمال کریں</span>
                </div>
                <div className="relative inline-flex items-center">
                  <input 
                    type="checkbox" 
                    checked={isMonitoring} 
                    onChange={(e) => setIsMonitoring(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </div>
              </label>
            </div>
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
                    <div className="flex flex-col gap-2">
                      <p className="text-[10px] text-emerald-400 text-center font-bold uppercase tracking-widest animate-pulse">
                        مکسنگ موڈ فعال ہے - سلائیڈرز استعمال کریں
                      </p>
                      <button 
                        onClick={playMixedAudio}
                        className={`w-full py-3 rounded-xl flex items-center justify-center gap-2 font-semibold transition-all ${isPlaying ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/40' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'}`}
                      >
                        {isPlaying ? <Square size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                        {isPlaying ? "سننا بند کریں" : "مکسنگ کے ساتھ سنیں"}
                      </button>
                    
                    <button 
                      onClick={() => recordedBlob && autoNormalize(recordedBlob)}
                      disabled={isNormalizing}
                      className="w-full py-2 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-2 border border-indigo-500/30"
                    >
                      <Sparkles size={14} className={isNormalizing ? "animate-spin" : ""} />
                      {isNormalizing ? "متوازن کیا جا رہا ہے..." : "آواز متوازن کریں (Normalize)"}
                    </button>
                  </div>

                  <div className="flex gap-3">
                    <a 
                      href={audioUrl} 
                      download={`Saifia_Studio_${mode}_${new Date().getTime()}.webm`}
                      className="flex-1 bg-blue-600 hover:bg-blue-500 py-3 rounded-xl flex items-center justify-center gap-2 font-semibold transition-colors text-sm"
                    >
                      <Download size={18} />
                      محفوظ کریں (Save)
                    </a>
                    <button 
                      onClick={() => { setAudioUrl(null); setRecordedBlob(null); setIsPlaying(false); }}
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
