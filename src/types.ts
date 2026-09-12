export interface Sheikh {
  id: string;
  name: string;
  title: string;
  country: string;
  maqam: string;
  maqamDescription: string;
  styleTags: string[];
  keyTraits: string[];
  avatarGradient: string;
  imagePlaceholder: string;
  everyAyahFolder: string;
  serverUrlPrefix?: string;
  quote: string;
}

export interface AyahItem {
  numberInSurah: number;
  numberInQuran: number;
  text: string;
  audioDurationSec?: number;
}

export interface SurahOption {
  id: number;
  numberString: string; // "001", "112", etc.
  nameArabic: string;
  nameEnglish: string;
  numberOfAyahs: number;
  revelationType: 'مكية' | 'مدنية';
  description: string;
  ayahs: AyahItem[];
  defaultAudioDurationSec: number;
}

export interface AudioAcousticMetrics {
  pitchScore: number;
  tempoScore: number;
  energyScore: number;
  cadenceScore: number;
  durationRatio: number;
  averageFrequencyHz: number;
  isSilence: boolean;
  isGibberish?: boolean;
  sustainedPitchRatio?: number;
  recognizedTranscript?: string;
  maxVolume: number;
  averageVolume: number;
}

export interface EvaluationResult {
  overallScore: number;
  tajweedScore: number;
  maqamScore: number;
  rhythmScore: number;
  toneScore: number;
  turnedChairs: number;
  coachVerdict: string;
  sheikhHighlights: string[];
  improvementTips: string[];
  vocalTrophyTitle: string;
  engineUsed: 'gemini' | 'acoustic';
  isRecitationValid?: boolean;
  detectionType?: 'valid_recitation' | 'silence' | 'singing_non_quranic' | 'unintelligible' | 'gibberish_non_quranic';
  audioDetectedText?: string;
}

export interface SavedRecitationRecord {
  id: string;
  timestamp: number;
  sheikhId: string;
  sheikhName: string;
  surahId: number;
  surahName: string;
  score: number;
  turnedChairs: number;
  audioBlobUrl?: string;
  trophyTitle: string;
}

export interface ConstellationPoint {
  time: number;
  freq: number;
  magnitude: number;
}

export interface MatchedConstellationPair {
  sheikhTime: number;
  sheikhFreq: number;
  userTime: number;
  userFreq: number;
  confidence: number;
}

export interface AcousticFingerprint {
  duration: number;
  timeFrames: number;
  frequencies: number[];
  spectrogram: number[][]; // [timeFrame][freqBin] 0..1
  peakConstellations: ConstellationPoint[];
  landmarkHashes: string[];
  spectralCentroids: number[];
  rmsEnvelope: number[];
  averageVolume: number;
  isSilent: boolean;
  fingerprintHash: string;
}

export type ContentIdMatchLevel =
  | 'IDENTICAL_AUDIO'
  | 'STRONG_VOICE_MATCH'
  | 'MODERATE_SIMILARITY'
  | 'WEAK_SIMILARITY'
  | 'NO_ACOUSTIC_MATCH'
  | 'GIBBERISH_OR_NOISE'
  | 'SILENT_OR_INVALID';

export interface FingerprintComparisonResult {
  overallMatchPercent: number;
  spectralTimbreMatch: number;
  landmarkOverlapPercent: number;
  temporalEnvelopeMatch: number;
  harmonicChromaMatch: number;
  matchedPairsCount: number;
  totalLandmarks: number;
  matchedConstellations: MatchedConstellationPair[];
  timelineSimilarity: Array<{ time: number; matchPercent: number }>;
  contentIdStatus: ContentIdMatchLevel;
  statusTitle: string;
  statusDescription: string;
  sheikhFingerprintId: string;
  userFingerprintId: string;
  sheikhSpectrogram: number[][];
  userSpectrogram: number[][];
  frequencies: number[];
  duration: number;
}

export type StageStep = 'select_sheikh' | 'select_surah' | 'listen' | 'record' | 'result';
