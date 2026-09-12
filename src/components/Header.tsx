import React from 'react';
import { Mic, Volume2, VolumeX, History, Sparkles, Award } from 'lucide-react';
import { StageStep } from '../types';
import { soundFX } from '../utils/soundEffects';

interface HeaderProps {
  currentStage: StageStep;
  onNavigateStage: (stage: StageStep) => void;
  canNavigateTo: (stage: StageStep) => boolean;
  historyCount: number;
  onOpenHistory: () => void;
  isSoundEnabled: boolean;
  onToggleSound: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentStage,
  onNavigateStage,
  canNavigateTo,
  historyCount,
  onOpenHistory,
  isSoundEnabled,
  onToggleSound,
}) => {
  const steps: { id: StageStep; label: string; number: number }[] = [
    { id: 'select_sheikh', label: 'اختر الشيخ', number: 1 },
    { id: 'select_surah', label: 'اختر السورة', number: 2 },
    { id: 'listen', label: 'استمع للتلاوة', number: 3 },
    { id: 'record', label: 'قلّد التلاوة', number: 4 },
    { id: 'result', label: 'نسبة التطابق', number: 5 },
  ];

  return (
    <header className="sticky top-0 z-40 backdrop-blur-md bg-slate-950/85 border-b border-amber-500/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex items-center justify-between gap-4">
          {/* Brand & Logo */}
          <div
            id="brand-logo-btn"
            onClick={() => {
              soundFX.playClick();
              onNavigateStage('select_sheikh');
            }}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 via-amber-600 to-yellow-800 flex items-center justify-center shadow-lg shadow-amber-500/20 border border-amber-300/40 group-hover:scale-105 transition-transform">
              <Mic className="w-5 h-5 text-slate-950" />
              <span className="absolute -bottom-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-amber-200 via-yellow-400 to-amber-500 bg-clip-text text-transparent">
                  The Choice Voice
                </span>
                <span className="hidden sm:inline-block px-2 py-0.5 text-xs font-bold rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30">
                  صوت الاختيار
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                تحدي محاكاة أصوات القراء ونسبة التطابق والتجويد
              </p>
            </div>
          </div>

          {/* Stepper Navigation */}
          <nav className="hidden md:flex items-center gap-1.5 lg:gap-2">
            {steps.map((step, idx) => {
              const isCurrent = currentStage === step.id;
              const isSelectable = canNavigateTo(step.id);
              return (
                <React.Fragment key={step.id}>
                  <button
                    id={`nav-step-${step.id}`}
                    disabled={!isSelectable}
                    onClick={() => {
                      if (isSelectable) {
                        soundFX.playClick();
                        onNavigateStage(step.id);
                      }
                    }}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                      isCurrent
                        ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30 font-bold scale-105'
                        : isSelectable
                        ? 'bg-slate-900/80 text-slate-300 hover:text-amber-300 hover:bg-slate-800/80 border border-slate-800'
                        : 'text-slate-600 cursor-not-allowed opacity-60'
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded-full text-[10px] flex items-center justify-center ${
                        isCurrent
                          ? 'bg-slate-950 text-amber-400'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {step.number}
                    </span>
                    <span>{step.label}</span>
                  </button>
                  {idx < steps.length - 1 && (
                    <span className="text-slate-700 text-xs">←</span>
                  )}
                </React.Fragment>
              );
            })}
          </nav>

          {/* Actions: Sound toggle & History */}
          <div className="flex items-center gap-2">
            <button
              id="sound-fx-toggle-btn"
              onClick={onToggleSound}
              title={isSoundEnabled ? 'كتم المؤثرات الصوتية' : 'تفعيل المؤثرات'}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-amber-400 hover:border-amber-500/40 transition-colors"
            >
              {isSoundEnabled ? (
                <Volume2 className="w-4 h-4" />
              ) : (
                <VolumeX className="w-4 h-4 text-slate-500" />
              )}
            </button>

            <button
              id="open-history-btn"
              onClick={() => {
                soundFX.playClick();
                onOpenHistory();
              }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-amber-500/40 text-slate-200 hover:text-amber-300 text-xs font-semibold transition-all relative"
            >
              <History className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">سجل التحديات</span>
              {historyCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-slate-950 font-bold text-[10px]">
                  {historyCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Step Indicator Bar */}
        <div className="flex md:hidden items-center justify-between gap-1 mt-2.5 pt-2 border-t border-slate-900">
          {steps.map((step) => {
            const isCurrent = currentStage === step.id;
            const isSelectable = canNavigateTo(step.id);
            return (
              <button
                key={step.id}
                disabled={!isSelectable}
                onClick={() => {
                  if (isSelectable) onNavigateStage(step.id);
                }}
                className={`flex-1 py-1 rounded text-center text-[10px] font-medium transition-all ${
                  isCurrent
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : isSelectable
                    ? 'text-slate-300 bg-slate-900/60'
                    : 'text-slate-600'
                }`}
              >
                {step.number}. {step.label}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
