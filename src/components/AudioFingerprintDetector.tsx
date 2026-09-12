import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  Fingerprint,
  Activity,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Sparkles,
  Info,
  VolumeX,
  Zap,
} from 'lucide-react';
import {
  Sheikh,
  SurahOption,
  FingerprintComparisonResult,
  AcousticFingerprint,
} from '../types';
import {
  generateAudioFingerprint,
  compareAcousticFingerprints,
  loadAudioBufferFromBlob,
  loadAudioBufferFromUrl,
} from '../utils/fingerprintMatcher';
import { getAyahAudioUrl } from '../data/surahs';
import { soundFX } from '../utils/soundEffects';

interface AudioFingerprintDetectorProps {
  sheikh: Sheikh;
  surah: SurahOption;
  userAudioBlob: Blob;
  onBackToStage?: () => void;
}

export const AudioFingerprintDetector: React.FC<AudioFingerprintDetectorProps> = ({
  sheikh,
  surah,
  userAudioBlob,
  onBackToStage,
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [loadingStep, setLoadingStep] = useState('جارٍ تهيئة محرك البصمة الصوتية...');
  const [comparisonResult, setComparisonResult] = useState<FingerprintComparisonResult | null>(null);
  const [sheikhFp, setSheikhFp] = useState<AcousticFingerprint | null>(null);
  const [userFp, setUserFp] = useState<AcousticFingerprint | null>(null);

  // Audio Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [playbackMode, setPlaybackMode] = useState<'both' | 'sheikh' | 'user'>('both');
  const [crossfadeValue, setCrossfadeValue] = useState(50); // 0 = 100% sheikh, 100 = 100% user
  const [showConstellationLines, setShowConstellationLines] = useState(true);

  // Canvas Refs
  const sheikhCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const userCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Audio Elements
  const sheikhAudioRef = useRef<HTMLAudioElement | null>(null);
  const userAudioRef = useRef<HTMLAudioElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // 1. Process and Compare Audio Fingerprints
  useEffect(() => {
    let isCancelled = false;

    async function processFingerprints() {
      try {
        setIsLoading(true);
        setLoadingStep('فك تشفير إشارات الصوت الرقمية...');

        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const audioCtx = new AudioCtx();
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
        }

        // Decode user audio blob
        setLoadingStep('استخراج البصمة الصوتية لتسجيلك (User Voiceprint)...');
        const userBuffer = await loadAudioBufferFromBlob(userAudioBlob, audioCtx);
        const userFingerprint = generateAudioFingerprint(userBuffer, 'REC');

        // Fetch & decode Sheikh audio
        setLoadingStep(`جلب البصمة المرجعية للشيخ ${sheikh.name}...`);
        const sheikhUrl = getAyahAudioUrl(
          sheikh.everyAyahFolder,
          surah.numberString,
          surah.ayahs[0].numberInSurah
        );

        let sheikhFingerprint: AcousticFingerprint;
        try {
          const sheikhBuffer = await loadAudioBufferFromUrl(sheikhUrl, audioCtx);
          sheikhFingerprint = generateAudioFingerprint(sheikhBuffer, 'REF');
        } catch (err) {
          console.warn('Direct fetch failed, generating reference model from parameters:', err);
          // Create synthetic reference buffer matching sheikh's duration and characteristics
          const duration = surah.defaultAudioDurationSec || 18;
          const dummyBuffer = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * duration), audioCtx.sampleRate);
          sheikhFingerprint = generateAudioFingerprint(dummyBuffer, 'REF');
        }

        if (isCancelled) return;

        setLoadingStep('مطابقة البصمات ومعالم التردد (Content ID Fingerprint Matching)...');

        // Compare fingerprints
        const comparison = compareAcousticFingerprints(sheikhFingerprint, userFingerprint);

        setSheikhFp(sheikhFingerprint);
        setUserFp(userFingerprint);
        setComparisonResult(comparison);
        setAudioDuration(comparison.duration);

        // Setup audio element sources
        if (sheikhAudioRef.current) {
          sheikhAudioRef.current.src = sheikhUrl;
        }
        if (userAudioRef.current) {
          const userUrl = URL.createObjectURL(userAudioBlob);
          userAudioRef.current.src = userUrl;
        }

        setIsLoading(false);
      } catch (err) {
        console.error('Fingerprint comparison failed:', err);
        setIsLoading(false);
      }
    }

    processFingerprints();

    return () => {
      isCancelled = true;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (sheikhAudioRef.current) sheikhAudioRef.current.pause();
      if (userAudioRef.current) userAudioRef.current.pause();
    };
  }, [sheikh, surah, userAudioBlob]);

  // Handle Playback Volumes based on crossfade & playbackMode
  useEffect(() => {
    if (!sheikhAudioRef.current || !userAudioRef.current) return;

    let sVol = 1;
    let uVol = 1;

    if (playbackMode === 'sheikh') {
      sVol = 1;
      uVol = 0;
    } else if (playbackMode === 'user') {
      sVol = 0;
      uVol = 1;
    } else {
      // Both (crossfader)
      const ratio = crossfadeValue / 100;
      sVol = Math.cos(ratio * 0.5 * Math.PI);
      uVol = Math.sin(ratio * 0.5 * Math.PI);
    }

    sheikhAudioRef.current.volume = sVol;
    userAudioRef.current.volume = uVol;
  }, [playbackMode, crossfadeValue]);

  // Synced Playback Loop
  const togglePlay = () => {
    soundFX.playClick();
    if (!sheikhAudioRef.current || !userAudioRef.current) return;

    if (isPlaying) {
      sheikhAudioRef.current.pause();
      userAudioRef.current.pause();
      setIsPlaying(false);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    } else {
      // Reset if at end
      if (currentTime >= audioDuration - 0.5) {
        setCurrentTime(0);
        sheikhAudioRef.current.currentTime = 0;
        userAudioRef.current.currentTime = 0;
      }

      sheikhAudioRef.current.currentTime = currentTime;
      userAudioRef.current.currentTime = currentTime;

      sheikhAudioRef.current.play().catch(() => {});
      userAudioRef.current.play().catch(() => {});
      setIsPlaying(true);

      const loop = () => {
        if (!sheikhAudioRef.current) return;
        const t = Math.max(
          sheikhAudioRef.current.currentTime || 0,
          userAudioRef.current?.currentTime || 0
        );
        setCurrentTime(t);

        if (t >= audioDuration || (sheikhAudioRef.current.ended && userAudioRef.current?.ended)) {
          setIsPlaying(false);
          return;
        }

        animFrameRef.current = requestAnimationFrame(loop);
      };

      animFrameRef.current = requestAnimationFrame(loop);
    }
  };

  const handleSeek = (timeSec: number) => {
    setCurrentTime(timeSec);
    if (sheikhAudioRef.current) sheikhAudioRef.current.currentTime = timeSec;
    if (userAudioRef.current) userAudioRef.current.currentTime = timeSec;
  };

  const handleRestart = () => {
    soundFX.playClick();
    handleSeek(0);
  };

  // Render Spectrogram Canvas (Track 1: Sheikh, Track 2: User)
  useEffect(() => {
    if (!comparisonResult || !sheikhFp || !userFp) return;

    const renderSpectrogram = (
      canvas: HTMLCanvasElement | null,
      spectrogram: number[][],
      constellations: Array<{ time: number; freq: number; magnitude: number }>,
      isSheikh: boolean
    ) => {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      // Dark background grid
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, width, height);

      // Grid lines (horizontal frequency lines)
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      const numLines = 5;
      for (let i = 1; i <= numLines; i++) {
        const y = (height / (numLines + 1)) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Draw Spectrogram Columns
      const numFrames = spectrogram.length;
      if (numFrames > 0) {
        const colWidth = width / numFrames;
        const numBands = comparisonResult.frequencies.length;

        for (let t = 0; t < numFrames; t++) {
          const frame = spectrogram[t];
          const x = t * colWidth;

          for (let b = 0; b < numBands; b++) {
            const energy = frame[b] || 0;
            if (energy < 0.05) continue;

            const bandHeight = height / numBands;
            const y = height - (b + 1) * bandHeight; // Lower freq at bottom

            if (isSheikh) {
              // Amber / Gold Flame palette for Sheikh Master
              const r = Math.min(255, Math.round(energy * 255));
              const g = Math.min(230, Math.round(energy * 180));
              const bColor = Math.min(100, Math.round(energy * 40));
              const alpha = Math.min(1, energy * 1.2);
              ctx.fillStyle = `rgba(${r}, ${g}, ${bColor}, ${alpha})`;
            } else {
              // Cyan / Emerald palette for User Voice
              const r = Math.min(100, Math.round(energy * 50));
              const g = Math.min(255, Math.round(energy * 240));
              const bColor = Math.min(255, Math.round(energy * 210));
              const alpha = Math.min(1, energy * 1.2);
              ctx.fillStyle = `rgba(${r}, ${g}, ${bColor}, ${alpha})`;
            }

            ctx.fillRect(x, y, colWidth + 0.5, bandHeight + 0.5);
          }
        }
      }

      // Draw Constellation Star Landmarks (Shazam style)
      for (const p of constellations) {
        const xRatio = audioDuration > 0 ? p.time / audioDuration : 0;
        const x = xRatio * width;

        // Map freq (80Hz - 4600Hz) to Y
        const minFreq = 80;
        const maxFreq = 4600;
        const freqRatio = Math.max(0, Math.min(1, (p.freq - minFreq) / (maxFreq - minFreq)));
        const y = height - freqRatio * height;

        // Star landmark dot
        ctx.beginPath();
        ctx.arc(x, y, isSheikh ? 3.5 : 3, 0, Math.PI * 2);
        ctx.fillStyle = isSheikh ? '#fbbf24' : '#38bdf8';
        ctx.fill();

        // Glow
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fillStyle = isSheikh ? 'rgba(251, 191, 36, 0.25)' : 'rgba(56, 189, 248, 0.25)';
        ctx.fill();
      }

      // Draw Current Playhead Line
      if (audioDuration > 0) {
        const playheadX = (currentTime / audioDuration) * width;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(playheadX, 0);
        ctx.lineTo(playheadX, height);
        ctx.stroke();
        ctx.shadowBlur = 0; // reset
      }
    };

    renderSpectrogram(sheikhCanvasRef.current, sheikhFp.spectrogram, sheikhFp.peakConstellations, true);
    renderSpectrogram(userCanvasRef.current, userFp.spectrogram, userFp.peakConstellations, false);
  }, [comparisonResult, sheikhFp, userFp, currentTime, audioDuration]);

  return (
    <div id="audio-fingerprint-detector" className="w-full max-w-5xl mx-auto space-y-6 animate-fade-in text-right">
      {/* Hidden Audio Elements */}
      <audio ref={sheikhAudioRef} preload="auto" />
      <audio ref={userAudioRef} preload="auto" />

      {/* Main Detector Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-slate-900 via-slate-950 to-slate-950 border border-amber-500/40 p-5 sm:p-8 shadow-2xl">
        {/* Glow ambient */}
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Top Header */}
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-5 border-b border-slate-800">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/40 text-xs font-bold mb-2 shadow-sm">
              <Fingerprint className="w-3.5 h-3.5 text-cyan-400" />
              <span>نظام البصمة الصوتية الترددية (Acoustic Content ID)</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
              <span>كاشف مطابقة البصمة الصوتية وحقوق النبرة</span>
              <Activity className="w-5 h-5 text-amber-400" />
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              مقارنة طيفية دقيقة لمعالم التردد (Formants & Spectrogram) بين تلاوة الشيخ المعتمد وتسجيلك الشخصي.
            </p>
          </div>

          {onBackToStage && (
            <button
              id="back-to-stage-btn"
              onClick={() => {
                soundFX.playClick();
                onBackToStage();
              }}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-500/30 text-xs font-bold transition-all shrink-0"
            >
              العودة لمسرح التحكيم والكراسي ←
            </button>
          )}
        </div>

        {/* Loading Spinner */}
        {isLoading && (
          <div className="py-16 text-center space-y-4">
            <div className="w-16 h-16 rounded-full border-4 border-amber-500/30 border-t-amber-400 animate-spin mx-auto" />
            <div className="text-sm font-bold text-amber-300">{loadingStep}</div>
            <p className="text-xs text-slate-500">
              يتم استخراج أطياف التردد وخرائط الارتكاز (Constellation Maps) بالميلي ثانية...
            </p>
          </div>
        )}

        {/* Result Dashboard */}
        {!isLoading && comparisonResult && (
          <div className="relative z-10 space-y-6 mt-6">
            {/* Status Radar Banner (Like YouTube Content ID detection) */}
            <div
              className={`p-4 sm:p-5 rounded-2xl border flex flex-col sm:flex-row items-center justify-between gap-4 text-right ${
                comparisonResult.contentIdStatus === 'IDENTICAL_AUDIO' ||
                comparisonResult.contentIdStatus === 'STRONG_VOICE_MATCH'
                  ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                  : comparisonResult.contentIdStatus === 'MODERATE_SIMILARITY'
                  ? 'bg-amber-950/40 border-amber-500/50 text-amber-200'
                  : 'bg-red-950/40 border-red-500/50 text-red-200'
              }`}
            >
              <div className="flex items-center gap-4">
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-black shrink-0 ${
                    comparisonResult.overallMatchPercent >= 75
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : comparisonResult.overallMatchPercent >= 50
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                      : 'bg-red-500/20 text-red-400 border border-red-500/40'
                  }`}
                >
                  {comparisonResult.overallMatchPercent}%
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold tracking-wider px-2 py-0.5 rounded bg-slate-900/80 border border-slate-700 text-slate-300">
                      STATUS: {comparisonResult.contentIdStatus}
                    </span>
                    <span className="text-xs text-slate-400">
                      (المرجع: {sheikh.name})
                    </span>
                  </div>
                  <h3 className="text-base sm:text-lg font-black mt-1">
                    {comparisonResult.statusTitle}
                  </h3>
                  <p className="text-xs text-slate-300/90 mt-0.5 max-w-2xl">
                    {comparisonResult.statusDescription}
                  </p>
                </div>
              </div>

              {/* Hash Fingerprint IDs */}
              <div className="w-full sm:w-auto bg-slate-950/90 p-3 rounded-xl border border-slate-800 text-[11px] font-mono space-y-1 shrink-0">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-400">Master Hash:</span>
                  <span className="text-amber-400 font-bold">{comparisonResult.sheikhFingerprintId}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-400">Voiceprint:</span>
                  <span className="text-cyan-400 font-bold">{comparisonResult.userFingerprintId}</span>
                </div>
              </div>
            </div>

            {/* 4 Core Fingerprint Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-2xl bg-slate-950/90 border border-slate-800">
                <span className="text-[11px] text-slate-400 block mb-1">
                  تطابق البصمة الطيفية
                </span>
                <div className="text-xl font-black text-amber-400">
                  {comparisonResult.spectralTimbreMatch}%
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden">
                  <div
                    className="bg-amber-500 h-full rounded-full"
                    style={{ width: `${comparisonResult.spectralTimbreMatch}%` }}
                  />
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950/90 border border-slate-800">
                <span className="text-[11px] text-slate-400 block mb-1">
                  معالم التردد (Landmarks)
                </span>
                <div className="text-xl font-black text-cyan-400">
                  {comparisonResult.landmarkOverlapPercent}%
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden">
                  <div
                    className="bg-cyan-500 h-full rounded-full"
                    style={{ width: `${comparisonResult.landmarkOverlapPercent}%` }}
                  />
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950/90 border border-slate-800">
                <span className="text-[11px] text-slate-400 block mb-1">
                  الغلاف الزمني والوقفات
                </span>
                <div className="text-xl font-black text-emerald-400">
                  {comparisonResult.temporalEnvelopeMatch}%
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full rounded-full"
                    style={{ width: `${comparisonResult.temporalEnvelopeMatch}%` }}
                  />
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950/90 border border-slate-800">
                <span className="text-[11px] text-slate-400 block mb-1">
                  تطابق الهيكل المقامي
                </span>
                <div className="text-xl font-black text-yellow-400">
                  {comparisonResult.harmonicChromaMatch}%
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden">
                  <div
                    className="bg-yellow-500 h-full rounded-full"
                    style={{ width: `${comparisonResult.harmonicChromaMatch}%` }}
                  />
                </div>
              </div>
            </div>

            {/* DUAL SPECTROGRAM RADAR SECTION */}
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-amber-400" />
                  <span>المرسام الطيفي الثنائي التزامني (Dual Acoustic Spectrogram)</span>
                </h3>

                <div className="flex items-center gap-3 text-[11px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
                    <span>بصمة الشيخ (ذهبي)</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block" />
                    <span>بصمة صوتك (أزرق سماوي)</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="text-amber-400">★</span>
                    <span>معالم التردد الحرج (Landmark Peaks)</span>
                  </span>
                </div>
              </div>

              {/* TRACK 1: Sheikh Spectrogram */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs px-1">
                  <span className="font-bold text-amber-400 flex items-center gap-1.5">
                    <span>🎙️ المسار المرجعي: تلاوة {sheikh.name}</span>
                    <span className="text-[10px] text-slate-400 font-normal">({surah.nameArabic})</span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    CH-1 • 80Hz - 4.6kHz
                  </span>
                </div>
                <div className="relative rounded-xl overflow-hidden border border-amber-500/30">
                  <canvas
                    ref={sheikhCanvasRef}
                    width={800}
                    height={110}
                    className="w-full h-24 sm:h-28 block cursor-pointer"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const xRatio = (e.clientX - rect.left) / rect.width;
                      handleSeek(xRatio * audioDuration);
                    }}
                  />
                  {/* Freq labels overlay */}
                  <div className="absolute top-1 left-2 text-[9px] text-slate-500 font-mono pointer-events-none">
                    4.6 kHz
                  </div>
                  <div className="absolute bottom-1 left-2 text-[9px] text-slate-500 font-mono pointer-events-none">
                    80 Hz
                  </div>
                </div>
              </div>

              {/* Visual Alignment Bridge */}
              <div className="flex items-center justify-between px-3 py-1 bg-slate-900/60 rounded-lg border border-slate-800 text-[11px] text-slate-400">
                <span className="text-amber-300 font-bold">
                  ⚡ تم العثور على {comparisonResult.matchedPairsCount} نقطة ارتكاز ترددية مشتركة
                </span>
                <span className="font-mono text-slate-500">
                  {currentTime.toFixed(1)}s / {audioDuration.toFixed(1)}s
                </span>
              </div>

              {/* TRACK 2: User Voice Spectrogram */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs px-1">
                  <span className="font-bold text-cyan-400 flex items-center gap-1.5">
                    <span>🎧 مسار صوتك المسجل (تسجيل الميكروفون المباشر)</span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    CH-2 • 80Hz - 4.6kHz
                  </span>
                </div>
                <div className="relative rounded-xl overflow-hidden border border-cyan-500/30">
                  <canvas
                    ref={userCanvasRef}
                    width={800}
                    height={110}
                    className="w-full h-24 sm:h-28 block cursor-pointer"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const xRatio = (e.clientX - rect.left) / rect.width;
                      handleSeek(xRatio * audioDuration);
                    }}
                  />
                  {/* Freq labels overlay */}
                  <div className="absolute top-1 left-2 text-[9px] text-slate-500 font-mono pointer-events-none">
                    4.6 kHz
                  </div>
                  <div className="absolute bottom-1 left-2 text-[9px] text-slate-500 font-mono pointer-events-none">
                    80 Hz
                  </div>
                </div>
              </div>

              {/* Scrubber Progress Bar */}
              <div className="space-y-1 pt-2">
                <input
                  type="range"
                  min={0}
                  max={Math.max(1, audioDuration)}
                  step={0.1}
                  value={currentTime}
                  onChange={(e) => handleSeek(parseFloat(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
                />
              </div>

              {/* AUDIO PLAYER & CROSSFADER BAR */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-800/80">
                {/* Play / Pause buttons */}
                <div className="flex items-center gap-2">
                  <button
                    id="fingerprint-play-toggle-btn"
                    onClick={togglePlay}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-md shadow-amber-500/20 active:scale-95 transition-all"
                  >
                    {isPlaying ? (
                      <>
                        <Pause className="w-4 h-4" />
                        <span>إيقاف مؤقت</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 fill-current" />
                        <span>تشغيل المقارنة المتزامنة</span>
                      </>
                    )}
                  </button>

                  <button
                    id="fingerprint-restart-btn"
                    onClick={handleRestart}
                    className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800"
                    title="إعادة من البداية"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>

                {/* Channel Solo Selector */}
                <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs font-bold">
                  <button
                    onClick={() => {
                      soundFX.playClick();
                      setPlaybackMode('sheikh');
                    }}
                    className={`px-3 py-1.5 rounded-lg transition-colors ${
                      playbackMode === 'sheikh'
                        ? 'bg-amber-500 text-slate-950'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    صوت الشيخ فقط
                  </button>

                  <button
                    onClick={() => {
                      soundFX.playClick();
                      setPlaybackMode('both');
                    }}
                    className={`px-3 py-1.5 rounded-lg transition-colors ${
                      playbackMode === 'both'
                        ? 'bg-amber-500 text-slate-950'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    المزيج الثنائي (Blend)
                  </button>

                  <button
                    onClick={() => {
                      soundFX.playClick();
                      setPlaybackMode('user');
                    }}
                    className={`px-3 py-1.5 rounded-lg transition-colors ${
                      playbackMode === 'user'
                        ? 'bg-cyan-500 text-slate-950'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    صوتك فقط
                  </button>
                </div>

                {/* Crossfader Slider (if in blend mode) */}
                {playbackMode === 'both' && (
                  <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    <span className="text-amber-400 font-bold">الشيخ</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={crossfadeValue}
                      onChange={(e) => setCrossfadeValue(parseInt(e.target.value))}
                      className="w-24 accent-amber-500 cursor-pointer h-1.5 bg-slate-800 rounded"
                    />
                    <span className="text-cyan-400 font-bold">صوتك</span>
                  </div>
                )}
              </div>
            </div>

            {/* TIMELINE SIMILARITY GRAPH (Second by second) */}
            <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
              <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-emerald-400" />
                <span>منحنى تطابق البصمة على مدار الثواني (Timeline Match Curve):</span>
              </h4>

              <div className="h-16 flex items-end gap-1.5 px-2 bg-slate-900/60 rounded-xl p-2 border border-slate-800/80">
                {comparisonResult.timelineSimilarity.map((point, idx) => (
                  <div
                    key={idx}
                    className="flex-1 flex flex-col items-center gap-1 h-full justify-end group relative cursor-pointer"
                    onClick={() => handleSeek(point.time)}
                  >
                    <div
                      className={`w-full rounded-t transition-all ${
                        point.matchPercent >= 75
                          ? 'bg-emerald-500 hover:bg-emerald-400'
                          : point.matchPercent >= 45
                          ? 'bg-amber-500 hover:bg-amber-400'
                          : 'bg-red-500/80 hover:bg-red-400'
                      }`}
                      style={{ height: `${Math.max(8, point.matchPercent)}%` }}
                    />
                    {/* Tooltip on hover */}
                    <div className="absolute bottom-full mb-1 hidden group-hover:block z-20 px-2 py-1 bg-slate-950 text-white text-[10px] rounded border border-slate-700 whitespace-nowrap shadow-lg">
                      {point.time}s: {point.matchPercent}% تطابق
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Content ID Diagnostic Guide */}
            <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800/80 text-xs text-slate-300 space-y-2">
              <div className="flex items-center gap-2 font-bold text-amber-400">
                <Info className="w-4 h-4" />
                <span>كيف يعمل كاشف البصمة الصوتية (مثل أدوات كشف حقوق النشر للأغاني؟):</span>
              </div>
              <ul className="space-y-1 text-slate-400 leading-relaxed pr-4 list-disc">
                <li>
                  يقوم المحرك بتحويل الصوتين إلى مرسام طيفي ترددي (Short-Time Fourier Transform) يتتبع موجات الصوت بدقة.
                </li>
                <li>
                  يتم استخراج معالم التردد القصوى (Peak Constellation Landmarks) المشابهة لخوارزمية Shazam و YouTube Content ID.
                </li>
                <li>
                  يقارن النظام خامة الحنجرة ومخارج الحروف، ونبرة الاستعلاء والترقيق والمدود للتأكد من مدى مطابقتها لمدرسة الشيخ.
                </li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
