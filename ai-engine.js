// ═══════════════════════════════════════════════════════
// EXAMORA AI Engine — OpenRouter + Gemini Failover
// Replace OPENROUTER_API_KEY with your key from openrouter.ai
// ═══════════════════════════════════════════════════════

const EXAMORA_AI = (() => {

  // ── Config ─────────────────────────────────────────
  const OPENROUTER_KEY = "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"; // Get from openrouter.ai/keys
  const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
  const APP_URL        = "https://examora.com.ng";
  const APP_NAME       = "EXAMORA";

  // Model chain — tries each in order until one succeeds
  const MODELS = [
    "google/gemini-2.0-flash-001",       // Primary: fastest, cheapest Gemini
    "google/gemini-flash-1.5-8b",        // Fallback 1: small Gemini
    "google/gemini-flash-1.5",           // Fallback 2: full Gemini 1.5
    "mistralai/mistral-7b-instruct:free",// Fallback 3: free Mistral
    "meta-llama/llama-3.2-3b-instruct:free", // Last resort: free Llama
  ];

  // ── Core call ──────────────────────────────────────
  async function call(messages, maxTokens = 500, temperature = 0.25) {
    if (!OPENROUTER_KEY || OPENROUTER_KEY === "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") {
      throw new Error("AI_KEY_MISSING");
    }

    const errors = [];
    for (const model of MODELS) {
      try {
        const res = await fetch(OPENROUTER_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + OPENROUTER_KEY,
            "HTTP-Referer": APP_URL,
            "X-Title": APP_NAME,
          },
          body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
        });

        if (!res.ok) {
          const err = await res.text().catch(() => res.status);
          throw new Error("HTTP " + res.status + ": " + err);
        }

        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content?.trim();
        if (!text) throw new Error("Empty response from " + model);

        return { text, model };
      } catch (e) {
        errors.push(model + ": " + e.message);
        console.warn("[EXAMORA AI] Model failed:", model, e.message);
      }
    }

    throw new Error("All AI models failed. Errors: " + errors.join(" | "));
  }

  // ── Prompts ────────────────────────────────────────
  const SYSTEM = `You are an expert Nigerian education tutor helping students prepare for JAMB, WAEC, NECO, and Post-UTME exams. 
Be concise, accurate, and encouraging. Use simple English that Nigerian secondary students understand.
Format your answers clearly. Use bullet points only when listing multiple steps or items.
Never use markdown headers. Keep responses under 300 words.`;

  // Explain a wrong answer in detail
  async function explainAnswer({ question, options, correctAnswer, userAnswer, subject, category, year }) {
    const optText = Object.entries(options || {})
      .map(([k, v]) => `${k}. ${v}`)
      .join("\n");
    
    const prompt = `${SYSTEM}

A student got this ${category || "JAMB"} ${subject || ""} question wrong ${year ? `(${year})` : ""}.

Question: ${question}

Options:
${optText}

Correct Answer: ${correctAnswer}. ${options?.[correctAnswer] || ""}
Student chose: ${userAnswer ? userAnswer + ". " + (options?.[userAnswer] || "") : "Skipped"}

Explain:
1. Why the correct answer is right (brief, direct explanation)
2. Why the student's choice is wrong (if applicable)
3. The key concept they need to remember
4. A memory tip if helpful

Be encouraging at the end.`;

    return call([{ role: "user", content: prompt }], 450);
  }

  // Get a hint for the current question (practice mode)
  async function getHint({ question, options, subject, category }) {
    const optText = Object.entries(options || {})
      .map(([k, v]) => `${k}. ${v}`)
      .join("\n");

    const prompt = `${SYSTEM}

Give a helpful hint for this ${category || "JAMB"} ${subject || ""} question WITHOUT revealing the answer.

Question: ${question}

Options:
${optText}

Give a 2-3 sentence hint that narrows down the answer through logic or key concepts. Don't say the answer directly.`;

    return call([{ role: "user", content: prompt }], 200);
  }

  // Generate a 7-day personalized study plan
  async function generateStudyPlan({ weakSubjects, avgScore, totalExams, targetScore, examType }) {
    const weakList = weakSubjects.map(s => `${s.subject}: ${s.score}%`).join(", ");
    
    const prompt = `${SYSTEM}

Create a focused 7-day study plan for a ${examType || "JAMB"} student.

Student stats:
- Average score: ${avgScore}%
- Target score: ${targetScore || 250}/400
- Total practice exams: ${totalExams}
- Weak subjects: ${weakList || "General revision needed"}

Return a JSON array of 7 days. Each day must have exactly these fields:
{
  "day": number,
  "title": "short focus area (max 30 chars)",
  "tasks": "2-3 specific tasks for that day (1 sentence each, separated by |)",
  "duration": "e.g. 2 hours"
}

Return ONLY the JSON array, no other text, no markdown.`;

    const result = await call([{ role: "user", content: prompt }], 700, 0.3);
    
    // Parse JSON
    let text = result.text.trim();
    text = text.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
    
    try {
      const plan = JSON.parse(text);
      return { plan, model: result.model };
    } catch {
      // Fallback: return raw text
      return { plan: null, rawText: result.text, model: result.model };
    }
  }

  // Score prediction based on practice performance
  async function predictScore({ avgScore, weakSubjects, totalExams, examType, recentTrend }) {
    const prompt = `${SYSTEM}

Based on this student's practice data, predict their ${examType || "JAMB"} score.

Data:
- Practice average: ${avgScore}%
- Total exams taken: ${totalExams}
- Recent trend: ${recentTrend > 0 ? "+" : ""}${recentTrend}% change
- Weak areas: ${weakSubjects.join(", ") || "None identified"}

Return ONLY a JSON object:
{
  "predictedScore": number (out of 400 for JAMB, or percentage for others),
  "confidence": "Low" | "Medium" | "High",
  "range": "e.g. 240-280",
  "tip": "one sentence improvement tip"
}

No other text.`;

    const result = await call([{ role: "user", content: prompt }], 200, 0.2);
    let text = result.text.trim().replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
    try {
      return { data: JSON.parse(text), model: result.model };
    } catch {
      return { data: null, model: result.model };
    }
  }

  return { call, explainAnswer, getHint, generateStudyPlan, predictScore };
})();
