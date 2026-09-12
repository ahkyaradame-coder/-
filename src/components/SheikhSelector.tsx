import React, { useState, useRef } from 'react';
import { Play, Pause, Check, Music2, Sparkles, User, MapPin } from 'lucide-react';
import { Sheikh } from '../types';
import { soundFX } from '../utils/soundEffects';

interface SheikhSelectorProps {
  sheikhs: Sheikh[];
  selectedSheikh: Sheikh | null;
  onSelectSheikh: (sheikh: Sheikh) => void;
  onNext: () => void;
}

export const SheikhSelector: React.FC<SheikhSelectorProps> = ({
  sheikhs,
  selectedSheikh,
  onSelectSheikh,
  onNext,
}) => {
  const [playingPreviewId, setPlayingPreviewId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);

  const togglePreview = (sheikh: Sheikh, e: React.MouseEvent) => {
    e.stopPropagation();
    soundFX.playClick();

    if (playingPreviewId === sheikh.id) {
      if (audioPreviewRef.current) {
        audioPreviewRef.current.pause();
      }
      setPlayingPreviewId(null);
      return;
    }

    // Play first verse of Al-Fatiha as preview
    const previewUrl = `https://everyayah.com/data/${sheikh.everyAyahFolder}/001001.mp3`;
    if (!audioPreviewRef.current) {
      audioPreviewRef.current = new Audio();
    }
    audioPreviewRef.current.src = previewUrl;
    audioPreviewRef.current.play().catch((err) => console.warn('Audio preview autoplay blocked:', err));

    audioPreviewRef.current.onended = () => {
      setPlayingPreviewId(null);
    };
    audioPreviewRef.current.onerror = () => {
      setPlayingPreviewId(null);
    };

    setPlayingPreviewId(sheikh.id);
  };

  const handleSelect = (sheikh: Sheikh) => {
    soundFX.playClick();
    onSelectSheikh(sheikh);
  };

  const filteredSheikhs = sheikhs.filter(
    (s) =>
      s.name.includes(searchTerm) ||
      s.maqam.includes(searchTerm) ||
      s.country.includes(searchTerm) ||
      s.styleTags.some((tag) => tag.includes(searchTerm))
  );

  return (
    <div className="space-y-6">
      {/* Intro Hero banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-amber-950/40 to-slate-900 border border-amber-500/20 p-6 sm:p-8 text-center shadow-xl">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30 text-xs font-semibold mb-3">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>المرحلة الأولى: اختيار صوت الشيخ</span>
        </div>
        <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight mb-3">
          من الشيخ الذي ترغب في <span className="text-amber-400">محاكاة صوته</span> اليوم؟
        </h1>
        <p className="text-slate-300 max-w-2xl mx-auto text-sm sm:text-base leading-relaxed">
          اختر أحد عمالقة التلاوة في العالم الإسلامي، استمع لنبرته ومقامه الصوتي المميز، ثم استعد لتقليد ترتيله وقياس نسبة المطابقة الذكية!
        </p>

        {/* Search input */}
        <div className="mt-5 max-w-md mx-auto">
          <input
            id="search-sheikh-input"
            type="text"
            placeholder="ابحث باسم الشيخ، المقام الصوتي، أو البلد..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2.5 rounded-2xl bg-slate-950/80 border border-amber-500/30 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50 transition-all text-center"
          />
        </div>
      </div>

      {/* Sheikh Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredSheikhs.map((sheikh) => {
          const isSelected = selectedSheikh?.id === sheikh.id;
          const isPreviewing = playingPreviewId === sheikh.id;

          return (
            <div
              key={sheikh.id}
              id={`sheikh-card-${sheikh.id}`}
              onClick={() => handleSelect(sheikh)}
              className={`group relative rounded-2xl p-5 cursor-pointer transition-all duration-300 flex flex-col justify-between border ${
                isSelected
                  ? 'bg-gradient-to-b from-amber-950/60 to-slate-900 border-amber-400 ring-2 ring-amber-400/30 shadow-xl shadow-amber-500/10 -translate-y-1'
                  : 'bg-slate-900/70 hover:bg-slate-800/70 border-slate-800 hover:border-amber-500/40 hover:-translate-y-0.5'
              }`}
            >
              {/* Header with avatar & preview */}
              <div>
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${sheikh.avatarGradient} flex items-center justify-center text-2xl shadow-md border border-amber-200/20`}
                    >
                      <span>{sheikh.imagePlaceholder}</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-bold text-base sm:text-lg text-white group-hover:text-amber-300 transition-colors">
                          {sheikh.name}
                        </h3>
                      </div>
                      <p className="text-xs text-amber-400/90 font-medium">{sheikh.title}</p>
                      <div className="flex items-center gap-1 text-[11px] text-slate-400 mt-0.5">
                        <MapPin className="w-3 h-3 text-slate-500" />
                        <span>{sheikh.country}</span>
                      </div>
                    </div>
                  </div>

                  {/* Play audio preview button */}
                  <button
                    id={`preview-sheikh-btn-${sheikh.id}`}
                    onClick={(e) => togglePreview(sheikh, e)}
                    title={isPreviewing ? 'إيقاف المعاينة' : 'استمع لعينة من صوته'}
                    className={`p-2.5 rounded-xl border transition-all ${
                      isPreviewing
                        ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/30 animate-pulse'
                        : 'bg-slate-800/80 text-slate-300 hover:text-amber-300 border-slate-700 hover:border-amber-500/40'
                    }`}
                  >
                    {isPreviewing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                  </button>
                </div>

                {/* Maqam & Description */}
                <div className="mb-3 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300 mb-1">
                    <Music2 className="w-3.5 h-3.5 text-amber-400" />
                    <span>{sheikh.maqam}</span>
                  </div>
                  <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">
                    {sheikh.maqamDescription}
                  </p>
                </div>

                {/* Style tags */}
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {sheikh.styleTags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-[11px] font-medium border border-slate-700/60"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Bottom selection button */}
              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
                <span className="text-xs text-slate-400 italic">"{sheikh.quote}"</span>
                <div
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                    isSelected
                      ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30'
                      : 'bg-slate-800 text-slate-300 group-hover:bg-amber-500/20 group-hover:text-amber-300'
                  }`}
                >
                  {isSelected ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>تم الاختيار</span>
                    </>
                  ) : (
                    <span>اختر هذا الشيخ</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Continue floating/bottom button if selected */}
      {selectedSheikh && (
        <div className="sticky bottom-6 z-30 flex justify-center mt-6">
          <button
            id="confirm-sheikh-next-btn"
            onClick={() => {
              soundFX.playClick();
              if (audioPreviewRef.current) {
                audioPreviewRef.current.pause();
              }
              onNext();
            }}
            className="group flex items-center gap-3 px-8 py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 text-slate-950 font-black text-base sm:text-lg shadow-xl shadow-amber-500/25 hover:shadow-amber-500/40 hover:scale-105 active:scale-95 transition-all"
          >
            <span>متابعة باختيار الشيخ ({selectedSheikh.name})</span>
            <span className="text-xl transition-transform group-hover:-translate-x-1">←</span>
          </button>
        </div>
      )}
    </div>
  );
};
