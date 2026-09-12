import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { SheikhSelector } from './components/SheikhSelector';
import { SurahSelector } from './components/SurahSelector';
import { SheikhPlayer } from './components/SheikhPlayer';
import { VoiceRecorder } from './components/VoiceRecorder';
import { EvaluationScoreView } from './components/EvaluationScoreView';
import { HistoryModal } from './components/HistoryModal';
import { SHEIKHS_LIST } from './data/sheikhs';
import { SURAHS_LIST } from './data/surahs';
import { Sheikh, SurahOption, StageStep, EvaluationResult, SavedRecitationRecord } from './types';
import { VoiceRecorderSession, requestRecitationEvaluation, blobToBase64 } from './utils/audioAnalyzer';
import { soundFX } from './utils/soundEffects';
import { Sparkles, Loader2, Music, Mic, HelpCircle } from 'lucide-react';

const STORAGE_KEY_HISTORY = 'the_choice_voice_history_v1';
const STORAGE_KEY_SOUND = 'the_choice_voice_sound_v1';

export default function App() {
  const [currentStage, setCurrentStage] = useState<StageStep>('select_sheikh');
  const [selectedSheikh, setSelectedSheikh] = useState<Sheikh | null>(SHEIKHS_LIST[0]);
  const [selectedSurah, setSelectedSurah] = useState<SurahOption | null>(SURAHS_LIST[0]);
  const [userAudioBlob, setUserAudioBlob] = useState<Blob | null>(null);
  const [evaluationResult, setEvaluationResult] = useState<EvaluationResult | null>(null);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
  const [isSoundEnabled, setIsSoundEnabled] = useState<boolean>(true);
  const [historyRecords, setHistoryRecords] = useState<SavedRecitationRecord[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);

  // Load persisted history & sound pref
  useEffect(() => {
    try {
      const savedHist = localStorage.getItem(STORAGE_KEY_HISTORY);
      if (savedHist) {
        setHistoryRecords(JSON.parse(savedHist));
      }
      const savedSound = localStorage.getItem(STORAGE_KEY_SOUND);
      if (savedSound !== null) {
        const enabled = savedSound === 'true';
        setIsSoundEnabled(enabled);
        soundFX.enabled = enabled;
      }
    } catch (e) {
      console.warn('Storage read error:', e);
    }
  }, []);

  const handleToggleSound = () => {
    const next = !isSoundEnabled;
    setIsSoundEnabled(next);
    soundFX.enabled = next;
    try {
      localStorage.setItem(STORAGE_KEY_SOUND, String(next));
    } catch (e) {}
  };

  const handleClearHistory = () => {
    setHistoryRecords([]);
    try {
      localStorage.removeItem(STORAGE_KEY_HISTORY);
    } catch (e) {}
  };

  const canNavigateTo = (stage: StageStep): boolean => {
    if (stage === 'select_sheikh') return true;
    if (stage === 'select_surah') return !!selectedSheikh;
    if (stage === 'listen') return !!selectedSheikh && !!selectedSurah;
    if (stage === 'record') return !!selectedSheikh && !!selectedSurah;
    if (stage === 'result') return !!evaluationResult && !!userAudioBlob;
    return false;
  };

  // Callback when recording is completed
  const handleFinishedRecording = async (
    blob: Blob,
    recordedDurationSec: number,
    recorder: VoiceRecorderSession
  ) => {
    if (!selectedSheikh || !selectedSurah) return;

    setUserAudioBlob(blob);
    setIsEvaluating(true);
    setCurrentStage('result');

    // Compute acoustic metrics
    const audioMetrics = recorder.computeAcousticMetrics(
      selectedSurah.defaultAudioDurationSec,
      recordedDurationSec
    );

    const fullAyahsText = selectedSurah.ayahs.map((a) => a.text).join(' - ');

    // Convert recorded blob to base64 so AI listens to the real recording
    let audioBase64: string | undefined;
    let audioMimeType: string | undefined;
    try {
      const encoded = await blobToBase64(blob);
      audioBase64 = encoded.base64;
      audioMimeType = encoded.mimeType;
    } catch (e) {
      console.warn('Audio conversion failed:', e);
    }

    try {
      const evaluation = await requestRecitationEvaluation({
        sheikhName: selectedSheikh.name,
        sheikhStyle: `${selectedSheikh.maqam} - ${selectedSheikh.maqamDescription}`,
        surahName: selectedSurah.nameArabic,
        ayahText: fullAyahsText,
        audioMetrics,
        recordedDuration: recordedDurationSec,
        targetDuration: selectedSurah.defaultAudioDurationSec,
        audioBase64,
        audioMimeType,
      });

      setEvaluationResult(evaluation);

      // Save to local history
      const blobUrl = URL.createObjectURL(blob);
      const newRecord: SavedRecitationRecord = {
        id: `rec_${Date.now()}`,
        timestamp: Date.now(),
        sheikhId: selectedSheikh.id,
        sheikhName: selectedSheikh.name,
        surahId: selectedSurah.id,
        surahName: selectedSurah.nameArabic,
        score: evaluation.overallScore,
        turnedChairs: evaluation.turnedChairs,
        audioBlobUrl: blobUrl,
        trophyTitle: evaluation.vocalTrophyTitle,
      };

      setHistoryRecords((prev) => {
        const updated = [newRecord, ...prev.slice(0, 19)];
        try {
          // Store minimal metadata in localStorage (without large blob url strings)
          const metaOnly = updated.map((r) => ({ ...r, audioBlobUrl: undefined }));
          localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(metaOnly));
        } catch (e) {}
        return updated;
      });
    } catch (err) {
      console.error('Recitation evaluation failed:', err);
    } finally {
      setIsEvaluating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500/30 selection:text-amber-200">
      {/* App Header */}
      <Header
        currentStage={currentStage}
        onNavigateStage={setCurrentStage}
        canNavigateTo={canNavigateTo}
        historyCount={historyRecords.length}
        onOpenHistory={() => setIsHistoryOpen(true)}
        isSoundEnabled={isSoundEnabled}
        onToggleSound={handleToggleSound}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Stage 1: Choose Sheikh */}
        {currentStage === 'select_sheikh' && (
          <SheikhSelector
            sheikhs={SHEIKHS_LIST}
            selectedSheikh={selectedSheikh}
            onSelectSheikh={(sheikh) => setSelectedSheikh(sheikh)}
            onNext={() => setCurrentStage('select_surah')}
          />
        )}

        {/* Stage 2: Choose Surah */}
        {currentStage === 'select_surah' && selectedSheikh && (
          <SurahSelector
            surahs={SURAHS_LIST}
            selectedSurah={selectedSurah}
            selectedSheikh={selectedSheikh}
            onSelectSurah={(surah) => setSelectedSurah(surah)}
            onNext={() => setCurrentStage('listen')}
            onBack={() => setCurrentStage('select_sheikh')}
          />
        )}

        {/* Stage 3: Listen to the Sheikh */}
        {currentStage === 'listen' && selectedSheikh && selectedSurah && (
          <SheikhPlayer
            sheikh={selectedSheikh}
            surah={selectedSurah}
            onReadyToRecord={() => setCurrentStage('record')}
            onBack={() => setCurrentStage('select_surah')}
          />
        )}

        {/* Stage 4: Imitate & Record User Voice */}
        {currentStage === 'record' && selectedSheikh && selectedSurah && (
          <VoiceRecorder
            sheikh={selectedSheikh}
            surah={selectedSurah}
            onFinishedRecording={handleFinishedRecording}
            onBack={() => setCurrentStage('listen')}
          />
        )}

        {/* Stage 5: Evaluating / Result Stage */}
        {currentStage === 'result' && (
          <>
            {isEvaluating ? (
              <div className="min-h-[50vh] flex flex-col items-center justify-center text-center p-8">
                <div className="relative w-24 h-24 mb-6">
                  <div className="absolute inset-0 rounded-full border-4 border-amber-500/20 border-t-amber-400 animate-spin" />
                  <div className="absolute inset-2 rounded-full border-4 border-yellow-500/30 border-b-yellow-400 animate-spin" style={{ animationDirection: 'reverse' }} />
                  <div className="w-full h-full rounded-full flex items-center justify-center text-3xl">
                    🎙️
                  </div>
                </div>

                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30 text-xs font-bold mb-2">
                  <Sparkles className="w-3.5 h-3.5 animate-spin" />
                  <span>The Choice Voice AI Engine</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">
                  جارٍ فحص التلاوة وحساب نسبة التطابق مع الشيخ...
                </h3>
                <p className="text-xs sm:text-sm text-slate-400 max-w-md">
                  نقوم بتحليل أزمنة المدود، طبقات المقام الصوتي، ومخارج الحروف لمقارنتها بأداء الشيخ {selectedSheikh?.name}.
                </p>
              </div>
            ) : evaluationResult && selectedSheikh && selectedSurah && userAudioBlob ? (
              <EvaluationScoreView
                evaluation={evaluationResult}
                sheikh={selectedSheikh}
                surah={selectedSurah}
                userAudioBlob={userAudioBlob}
                onRetry={() => setCurrentStage('record')}
                onSelectAnotherSheikh={() => setCurrentStage('select_sheikh')}
                onSelectAnotherSurah={() => setCurrentStage('select_surah')}
              />
            ) : null}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-900 bg-slate-950/80 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-amber-400">The Choice Voice</span>
            <span>- منصة تحدي محاكاة أصوات كبار القراء وحساب نسبة التطابق والتجويد</span>
          </div>
          <div className="text-slate-400">
            تلاوات كبار القراء عبر شبكة EveryAyah | تقييم صوتي ذكي
          </div>
        </div>
      </footer>

      {/* History Modal */}
      <HistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        records={historyRecords}
        onClearRecords={handleClearHistory}
      />
    </div>
  );
}
