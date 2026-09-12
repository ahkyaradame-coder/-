import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "25mb" }));

// Initialize Google GenAI lazily
let aiClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) {
    return null;
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// Health endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// Audio proxy endpoint for EveryAyah reciter files to allow CORS-free AudioContext decoding
app.get("/api/proxy-audio", async (req, res) => {
  try {
    const audioUrl = req.query.url as string;
    if (!audioUrl) {
      return res.status(400).send("Missing audio url parameter");
    }

    const parsed = new URL(audioUrl);
    if (!parsed.hostname.includes("everyayah.com") && !parsed.hostname.includes("quran.com")) {
      return res.status(403).send("Forbidden domain");
    }

    const response = await fetch(audioUrl);
    if (!response.ok) {
      return res.status(response.status).send(`Failed to fetch audio: ${response.statusText}`);
    }

    res.setHeader("Content-Type", response.headers.get("content-type") || "audio/mpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("Access-Control-Allow-Origin", "*");

    const arrayBuffer = await response.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err: any) {
    console.error("Audio proxy error:", err);
    res.status(500).send("Proxy error: " + err.message);
  }
});

// Voice analysis endpoint
app.post("/api/analyze-recitation", async (req, res) => {
  try {
    const {
      sheikhName,
      sheikhStyle,
      surahName,
      ayahText,
      audioMetrics,
      recordedDuration,
      targetDuration,
      audioBase64,
      audioMimeType,
      userNotes,
    } = req.body;

    // 1. Instant check for complete silence
    if (audioMetrics?.isSilence) {
      return res.json({
        success: true,
        data: {
          overallScore: 0,
          tajweedScore: 0,
          maqamScore: 0,
          rhythmScore: 0,
          toneScore: 0,
          turnedChairs: 0,
          isRecitationValid: false,
          detectionType: "silence",
          coachVerdict:
            "لم يتم رصد أي صوت أو تلاوة في التسجيل! كان التسجيل صامتاً تماماً. يرجى التأكد من تشغيل الميكروفون والترتيل بصوت واضح ومسموع.",
          sheikhHighlights: ["لم يتم رصد صوت للتقييم"],
          improvementTips: [
            "تأكد من تفعيل صلاحية الميكروفون في المتصفح",
            "اقرأ الآيات بصوت واضح بمجرد انتهاء العد التنازلي",
            "تأكد من عدم كتم صوت الميكروفون في جهازك",
          ],
          vocalTrophyTitle: "تنبيه: تسجيل صامت (0%)",
          audioDetectedText: "صمت مطبق - لم يُلتقط أي كلام",
        },
        engine: "silence_guard",
      });
    }

    // 1b. Instant check for non-quranic plosives, gibberish, clucking ("بق بق بق"), clicking, or zero vocal resonance
    if (audioMetrics?.isGibberish) {
      return res.json({
        success: true,
        data: {
          overallScore: 0,
          tajweedScore: 0,
          maqamScore: 0,
          rhythmScore: 0,
          toneScore: 0,
          turnedChairs: 0,
          isRecitationValid: false,
          detectionType: "gibberish_non_quranic",
          coachVerdict:
            "تم رصد أصوات عشوائية أو هراء متقطع (مثل بقبقة 'بق بق بق' أو نقرات فم) وليس تلاوة لآيات القرآن الكريم! هذا التطبيق مخصص حصرياً للقرآن الكريم ومحاكاة القراء، النتيجة 0% بدون التفات لأي كرسي.",
          sheikhHighlights: ["لم يتم رصد تلاوة قرآنية إطلاقاً"],
          improvementTips: [
            "اقرأ الآيات الكريمة المكتوبة أمامك بترتيل وتجويد حقيقي",
            "تجنب إصدار أصوات عشوائية أو هراء بالميكروفون",
            "استمع لتلاوة الشيخ أولاً وكرر خلفه بتركيز وخشوع",
          ],
          vocalTrophyTitle: "تنبيه: أصوات عشوائية مرفوضة (0%)",
          audioDetectedText: audioMetrics?.recognizedTranscript || "أصوات عشوائية / غير قرآنية (بقبقة أو نقرات: بق بق بق)",
        },
        engine: "gibberish_guard",
      });
    }

    const ai = getGenAI();

    // 2. If Gemini is available, pass the ACTUAL AUDIO to gemini-3.8-flash to listen, transcribe & verify
    if (ai) {
      try {
        const prompt = `أنت المحكّم الصوتي والقرآني الصارم في مسابقة "The Choice Voice / صوت الاختيار".
المتسابق مطالب بترتيل ومحاكاة الآيات الكريمة التالية:
- السورة الكريمة: "${surahName}"
- نص الآيات المطلوبة: "${ayahText}"
- القارئ الشيخ المطلوب محاكاته: "${sheikhName}" (${sheikhStyle})
- مدة التسجيل الصوتي: ${recordedDuration ? recordedDuration.toFixed(1) + ' ثانية' : 'غير محدد'} (المدة الأصلية لتلاوة الشيخ: ${targetDuration ? targetDuration.toFixed(1) + ' ثانية' : 'غير محدد'})

المهمة الفاصلة (استمع بدقة للأوديو المرفق واحكم بصدق ومصداقية تامة دون مجاملة):

الحالة الأولى: [الصمت أو انعدام الصوت]
إذا كان الملف المرفق صامتاً تماماً، أو مجرد وشوشة ميكروفون، أو تنفس هادئ، أو نقرات دون قراءة:
- overallScore = 0
- tajweedScore = 0
- maqamScore = 0
- rhythmScore = 0
- toneScore = 0
- turnedChairs = 0
- isRecitationValid = false
- detectionType = "silence"
- coachVerdict = "لم يتم رصد أي تلاوة في التسجيل! كان الصوت صامتاً تماماً. يرجى تلاوة الآيات الكريمة بصوت مسموع."
- vocalTrophyTitle = "تنبيه: لا يوجد صوت مسجل (0%)"
- audioDetectedText = "صمت أو وشوشة فقط"

الحالة الثانية: [الغناء أو الحديث العادي غير القرآني]
إذا قام المستخدم بالغناء (أغنية طربية، شيلات، بوب، راب، ألحان غنائية)، أو التحدث بكلام عادي أو ضحك:
- overallScore = 0
- tajweedScore = 0
- maqamScore = 0
- rhythmScore = 0
- toneScore = 0
- turnedChairs = 0
- isRecitationValid = false
- detectionType = "singing_non_quranic"
- coachVerdict = "عذراً! تم رصد غناء أو كلام عادي وليس تلاوة للآيات الكريمة المطلوبة! هذا التطبيق مخصص حصرياً لتلاوة القرآن الكريم ومحاكاة القراء."
- vocalTrophyTitle = "تنبيه: تم رصد غناء / محتوى غير قرآني (0%)"
- audioDetectedText = صف باختصار ما سمعته (مثال: "تم رصد غناء أو حديث غير قرآني")

الحالة الثالثة: [الهراء، التمتمة، الأصوات العشوائية، البقبقة مثل "بق بق بق"، أصوات الحيوانات والطيور، الصياح أو الاستهزاء]
إذا كان المتسابق يصدر أصواتاً عشوائية مثل "بق بق بق"، نقرات باللسان، تمتمات غير مفهومة، مواء أو نباح، صفير، قهقهة، أو أصوات لا تمت لآيات السورة بصلة:
- overallScore = 0 حتماً (صفر بالمئة)! ممنوع إعطاء أي نسبة!
- tajweedScore = 0
- maqamScore = 0
- rhythmScore = 0
- toneScore = 0
- turnedChairs = 0
- isRecitationValid = false
- detectionType = "gibberish_non_quranic"
- coachVerdict = "تم رصد أصوات عشوائية أو هراء غير قرآني (مثل بقبقة أو نقرات) وليس تلاوة لآيات القرآن الكريم! النتيجة 0%."
- vocalTrophyTitle = "تنبيه: أصوات عشوائية مرفوضة (0%)"
- audioDetectedText = صف الصوت بدقة (مثال: "أصوات بقبقة ونقرات فم: بق بق بق")

الحالة الرابعة: [تلاوة قرآنية حقيقية للآيات]
- isRecitationValid = true
- detectionType = "valid_recitation"
- audioDetectedText = الآيات أو الكلمات التي تم رصدها في التلاوة.
- قيّم بموضوعية تامة وصرامة مدى دقة التجويد، والمخارج، ومدى نجاحه في تقليد مقام وخامة وصوت الشيخ "${sheikhName}":
  * إذا كانت التلاوة ركيكة جداً أو بعيدة عن الشيخ: ضع نسبة عادلة بين 15% و 40%.
  * إذا كانت مقبولة مع أخطاء في التجويد والمحاكاة: بين 50% و 65%.
  * إذا كانت جيدة ومحاكية للشيخ: بين 68% و 84%.
  * إذا كانت محاكاة إعجازية متقنة جداً: بين 85% و 96%.
- احسب عدد الكراسي التي التفت له بدقة:
  * أقل من 50%: 0 كراسي (لم يلتف له أي كرسي)
  * من 50% إلى 64%: كرسي واحد (1)
  * من 65% إلى 77%: كرسيان (2)
  * من 78% إلى 88%: 3 كراسي
  * من 89% إلى 100%: 4 كراسي
- اكتب تعليقاً حقيقياً ومفصلاً عن أدائه الصوتي، واذكر 3 نقاط قوة حقيقية و3 نصائح لتصحيح الأخطاء.`;

        const contents: any[] = [];

        // Attach user's audio if provided
        if (audioBase64) {
          contents.push({
            inlineData: {
              mimeType: audioMimeType || "audio/webm",
              data: audioBase64,
            },
          });
        }

        contents.push({
          text: prompt,
        });

        const candidateModels = ["gemini-3.8-flash", "gemini-2.5-flash"];
        let response: any = null;
        let lastError: any = null;

        for (const modelName of candidateModels) {
          try {
            response = await ai.models.generateContent({
              model: modelName,
              contents: contents,
              config: {
                responseMimeType: "application/json",
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    overallScore: {
                      type: Type.INTEGER,
                      description: "نسبة التطابق الإجمالية (0 إذا صمت أو غناء، ومن 20 إلى 98 إذا تلاوة)",
                    },
                    tajweedScore: {
                      type: Type.INTEGER,
                      description: "نسبة التجويد والمخارج والمدود بين 0 و 100",
                    },
                    maqamScore: {
                      type: Type.INTEGER,
                      description: "نسبة تمثيل مقام وأسلوب الشيخ بين 0 و 100",
                    },
                    rhythmScore: {
                      type: Type.INTEGER,
                      description: "نسبة سرعة الأداء والوقف والابتداء بين 0 و 100",
                    },
                    toneScore: {
                      type: Type.INTEGER,
                      description: "نسبة خامة ونبرة الصوت والخشوع بين 0 و 100",
                    },
                    turnedChairs: {
                      type: Type.INTEGER,
                      description: "عدد الكراسي التي التفت من 0 إلى 4",
                    },
                    isRecitationValid: {
                      type: Type.BOOLEAN,
                      description: "صحيح فقط إذا كان الصوت تلاوة قرآنية حقيقية للآيات",
                    },
                    detectionType: {
                      type: Type.STRING,
                      description: "أحد الخيارات: valid_recitation, silence, singing_non_quranic, unintelligible",
                    },
                    audioDetectedText: {
                      type: Type.STRING,
                      description: "وصف مقتضب للكلام أو الصوت الذي تم رصده في التسجيل",
                    },
                    coachVerdict: {
                      type: Type.STRING,
                      description: "حكم وتعليق المحكّم بأسلوب The Voice الصريح والموضوعي",
                    },
                    sheikhHighlights: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: "نقاط القوة أو ما تم رصده",
                    },
                    improvementTips: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: "نقاط عملية ومحددة لتصحيح الأداء",
                    },
                    vocalTrophyTitle: {
                      type: Type.STRING,
                      description: "لقب التقييم أو التنبيه",
                    },
                  },
                  required: [
                    "overallScore",
                    "tajweedScore",
                    "maqamScore",
                    "rhythmScore",
                    "toneScore",
                    "turnedChairs",
                    "isRecitationValid",
                    "detectionType",
                    "coachVerdict",
                    "sheikhHighlights",
                    "improvementTips",
                    "vocalTrophyTitle",
                  ],
                },
              },
            });
            if (response?.text) break;
          } catch (mErr) {
            lastError = mErr;
            console.warn(`Model ${modelName} error (e.g. 503), trying next model:`, mErr);
          }
        }

        if (!response && lastError) {
          throw lastError;
        }

        if (response.text) {
          const parsed = JSON.parse(response.text.trim());
          return res.json({ success: true, data: parsed, engine: "gemini" });
        }
      } catch (geminiError) {
        console.warn("Gemini evaluation error, falling back to acoustic algorithm:", geminiError);
      }
    }

    // 3. Algorithmic evaluation fallback (when Gemini is unavailable)
    // Honest acoustic calculations: NO arbitrary 30% or 62% floors!
    const pScore = Math.max(0, Math.min(96, Math.round(audioMetrics?.pitchScore || 0)));
    const tScore = Math.max(0, Math.min(98, Math.round(audioMetrics?.tempoScore || 0)));
    const eScore = Math.max(0, Math.min(95, Math.round(audioMetrics?.energyScore || 0)));
    const cScore = Math.max(0, Math.min(94, Math.round(audioMetrics?.cadenceScore || 0)));

    // Must have genuine vocal cord resonance and sustained pitch continuity to be valid tilawa
    const isGibberishOrNoise =
      audioMetrics?.isGibberish ||
      audioMetrics?.isSilence ||
      pScore < 20 ||
      cScore < 15;

    const isValid = !isGibberishOrNoise && pScore >= 25 && cScore >= 25;
    const overall = isValid ? Math.round(pScore * 0.35 + tScore * 0.25 + eScore * 0.2 + cScore * 0.2) : 0;
    const turnedChairs = overall >= 88 ? 4 : overall >= 78 ? 3 : overall >= 65 ? 2 : overall >= 50 ? 1 : 0;

    const fallbackResult = {
      overallScore: overall,
      tajweedScore: isValid ? Math.min(99, Math.round(overall + 2)) : 0,
      maqamScore: isValid ? pScore : 0,
      rhythmScore: isValid ? tScore : 0,
      toneScore: isValid ? eScore : 0,
      turnedChairs,
      isRecitationValid: isValid,
      detectionType: isGibberishOrNoise
        ? "gibberish_non_quranic"
        : isValid
        ? "valid_recitation"
        : "unintelligible",
      audioDetectedText: isGibberishOrNoise
        ? audioMetrics?.recognizedTranscript || "أصوات عشوائية أو هراء غير قرآني (مثل بقبقة أو نقرات)"
        : isValid
        ? "تلاوة قرآنية تم تحليلها عبر المرسام الصوتي"
        : "صوت غير واضح أو لم يلتزم بالترتيل",
      coachVerdict: isGibberishOrNoise
        ? `عذراً! تم رصد أصوات متقطعة أو هراء (مثل بقبقة أو نقرات) وليس تلاوة لآيات القرآن الكريم. المسابقة تشترط التلاوة والترتيل الصحيح، النتيجة 0%.`
        : isValid
        ? `محاولة واعدة لمحاكاة مدرسة الشيخ ${sheikhName}. استمر في التدرب لضبط مخارج الحروف وأزمنة المدود.`
        : `لم يكن الأداء متطابقاً مع تلاوة الشيخ ${sheikhName} أو كانت التلاوة غير واضحة. يرجى إعادة المحاولة مع مراعاة الترتيل.`,
      sheikhHighlights: isValid
        ? [
            `محاكاة لطبقة الصوت وانسيابية الترتيل عند الشيخ ${sheikhName}`,
            "وضوح في بعض مخارج الحروف وتأدية الحركات الإعرابية",
            "محاولة استحضار الخشوع في نبرة الإلقاء",
          ]
        : ["لم يتم رصد تلاوة قرآنية مقبولة للمقارنة"],
      improvementTips: isGibberishOrNoise
        ? [
            "تجنب إصدار أصوات عشوائية أو هراء بالميكروفون",
            "اقرأ الآيات المكتوبة أمامك بترتيل وتجويد حقيقي",
            "استمع لتلاوة الشيخ أولاً وحاول محاكاتها بتركيز وخشوع",
          ]
        : [
            `انتبه لضبط زمن المدود (المد الطبيعي والمنفصل) بدقة الشيخ ${sheikhName}`,
            "حافظ على تدفق النفس وتوزيع الهواء لعدم انقطاع الصوت قبل رأس الآية",
            "ركز على نغمات الانتقال في المقام الصوتي لإبراز الشجن القرآني",
          ],
      vocalTrophyTitle: isGibberishOrNoise
        ? "تنبيه: أصوات عشوائية مرفوضة (0%)"
        : overall >= 85
        ? `صوت واعد على خطى الشيخ ${sheikhName}`
        : overall >= 60
        ? `مرتل واعد في مدرسة ${sheikhName}`
        : `أداء يحتاج لتجويد وتدريب مكثف (0 كراسي)`,
    };

    res.json({ success: true, data: fallbackResult, engine: "acoustic" });
  } catch (err: any) {
    console.error("Analysis route error:", err);
    res.status(500).json({ error: "Failed to analyze recitation", message: err.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`The Choice Voice Server running on http://localhost:${PORT}`);
  });
}

startServer();
