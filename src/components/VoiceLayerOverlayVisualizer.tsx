import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Sheikh, SurahOption } from '../types';
import { VoiceRecorderSession } from '../utils/audioAnalyzer';
import {
  getSheikhWaveformProfile,
  fetchRealSheikhWaveformProfile,
  calculatePostRecordingLayerMatch,
  SheikhWaveformProfile,
  PostRecordingMatchResult,
} from '../utils/sheikhWaveform';
import {
  Headphones,
  Sparkles,
  Check,
  ArrowUp,
  ArrowDown,
  Volume2,
  Activity,
  Zap,
  Mic,
  Music,
} from 'lucide-react';
import { getAyahAudioUrl } from '../data/surahs';

interface VoiceLayerOverlayVisualizerProps {
  sheikh: Sheikh;
  surah: SurahOption;
  isRecording: boolean;
  elapsedSeconds: number;
  recorderSession: VoiceRecorderSession | null;
  completedMatchResult?: PostRecordingMatchResult | null;
  onAnalysisReady?: (result: PostRecordingMatchResult) => void;
}

export const VoiceLayerOverlayVisualizer: React.FC<VoiceLayerOverlayVisualizerProps> = ({
  sheikh,
  surah,
  isRecording,
  elapsedSeconds,
  recorderSession,
  completedMatchResult,
  onAnalysisReady,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number | null>(null);

  // Sheikh reference profile: initialized with precomputed model, then loaded with REAL audio
  const [profile, setProfile] = useState<SheikhWaveformProfile>(() =>
    getSheikhWaveformProfile(sheikh, surah)
  );
  const [isRealAudioLoaded, setIsRealAudioLoaded] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    setIsRealAudioLoaded(false);

    fetchRealSheikhWaveformProfile(sheikh, surah).then((realProf) => {
      if (!cancelled) {
        setProfile(realProf);
        setIsRealAudioLoaded(realProf.isRealAudio === true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [sheikh.id, surah.id]);

  // Guide audio track (for headphones / karaoke style live guide)
  const [guideAudioEnabled, setGuideAudioEnabled] = useState<boolean>(false);
  const [guideVolume, setGuideVolume] = useState<number>(0.5);
  const guideAudioRef = useRef<HTMLAudioElement | null>(null);

  // Number of discrete waveform bars for the visualizer
  const TOTAL_BARS = 140;

  // Real-time recorded waveform amplitudes (0.0 to 1.0) stored purely in ref to prevent re-renders
  const userBarsRef = useRef<Float32Array>(new Float32Array(TOTAL_BARS));
  const recordingStartTimeRef = useRef<number>(0);
  const smoothedRmsRef = useRef<number>(0);

  // Pitch samples accumulator for post-recording evaluation
  const collectedPitchSamplesRef = useRef<number[]>([]);

  // Post-recording evaluation result state (calculated ONLY when recording finishes!)
  const [postMatchResult, setPostMatchResult] = useState<PostRecordingMatchResult | null>(
    completedMatchResult || null
  );

  // Synchronize guide audio with recording state
  useEffect(() => {
    const audio = guideAudioRef.current;
    if (!audio) return;

    if (isRecording && guideAudioEnabled) {
      audio.currentTime = Math.min(audio.duration || 0, elapsedSeconds);
      audio.volume = guideVolume;
      audio.play().catch((e) => console.warn('Guide audio play blocked:', e));
    } else {
      audio.pause();
    }
  }, [isRecording, guideAudioEnabled, guideVolume, elapsedSeconds]);

  // When recording begins: reset user wave buffer and set high-resolution start time
  useEffect(() => {
    if (isRecording) {
      userBarsRef.current = new Float32Array(TOTAL_BARS);
      collectedPitchSamplesRef.current = [];
      recordingStartTimeRef.current = performance.now();
      setPostMatchResult(null);
    }
  }, [isRecording]);

  // WHEN RECORDING ENDS: Execute the full matching and analysis ONLY NOW!
  const prevIsRecordingRef = useRef(isRecording);
  useEffect(() => {
    const wasRecording = prevIsRecordingRef.current;
    prevIsRecordingRef.current = isRecording;

    if (wasRecording && !isRecording) {
      // Collect user samples from the recorded pink bars
      const userPoints: number[] = Array.from(userBarsRef.current);
      const pitchSamples =
        collectedPitchSamplesRef.current.length > 0
          ? collectedPitchSamplesRef.current
          : recorderSession?.pitchSamples || [];
      const duration = Math.max(1, elapsedSeconds);

      // Perform comprehensive post-recording match
      const result = calculatePostRecordingLayerMatch(
        userPoints,
        pitchSamples,
        duration,
        profile
      );

      setPostMatchResult(result);
      if (onAnalysisReady) {
        onAnalysisReady(result);
      }
    }
  }, [isRecording, elapsedSeconds, profile, recorderSession, onAnalysisReady]);

  // --------------------------------------------------------------------------
  // HIGH-RESOLUTION 60 FPS CANVAS RENDER LOOP
  // Real Sheikh Voice Contour + Live Pink User Waveform Overlay
  // Zero React re-renders or setState calls during recording.
  // --------------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const targetDuration = Math.max(1, profile.durationSec);
    const sheikhPoints = profile.waveformPoints;

    // Local buffer for time-domain audio data
    let timeDomainBuffer: Float32Array | null = null;

    const render = () => {
      animRef.current = requestAnimationFrame(render);

      const width = canvas.width;
      const height = canvas.height;
      const centerY = height / 2;
      const barWidth = (width / TOTAL_BARS) * 0.72;
      const barGap = (width / TOTAL_BARS) * 0.28;
      const stepX = width / TOTAL_BARS;

      // 1. Dark Studio Monitor Background
      ctx.fillStyle = '#060913';
      ctx.fillRect(0, 0, width, height);

      // Center subtle guideline
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(width, centerY);
      ctx.stroke();

      // Timeline vertical ticks (every 10%)
      for (let t = 1; t < 10; t++) {
        const x = (t / 10) * width;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      // Calculate high-resolution progress (continuous 60 FPS sub-pixel tracking)
      let currentProgress = 0;
      if (isRecording) {
        const now = performance.now();
        const realElapsedSec = (now - recordingStartTimeRef.current) / 1000;
        currentProgress = Math.min(1.0, Math.max(0, realElapsedSec / targetDuration));
      } else if (postMatchResult) {
        currentProgress = 1.0;
      }

      const activeBarIndex = Math.min(TOTAL_BARS - 1, Math.floor(currentProgress * TOTAL_BARS));
      const cursorX = currentProgress * width;

      // ----------------------------------------------------------------------
      // LAYER 1: Sheikh REAL Audio Waveform Strip & Contour Envelope
      // ("شريط ومحيط صوت الشيخ الحقيقي - مستخرج من ملف الصوت الأصلي")
      // ----------------------------------------------------------------------

      // 1A. Rounded studio acoustic bars for the Sheikh
      for (let i = 0; i < TOTAL_BARS; i++) {
        const x = i * stepX + barGap / 2;
        const sheikhAmp = sheikhPoints[i] || 0.12;
        const sheikhBarH = sheikhAmp * (height * 0.42);
        const sheikhTopY = centerY - sheikhBarH;
        const sheikhTotalH = sheikhBarH * 2;
        const sheikhRadius = Math.min(barWidth / 2, 2.5);

        // Rich Royal Amber & Violet gradient for Sheikh's acoustic body
        const sheikhBarGrad = ctx.createLinearGradient(x, sheikhTopY, x, sheikhTopY + sheikhTotalH);
        sheikhBarGrad.addColorStop(0, 'rgba(168, 85, 247, 0.45)');   // purple top
        sheikhBarGrad.addColorStop(0.2, 'rgba(217, 70, 239, 0.35)');
        sheikhBarGrad.addColorStop(0.5, 'rgba(251, 191, 36, 0.55)'); // gold/amber core
        sheikhBarGrad.addColorStop(0.8, 'rgba(217, 70, 239, 0.35)');
        sheikhBarGrad.addColorStop(1, 'rgba(168, 85, 247, 0.45)');

        ctx.fillStyle = sheikhBarGrad;
        ctx.beginPath();
        ctx.roundRect(x, sheikhTopY, barWidth, Math.max(3, sheikhTotalH), sheikhRadius);
        ctx.fill();
      }

      // 1B. Luminous outer contour envelope tracing the Sheikh's vocal envelope
      ctx.shadowColor = 'rgba(168, 85, 247, 0.65)';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      for (let i = 0; i < TOTAL_BARS; i++) {
        const x = i * stepX + barWidth / 2;
        const amp = sheikhPoints[i] || 0.12;
        const y = centerY - amp * (height * 0.42);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      for (let i = TOTAL_BARS - 1; i >= 0; i--) {
        const x = i * stepX + barWidth / 2;
        const amp = sheikhPoints[i] || 0.12;
        const y = centerY + amp * (height * 0.42);
        ctx.lineTo(x, y);
      }
      ctx.closePath();

      // Soft purple/gold translucent wash inside contour
      ctx.fillStyle = 'rgba(147, 51, 234, 0.08)';
      ctx.fill();

      // Crisp luminous contour border
      ctx.strokeStyle = '#c084fc';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // ----------------------------------------------------------------------
      // LAYER 2: Live Mic Processing (True Real-Time Voice Waveform)
      // ----------------------------------------------------------------------
      if (isRecording && recorderSession) {
        const analyser = recorderSession.getAnalyser();
        if (analyser) {
          if (!timeDomainBuffer || timeDomainBuffer.length !== analyser.fftSize) {
            timeDomainBuffer = new Float32Array(analyser.fftSize);
          }
          analyser.getFloatTimeDomainData(timeDomainBuffer);

          // Fast RMS loudness computation
          let sumSquares = 0;
          for (let i = 0; i < timeDomainBuffer.length; i++) {
            sumSquares += timeDomainBuffer[i] * timeDomainBuffer[i];
          }
          const rawRms = Math.sqrt(sumSquares / timeDomainBuffer.length);

          // Smooth exponential moving average for organic wave feel
          smoothedRmsRef.current = smoothedRmsRef.current * 0.65 + rawRms * 0.35;
          const liveAmp = Math.min(1.0, Math.max(0.04, smoothedRmsRef.current * 4.2));

          // Write current amplitude into user pink bars buffer at active timeline position
          userBarsRef.current[activeBarIndex] = Math.max(
            userBarsRef.current[activeBarIndex] || 0,
            liveAmp
          );

          // If moving between bars, interpolate smoothly to avoid empty steps
          if (activeBarIndex > 0 && userBarsRef.current[activeBarIndex - 1] === 0) {
            userBarsRef.current[activeBarIndex - 1] = liveAmp * 0.85;
          }
        }
      }

      // ----------------------------------------------------------------------
      // LAYER 3: The Glowing Pink Waveform Strip ("صوتك فوق صوت الشيخ")
      // High-end rounded soundwave bars in vibrant Rose / Pink / Fuchsia!
      // Overlaid directly over the Sheikh's real acoustic contour
      // ----------------------------------------------------------------------
      const userBars = userBarsRef.current;
      const barsToDraw = isRecording ? activeBarIndex + 1 : TOTAL_BARS;

      for (let i = 0; i < barsToDraw; i++) {
        const x = i * stepX + barGap / 2;
        let amp = userBars[i] || 0;

        // Give a minimum subtle ambient height (10%) so the pink track is visible
        amp = Math.max(0.08, amp);

        const barHeight = amp * (height * 0.44);
        const topY = centerY - barHeight;
        const totalH = barHeight * 2;
        const radius = Math.min(barWidth / 2, 3);

        // Pink/Rose Neon Gradient with White Hot Center
        const pinkGrad = ctx.createLinearGradient(x, topY, x, topY + totalH);
        pinkGrad.addColorStop(0, '#f43f5e');     // vivid rose top
        pinkGrad.addColorStop(0.2, '#fb7185');   // soft rose-pink
        pinkGrad.addColorStop(0.5, '#ffffff');   // bright glowing white core
        pinkGrad.addColorStop(0.8, '#ec4899');   // electric pink
        pinkGrad.addColorStop(1, '#f43f5e');     // rose bottom

        // Neon Pink Outer Glow
        ctx.shadowColor = 'rgba(244, 63, 94, 0.85)';
        ctx.shadowBlur = 8;
        ctx.fillStyle = pinkGrad;

        // Rounded pill bar
        ctx.beginPath();
        ctx.roundRect(x, topY, barWidth, Math.max(4, totalH), radius);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // ----------------------------------------------------------------------
      // LAYER 4: Real-Time Scanning Cursor & Oscilloscope Ripple
      // ----------------------------------------------------------------------
      if (isRecording) {
        // High-energy laser beam cursor
        ctx.shadowColor = '#ec4899';
        ctx.shadowBlur = 12;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;

        ctx.beginPath();
        ctx.moveTo(cursorX, 0);
        ctx.lineTo(cursorX, height);
        ctx.stroke();

        // Glowing pink cursor dot
        ctx.fillStyle = '#fb7185';
        ctx.beginPath();
        ctx.arc(cursorX, centerY, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(cursorX, centerY, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Live oscilloscope ripple ahead of cursor
        if (timeDomainBuffer) {
          ctx.beginPath();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
          ctx.lineWidth = 2;
          ctx.shadowColor = '#f43f5e';
          ctx.shadowBlur = 10;

          const scopePoints = 16;
          for (let s = 0; s < scopePoints; s++) {
            const sy = (s / (scopePoints - 1)) * height;
            const waveOffset = (timeDomainBuffer[s * 10] || 0) * 22;
            if (s === 0) ctx.moveTo(cursorX + waveOffset, sy);
            else ctx.lineTo(cursorX + waveOffset, sy);
          }
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
      }
    };

    render();

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [profile, isRecording, recorderSession, postMatchResult]);

  const currentAyahAudioUrl = getAyahAudioUrl(
    sheikh.everyAyahFolder,
    surah.numberString,
    surah.ayahs[0]?.numberInSurah || 1
  );

  return (
    <div className="w-full space-y-3">
      {/* Hidden guide audio element */}
      <audio ref={guideAudioRef} src={currentAyahAudioUrl} loop={false} />

      {/* Top Header Badge & Real-Time Status */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2.5">
          <div className="relative flex items-center justify-center">
            <span
              className={`w-3 h-3 rounded-full ${
                isRecording ? 'bg-pink-500 animate-ping' : 'bg-rose-400'
              }`}
            />
            <span
              className={`absolute w-2 h-2 rounded-full ${
                isRecording ? 'bg-pink-400' : 'bg-rose-300'
              }`}
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs sm:text-sm font-black tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-pink-400 via-rose-300 to-amber-300 uppercase">
              شريط صوتك فوق محيط صوت الشيخ
            </span>

            {isRealAudioLoaded && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-950/80 border border-purple-500/40 text-[10px] text-purple-200 font-bold shadow-sm">
                <Music className="w-3 h-3 text-amber-400" />
                <span>محيط حقيقي مستخرج من تلاوة الشيخ</span>
              </span>
            )}
          </div>
        </div>

        {/* Live status badge: Pure 60 FPS during recording, Full score upon completion */}
        {isRecording ? (
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-pink-500/40 shadow-[0_0_15px_rgba(244,63,94,0.25)]">
            <span className="w-2 h-2 rounded-full bg-pink-400 animate-pulse" />
            <span className="text-xs text-pink-300 font-bold">
              الشريط يتمشى بسلاسة مع صوتك (60 FPS)
            </span>
          </div>
        ) : postMatchResult ? (
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-slate-900 border border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.3)]">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-slate-400">تطابق الطبقة النهائي:</span>
            <span className="font-mono text-base font-black text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]">
              {postMatchResult.overallLayerMatchPercent}%
            </span>
          </div>
        ) : (
          <div className="text-xs text-slate-400">
            {isRealAudioLoaded
              ? 'موجة الشيخ جاهزة — ابدأ التسجيل لمحاكاة طبقته'
              : 'جارٍ استخراج محيط صوت الشيخ من التسجيل الأصلي...'}
          </div>
        )}
      </div>

      {/* Monitor Console Container */}
      <div className="relative rounded-2xl p-1 bg-gradient-to-b from-pink-500/30 via-slate-800 to-purple-500/30 shadow-[0_0_30px_rgba(244,63,94,0.25)]">
        <div className="relative rounded-[14px] bg-[#060913] border border-pink-500/40 overflow-hidden">
          {/* Top Info Bar */}
          <div className="relative z-10 flex items-center justify-between px-3 py-2 bg-slate-950/80 border-b border-pink-500/20 text-xs">
            {/* Legend */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-pink-500 shadow-[0_0_8px_#ec4899]" />
                <span className="text-[11px] text-pink-300 font-bold">
                  {isRecording ? 'صوتك المباشر (فوق صوت الشيخ)' : 'صوتك المسجل'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500/80 border border-amber-400/50 shadow-[0_0_6px_#a855f7]" />
                <span className="text-[11px] text-purple-200 font-bold">
                  شريط ومحيط الشيخ {sheikh.name} (الأصلي)
                </span>
              </div>
            </div>

            {/* Target base pitch & real duration */}
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-slate-400 hidden sm:inline">
                طبقة الشيخ: <strong className="text-amber-300">{profile.baseFreqHz} Hz</strong> ({sheikh.maqam})
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
                {profile.durationSec} ثانية
              </span>
            </div>
          </div>

          {/* High-speed Canvas with Real Sheikh Audio Contour & Pink Soundwave Bars */}
          <div className="relative p-2">
            <canvas
              ref={canvasRef}
              width={740}
              height={130}
              className="w-full h-28 sm:h-32 rounded-lg block cursor-crosshair"
            />

            {/* In-Canvas Dynamic Notification Pill */}
            {isRecording && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3.5 py-1 rounded-full bg-black/85 backdrop-blur-md border border-pink-500/40 shadow-lg flex items-center gap-2 text-xs whitespace-nowrap">
                <Mic className="w-3.5 h-3.5 text-pink-400 animate-pulse" />
                <span className="text-pink-200 font-medium">
                  صوتك يتمشى مباشرة فوق محيط الشيخ — احرص على محاذاة ارتفاع وانخفاض الشريط
                </span>
              </div>
            )}
          </div>

          {/* Bottom Controls & Time Progress Bar */}
          <div className="flex items-center justify-between px-3 py-2 bg-slate-950/90 border-t border-pink-500/20 text-xs">
            {/* Guide Audio Toggle */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setGuideAudioEnabled((prev) => !prev)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-all ${
                  guideAudioEnabled
                    ? 'bg-pink-500/20 border-pink-400 text-pink-300 shadow-[0_0_10px_rgba(236,72,153,0.3)]'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
                title="استمع لصوت الشيخ في السماعة أثناء الترديد لتسهيل محاكاة طبقته"
              >
                <Headphones className="w-3 h-3" />
                <span>سماع الشيخ في السماعة:</span>
                <strong className={guideAudioEnabled ? 'text-pink-300' : 'text-slate-500'}>
                  {guideAudioEnabled ? 'مفعّل 🎧' : 'معطّل'}
                </strong>
              </button>

              {guideAudioEnabled && (
                <div className="flex items-center gap-1.5">
                  <Volume2 className="w-3 h-3 text-pink-400" />
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={guideVolume}
                    onChange={(e) => setGuideVolume(parseFloat(e.target.value))}
                    className="w-16 accent-pink-400 h-1 bg-slate-800 rounded"
                  />
                </div>
              )}
            </div>

            {/* Time progress */}
            <div className="font-mono text-[11px] text-slate-400">
              <span>الزمن: </span>
              <strong className="text-pink-400">{elapsedSeconds} ث</strong> /{' '}
              <span>{profile.durationSec} ث</span>
            </div>
          </div>
        </div>
      </div>

      {/* POST-RECORDING ANALYSIS CARD (Shown ONLY after recording finishes!) */}
      {postMatchResult && !isRecording && (
        <div className="p-4 rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 border border-pink-500/30 shadow-xl space-y-3 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-pink-400" />
              <h4 className="text-sm font-bold text-white">
                نتائج مطابقة محيط صوت الشيخ عند انتهاء التسجيل
              </h4>
            </div>

            <div className="px-3 py-1 rounded-full bg-pink-500/10 border border-pink-400/40 text-pink-300 font-mono font-bold text-xs">
              تطابق الطبقة: {postMatchResult.overallLayerMatchPercent}%
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center text-xs">
            {/* Pitch layer assessment */}
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-slate-400 block mb-1">طبقة صوت الشيخ الحقيقية</span>
              <span className="font-mono font-bold text-amber-400 text-sm">
                {postMatchResult.sheikhAvgPitchHz} Hz
              </span>
              <p className="text-[10px] text-slate-500 mt-1">{sheikh.maqam}</p>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-slate-400 block mb-1">طبقة صوتك المسجل</span>
              <span className="font-mono font-bold text-pink-300 text-sm">
                {postMatchResult.userAvgPitchHz > 0 ? `${postMatchResult.userAvgPitchHz} Hz` : 'غير محدد'}
              </span>
              <p className="text-[10px] text-slate-500 mt-1">
                الفارق: {postMatchResult.pitchDiffHz > 0 ? `+${postMatchResult.pitchDiffHz}Hz` : `${postMatchResult.pitchDiffHz}Hz`}
              </p>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-slate-400 block mb-1">تطابق حركة الموجة الحقيقية</span>
              <span className="font-mono font-bold text-emerald-400 text-sm">
                {postMatchResult.envelopeMatchScore}%
              </span>
              <p className="text-[10px] text-slate-500 mt-1">أزمنة النفس والمدود</p>
            </div>
          </div>

          {/* Status Verdict Banner */}
          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center gap-2.5 text-xs">
            {postMatchResult.pitchStatus === 'PERFECT' ? (
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : postMatchResult.pitchStatus === 'HIGHER' ? (
              <ArrowDown className="w-4 h-4 text-amber-400 shrink-0" />
            ) : (
              <ArrowUp className="w-4 h-4 text-pink-400 shrink-0" />
            )}
            <span className="text-slate-200 font-medium">
              {postMatchResult.statusText}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
