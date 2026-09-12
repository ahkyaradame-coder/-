import { AudioAcousticMetrics, EvaluationResult } from '../types';

export class VoiceRecorderSession {
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private recordedChunks: Blob[] = [];
  private startTime: number = 0;
  private animationFrameId: number | null = null;

  // Real-time metrics
  public pitchSamples: number[] = [];
  public volumeSamples: number[] = [];
  private recognizedTranscript: string = '';

  constructor() {}

  setRecognizedTranscript(text: string) {
    this.recognizedTranscript = text.trim();
  }

  getRecognizedTranscript(): string {
    return this.recognizedTranscript;
  }

  async startRecording(onVolumeUpdate?: (volume: number) => void): Promise<boolean> {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx();
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.8;

      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.sourceNode.connect(this.analyser);

      this.recordedChunks = [];
      this.pitchSamples = [];
      this.volumeSamples = [];

      // Determine supported mimeType
      const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
      let selectedMime = '';
      for (const m of mimeTypes) {
        if (MediaRecorder.isTypeSupported(m)) {
          selectedMime = m;
          break;
        }
      }

      this.mediaRecorder = selectedMime
        ? new MediaRecorder(this.mediaStream, { mimeType: selectedMime })
        : new MediaRecorder(this.mediaStream);

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      this.startTime = Date.now();
      this.mediaRecorder.start(200);

      // Start continuous audio analysis loop
      const timeData = new Float32Array(this.analyser.fftSize);
      const freqData = new Uint8Array(this.analyser.frequencyBinCount);

      const loop = () => {
        if (!this.analyser) return;

        this.analyser.getFloatTimeDomainData(timeData);
        this.analyser.getByteFrequencyData(freqData);

        // Compute RMS volume
        let sum = 0;
        for (let i = 0; i < timeData.length; i++) {
          sum += timeData[i] * timeData[i];
        }
        const rms = Math.sqrt(sum / timeData.length);
        const volume = Math.min(100, Math.round(rms * 280));
        this.volumeSamples.push(volume);

        if (onVolumeUpdate) {
          onVolumeUpdate(volume);
        }

        // Auto-correlation pitch estimation
        const pitch = this.autoCorrelate(timeData, this.audioContext?.sampleRate || 44100);
        if (pitch > 60 && pitch < 600) {
          this.pitchSamples.push(pitch);
        }

        this.animationFrameId = requestAnimationFrame(loop);
      };

      loop();
      return true;
    } catch (err) {
      console.error('Failed to start voice recorder:', err);
      throw err;
    }
  }

  // Pitch estimation via autocorrelation
  private autoCorrelate(buffer: Float32Array, sampleRate: number): number {
    const SIZE = buffer.length;
    let sumOfSquares = 0;
    for (let i = 0; i < SIZE; i++) {
      const val = buffer[i];
      sumOfSquares += val * val;
    }
    const rootMeanSquare = Math.sqrt(sumOfSquares / SIZE);
    if (rootMeanSquare < 0.015) {
      return -1; // Silent or too quiet
    }

    let r1 = 0;
    let r2 = SIZE - 1;
    const thres = 0.2;
    for (let i = 0; i < SIZE / 2; i++) {
      if (Math.abs(buffer[i]) < thres) {
        r1 = i;
        break;
      }
    }
    for (let i = 1; i < SIZE / 2; i++) {
      if (Math.abs(buffer[SIZE - i]) < thres) {
        r2 = SIZE - i;
        break;
      }
    }

    const trimmed = buffer.slice(r1, r2);
    const c = new Array(trimmed.length).fill(0);
    for (let i = 0; i < trimmed.length; i++) {
      for (let j = 0; j < trimmed.length - i; j++) {
        c[i] = c[i] + trimmed[j] * trimmed[j + i];
      }
    }

    let d = 0;
    while (c[d] > c[d + 1]) d++;
    let maxval = -1;
    let maxpos = -1;
    for (let i = d; i < trimmed.length; i++) {
      if (c[i] > maxval) {
        maxval = c[i];
        maxpos = i;
      }
    }

    let T0 = maxpos;
    if (T0 > 0) {
      return sampleRate / T0;
    }
    return -1;
  }

  async stopRecording(): Promise<{ blob: Blob; durationSec: number }> {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    const durationSec = Math.max(1, (Date.now() - this.startTime) / 1000);

    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        const dummyBlob = new Blob(this.recordedChunks, { type: 'audio/webm' });
        this.cleanup();
        resolve({ blob: dummyBlob, durationSec });
        return;
      }

      this.mediaRecorder.onstop = () => {
        const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
        const blob = new Blob(this.recordedChunks, { type: mimeType });
        this.cleanup();
        resolve({ blob, durationSec });
      };

      this.mediaRecorder.stop();
    });
  }

  computeAcousticMetrics(targetDurationSec: number, recordedDurationSec: number): AudioAcousticMetrics {
    const totalSamples = this.volumeSamples.length;
    const maxVolume = totalSamples > 0 ? Math.max(...this.volumeSamples) : 0;
    const averageVolume = totalSamples > 0 ? Math.round(this.volumeSamples.reduce((a, b) => a + b, 0) / totalSamples) : 0;
    const activeSamples = this.volumeSamples.filter((v) => v >= 10);
    const activeRatio = totalSamples > 0 ? activeSamples.length / totalSamples : 0;

    // Strict silence check: no audible sound, negligible active ratio, or too brief (< 1.2s)
    const isSilence = maxVolume < 9 || activeRatio < 0.07 || recordedDurationSec < 1.2;

    if (isSilence) {
      return {
        pitchScore: 0,
        tempoScore: 0,
        energyScore: 0,
        cadenceScore: 0,
        durationRatio: recordedDurationSec / Math.max(1, targetDurationSec),
        averageFrequencyHz: 0,
        isSilence: true,
        isGibberish: false,
        sustainedPitchRatio: 0,
        maxVolume,
        averageVolume,
      };
    }

    // Strict Gibberish / Plosive Burst / Animal Noise check:
    // In authentic Quranic tilawa (which consists of vowels, tajweed madd 2-6 harakat, ghunna):
    // Human voice sustains harmonic pitch across 28%-80% of active frames.
    // In non-quranic plosives, clucking ("بق بق بق"), clicking, tapping, or laughing:
    // sustainedPitchRatio is extremely low (< 0.15) or pitchSamples count is <= 4.
    const sustainedPitchRatio = activeSamples.length > 0 ? this.pitchSamples.length / activeSamples.length : 0;
    
    // Check speech transcript for gibberish words like "بق"
    const lowerTranscript = this.recognizedTranscript.toLowerCase();
    const hasGibberishWords =
      lowerTranscript.includes('بق') ||
      lowerTranscript.includes('طمطم') ||
      lowerTranscript.includes('كوكو') ||
      lowerTranscript.includes('مياو') ||
      lowerTranscript.includes('هههه');

    const isGibberish =
      hasGibberishWords ||
      sustainedPitchRatio < 0.16 ||
      this.pitchSamples.length <= 4;

    if (isGibberish) {
      return {
        pitchScore: 0,
        tempoScore: 0,
        energyScore: 0,
        cadenceScore: 0,
        durationRatio: recordedDurationSec / Math.max(1, targetDurationSec),
        averageFrequencyHz: 0,
        isSilence: false,
        isGibberish: true,
        sustainedPitchRatio,
        maxVolume,
        averageVolume,
        recognizedTranscript: this.recognizedTranscript,
      };
    }

    // 1. Duration & Tempo score
    const durationRatio = recordedDurationSec / targetDurationSec;
    let tempoScore = 70;
    if (durationRatio >= 0.75 && durationRatio <= 1.35) {
      tempoScore = Math.round(95 - Math.abs(1 - durationRatio) * 45);
    } else if (durationRatio < 0.75) {
      // Way too fast or cut off
      tempoScore = Math.round(75 * (durationRatio / 0.75));
    } else {
      tempoScore = Math.max(0, Math.round(78 - (durationRatio - 1.35) * 25));
    }

    // 2. Pitch analysis
    let averageFrequencyHz = 160;
    let pitchScore = 50;
    if (this.pitchSamples.length > 5) {
      const sum = this.pitchSamples.reduce((a, b) => a + b, 0);
      averageFrequencyHz = Math.round(sum / this.pitchSamples.length);

      let varianceSum = 0;
      for (const p of this.pitchSamples) {
        varianceSum += Math.pow(p - averageFrequencyHz, 2);
      }
      const stdDev = Math.sqrt(varianceSum / this.pitchSamples.length);
      if (stdDev >= 12 && stdDev <= 55) {
        pitchScore = Math.min(96, Math.round(78 + (stdDev / 55) * 18));
      } else {
        pitchScore = Math.max(0, Math.round(65 - Math.abs(stdDev - 30) * 0.8));
      }
    } else {
      pitchScore = 0; // No vocal resonance detected
    }

    // 3. Energy & Breath Support
    let energyScore = 50;
    if (activeRatio > 0.4 && activeRatio < 0.9) {
      energyScore = Math.min(95, Math.round(75 + activeRatio * 20));
    } else {
      energyScore = Math.max(0, Math.round(activeRatio * 80));
    }

    // 4. Cadence & Pauses
    const cadenceScore = Math.min(
      95,
      Math.max(0, Math.round((tempoScore * 0.4 + pitchScore * 0.35 + energyScore * 0.25)))
    );

    return {
      pitchScore: Math.min(98, Math.max(0, pitchScore)),
      tempoScore: Math.min(98, Math.max(0, tempoScore)),
      energyScore: Math.min(98, Math.max(0, energyScore)),
      cadenceScore: Math.min(98, Math.max(0, cadenceScore)),
      durationRatio,
      averageFrequencyHz,
      isSilence: false,
      isGibberish: false,
      sustainedPitchRatio,
      maxVolume,
      averageVolume,
      recognizedTranscript: this.recognizedTranscript,
    };
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  getCurrentPitch(): number {
    if (this.pitchSamples.length === 0) return 0;
    return this.pitchSamples[this.pitchSamples.length - 1] || 0;
  }

  private cleanup() {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch (e) {}
      this.audioContext = null;
    }
    this.sourceNode = null;
    this.analyser = null;
    this.mediaRecorder = null;
  }
}

export function blobToBase64(blob: Blob): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const commaIdx = dataUrl.indexOf(',');
      const base64 = commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : dataUrl;
      const mimeMatch = dataUrl.match(/data:([^;]+);/);
      const mimeType = mimeMatch ? mimeMatch[1] : (blob.type || 'audio/webm');
      resolve({ base64, mimeType });
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function requestRecitationEvaluation(params: {
  sheikhName: string;
  sheikhStyle: string;
  surahName: string;
  ayahText: string;
  audioMetrics: AudioAcousticMetrics;
  recordedDuration: number;
  targetDuration: number;
  audioBase64?: string;
  audioMimeType?: string;
}): Promise<EvaluationResult> {
  // 1. Immediate client-side check for silence
  if (params.audioMetrics.isSilence) {
    return {
      overallScore: 0,
      tajweedScore: 0,
      maqamScore: 0,
      rhythmScore: 0,
      toneScore: 0,
      turnedChairs: 0,
      coachVerdict:
        'لم يتم رصد أي صوت أو تلاوة في التسجيل! كان التسجيل صامتاً تماماً. يرجى التأكد من تشغيل الميكروفون والتلاوة بصوت مسموع وواضح.',
      sheikhHighlights: ['لم يُرصد أي صوت للتلاوة في هذا المقطع'],
      improvementTips: [
        'تأكد من منح المتصفح صلاحية استخدام الميكروفون',
        'تحدث واقرأ الآيات بصوت واضح بمجرد انتهاء العد التنازلي',
        'تأكد من عدم كتم الصوت (Mute) في إعدادات جهازك',
      ],
      vocalTrophyTitle: 'تنبيه: تسجيل صامت (0%)',
      engineUsed: 'acoustic',
      isRecitationValid: false,
      detectionType: 'silence',
      audioDetectedText: 'صمت مطبق - لم يُلتقط أي كلام',
    };
  }

  // 2. Call backend with full audio data for Gemini analysis
  try {
    const res = await fetch('/api/analyze-recitation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (res.ok) {
      const json = await res.json();
      if (json.success && json.data) {
        return {
          ...json.data,
          engineUsed: json.engine || 'gemini',
        };
      }
    }
  } catch (err) {
    console.warn('API recitation evaluation error, using client fallback:', err);
  }

  // 3. Realistic Client-side fallback evaluator (no artificial 70% floor!)
  const m = params.audioMetrics;
  const overall = Math.min(
    95,
    Math.max(
      10,
      Math.round(
        m.pitchScore * 0.35 +
        m.tempoScore * 0.25 +
        m.energyScore * 0.2 +
        m.cadenceScore * 0.2
      )
    )
  );

  const turnedChairs = overall >= 88 ? 4 : overall >= 78 ? 3 : overall >= 65 ? 2 : overall >= 50 ? 1 : 0;
  const isValid = overall >= 40;

  return {
    overallScore: overall,
    tajweedScore: isValid ? Math.min(96, overall + 2) : Math.max(10, overall - 5),
    maqamScore: m.pitchScore,
    rhythmScore: m.tempoScore,
    toneScore: m.energyScore,
    turnedChairs,
    coachVerdict: isValid
      ? `أداء مقارب ومحاولة جيدة لمحاكاة الشيخ ${params.sheikhName}. يتضح الجهد في استحضار المقام والترتيل.`
      : `الأداء المسجل يحتاج إلى مراجعة وتدريب أعمق، أو كان الصوت غير متطابق مع الآيات وأسلوب الشيخ ${params.sheikhName}.`,
    sheikhHighlights: isValid
      ? [
          `محاولة تقريب المقام الصوتي المميز للشيخ ${params.sheikhName}`,
          'حضور طيب في نَفَس التلاوة',
          'مخارج الحروف مقروءة بشكل عام',
        ]
      : ['تم رصد صوت لكنه لم يلتزم بالترتيل المطلوب'],
    improvementTips: [
      `أعد الاستماع لتلاوة الشيخ ${params.sheikhName} وركز على أزمنة المدود والوقف`,
      'اضبط غنة النون والميم بمقدار حركتين صافيتين من الخيشوم',
      'حافظ على استقرار الصوت وعدم التذبذب أثناء ترتيل الآيات',
    ],
    vocalTrophyTitle:
      overall >= 86
        ? `حفيد الترتيل لصوت ${params.sheikhName}`
        : overall >= 65
        ? `مرتل واعد في مدرسة ${params.sheikhName}`
        : `محاولة تحتاج لمزيد من المران والتجويد`,
    engineUsed: 'acoustic',
    isRecitationValid: isValid,
    detectionType: isValid ? 'valid_recitation' : 'unintelligible',
  };
}
