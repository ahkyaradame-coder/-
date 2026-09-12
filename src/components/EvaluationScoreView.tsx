import React, { useEffect, useState, useRef } from 'react';
import confetti from 'canvas-confetti';
import {
  Trophy,
  Award,
  Sparkles,
  RotateCcw,
  Play,
  Pause,
  Share2,
  CheckCircle2,
  Flame,
  ArrowRight,
  Music,
  Heart,
  Volume2,
  VolumeX,
  AlertTriangle,
  XCircle,
  Check,
  Fingerprint,
  Activity,
} from 'lucide-react';
import { EvaluationResult, Sheikh, SurahOption } from '../types';
import { soundFX } from '../utils/soundEffects';
import { getAyahAudioUrl } from '../data/surahs';
import { AudioFingerprintDetector } from './AudioFingerprintDetector';
import { VoiceLayerResultsView } from './VoiceLayerResultsView';

interface EvaluationScoreViewProps {
  evaluation: EvaluationResult;
  sheikh: Sheikh;
  surah: SurahOption;
  userAudioBlob: Blob;
  onRetry: () => void;
  onSelectAnotherSheikh: () => void;
  onSelectAnotherSurah: () => void;
}

export const EvaluationScoreView: React.FC<EvaluationScoreViewProps> = ({
  evaluation,
  sheikh,
  surah,
  userAudioBlob,
  onRetry,
  onSelectAnotherSheikh,
  onSelectAnotherSurah,
}) => {
  const [displayedScore, setDisplayedScore] = useState(0);
  const [activeChairs, setActiveChairs] = useState(0);
  const [isPlayingUserAudio, setIsPlayingUserAudio] = useState(false);
  const [isPlayingSheikhAudio, setIsPlayingSheikhAudio] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [showCertificate, setShowCertificate] = useState(false);
  const [activeViewMode, setActiveViewMode] = useState<'stage' | 'layer' | 'fingerprint'>('stage');

  const userAudioRef = useRef<HTMLAudioElement | null>(null);
  const sheikhAudioRef = useRef<HTMLAudioElement | null>(null);
  const userAudioUrlRef = useRef<string | null>(null);

  const isInvalid = evaluation.isRecitationValid === false || evaluation.overallScore < 40 || evaluation.turnedChairs === 0;
  const isSilence = evaluation.detectionType === 'silence' || evaluation.overallScore === 0;
  const isSinging = evaluation.detectionType === 'singing_non_quranic';

  // Initialize audio URLs
  useEffect(() => {
    const userUrl = URL.createObjectURL(userAudioBlob);
    userAudioUrlRef.current = userUrl;

    if (userAudioRef.current) {
      userAudioRef.current.src = userUrl;
    }

    const sheikhUrl = getAyahAudioUrl(
      sheikh.everyAyahFolder,
      surah.numberString,
      surah.ayahs[0].numberInSurah
    );
    if (sheikhAudioRef.current) {
      sheikhAudioRef.current.src = sheikhUrl;
    }

    return () => {
      URL.revokeObjectURL(userUrl);
    };
  }, [userAudioBlob, sheikh, surah]);

  // Entrance evaluation sequence
  useEffect(() => {
    const totalChairs = evaluation.turnedChairs;

    if (isInvalid || totalChairs === 0) {
      // Failure / silence / non-quranic: play fail buzzer, no chairs turn, no confetti
      setActiveChairs(0);
      setDisplayedScore(evaluation.overallScore);
      const timer = setTimeout(() => {
        soundFX.playFailBuzzer();
      }, 400);
      return () => clearTimeout(timer);
    }

    // Valid recitation with turned chairs:
    // 1. Chairs turn sequentially with iconic buzzer sounds
    for (let i = 1; i <= totalChairs; i++) {
      setTimeout(() => {
        setActiveChairs(i);
        soundFX.playChairTurnSound();
      }, i * 650);
    }

    // 2. Animate counter up to overallScore
    const duration = 1800;
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, elapsed / duration);
      const current = Math.round(progress * evaluation.overallScore);
      setDisplayedScore(current);

      if (progress >= 1) {
        clearInterval(interval);
        // Celebration fanfare & confetti burst only for genuine scores
        soundFX.playCelebrationSound();
        try {
          confetti({
            particleCount: 80,
            spread: 90,
            origin: { y: 0.6 },
            colors: ['#f59e0b', '#fbbf24', '#10b981', '#ffffff'],
          });
        } catch (e) {}
      }
    }, 25);

    return () => clearInterval(interval);
  }, [evaluation, isInvalid]);

  const toggleUserAudio = () => {
    soundFX.playClick();
    if (!userAudioRef.current) return;

    if (isPlayingUserAudio) {
      userAudioRef.current.pause();
      setIsPlayingUserAudio(false);
    } else {
      if (sheikhAudioRef.current) {
        sheikhAudioRef.current.pause();
        setIsPlayingSheikhAudio(false);
      }
      userAudioRef.current.play().then(() => {
        setIsPlayingUserAudio(true);
      }).catch((err) => console.warn(err));
    }
  };

  const toggleSheikhAudio = () => {
    soundFX.playClick();
    if (!sheikhAudioRef.current) return;

    if (isPlayingSheikhAudio) {
      sheikhAudioRef.current.pause();
      setIsPlayingSheikhAudio(false);
    } else {
      if (userAudioRef.current) {
        userAudioRef.current.pause();
        setIsPlayingUserAudio(false);
      }
      sheikhAudioRef.current.play().then(() => {
        setIsPlayingSheikhAudio(true);
      }).catch((err) => console.warn(err));
    }
  };

  const handleShare = () => {
    soundFX.playClick();
    const text = `حققت نسبة تطابق ${evaluation.overallScore}% في تقليد صوت ${sheikh.name} في ${surah.nameArabic} على The Choice Voice! 🎙️🌟`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
    }
  };

  // 4 Virtual Chairs definitions like The Voice
  const coaches = [
    { id: 1, name: 'كرسي التحقيق والتجويد', avatar: '📖', subtitle: 'مدرسة الإتقان' },
    { id: 2, name: 'كرسي المقامات والنغم', avatar: '🎵', subtitle: 'مدرسة الشجن والروح' },
    { id: 3, name: 'كرسي الخشوع ونبرة الصوت', avatar: '🌙', subtitle: 'مدرسة التأثير' },
    { id: 4, name: 'كرسي الترتيل والوقف', avatar: '✨', subtitle: 'مدرسة الانسيابية' },
  ];

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <audio
        ref={userAudioRef}
        onEnded={() => setIsPlayingUserAudio(false)}
        preload="auto"
      />
      <audio
        ref={sheikhAudioRef}
        onEnded={() => setIsPlayingSheikhAudio(false)}
        preload="auto"
      />

      {/* Top Navigation Tabs: Stage vs Voice Layer vs Acoustic Content ID Detector */}
      <div className="flex items-center justify-center">
        <div className="inline-flex flex-wrap items-center justify-center p-1.5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl gap-2">
          <button
            id="tab-stage-view-btn"
            onClick={() => {
              soundFX.playClick();
              setActiveViewMode('stage');
            }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all ${
              activeViewMode === 'stage'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/25'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Trophy className="w-4 h-4" />
            <span>مسرح التحكيم والكراسي</span>
          </button>

          <button
            id="tab-layer-view-btn"
            onClick={() => {
              soundFX.playClick();
              setActiveViewMode('layer');
            }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all relative ${
              activeViewMode === 'layer'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 shadow-md shadow-cyan-500/25 font-black'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>موجة وتطابق الطبقة الصوتية</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-400/20 text-cyan-300 font-bold border border-cyan-400/30">
              تطابق الطبقة
            </span>
          </button>

          <button
            id="tab-fingerprint-view-btn"
            onClick={() => {
              soundFX.playClick();
              setActiveViewMode('fingerprint');
            }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all relative ${
              activeViewMode === 'fingerprint'
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/25'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Fingerprint className="w-4 h-4" />
            <span>كاشف البصمة وحقوق النبرة (Content ID)</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 font-black">
              رادار التردد
            </span>
          </button>
        </div>
      </div>

      {activeViewMode === 'fingerprint' ? (
        <AudioFingerprintDetector
          sheikh={sheikh}
          surah={surah}
          userAudioBlob={userAudioBlob}
          onBackToStage={() => setActiveViewMode('stage')}
        />
      ) : activeViewMode === 'layer' ? (
        <VoiceLayerResultsView
          sheikh={sheikh}
          surah={surah}
          userAudioBlob={userAudioBlob}
          onBackToStage={() => setActiveViewMode('stage')}
        />
      ) : (
        /* Main Arena Box */
        <div
          className={`relative overflow-hidden rounded-3xl bg-gradient-to-b from-slate-900 via-slate-950 to-slate-950 border p-6 sm:p-10 shadow-2xl text-center ${
            isInvalid ? 'border-red-500/40' : 'border-amber-500/40'
          }`}
        >
        {/* Spotlights behind */}
        <div
          className={`absolute top-0 left-1/3 -translate-x-1/2 w-96 h-96 rounded-full blur-3xl pointer-events-none ${
            isInvalid ? 'bg-red-500/10' : 'bg-amber-500/15'
          }`}
        />
        <div
          className={`absolute top-0 right-1/3 translate-x-1/2 w-96 h-96 rounded-full blur-3xl pointer-events-none ${
            isInvalid ? 'bg-rose-500/10' : 'bg-yellow-500/10'
          }`}
        />

        {/* Header Tag */}
        <div
          className={`relative z-10 inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs sm:text-sm font-black mb-4 shadow-lg ${
            isInvalid
              ? 'bg-red-500/15 text-red-300 border border-red-500/40 shadow-red-500/10'
              : 'bg-amber-500/15 text-amber-300 border border-amber-500/40 shadow-amber-500/10'
          }`}
        >
          {isInvalid ? (
            <XCircle className="w-4 h-4 text-red-400" />
          ) : (
            <Sparkles className="w-4 h-4 text-amber-400 animate-spin" />
          )}
          <span>
            {isInvalid
              ? 'نتيجة التقييم الصوتي: لم يتم اجتياز مرحلة الكراسي'
              : 'نتيجة المحاكاة في مسرح The Choice Voice'}
          </span>
        </div>

        {/* Prominent Truthful Alert Banners */}
        {isSilence && (
          <div
            id="silence-alert-banner"
            className="relative z-10 my-4 p-4 rounded-2xl bg-red-950/80 border border-red-500/60 text-red-200 text-sm flex items-center gap-3 text-right"
          >
            <div className="w-10 h-10 rounded-xl bg-red-500/20 text-red-400 flex items-center justify-center shrink-0 text-xl font-bold">
              <VolumeX className="w-6 h-6" />
            </div>
            <div>
              <strong className="block text-red-300 font-bold text-base">
                🔇 تسجيل صامت تماماً (النتيجة: 0%)
              </strong>
              <p className="text-xs text-red-200/90 mt-0.5">
                لم يتم رصد أي صوت أو تلاوة قرآنية في التسجيل! يرجى التأكد من تشغيل الميكروفون
                والقراءة بصوت واضح ومسموع.
              </p>
            </div>
          </div>
        )}

        {isSinging && (
          <div
            id="singing-alert-banner"
            className="relative z-10 my-4 p-4 rounded-2xl bg-amber-950/90 border border-amber-500/70 text-amber-200 text-sm flex items-center gap-3 text-right"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 text-xl font-bold">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <strong className="block text-amber-300 font-bold text-base">
                ⚠️ تم رصد غناء أو كلام غير قرآني! (النتيجة: {evaluation.overallScore}%)
              </strong>
              <p className="text-xs text-amber-200/90 mt-0.5">
                هذه المنصة مخصصة حصرياً لتلاوة القرآن الكريم ومحاكاة القراء المعتمدين. لم يتم قبول
                الغناء أو الحديث العادي.
              </p>
            </div>
          </div>
        )}

        {isInvalid && !isSilence && !isSinging && (
          <div
            id="fail-alert-banner"
            className="relative z-10 my-4 p-4 rounded-2xl bg-slate-900/90 border border-red-500/40 text-slate-200 text-sm flex items-center gap-3 text-right"
          >
            <div className="w-10 h-10 rounded-xl bg-red-500/20 text-red-400 flex items-center justify-center shrink-0 text-xl font-bold">
              <XCircle className="w-6 h-6" />
            </div>
            <div>
              <strong className="block text-red-300 font-bold text-base">
                لم يلتف أي كرسي ({evaluation.overallScore}%)
              </strong>
              <p className="text-xs text-slate-300 mt-0.5">
                الصوت المسجل لم يطابق تلاوة الشيخ أو كان غير واضح. أعد المحاولة بترتيل الآيات بدقة.
              </p>
            </div>
          </div>
        )}

        {/* Audio Detected Text proof */}
        {evaluation.audioDetectedText && (
          <div className="relative z-10 inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px] text-slate-400 mb-4">
            <span className="text-amber-400 font-bold">ما رصده المحكّم في التسجيل:</span>
            <span className="text-slate-200">"{evaluation.audioDetectedText}"</span>
          </div>
        )}

        {/* Trophy Title */}
        <h1 className="relative z-10 text-2xl sm:text-4xl font-black text-white tracking-tight mb-1">
          {evaluation.vocalTrophyTitle}
        </h1>
        <p className="relative z-10 text-xs sm:text-sm text-slate-300 mb-6">
          محاكاة تلاوة الشيخ <strong className="text-amber-400">{sheikh.name}</strong> في{' '}
          <strong className="text-amber-400">{surah.nameArabic}</strong>
        </p>

        {/* The 4 "The Voice" Chairs Section */}
        <div className="relative z-10 my-6 p-4 sm:p-6 rounded-2xl bg-slate-950/80 border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-amber-400" />
              <span>كراسي التحكيم الأربعة (I WANT YOU):</span>
            </span>
            <span
              className={`text-xs font-extrabold px-2.5 py-1 rounded-full border ${
                activeChairs > 0
                  ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                  : 'text-red-400 bg-red-500/10 border-red-500/30'
              }`}
            >
              {activeChairs > 0
                ? `التف لك ${activeChairs} من ٤ كراسي!`
                : 'لم يلتف أي كرسي (0 من 4)'}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {coaches.map((coach) => {
              const isTurned = coach.id <= activeChairs;
              return (
                <div
                  key={coach.id}
                  id={`chair-${coach.id}`}
                  className={`relative p-3.5 rounded-2xl transition-all duration-700 flex flex-col items-center justify-center border ${
                    isTurned
                      ? 'bg-gradient-to-b from-amber-950/70 via-slate-900 to-amber-950/40 border-amber-400 ring-2 ring-amber-400/40 shadow-xl shadow-amber-500/20 scale-105'
                      : 'bg-slate-900/50 border-slate-800 opacity-50 grayscale'
                  }`}
                >
                  {/* Glowing buzzer light */}
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl mb-2 transition-all ${
                      isTurned
                        ? 'bg-gradient-to-br from-amber-400 to-yellow-600 text-slate-950 shadow-lg shadow-amber-500/40 rotate-0'
                        : 'bg-slate-800 text-slate-400 rotate-180'
                    }`}
                  >
                    <span>{coach.avatar}</span>
                  </div>

                  <div className="text-center">
                    <span
                      className={`text-xs font-extrabold block ${
                        isTurned ? 'text-amber-300' : 'text-slate-500'
                      }`}
                    >
                      {coach.name}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      {isTurned ? 'التف الكرسي لك! 🌟' : 'لم يلتف (0)'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Big Circular Score Percentage Ring */}
        <div className="relative z-10 flex flex-col items-center justify-center my-6">
          <div className="relative w-48 h-48 sm:w-56 sm:h-56 flex items-center justify-center">
            {/* SVG Circle Progress */}
            <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="42"
                stroke="currentColor"
                strokeWidth="7"
                fill="transparent"
                className="text-slate-800"
              />
              <circle
                cx="50"
                cy="50"
                r="42"
                stroke={isInvalid ? 'url(#red-gradient)' : 'url(#amber-gradient)'}
                strokeWidth="8"
                strokeDasharray={264}
                strokeDashoffset={264 - (264 * Math.max(0, displayedScore)) / 100}
                strokeLinecap="round"
                fill="transparent"
                className="transition-all duration-300"
              />
              <defs>
                <linearGradient id="amber-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#f59e0b" />
                  <stop offset="50%" stopColor="#eab308" />
                  <stop offset="100%" stopColor="#fbbf24" />
                </linearGradient>
                <linearGradient id="red-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#ef4444" />
                  <stop offset="100%" stopColor="#f87171" />
                </linearGradient>
              </defs>
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span
                className={`text-4xl sm:text-6xl font-black tracking-tight ${
                  isInvalid ? 'text-red-400' : 'text-white'
                }`}
              >
                {displayedScore}
                <span className="text-2xl sm:text-3xl text-amber-400">%</span>
              </span>
              <span className="text-xs sm:text-sm font-bold text-slate-300 mt-1">
                {isInvalid ? 'النتيجة المستحقة' : 'نسبة التطابق مع الشيخ'}
              </span>
            </div>
          </div>
        </div>

        {/* Dual Audio Comparison Player: Sheikh vs Your Voice */}
        <div className="relative z-10 my-6 p-4 sm:p-5 rounded-2xl bg-slate-900/90 border border-slate-800">
          <h3 className="text-xs font-bold text-slate-300 mb-3 flex items-center justify-center gap-1.5">
            <Volume2 className="w-4 h-4 text-amber-400" />
            <span>مقارنة الأداء: استمع لصوتك مقارنةً بصوت الشيخ:</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Sheikh Audio Player */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl bg-gradient-to-br ${sheikh.avatarGradient} flex items-center justify-center text-base`}
                >
                  {sheikh.imagePlaceholder}
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-amber-400 font-bold block">تلاوة الشيخ الأصلي</span>
                  <span className="text-xs font-bold text-white">{sheikh.name}</span>
                </div>
              </div>

              <button
                id="play-sheikh-compare-btn"
                onClick={toggleSheikhAudio}
                className="p-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition-colors"
              >
                {isPlayingSheikhAudio ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
              </button>
            </div>

            {/* User Audio Player */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-amber-500/30 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-amber-600 flex items-center justify-center text-white text-base">
                  🎙️
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-amber-400 font-bold block">تسجيل صوتك المقلّد</span>
                  <span className="text-xs font-bold text-white">
                    {isSilence ? 'تسجيل صامت' : 'تلاوتك للمقطع'}
                  </span>
                </div>
              </div>

              <button
                id="play-user-compare-btn"
                onClick={toggleUserAudio}
                className="p-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold hover:bg-amber-400 transition-colors shadow-md shadow-amber-500/20"
              >
                {isPlayingUserAudio ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
              </button>
            </div>
          </div>
        </div>

        {/* 4 Detail Metric Bars */}
        <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 gap-3 text-right">
          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-bold text-slate-200">أحكام التجويد والمدود والمخارج</span>
              <span className="font-extrabold text-amber-400">{evaluation.tajweedScore}%</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className="bg-amber-500 h-full rounded-full transition-all duration-1000"
                style={{ width: `${evaluation.tajweedScore}%` }}
              />
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-bold text-slate-200">المقام الصوتي والنغم والشجن</span>
              <span className="font-extrabold text-amber-400">{evaluation.maqamScore}%</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className="bg-yellow-400 h-full rounded-full transition-all duration-1000"
                style={{ width: `${evaluation.maqamScore}%` }}
              />
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-bold text-slate-200">الإيقاع وسرعة الترتيل والتنفس</span>
              <span className="font-extrabold text-amber-400">{evaluation.rhythmScore}%</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className="bg-emerald-400 h-full rounded-full transition-all duration-1000"
                style={{ width: `${evaluation.rhythmScore}%` }}
              />
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-bold text-slate-200">خامة الصوت والخشوع والروحانية</span>
              <span className="font-extrabold text-amber-400">{evaluation.toneScore}%</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className="bg-cyan-400 h-full rounded-full transition-all duration-1000"
                style={{ width: `${evaluation.toneScore}%` }}
              />
            </div>
          </div>
        </div>

        {/* Voice Layer Overlay Action Banner */}
        <div className="relative z-10 mt-5 p-4 rounded-2xl bg-gradient-to-r from-slate-950 via-cyan-950/40 to-slate-950 border border-cyan-500/40 flex flex-wrap items-center justify-between gap-3 text-right shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-300 flex items-center justify-center text-lg border border-cyan-500/40 shadow-[0_0_10px_rgba(6,182,212,0.25)]">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-white">رسم وتطابق الطبقة الصوتية مع الشيخ</div>
              <p className="text-[11px] text-slate-400">
                شاهد موجة تلاوتك (بالأزرق النيوني) متراكبة على موجة الشيخ (بالأرجواني) مع فحص التردد بالهرتز
              </p>
            </div>
          </div>

          <button
            type="button"
            id="view-layer-overlay-btn"
            onClick={() => {
              soundFX.playClick();
              setActiveViewMode('layer');
            }}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs shadow-md shadow-cyan-500/25 transition-all"
          >
            عرض الرسم والموجة المتطابقة ⚡
          </button>
        </div>

        {/* Coach Feedback Box */}
        <div
          className={`relative z-10 mt-6 p-5 rounded-2xl text-right border ${
            isInvalid
              ? 'bg-red-950/20 border-red-500/30'
              : 'bg-amber-950/30 border-amber-500/30'
          }`}
        >
          <h4 className="text-xs sm:text-sm font-bold text-amber-300 mb-2 flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-400" />
            <span>حكم وتعليق محكّمي مسرح The Choice Voice:</span>
          </h4>
          <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
            {evaluation.coachVerdict}
          </p>

          {/* Highlights & Tips */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-800">
            <div>
              <span className="text-xs font-bold text-emerald-400 block mb-2">
                ✓ ما تم رصده في الأداء:
              </span>
              <ul className="space-y-1.5 text-xs text-slate-300">
                {evaluation.sheikhHighlights.map((hl, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-emerald-400 shrink-0">•</span>
                    <span>{hl}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <span className="text-xs font-bold text-amber-400 block mb-2">
                ⚡ نصائح هامة للمحاولة القادمة:
              </span>
              <ul className="space-y-1.5 text-xs text-slate-300">
                {evaluation.improvementTips.map((tip, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-amber-400 shrink-0">•</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Actions Bar */}
        <div className="relative z-10 mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            id="retry-challenge-btn"
            onClick={() => {
              soundFX.playClick();
              onRetry();
            }}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm shadow-lg shadow-amber-500/25 active:scale-95 transition-all"
          >
            <RotateCcw className="w-4 h-4" />
            <span>{isInvalid ? 'أعد المحاولة وتلو الآيات بصوت واضح 🎙️' : 'أعد المحاولة لتحسين النسبة'}</span>
          </button>

          {!isInvalid && evaluation.overallScore >= 50 && (
            <button
              id="show-certificate-btn"
              onClick={() => {
                soundFX.playClick();
                setShowCertificate(true);
              }}
              className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-500/30 text-sm font-bold transition-all"
            >
              <Award className="w-4 h-4 text-amber-400" />
              <span>عرض شهادة المطابقة</span>
            </button>
          )}

          <button
            id="open-fingerprint-radar-btn"
            onClick={() => {
              soundFX.playClick();
              setActiveViewMode('fingerprint');
            }}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-500/40 text-sm font-bold shadow-lg shadow-cyan-500/10 transition-all"
          >
            <Fingerprint className="w-4 h-4 text-cyan-400" />
            <span>كاشف البصمة وحقوق النبرة 🔬</span>
          </button>

          <button
            id="share-result-btn"
            onClick={handleShare}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 text-sm font-bold transition-all"
          >
            {isCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
            <span>{isCopied ? 'تم نسخ النتيجة!' : 'مشاركة النتيجة'}</span>
          </button>
        </div>

        {/* Change options */}
        <div className="relative z-10 mt-6 pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-center gap-4 text-xs">
          <button
            id="select-another-sheikh-btn"
            onClick={() => {
              soundFX.playClick();
              onSelectAnotherSheikh();
            }}
            className="text-amber-400 hover:text-amber-300 font-bold underline"
          >
            تحدي تقليد شيخ آخر ←
          </button>
          <span className="text-slate-600">|</span>
          <button
            id="select-another-surah-btn"
            onClick={() => {
              soundFX.playClick();
              onSelectAnotherSurah();
            }}
            className="text-slate-300 hover:text-amber-400 font-medium"
          >
            اختيار سورة أخرى لنفس الشيخ
          </button>
        </div>
      </div>
      )}

      {/* Certificate Modal */}
      {showCertificate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">
          <div className="relative max-w-lg w-full bg-gradient-to-b from-slate-900 via-amber-950/40 to-slate-900 rounded-3xl p-6 sm:p-8 border-2 border-amber-400 shadow-2xl text-center">
            <div className="w-16 h-16 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center text-3xl mx-auto mb-3 shadow-lg shadow-amber-500/30">
              🏆
            </div>
            <span className="text-xs uppercase tracking-widest text-amber-400 font-bold">
              The Choice Voice Certificate
            </span>
            <h3 className="text-2xl font-black text-white mt-1">شهادة محاكاة وتجويد</h3>

            <p className="text-xs text-slate-300 mt-2 mb-4">
              تشهد منصة صوت الاختيار القرآنية بأن المتسابق قد أتم محاكاة تلاوة الآيات الكريمة
            </p>

            <div className="p-4 rounded-2xl bg-slate-950/90 border border-amber-500/30 space-y-2 mb-4">
              <div className="text-sm font-bold text-white">الشيخ المختار: {sheikh.name}</div>
              <div className="text-xs text-amber-300">{surah.nameArabic}</div>
              <div className="text-3xl font-black text-amber-400 mt-2">
                نسبة التطابق: {evaluation.overallScore}%
              </div>
              <div className="text-xs font-semibold text-slate-300">
                اللقب المستحق: {evaluation.vocalTrophyTitle}
              </div>
            </div>

            <button
              id="close-certificate-btn"
              onClick={() => {
                soundFX.playClick();
                setShowCertificate(false);
              }}
              className="px-6 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-black text-xs hover:bg-amber-400 transition-all"
            >
              إغلاق الشهادة
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
