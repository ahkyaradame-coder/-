import {
  AcousticFingerprint,
  ConstellationPoint,
  ContentIdMatchLevel,
  FingerprintComparisonResult,
  MatchedConstellationPair,
} from '../types';

// Frequency bands for vocal fingerprinting (from 80Hz up to 4500Hz)
export const VOCAL_FREQ_BANDS = [
  80, 110, 145, 185, 230, 285, 350, 425, 510, 610, 725, 855,
  1000, 1165, 1350, 1560, 1800, 2070, 2375, 2720, 3110, 3550, 4050, 4600
];

/**
 * Fetch and decode audio into an AudioBuffer using the AudioContext
 */
export async function loadAudioBufferFromUrl(
  audioUrl: string,
  audioCtx: AudioContext
): Promise<AudioBuffer> {
  let res: Response;
  try {
    res = await fetch(audioUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch {
    // If direct fetch fails (e.g. CORS), use the server proxy
    const proxyUrl = `/api/proxy-audio?url=${encodeURIComponent(audioUrl)}`;
    res = await fetch(proxyUrl);
    if (!res.ok) throw new Error(`Failed to load audio from proxy: HTTP ${res.status}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return await audioCtx.decodeAudioData(arrayBuffer);
}

/**
 * Decode a recorded audio Blob into an AudioBuffer
 */
export async function loadAudioBufferFromBlob(
  blob: Blob,
  audioCtx: AudioContext
): Promise<AudioBuffer> {
  const arrayBuffer = await blob.arrayBuffer();
  return await audioCtx.decodeAudioData(arrayBuffer);
}

/**
 * Generate an acoustic fingerprint, spectrogram, and constellation map from PCM audio
 */
export function generateAudioFingerprint(
  audioBuffer: AudioBuffer,
  idPrefix: string = 'FP'
): AcousticFingerprint {
  const sampleRate = audioBuffer.sampleRate;
  const rawPcm = audioBuffer.getChannelData(0);
  const duration = audioBuffer.duration;

  // Window parameters
  const frameSize = 1024;
  const hopSize = 512;
  const totalFrames = Math.max(1, Math.floor((rawPcm.length - frameSize) / hopSize));

  // Pre-calculate Hanning window
  const hanning = new Float32Array(frameSize);
  for (let i = 0; i < frameSize; i++) {
    hanning[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (frameSize - 1)));
  }

  const numBands = VOCAL_FREQ_BANDS.length;
  const spectrogram: number[][] = [];
  const rmsEnvelope: number[] = [];
  const spectralCentroids: number[] = [];
  const peakConstellations: ConstellationPoint[] = [];

  let totalRms = 0;
  let maxVolume = 0;

  // Discrete Fourier / Filter Bank analysis per frame
  for (let f = 0; f < totalFrames; f++) {
    const startIdx = f * hopSize;
    const timeSec = (startIdx + frameSize / 2) / sampleRate;

    // Windowed frame & RMS calculation
    let frameSumSq = 0;
    const windowed = new Float32Array(frameSize);
    for (let i = 0; i < frameSize; i++) {
      const sample = rawPcm[startIdx + i] || 0;
      windowed[i] = sample * hanning[i];
      frameSumSq += sample * sample;
    }
    const frameRms = Math.sqrt(frameSumSq / frameSize);
    const frameVol = Math.min(100, Math.round(frameRms * 280));
    rmsEnvelope.push(frameVol);
    totalRms += frameRms;
    if (frameVol > maxVolume) maxVolume = frameVol;

    // Compute band energies using Goertzel / band filtering approximation
    const bandEnergies = new Float32Array(numBands);
    let weightedFreqSum = 0;
    let totalEnergy = 0;

    for (let b = 0; b < numBands; b++) {
      const targetFreq = VOCAL_FREQ_BANDS[b];
      const k = Math.round((targetFreq * frameSize) / sampleRate);

      // 4-point DFT bin sum around target frequency
      let real = 0;
      let imag = 0;
      const binRadius = 1;

      for (let bin = Math.max(0, k - binRadius); bin <= Math.min(frameSize / 2, k + binRadius); bin++) {
        const omega = (2 * Math.PI * bin) / frameSize;
        let r = 0;
        let im = 0;
        for (let i = 0; i < frameSize; i += 2) {
          const w = windowed[i];
          r += w * Math.cos(omega * i);
          im -= w * Math.sin(omega * i);
        }
        real += r;
        imag += im;
      }

      const mag = Math.sqrt(real * real + imag * imag);
      const normalizedMag = Math.min(1, mag / 25);
      bandEnergies[b] = normalizedMag;

      weightedFreqSum += targetFreq * normalizedMag;
      totalEnergy += normalizedMag;
    }

    spectrogram.push(Array.from(bandEnergies));

    // Spectral centroid (brightness)
    const centroid = totalEnergy > 0.05 ? weightedFreqSum / totalEnergy : 0;
    spectralCentroids.push(centroid);

    // Peak Constellation Extraction (Content ID / Shazam style)
    if (frameRms > 0.02) {
      // Find local peak in 3 key frequency ranges
      const ranges = [
        { min: 0, max: 7 },   // Bass / Fundament (80 - 425Hz)
        { min: 8, max: 15 },  // Warmth & Formants (510 - 1560Hz)
        { min: 16, max: 23 }, // Clarity & High Formants (1800 - 4600Hz)
      ];

      for (const range of ranges) {
        let maxBand = -1;
        let maxEnergy = 0;
        for (let b = range.min; b <= range.max; b++) {
          if (bandEnergies[b] > maxEnergy && bandEnergies[b] > 0.35) {
            maxEnergy = bandEnergies[b];
            maxBand = b;
          }
        }

        if (maxBand !== -1) {
          peakConstellations.push({
            time: Math.round(timeSec * 100) / 100,
            freq: VOCAL_FREQ_BANDS[maxBand],
            magnitude: Math.round(maxEnergy * 100) / 100,
          });
        }
      }
    }
  }

  const averageVolume = Math.round((totalRms / Math.max(1, totalFrames)) * 280);
  const isSilent = maxVolume < 6 || averageVolume < 2;

  // Generate Landmark Hashes (pairs of peaks separated in time)
  const landmarkHashes: string[] = [];
  for (let i = 0; i < peakConstellations.length; i++) {
    const p1 = peakConstellations[i];
    for (let j = i + 1; j < Math.min(i + 5, peakConstellations.length); j++) {
      const p2 = peakConstellations[j];
      const deltaT = Math.round((p2.time - p1.time) * 10);
      if (deltaT > 0 && deltaT <= 15) {
        landmarkHashes.push(`${p1.freq}:${p2.freq}:${deltaT}`);
      }
    }
  }

  // Generate short Content ID hash string
  let checksum = 0;
  for (let i = 0; i < Math.min(20, landmarkHashes.length); i++) {
    for (let c = 0; c < landmarkHashes[i].length; c++) {
      checksum = (checksum * 31 + landmarkHashes[i].charCodeAt(c)) & 0xfffffff;
    }
  }
  const fingerprintHash = `${idPrefix}-${Math.abs(checksum).toString(16).toUpperCase().padStart(8, '0')}`;

  return {
    duration,
    timeFrames: totalFrames,
    frequencies: VOCAL_FREQ_BANDS,
    spectrogram,
    peakConstellations,
    landmarkHashes,
    spectralCentroids,
    rmsEnvelope,
    averageVolume,
    isSilent,
    fingerprintHash,
  };
}

/**
 * Compare two acoustic fingerprints like copyright detection / Content ID engines
 */
export function compareAcousticFingerprints(
  sheikhFp: AcousticFingerprint,
  userFp: AcousticFingerprint
): FingerprintComparisonResult {
  const duration = Math.max(sheikhFp.duration, userFp.duration);

  // 1. Silent check
  if (userFp.isSilent) {
    return {
      overallMatchPercent: 0,
      spectralTimbreMatch: 0,
      landmarkOverlapPercent: 0,
      temporalEnvelopeMatch: 0,
      harmonicChromaMatch: 0,
      matchedPairsCount: 0,
      totalLandmarks: sheikhFp.peakConstellations.length,
      matchedConstellations: [],
      timelineSimilarity: Array.from({ length: Math.ceil(duration) }, (_, i) => ({
        time: i,
        matchPercent: 0,
      })),
      contentIdStatus: 'SILENT_OR_INVALID',
      statusTitle: '🔇 تسجيل صامت - لا توجد بصمة صوتية',
      statusDescription:
        'لم يتم رصد أي ترددات صوتية أو بصمة مسموعة في التسجيل. نظام الفحص يتطلب صوتاً حقيقياً لإجراء المقارنة.',
      sheikhFingerprintId: sheikhFp.fingerprintHash,
      userFingerprintId: 'FP-EMPTY-SILENCE',
      sheikhSpectrogram: sheikhFp.spectrogram,
      userSpectrogram: userFp.spectrogram,
      frequencies: VOCAL_FREQ_BANDS,
      duration,
    };
  }

  // 2. Peak Constellation Landmark Matching (Shazam / AcoustID style)
  const sheikhHashesSet = new Set(sheikhFp.landmarkHashes);
  let matchedHashCount = 0;
  for (const hash of userFp.landmarkHashes) {
    if (sheikhHashesSet.has(hash)) {
      matchedHashCount++;
    }
  }

  // In Content ID / Shazam: 1 or 2 hash collisions are random noise.
  // Genuine audio match requires clustered landmark alignment (at least 3+ hashes).
  const effectiveHashMatches = matchedHashCount >= 3 ? matchedHashCount : 0;
  const landmarkOverlapPercent =
    sheikhFp.landmarkHashes.length > 0 && effectiveHashMatches > 0
      ? Math.min(100, Math.round((effectiveHashMatches / sheikhFp.landmarkHashes.length) * 160))
      : 0;

  // Find matching constellation coordinate pairs for visual rendering
  const matchedConstellations: MatchedConstellationPair[] = [];
  if (effectiveHashMatches > 0) {
    for (const uPoint of userFp.peakConstellations) {
      let bestSheikhPoint: ConstellationPoint | null = null;
      let minDistance = Infinity;

      for (const sPoint of sheikhFp.peakConstellations) {
        const timeDiff = Math.abs(uPoint.time - sPoint.time);
        const freqDiff = Math.abs(uPoint.freq - sPoint.freq);

        if (timeDiff <= 1.2 && freqDiff <= 50) {
          const dist = timeDiff * 30 + freqDiff * 0.5;
          if (dist < minDistance) {
            minDistance = dist;
            bestSheikhPoint = sPoint;
          }
        }
      }

      if (bestSheikhPoint) {
        const confidence = Math.max(
          40,
          Math.min(99, Math.round(100 - minDistance * 1.5))
        );
        matchedConstellations.push({
          sheikhTime: bestSheikhPoint.time,
          sheikhFreq: bestSheikhPoint.freq,
          userTime: uPoint.time,
          userFreq: uPoint.freq,
          confidence,
        });
      }
    }
  }

  // 3. Spectral Cosine Similarity across Time
  // Audio spectra in positive frequency domain have baseline random correlation around 0.30 - 0.35.
  // Any similarity <= 0.35 is pure noise/unrelated sounds.
  const numTimeSlices = 20;
  const timelineSimilarity: Array<{ time: number; matchPercent: number }> = [];
  let totalCosineSim = 0;
  let validSlices = 0;

  for (let s = 0; s < numTimeSlices; s++) {
    const timeRatio = s / (numTimeSlices - 1);
    const sliceTime = timeRatio * duration;

    const sFrameIdx = Math.min(
      sheikhFp.spectrogram.length - 1,
      Math.floor(timeRatio * sheikhFp.spectrogram.length)
    );
    const uFrameIdx = Math.min(
      userFp.spectrogram.length - 1,
      Math.floor(timeRatio * userFp.spectrogram.length)
    );

    const sVec = sheikhFp.spectrogram[sFrameIdx] || [];
    const uVec = userFp.spectrogram[uFrameIdx] || [];

    // Cosine similarity
    let dot = 0;
    let normS = 0;
    let normU = 0;
    for (let b = 0; b < VOCAL_FREQ_BANDS.length; b++) {
      const sv = sVec[b] || 0;
      const uv = uVec[b] || 0;
      dot += sv * uv;
      normS += sv * sv;
      normU += uv * uv;
    }

    let sliceSim = 0;
    if (normS > 0.01 && normU > 0.01) {
      const rawSim = dot / (Math.sqrt(normS) * Math.sqrt(normU));
      // Calibrate: remove baseline ambient noise floor (0.35)
      sliceSim = rawSim > 0.35 ? (rawSim - 0.35) / (1 - 0.35) : 0;
      totalCosineSim += sliceSim;
      validSlices++;
    }

    const slicePercent = Math.round(Math.min(100, Math.max(0, sliceSim * 100)));
    timelineSimilarity.push({
      time: Math.round(sliceTime * 10) / 10,
      matchPercent: slicePercent,
    });
  }

  const spectralTimbreMatch =
    validSlices > 0 ? Math.round((totalCosineSim / validSlices) * 100) : 0;

  // 4. Temporal Envelope Correlation (RMS Volume dynamics & Pauses)
  let sumProd = 0;
  let sumU = 0;
  let sumS = 0;
  const samplePoints = Math.min(50, Math.min(sheikhFp.rmsEnvelope.length, userFp.rmsEnvelope.length));

  for (let i = 0; i < samplePoints; i++) {
    const sVal = sheikhFp.rmsEnvelope[Math.floor((i / samplePoints) * sheikhFp.rmsEnvelope.length)] || 0;
    const uVal = userFp.rmsEnvelope[Math.floor((i / samplePoints) * userFp.rmsEnvelope.length)] || 0;
    sumProd += sVal * uVal;
    sumS += sVal * sVal;
    sumU += uVal * uVal;
  }

  const temporalEnvelopeMatch =
    sumS > 0.001 && sumU > 0.001 && sumProd > 0
      ? Math.round(Math.min(98, Math.max(0, (sumProd / (Math.sqrt(sumS) * Math.sqrt(sumU))) * 100)))
      : 0;

  // 5. Harmonic Chroma / Maqam Pitch distribution similarity
  let harmonicChromaMatch = 0;
  if (landmarkOverlapPercent > 0 || spectralTimbreMatch > 15) {
    harmonicChromaMatch = Math.round(
      spectralTimbreMatch * 0.6 + landmarkOverlapPercent * 0.4
    );
  }

  // 6. Overall Content ID Fingerprint Match Calculation
  let overallMatchPercent = 0;
  if (landmarkOverlapPercent > 0 || spectralTimbreMatch >= 20) {
    overallMatchPercent = Math.min(
      98,
      Math.max(
        0,
        Math.round(
          spectralTimbreMatch * 0.4 +
            landmarkOverlapPercent * 0.3 +
            temporalEnvelopeMatch * 0.2 +
            harmonicChromaMatch * 0.1
        )
      )
    );
  }

  // Determine Content ID Status Level
  let contentIdStatus: ContentIdMatchLevel = 'NO_ACOUSTIC_MATCH';
  let statusTitle = 'بصمة صوتية غير متطابقة (0%)';
  let statusDescription = 'لم يتم العثور على تشابه كافٍ في البصمة الترددية أو النبرة الصوتية مع تلاوة الشيخ المختار.';

  // Check if it was gibberish/plosives like "بق بق بق" (few constellations or zero overlap)
  const isGibberishOrNoise =
    userFp.peakConstellations.length < 5 ||
    (landmarkOverlapPercent === 0 && spectralTimbreMatch < 10);

  if (isGibberishOrNoise) {
    overallMatchPercent = 0;
    contentIdStatus = 'GIBBERISH_OR_NOISE';
    statusTitle = '❌ أصوات عشوائية / غير قرآنية (0% تطابق)';
    statusDescription =
      'رصد نظام Content ID أصواتاً عشوائية أو متقطعة (مثل بقبقة أو نقرات أو أصوات فم) دون أي تلاوة أو معالم متطابقة مع تلاوة الشيخ المختار.';
  } else if (overallMatchPercent >= 92) {
    contentIdStatus = 'IDENTICAL_AUDIO';
    statusTitle = '🛡️ تطابق تام للبصمة الصوتية (Identical Master Track)';
    statusDescription =
      'كاشف البصمة رصد تطابقاً فائق الدقة في معالم التردد ورنين النبرة، محاكاة شبه مطابقة للمقطع الأصلي!';
  } else if (overallMatchPercent >= 75) {
    contentIdStatus = 'STRONG_VOICE_MATCH';
    statusTitle = '✨ تطابق بصمة صوتية عالي (High Acoustic Match)';
    statusDescription =
      'تم رصد توافق ملحوظ في البصمة الصوتية وتوزيع الفورمانت والوقفات مع تلاوة الشيخ المختار.';
  } else if (overallMatchPercent >= 50) {
    contentIdStatus = 'MODERATE_SIMILARITY';
    statusTitle = '⚖️ تشابه جزئي في البصمة الصوتية (Partial Match)';
    statusDescription =
      'يوجد تطابق في بعض المقاطع والترددات، مع وجود تباين في سرعة الترتيل أو خامة الصوت.';
  } else if (overallMatchPercent >= 25) {
    contentIdStatus = 'WEAK_SIMILARITY';
    statusTitle = '⚠️ تشابه طفيف في البصمة الصوتية (Weak Match)';
    statusDescription =
      'البصمة الصوتية تظهر اختلافاً كبيراً في النغم والترددات عن المرجع الصوتي للشيخ.';
  }

  return {
    overallMatchPercent,
    spectralTimbreMatch,
    landmarkOverlapPercent,
    temporalEnvelopeMatch,
    harmonicChromaMatch,
    matchedPairsCount: matchedConstellations.length,
    totalLandmarks: sheikhFp.peakConstellations.length,
    matchedConstellations,
    timelineSimilarity,
    contentIdStatus,
    statusTitle,
    statusDescription,
    sheikhFingerprintId: sheikhFp.fingerprintHash,
    userFingerprintId: userFp.fingerprintHash,
    sheikhSpectrogram: sheikhFp.spectrogram,
    userSpectrogram: userFp.spectrogram,
    frequencies: VOCAL_FREQ_BANDS,
    duration,
  };
}
