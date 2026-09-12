import React from 'react';
import { X, Trophy, Trash2, Play, Pause, Calendar, Award } from 'lucide-react';
import { SavedRecitationRecord } from '../types';
import { soundFX } from '../utils/soundEffects';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  records: SavedRecitationRecord[];
  onClearRecords: () => void;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({
  isOpen,
  onClose,
  records,
  onClearRecords,
}) => {
  const [playingId, setPlayingId] = React.useState<string | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  if (!isOpen) return null;

  const toggleAudio = (record: SavedRecitationRecord) => {
    soundFX.playClick();
    if (!record.audioBlobUrl) return;

    if (playingId === record.id) {
      if (audioRef.current) audioRef.current.pause();
      setPlayingId(null);
      return;
    }

    if (!audioRef.current) {
      audioRef.current = new Audio();
    }

    audioRef.current.src = record.audioBlobUrl;
    audioRef.current.play().then(() => {
      setPlayingId(record.id);
    }).catch((e) => console.warn(e));

    audioRef.current.onended = () => {
      setPlayingId(null);
    };
  };

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    return d.toLocaleDateString('ar-SA', {
      hour: '2-digit',
      minute: '2-digit',
      day: 'numeric',
      month: 'short',
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="relative max-w-xl w-full bg-slate-900 rounded-3xl p-6 border border-amber-500/30 shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-400" />
            <h3 className="text-lg font-bold text-white">سجل تلاواتك وتحديات التقليد</h3>
          </div>

          <button
            id="close-history-modal-btn"
            onClick={() => {
              soundFX.playClick();
              if (audioRef.current) audioRef.current.pause();
              onClose();
            }}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto py-4 space-y-3">
          {records.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              <Award className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p>لم تسجل أي تلاوة بعد.</p>
              <p className="text-xs text-slate-500 mt-1">
                اختر شيخاً وسورة وابدأ محاكاة صوته لتسجيل أول نسبة مطابقة لك!
              </p>
            </div>
          ) : (
            records.map((rec) => (
              <div
                key={rec.id}
                className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800/80 flex items-center justify-between gap-3 hover:border-amber-500/30 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center justify-center font-black text-sm">
                    {rec.score}%
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-sm text-white">{rec.sheikhName}</h4>
                      <span className="text-[11px] text-amber-400 font-semibold">
                        ({rec.surahName})
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">{rec.trophyTitle}</div>
                    <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-1">
                      <Calendar className="w-3 h-3" />
                      <span>{formatDate(rec.timestamp)}</span>
                    </div>
                  </div>
                </div>

                {/* Audio playback */}
                {rec.audioBlobUrl && (
                  <button
                    onClick={() => toggleAudio(rec)}
                    title={playingId === rec.id ? 'إيقاف' : 'استمع لتسجيلك'}
                    className="p-2.5 rounded-xl bg-slate-800 hover:bg-amber-500 text-slate-200 hover:text-slate-950 transition-all"
                  >
                    {playingId === rec.id ? (
                      <Pause className="w-4 h-4" />
                    ) : (
                      <Play className="w-4 h-4 fill-current" />
                    )}
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {records.length > 0 && (
          <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-400">إجمالي التحديات: {records.length}</span>
            <button
              id="clear-all-history-btn"
              onClick={() => {
                soundFX.playClick();
                onClearRecords();
              }}
              className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 font-medium"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>مسح السجل</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
