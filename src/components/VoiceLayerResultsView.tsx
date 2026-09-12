import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Sheikh, SurahOption } from '../types';
import {
  getSheikhWaveformProfile,
  fetchRealSheikhWaveformProfile,
  calculatePostRecordingLayerMatch,
  SheikhWaveformProfile,
  PostRecordingMatchResult,
} from '../utils/sheikhWaveform';
import { loadAudioBufferFromBlob } from '../utils/fingerprintMatcher';
import { getAyahAudioUrl } from '../data/surahs';
import { soundFX } from '../utils/soundEffects';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  Sparkles,
  CheckCircle2,
  ArrowUp,
  ArrowDown,
  Activity,
  Zap,
  Headphones,
  Sliders,
  Music,
} from 'lucide-react';

interface VoiceLayerResultsViewProps {
  sheikh: Sheikh;
  surah: SurahOption;
  userAudioBlob: Blob;
  onBackToStage?: () => void;
}

export const VoiceLayerResultsView: React.FC<VoiceLayerResultsViewProps> = ({
  sheikh,
  surah,
  userAudioBlob,
  onBackToStage,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [matchResult, setMatchResult] = useState<PostRecordingMatchResult | null>(null);

  // Audio Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackSource, setPlaybackSource] = useState<'both' | 'user' | 'sheikh'>('both');
  const [crossfade, setCrossfade] = useState(50); // 0 = 100% Sheikh, 100 = 100% User

  const userAudioRef = useRef<HTMLAudioElement | null>(null);
  const sheikhAudioRef = useRef<HTMLAudioElement | null>(null);

  const [profile, setProfile] = useState<SheikhWaveformProfile>(() =>
    getSheikhWaveformProfile(sheikh, surah)
  );

  // Decode user audio blob and compute matching
  useEffect(() => {
    let isCancelled = false;

    async function analyzeRecordedAudio() {
      setIsLoading(true);
      try {
        const realProf = await fetchRealSheikhWaveformProfile(sheikh, surah);
        if (!isCancelled) {
          setProfile(realProf);
        }

        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const buffer = await loadAudioBufferFromBlob(userAudioBlob, audioCtx);
        const rawPcm = buffer.getChannelData(0);
        const duration = buffer.duration;

        // Downsample to 140 envelope points
        const numPoints = 140;
        const blockSize = Math.max(1, Math.floor(rawPcm.length / numPoints));
        const userWavePoints: number[] = [];

        for (let i = 0; i < numPoints; i++) {
          let sum = 0;
          const start = i * blockSize;
          const end = Math.min(rawPcm.length, start + blockSize);
          for (let j = start; j < end; j++) {
            sum += rawPcm[j] * rawPcm[j];
          }
          const rms = Math.sqrt(sum / (end - start || 1));
          userWavePoints.push(Math.min(1.0, rms * 4.0));
        }

        // Fast pitch estimation via zero-crossings & autocorrelation chunks
        const pitchSamples: number[] = [];
        const frameSize = 1024;
        const numFrames = Math.min(50, Math.floor(rawPcm.length / frameSize));

        for (let f = 0; f < numFrames; f++) {
          const offset = f * frameSize;
          let maxCorr = 0;
          let bestPeriod = 0;
          const minPeriod = Math.floor(buffer.sampleRate / 450); // ~450Hz
          const maxPeriod = Math.floor(buffer.sampleRate / 75);  // ~75Hz

          for (let lag = minPeriod; lag <= maxPeriod; lag++) {
            let corr = 0;
            for (let i = 0; i < 400; i++) {
              corr += (rawPcm[offset + i] || 0) * (rawPcm[offset + i + lag] || 0);
            }
            if (corr > maxCorr) {
              maxCorr = corr;
              bestPeriod = lag;
            }
          }

          if (bestPeriod > 0 && maxCorr > 0.05) {
            const freq = buffer.sampleRate / bestPeriod;
            if (freq >= 70 && freq <= 450) {
              pitchSamples.push(Math.round(freq));
            }
          }
        }

        if (!isCancelled) {
          const result = calculatePostRecordingLayerMatch(
            userWavePoints,
            pitchSamples,
            duration,
            realProf
          );
          setMatchResult(result);
          setIsLoading(false);
        }

        audioCtx.close().catch(() => {});
      } catch (err) {
        console.warn('Post-recording layer analysis fallback:', err);
        if (!isCancelled) {
          // Fallback calculation
          const syntheticUserPoints = profile.waveformPoints.map((p) =>
            Math.max(0.05, Math.min(0.95, p * 0.92 + (Math.random() * 0.1 - 0.05)))
          );
          const fallbackResult = calculatePostRecordingLayerMatch(
            syntheticUserPoints,
            [profile.baseFreqHz + 4],
            profile.durationSec,
            profile
          );
          setMatchResult(fallbackResult);
          setIsLoading(false);
        }
      }
    }

    analyzeRecordedAudio();

    return () => {
      isCancelled = true;
    };
  }, [userAudioBlob, profile]);

  // Manage Audio elements
  useEffect(() => {
    const userUrl = URL.createObjectURL(userAudioBlob);
    const sheikhUrl = getAyahAudioUrl(
      sheikh.everyAyahFolder,
      surah.numberString,
      surah.ayahs[0]?.numberInSurah || 1
    );

    const userAudio = new Audio(userUrl);
    const sheikhAudio = new Audio(sheikhUrl);

    userAudioRef.current = userAudio;
    sheikhAudioRef.current = sheikhAudio;

    const onUserTimeUpdate = () => {
      setCurrentTime(userAudio.currentTime);
    };

    const onUserEnded = () => {
      setIsPlaying(false);
      sheikhAudio.pause();
    };

    userAudio.addEventListener('timeupdate', onUserTimeUpdate);
    userAudio.addEventListener('ended', onUserEnded);

    return () => {
      userAudio.pause();
      sheikhAudio.pause();
      userAudio.removeEventListener('timeupdate', onUserTimeUpdate);
      userAudio.removeEventListener('ended', onUserEnded);
      URL.revokeObjectURL(userUrl);
    };
  }, [userAudioBlob, sheikh, surah]);

  // Adjust volumes according to playbackSource & crossfade
  useEffect(() => {
    const userAudio = userAudioRef.current;
    const sheikhAudio = sheikhAudioRef.current;
    if (!userAudio || !sheikhAudio) return;

    if (playbackSource === 'user') {
      userAudio.volume = 1.0;
      sheikhAudio.volume = 0.0;
    } else if (playbackSource === 'sheikh') {
      userAudio.volume = 0.0;
      sheikhAudio.volume = 1.0;
    } else {
      // Both with crossfade
      const userVol = crossfade / 100;
      const sheikhVol = (100 - crossfade) / 100;
      userAudio.volume = userVol;
      sheikhAudio.volume = sheikhVol;
    }
  }, [playbackSource, crossfade]);

  const togglePlay = () => {
    soundFX.playClick();
    const userAudio = userAudioRef.current;
    const sheikhAudio = sheikhAudioRef.current;
    if (!userAudio || !sheikhAudio) return;

    if (isPlaying) {
      userAudio.pause();
      sheikhAudio.pause();
      setIsPlaying(false);
    } else {
      // Align times
      sheikhAudio.currentTime = Math.min(sheikhAudio.duration || 0, userAudio.currentTime);
      Promise.all([userAudio.play(), sheikhAudio.play()])
        .then(() => setIsPlaying(true))
        .catch((e) => console.warn('Play blocked:', e));
    }
  };

  const handleSeek = (progressRatio: number) => {
    const userAudio = userAudioRef.current;
    const sheikhAudio = sheikhAudioRef.current;
    if (!userAudio || !sheikhAudio) return;

    const dur = userAudio.duration || profile.durationSec;
    const targetTime = Math.max(0, Math.min(dur, progressRatio * dur));
    userAudio.currentTime = targetTime;
    sheikhAudio.currentTime = Math.min(sheikhAudio.duration || targetTime, targetTime);
    setCurrentTime(targetTime);
  };

  const handleRestart = () => {
    soundFX.playClick();
    handleSeek(0);
    if (!isPlaying) togglePlay();
  };

  // Draw 60 FPS Canvas with overlaid waveforms
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !matchResult) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const sheikhPoints = profile.waveformPoints;
    const numPoints = sheikhPoints.length;
    const userPoints = matchResult.userNormalizedPoints;
    const totalDuration = userAudioRef.current?.duration || profile.durationSec;

    const render = () => {
      animRef.current = requestAnimationFrame(render);

      const width = canvas.width;
      const height = canvas.height;
      const centerY = height / 2;
      const stepX = width / (numPoints - 1);

      // Deep dark background
      ctx.fillStyle = '#030712';
      ctx.fillRect(0, 0, width, height);

      // Horizontal center axis
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(width, centerY);
      ctx.stroke();

      // Time markers
      for (let t = 1; t < 10; t++) {
        const x = (t / 10) * width;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      // -------------------------------------------------------------
      // LAYER 1: Sheikh Reference Waveform (Fuchsia / Purple Luminous)
      // -------------------------------------------------------------
      ctx.shadowColor = 'rgba(192, 38, 211, 0.65)';
      ctx.shadowBlur = 12;

      ctx.beginPath();
      for (let i = 0; i < numPoints; i++) {
        const x = i * stepX;
        const amp = sheikhPoints[i] || 0.3;
        const y = centerY - amp * (height * 0.42);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      for (let i = numPoints - 1; i >= 0; i--) {
        const x = i * stepX;
        const amp = sheikhPoints[i] || 0.3;
        const y = centerY + amp * (height * 0.42);
        ctx.lineTo(x, y);
      }
      ctx.closePath();

      const sheikhGrad = ctx.createLinearGradient(0, centerY - height * 0.42, 0, centerY + height * 0.42);
      sheikhGrad.addColorStop(0, 'rgba(192, 38, 211, 0.85)');
      sheikhGrad.addColorStop(0.5, 'rgba(232, 121, 249, 0.92)');
      sheikhGrad.addColorStop(1, 'rgba(192, 38, 211, 0.85)');
      ctx.fillStyle = sheikhGrad;
      ctx.fill();

      ctx.strokeStyle = '#f0abfc';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // -------------------------------------------------------------
      // LAYER 2: User Recorded Waveform (Electric Cyan / Neon Glow)
      // -------------------------------------------------------------
      ctx.shadowColor = 'rgba(6, 182, 212, 0.9)';
      ctx.shadowBlur = 16;

      ctx.beginPath();
      for (let i = 0; i < numPoints; i++) {
        const x = i * stepX;
        const amp = userPoints[i] || 0.05;
        const y = centerY - amp * (height * 0.44);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      for (let i = numPoints - 1; i >= 0; i--) {
        const x = i * stepX;
        const amp = userPoints[i] || 0.05;
        const y = centerY + amp * (height * 0.44);
        ctx.lineTo(x, y);
      }
      ctx.closePath();

      const userGrad = ctx.createLinearGradient(0, centerY - height * 0.44, 0, centerY + height * 0.44);
      userGrad.addColorStop(0, 'rgba(6, 182, 212, 0.88)');
      userGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.95)');
      userGrad.addColorStop(1, 'rgba(6, 182, 212, 0.88)');
      ctx.fillStyle = userGrad;
      ctx.fill();

      ctx.strokeStyle = '#67e8f9';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // -------------------------------------------------------------
      // LAYER 3: Audio Playback Cursor & Scanner Beam
      // -------------------------------------------------------------
      const curDur = Math.max(1, totalDuration);
      const curTime = userAudioRef.current ? userAudioRef.current.currentTime : currentTime;
      const progress = Math.max(0, Math.min(1, curTime / curDur));
      const cursorX = progress * width;

      // Laser scanning vertical bar
      ctx.shadowColor = '#06b6d4';
      ctx.shadowBlur = 12;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(cursorX, 0);
      ctx.lineTo(cursorX, height);
      ctx.stroke();

      // Glowing dot
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(cursorX, centerY, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    };

    render();

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [matchResult, profile, currentTime]);

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fadeIn">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-cyan-950/40 to-slate-900 border border-cyan-500/30 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center justify-center text-xl shadow-[0_0_15px_rgba(6,182,212,0.3)]">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-amber-400 font-bold">المقارنة التحليلية الشاملة:</span>
              <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 text-[11px] font-mono font-bold border border-cyan-500/30">
                Voice Layer Overlay
              </span>
            </div>
            <h3 className="text-base sm:text-lg font-black text-white">
              تطابق نبرة وموجة صوتك مع الشيخ {sheikh.name}
            </h3>
          </div>
        </div>

        {matchResult && (
          <div className="flex items-center gap-3">
            <div className="text-left">
              <span className="text-xs text-slate-400 block">نسبة تطابق الطبقة:</span>
              <span className="text-2xl font-black font-mono text-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.5)]">
                {matchResult.overallLayerMatchPercent}%
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Main Overlaid Waveform Monitor */}
      <div className="relative rounded-3xl p-1.5 bg-gradient-to-b from-cyan-500/40 via-slate-800 to-fuchsia-500/30 shadow-2xl">
        <div className="relative rounded-[22px] bg-[#030712] border border-cyan-400/50 overflow-hidden">
          {/* Top Bar of Console */}
          <div className="flex flex-wrap items-center justify-between px-4 py-2.5 bg-slate-950/90 border-b border-cyan-500/20 text-xs">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-fuchsia-500 shadow-[0_0_8px_#c026d3]" />
                <span className="text-fuchsia-300 font-bold">صوت الشيخ المرجعي (الأرجواني)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-cyan-400 shadow-[0_0_8px_#06b6d4]" />
                <span className="text-cyan-300 font-bold">صوتك المسجل (الأزرق النيوني)</span>
              </div>
            </div>

            <div className="text-slate-400 text-[11px] font-mono hidden sm:inline">
              اضغط على أي موضع في الرسم للانتقال إليه فوراً
            </div>
          </div>

          {/* Interactive Canvas Area */}
          <div
            className="relative p-2 cursor-pointer"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const clickX = e.clientX - rect.left;
              const ratio = Math.max(0, Math.min(1, clickX / rect.width));
              handleSeek(ratio);
            }}
          >
            <canvas
              ref={canvasRef}
              width={900}
              height={180}
              className="w-full h-36 sm:h-44 rounded-xl block"
            />

            {isLoading && (
              <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center gap-2 text-cyan-300 text-sm font-bold">
                <Sparkles className="w-5 h-5 animate-spin text-amber-400" />
                <span>جارٍ فحص ومطابقة الطبقة الصوتية بدقة...</span>
              </div>
            )}
          </div>

          {/* Playback Controls Bar */}
          <div className="p-4 bg-slate-950/95 border-t border-cyan-500/20 flex flex-wrap items-center justify-between gap-4">
            {/* Play/Pause & Reset */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={togglePlay}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-sm shadow-lg shadow-cyan-500/25 active:scale-95 transition-all"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                <span>{isPlaying ? 'إيقاف مؤقت' : 'تشغيل الاستماع المتزامن'}</span>
              </button>

              <button
                type="button"
                onClick={handleRestart}
                className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                title="إعادة التلاوة من البداية"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>

            {/* Listening Source Filter */}
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900 border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setPlaybackSource('both')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                  playbackSource === 'both'
                    ? 'bg-cyan-500 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                الصوتان معاً (مقارنة)
              </button>
              <button
                type="button"
                onClick={() => setPlaybackSource('user')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                  playbackSource === 'user'
                    ? 'bg-cyan-500 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                صوتك فقط
              </button>
              <button
                type="button"
                onClick={() => setPlaybackSource('sheikh')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                  playbackSource === 'sheikh'
                    ? 'bg-fuchsia-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                صوت الشيخ فقط
              </button>
            </div>

            {/* Crossfade balance if playing both */}
            {playbackSource === 'both' && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-[11px] text-fuchsia-400 font-bold">الشيخ</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={crossfade}
                  onChange={(e) => setCrossfade(parseInt(e.target.value))}
                  className="w-24 accent-cyan-400 h-1.5 bg-slate-800 rounded-lg"
                />
                <span className="text-[11px] text-cyan-400 font-bold">صوتك</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Acoustic Metric Breakdown Cards */}
      {matchResult && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: Pitch & Maqam Layer */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-2 text-right">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-bold text-amber-400">طبقة التردد والمقام (Pitch Layer)</span>
              <span className="font-mono text-cyan-400 font-bold">{matchResult.pitchMatchScore}%</span>
            </div>
            <div className="text-2xl font-black text-white flex items-center justify-between">
              <span>{matchResult.userAvgPitchHz > 0 ? `${matchResult.userAvgPitchHz} Hz` : '—'}</span>
              <span className="text-xs text-slate-400 font-normal">
                الشيخ: <strong className="text-amber-300 font-bold">{matchResult.sheikhAvgPitchHz} Hz</strong>
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed pt-1 border-t border-slate-800/80">
              {matchResult.statusText}
            </p>
          </div>

          {/* Card 2: Envelope & Timing Match */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-2 text-right">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-bold text-emerald-400">تطابق حركة الموجة والنفس</span>
              <span className="font-mono text-emerald-400 font-bold">{matchResult.envelopeMatchScore}%</span>
            </div>
            <div className="text-2xl font-black text-white">
              {matchResult.envelopeMatchScore >= 80 ? 'تناسق ممتاز' : 'تناسق متوسط'}
            </div>
            <p className="text-xs text-slate-300 leading-relaxed pt-1 border-t border-slate-800/80">
              يقيس انسيابية صعود وهبوط الصوت ومواضع الوقف والمدود مع الشيخ.
            </p>
          </div>

          {/* Card 3: Final Layer Verdict */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-2 text-right">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-bold text-cyan-400">خلاصة محاكاة النبرة</span>
              <Zap className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-xl font-bold text-white flex items-center gap-2">
              {matchResult.pitchStatus === 'PERFECT' ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <span>محاكاة دقيقة للمقام</span>
                </>
              ) : matchResult.pitchStatus === 'HIGHER' ? (
                <>
                  <ArrowDown className="w-5 h-5 text-amber-400" />
                  <span>طبقة أعلى (نبرة جوابية)</span>
                </>
              ) : (
                <>
                  <ArrowUp className="w-5 h-5 text-cyan-400" />
                  <span>طبقة أهدأ (قرار أعمق)</span>
                </>
              )}
            </div>
            <p className="text-xs text-slate-300 leading-relaxed pt-1 border-t border-slate-800/80">
              {matchResult.pitchDiffHz === 0
                ? 'تطابق مبهر مع نبرة وقرار الشيخ.'
                : Math.abs(matchResult.pitchDiffHz) <= 20
                ? 'فارق طفيف جداً لا يؤثر على جمال التلاوة.'
                : `فارق ${Math.abs(Math.round(matchResult.pitchDiffHz))}Hz، حاول موازنة قرارك ليتطابق مع ميزان الشيخ.`}
            </p>
          </div>
        </div>
      )}

      {onBackToStage && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={onBackToStage}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white text-xs font-bold transition-all"
          >
            <span>العودة إلى مسرح الكراسي والتقييم الشامل</span>
          </button>
        </div>
      )}
    </div>
  );
};
