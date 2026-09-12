import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Square, Play, RotateCcw, AlertCircle, Sparkles, Volume2, ArrowRight } from 'lucide-react';
import { Sheikh, SurahOption } from '../types';
import { VoiceRecorderSession } from '../utils/audioAnalyzer';
import { soundFX } from '../utils/soundEffects';
import { VoiceLayerOverlayVisualizer } from './VoiceLayerOverlayVisualizer';

interface VoiceRecorderProps {
  sheikh: Sheikh;
  surah: SurahOption;
  onFinishedRecording: (blob: Blob, recordedDurationSec: number, recorder: VoiceRecorderSession) => void;
  onBack: () => void;
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({
  sheikh,
  surah,
  onFinishedRecording,
  onBack,
}) => {
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [currentVolume, setCurrentVolume] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeSession, setActiveSession] = useState<VoiceRecorderSession | null>(null);

  const recorderRef = useRef<VoiceRecorderSession | null>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const recognitionRef = useRef<any>(null);
  const liveTranscriptRef = useRef<string>('');

  // Start 3-second countdown on click
  const triggerStartCountdown = () => {
    soundFX.playClick();
    setErrorMsg(null);
    setCountdown(3);
    soundFX.playCountdownBeep(false);

    let count = 3;
    const interval = setInterval(() => {
      count -= 1;
      if (count > 0) {
        setCountdown(count);
        soundFX.playCountdownBeep(false);
      } else {
        clearInterval(interval);
        setCountdown(null);
        soundFX.playCountdownBeep(true);
        startActualRecording();
      }
    }, 1000);
  };

  const startActualRecording = async () => {
    try {
      const recorder = new VoiceRecorderSession();
      recorderRef.current = recorder;

      await recorder.startRecording((vol) => {
        setCurrentVolume(vol);
      });

      setIsRecording(true);
      setActiveSession(recorder);
      setElapsedSeconds(0);
      liveTranscriptRef.current = '';

      // Initialize SpeechRecognition if available (Chrome / Edge / Safari / Android)
      try {
        const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRec) {
          const rec = new SpeechRec();
          rec.lang = 'ar-SA';
          rec.continuous = true;
          rec.interimResults = true;
          rec.onresult = (e: any) => {
            let combined = '';
            for (let i = 0; i < e.results.length; i++) {
              combined += e.results[i][0]?.transcript + ' ';
            }
            liveTranscriptRef.current = combined.trim();
            if (recorderRef.current) {
              recorderRef.current.setRecognizedTranscript(liveTranscriptRef.current);
            }
          };
          rec.onerror = () => {};
          rec.start();
          recognitionRef.current = rec;
        }
      } catch (speechErr) {
        console.warn('SpeechRecognition setup non-fatal error:', speechErr);
      }

      // Start elapsed timer
      timerIntervalRef.current = window.setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error('Microphone error:', err);
      setErrorMsg(
        'تعذر الوصول إلى الميكروفون. يرجى التأكد من منح الإذن لاستخدام الميكروفون في المتصفح.'
      );
      setIsRecording(false);
      setActiveSession(null);
    }
  };

  const stopAndFinish = async () => {
    if (!recorderRef.current || !isRecording) return;
    soundFX.playClick();
    setIsProcessing(true);

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
      recognitionRef.current = null;
    }

    try {
      const { blob, durationSec } = await recorderRef.current.stopRecording();
      setIsRecording(false);
      setActiveSession(null);
      onFinishedRecording(blob, durationSec, recorderRef.current);
    } catch (err) {
      console.error('Stop recording error:', err);
      setIsProcessing(false);
      setActiveSession(null);
    }
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (recorderRef.current) {
        recorderRef.current.stopRecording().catch(() => {});
      }
    };
  }, []);

  const formatTimer = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <button
          id="back-to-listen-btn"
          disabled={isRecording}
          onClick={() => {
            soundFX.playClick();
            onBack();
          }}
          className={`flex items-center gap-1.5 text-xs text-slate-400 hover:text-amber-300 transition-colors ${
            isRecording ? 'opacity-40 cursor-not-allowed' : ''
          }`}
        >
          <ArrowRight className="w-4 h-4" />
          <span>الرجوع للاستماع للشيخ</span>
        </button>

        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 text-red-300 border border-red-500/30 text-xs font-semibold">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
          <span>المرحلة الرابعة: محاكاة الصوت والتسجيل المباشر</span>
        </div>
      </div>

      {/* Target Sheikh Reference Banner */}
      <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-900 border border-amber-500/20">
        <div className="flex items-center gap-3">
          <div
            className={`w-11 h-11 rounded-xl bg-gradient-to-br ${sheikh.avatarGradient} flex items-center justify-center text-lg shadow`}
          >
            {sheikh.imagePlaceholder}
          </div>
          <div>
            <span className="text-[11px] text-amber-400 font-bold">أنت تقلد الآن:</span>
            <div className="text-sm sm:text-base font-bold text-white">{sheikh.name}</div>
            <p className="text-xs text-slate-400">
              {surah.nameArabic} ({sheikh.maqam})
            </p>
          </div>
        </div>

        <div className="text-left">
          <span className="text-xs text-slate-400 block">زمن التلاوة الموصى به:</span>
          <span className="text-sm font-bold text-amber-400">
            حوالي {surah.defaultAudioDurationSec} ثانية
          </span>
        </div>
      </div>

      {/* Quranic Text Teleprompter Box */}
      <div className="relative rounded-3xl bg-slate-950/90 border border-amber-500/30 p-6 sm:p-8 text-center shadow-2xl">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 text-slate-300 border border-slate-800 text-xs mb-4">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>اقرأ هذه الآيات الكريمة بأسلوب ونبرة الشيخ:</span>
        </div>

        {surah.id !== 1 && surah.id !== 9 && (
          <p className="font-quran text-lg sm:text-xl text-amber-400/80 mb-3">
            بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
          </p>
        )}

        {/* Scrollable Verses */}
        <div className="space-y-4 max-h-64 overflow-y-auto px-4 py-2 border-y border-slate-800/80 my-4">
          {surah.ayahs.map((ayah) => (
            <p
              key={ayah.numberInSurah}
              className="font-quran text-xl sm:text-2xl md:text-3xl text-amber-100/95 leading-loose tracking-wide"
            >
              {ayah.text}{' '}
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-sans text-amber-400 border border-amber-500/40 bg-amber-500/10 mx-1 align-middle">
                {ayah.numberInSurah}
              </span>
            </p>
          ))}
        </div>

        {/* Live Audio Visualizer Canvas - Voice Layer Accuracy Overlay (Like User's Video) */}
        <div className="mt-6">
          <VoiceLayerOverlayVisualizer
            sheikh={sheikh}
            surah={surah}
            isRecording={isRecording}
            elapsedSeconds={elapsedSeconds}
            recorderSession={activeSession || recorderRef.current}
          />
        </div>

        {/* Error message display if mic failed */}
        {errorMsg && (
          <div className="mt-4 p-3 rounded-xl bg-red-950/70 border border-red-500/40 text-red-200 text-xs flex items-center justify-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Interactive Controls & Countdown Overlay */}
        <div className="mt-8 flex flex-col items-center justify-center">
          {countdown !== null ? (
            <div className="flex flex-col items-center gap-3 animate-pulse">
              <div className="w-24 h-24 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center text-5xl font-black shadow-2xl shadow-amber-500/40 border-4 border-white">
                {countdown}
              </div>
              <span className="text-amber-300 font-bold text-sm">
                استعد وابدأ الترتيل فور انتهاء العد...
              </span>
            </div>
          ) : !isRecording ? (
            <button
              id="start-recording-btn"
              onClick={triggerStartCountdown}
              className="group flex items-center gap-3 px-10 py-4 rounded-3xl bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-black text-lg sm:text-xl shadow-2xl shadow-red-600/30 hover:scale-105 active:scale-95 transition-all"
            >
              <div className="w-8 h-8 rounded-full bg-white text-red-600 flex items-center justify-center shadow">
                <Mic className="w-5 h-5" />
              </div>
              <span>ابدأ تسجيل صوتك الآن (تقليد الشيخ)</span>
            </button>
          ) : (
            <div className="flex flex-col items-center gap-4 w-full max-w-md">
              <button
                id="stop-recording-btn"
                onClick={stopAndFinish}
                disabled={isProcessing}
                className="w-full flex items-center justify-center gap-3 px-8 py-4 rounded-3xl bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 text-slate-950 font-black text-lg shadow-xl shadow-amber-500/30 hover:scale-105 active:scale-95 transition-all animate-bounce"
              >
                <Square className="w-5 h-5 fill-current" />
                <span>
                  {isProcessing
                    ? 'جارٍ معالجة الصوت...'
                    : 'أنهيت التلاوة! أظهر نسبة التطابق والنتيجة'}
                </span>
              </button>

              <p className="text-xs text-slate-400">
                اضغط على الزر فور انتهائك من آخر آية ليتم فحص التوقيت والمقام والتجويد.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
