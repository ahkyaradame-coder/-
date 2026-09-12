import React from 'react';
import { BookOpen, Sparkles, Clock, Check, ArrowRight } from 'lucide-react';
import { SurahOption, Sheikh } from '../types';
import { soundFX } from '../utils/soundEffects';

interface SurahSelectorProps {
  surahs: SurahOption[];
  selectedSurah: SurahOption | null;
  selectedSheikh: Sheikh;
  onSelectSurah: (surah: SurahOption) => void;
  onNext: () => void;
  onBack: () => void;
}

export const SurahSelector: React.FC<SurahSelectorProps> = ({
  surahs,
  selectedSurah,
  selectedSheikh,
  onSelectSurah,
  onNext,
  onBack,
}) => {
  return (
    <div className="space-y-6">
      {/* Selected Sheikh Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-slate-900 border border-amber-500/20">
        <div className="flex items-center gap-3">
          <div
            className={`w-12 h-12 rounded-xl bg-gradient-to-br ${selectedSheikh.avatarGradient} flex items-center justify-center text-xl shadow`}
          >
            {selectedSheikh.imagePlaceholder}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-amber-400 font-bold">الشيخ المختار:</span>
              <h2 className="text-base sm:text-lg font-bold text-white">{selectedSheikh.name}</h2>
            </div>
            <p className="text-xs text-slate-400">{selectedSheikh.maqam}</p>
          </div>
        </div>

        <button
          id="change-sheikh-btn"
          onClick={() => {
            soundFX.playClick();
            onBack();
          }}
          className="text-xs text-amber-400 hover:text-amber-300 underline font-semibold flex items-center gap-1"
        >
          <span>تغيير الشيخ</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Header instructions */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30 text-xs font-semibold mb-2">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>المرحلة الثانية: اختيار السورة أو المقطع</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-black text-white">
          أي سورة تريد أن <span className="text-amber-400">تتحدى نفسك</span> في محاكاتها؟
        </h2>
        <p className="text-slate-400 text-sm mt-1 max-w-xl mx-auto">
          اختر مقطعاً ترغب في الاستماع إليه بصوت الشيخ ثم تقليده نبرةً وتجويداً للحصول على نسبة التطابق.
        </p>
      </div>

      {/* Surahs Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
        {surahs.map((surah) => {
          const isSelected = selectedSurah?.id === surah.id;
          const firstAyah = surah.ayahs[0]?.text || '';

          return (
            <div
              key={surah.id}
              id={`surah-card-${surah.id}`}
              onClick={() => {
                soundFX.playClick();
                onSelectSurah(surah);
              }}
              className={`group p-5 rounded-2xl cursor-pointer transition-all duration-300 border flex flex-col justify-between ${
                isSelected
                  ? 'bg-gradient-to-br from-amber-950/70 via-slate-900 to-slate-900 border-amber-400 ring-2 ring-amber-400/30 shadow-lg shadow-amber-500/10'
                  : 'bg-slate-900/70 hover:bg-slate-800/80 border-slate-800 hover:border-amber-500/40'
              }`}
            >
              <div>
                {/* Title and Badge */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center font-bold text-sm">
                      {surah.id === 255 ? '٢٥٥' : surah.id}
                    </div>
                    <div>
                      <h3 className="font-extrabold text-lg text-white group-hover:text-amber-300 transition-colors">
                        {surah.nameArabic}
                      </h3>
                      <span className="text-xs text-slate-400 font-sans">{surah.nameEnglish}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-800 text-amber-300 border border-slate-700">
                      {surah.revelationType}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
                      {surah.numberOfAyahs} {surah.numberOfAyahs === 1 ? 'آية' : 'آيات'}
                    </span>
                  </div>
                </div>

                {/* Ayah Sample In Quranic Script */}
                <div className="my-3 p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 text-center">
                  <p className="font-quran text-lg sm:text-xl text-amber-200/90 leading-loose">
                    {firstAyah}
                  </p>
                  {surah.numberOfAyahs > 1 && (
                    <span className="text-[11px] text-slate-500 mt-1 block">
                      ... وباقي آيات السورة الكريمة
                    </span>
                  )}
                </div>

                {/* Description & Tajweed focus */}
                <p className="text-xs text-slate-300 leading-relaxed mb-3">
                  {surah.description}
                </p>
              </div>

              {/* Bottom selection indicator */}
              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>المدة التقريبية: {surah.defaultAudioDurationSec} ثانية</span>
                </div>

                <div
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                    isSelected
                      ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                      : 'bg-slate-800 text-slate-300 group-hover:bg-amber-500/20 group-hover:text-amber-300'
                  }`}
                >
                  {isSelected ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>تم الاختيار</span>
                    </>
                  ) : (
                    <span>اختر هذه السورة</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating CTA */}
      {selectedSurah && (
        <div className="sticky bottom-6 z-30 flex justify-center mt-6">
          <button
            id="confirm-surah-next-btn"
            onClick={() => {
              soundFX.playClick();
              onNext();
            }}
            className="group flex items-center gap-3 px-8 py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 text-slate-950 font-black text-base sm:text-lg shadow-xl shadow-amber-500/25 hover:shadow-amber-500/40 hover:scale-105 active:scale-95 transition-all"
          >
            <span>بدء الاستماع لصوت الشيخ ({selectedSheikh.name})</span>
            <span className="text-xl transition-transform group-hover:-translate-x-1">←</span>
          </button>
        </div>
      )}
    </div>
  );
};
