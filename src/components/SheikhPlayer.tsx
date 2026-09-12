import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Volume2, Mic, Sparkles, CheckCircle2, ArrowRight } from 'lucide-react';
import { Sheikh, SurahOption } from '../types';
import { getAyahAudioUrl } from '../data/surahs';
import { soundFX } from '../utils/soundEffects';

interface SheikhPlayerProps {
  sheikh: Sheikh;
  surah: SurahOption;
  onReadyToRecord: () => void;
  onBack: () => void;
}

export const SheikhPlayer: React.FC<SheikhPlayerProps> = ({
  sheikh,
  surah,
  onReadyToRecord,
  onBack,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentAyahIndex, setCurrentAyahIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [audioError, setAudioError] = useState(false);
  const [hasListenedThrough, setHasListenedThrough] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const currentAyah = surah.ayahs[currentAyahIndex] || surah.ayahs[0];
  const audioUrl = getAyahAudioUrl(
    sheikh.everyAyahFolder,
    surah.numberString,
    currentAyah.numberInSurah
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.src = audioUrl;
    setAudioError(false);

    if (isPlaying) {
      audio.play().catch((err) => {
        console.warn('Playback error:', err);
        setIsPlaying(false);
      });
    }

    const handleTimeUpdate = () => {
      if (audio.duration) {
        setProgress((audio.currentTime / audio.duration) * 100);
      }
    };

    const handleEnded = () => {
      if (currentAyahIndex < surah.ayahs.length - 1) {
        setCurrentAyahIndex((prev) => prev + 1);
      } else {
        setIsPlaying(false);
        setProgress(100);
        setHasListenedThrough(true);
      }
    };

    const handleError = () => {
      console.warn('Audio stream error for URL:', audioUrl);
      setAudioError(true);
      setIsPlaying(false);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [currentAyahIndex, audioUrl]);

  // Autoplay on first render
  useEffect(() => {
    const timer = setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.play().then(() => {
          setIsPlaying(true);
        }).catch(() => {
          // Browser requires user interaction, keep paused
          setIsPlaying(false);
        });
      }
    }, 400);

    return () => clearTimeout(timer);
  }, []);

  const togglePlay = () => {
    soundFX.playClick();
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch((e) => console.warn(e));
    }
  };

  const restartRecitation = () => {
    soundFX.playClick();
    setCurrentAyahIndex(0);
    setProgress(0);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const selectAyah = (index: number) => {
    soundFX.playClick();
    setCurrentAyahIndex(index);
    setProgress(0);
    setIsPlaying(true);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <audio ref={audioRef} preload="auto" />

      {/* Top Bar with Return */}
      <div className="flex items-center justify-between">
        <button
          id="back-to-surah-btn"
          onClick={() => {
            soundFX.playClick();
            if (audioRef.current) audioRef.current.pause();
            onBack();
          }}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-amber-300 transition-colors"
        >
          <ArrowRight className="w-4 h-4" />
          <span>تغيير السورة أو الشيخ</span>
        </button>

        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30 text-xs font-semibold">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>المرحلة الثالثة: استمع للشيخ وركّز في نبرته</span>
        </div>
      </div>

      {/* Main Reciter & Surah Stage Box */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-slate-900 via-slate-900/90 to-slate-950 border border-amber-500/30 p-6 sm:p-8 shadow-2xl">
        {/* Ambient Stage Lights */}
        <div className="absolute top-0 left-1/4 -translate-x-1/2 w-72 h-72 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-0 right-1/4 translate-x-1/2 w-72 h-72 bg-yellow-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Sheikh Info & Live Waveform */}
        <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-6 pb-6 border-b border-slate-800">
          <div className="flex items-center gap-4 text-center sm:text-right">
            <div
              className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${sheikh.avatarGradient} flex items-center justify-center text-3xl shadow-xl border-2 border-amber-400/40 relative`}
            >
              <span>{sheikh.imagePlaceholder}</span>
              {isPlaying && (
                <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-amber-500"></span>
                </span>
              )}
            </div>
            <div>
              <span className="text-xs text-amber-400 font-bold tracking-wide">القارئ الشيخ</span>
              <h1 className="text-xl sm:text-2xl font-black text-white">{sheikh.name}</h1>
              <p className="text-xs sm:text-sm text-slate-300 mt-0.5">{sheikh.maqam}</p>
            </div>
          </div>

          {/* Surah badge */}
          <div className="text-center sm:text-left bg-slate-950/80 px-4 py-2.5 rounded-2xl border border-slate-800">
            <span className="text-xs text-slate-400">السورة المختارة للتحدي</span>
            <div className="text-lg font-bold text-amber-300">{surah.nameArabic}</div>
            <div className="text-[11px] text-slate-400">
              الآية {currentAyahIndex + 1} من {surah.ayahs.length}
            </div>
          </div>
        </div>

        {/* Quranic Text Display with Active Ayah Highlight */}
        <div className="relative z-10 my-8 space-y-4">
          <div className="p-6 rounded-2xl bg-slate-950/90 border border-amber-500/25 shadow-inner text-center">
            {/* Basmalah for Surahs other than Tawbah */}
            {surah.id !== 1 && surah.id !== 9 && (
              <div className="mb-4 pb-3 border-b border-slate-800/80">
                <p className="font-quran text-lg sm:text-xl text-amber-400/80">
                  بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
                </p>
              </div>
            )}

            {/* Ayahs Container */}
            <div className="space-y-4 max-h-72 overflow-y-auto px-2 py-1">
              {surah.ayahs.map((ayah, idx) => {
                const isCurrent = idx === currentAyahIndex;
                return (
                  <div
                    key={ayah.numberInSurah}
                    id={`ayah-display-${idx}`}
                    onClick={() => selectAyah(idx)}
                    className={`cursor-pointer p-4 rounded-xl transition-all duration-300 ${
                      isCurrent
                        ? 'bg-amber-950/50 border border-amber-400/60 shadow-lg shadow-amber-500/10 scale-[1.01]'
                        : 'hover:bg-slate-900/60 border border-transparent opacity-85 hover:opacity-100'
                    }`}
                  >
                    <p
                      className={`font-quran text-xl sm:text-2xl md:text-3xl leading-loose sm:leading-relaxed ${
                        isCurrent ? 'text-amber-200 font-bold' : 'text-slate-200'
                      }`}
                    >
                      {ayah.text}{' '}
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-sans text-amber-400 border border-amber-500/40 bg-amber-500/10 mx-1 align-middle">
                        {ayah.numberInSurah}
                      </span>
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Audio Visualizer & Player Controls */}
        <div className="relative z-10 space-y-4 bg-slate-950/60 p-4 rounded-2xl border border-slate-800">
          {/* Animated visualizer bars */}
          <div className="flex items-center justify-center gap-1.5 h-10 px-4">
            {[40, 65, 85, 50, 95, 70, 30, 80, 100, 60, 45, 90, 75, 55, 85, 35, 65, 95, 50, 40].map(
              (height, i) => (
                <span
                  key={i}
                  className={`w-1 rounded-full transition-all duration-150 ${
                    isPlaying
                      ? 'bg-gradient-to-t from-amber-600 to-yellow-300'
                      : 'bg-slate-800'
                  }`}
                  style={{
                    height: isPlaying ? `${Math.max(15, (height * (progress + 20)) % 100)}%` : '15%',
                  }}
                />
              )
            )}
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden cursor-pointer">
            <div
              className="bg-gradient-to-r from-amber-500 to-yellow-400 h-full transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <button
                id="sheikh-restart-btn"
                onClick={restartRecitation}
                title="إعادة الاستماع من البداية"
                className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-amber-300 hover:border-amber-500/40 transition-all"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>

            <button
              id="sheikh-play-pause-btn"
              onClick={togglePlay}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black shadow-lg shadow-amber-500/20 active:scale-95 transition-all text-sm sm:text-base"
            >
              {isPlaying ? (
                <>
                  <Pause className="w-5 h-5 fill-current" />
                  <span>إيقاف مؤقت</span>
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 fill-current" />
                  <span>{progress > 0 ? 'متابعة الاستماع' : 'استمع لصوت الشيخ'}</span>
                </>
              )}
            </button>

            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Volume2 className="w-4 h-4 text-amber-400" />
              <span>صوت أصلي نقي</span>
            </div>
          </div>
        </div>

        {/* Recitation Guidance & Key Traits to Watch for */}
        <div className="relative z-10 mt-6 p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
          <h4 className="text-xs font-bold text-amber-400 mb-2 flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span>أسرار صوت الشيخ {sheikh.name} (ركّز عليها أثناء التقليد):</span>
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {sheikh.keyTraits.map((trait, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-slate-300">
                <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <span>{trait}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Action CTA: Proceed to Imitation & Voice Challenge */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
        <button
          id="proceed-to-record-btn"
          onClick={() => {
            soundFX.playClick();
            if (audioRef.current) audioRef.current.pause();
            onReadyToRecord();
          }}
          className="w-full sm:w-auto flex items-center justify-center gap-3 px-8 py-4 rounded-2xl bg-gradient-to-r from-red-600 via-amber-500 to-amber-600 hover:from-red-500 hover:to-amber-500 text-slate-950 font-black text-lg shadow-xl shadow-red-500/20 hover:scale-105 active:scale-95 transition-all group"
        >
          <div className="w-6 h-6 rounded-full bg-slate-950 text-amber-400 flex items-center justify-center shadow">
            <Mic className="w-3.5 h-3.5" />
          </div>
          <span>أنا جاهز لتقليد صوت الشيخ! (ابدأ التسجيل)</span>
          <span className="text-xl transition-transform group-hover:-translate-x-1">←</span>
        </button>
      </div>
    </div>
  );
};
