// ═══════════════════════════════════════════════════════════════
// EXAMORA AI Engine v5.0 — Google Gemini Direct API
// Uses Gemini API directly — free tier, reliable, no middleman
// Get your free API key at: aistudio.google.com/app/apikey
// ═══════════════════════════════════════════════════════════════

const EXAMORA_AI = (() => {
  // Paste your Gemini API key from aistudio.google.com/app/apikey
  var GEMINI_KEY = "YOUR_GEMINI_API_KEY";

  // Models tried in order — all free
  var MODELS = [
    "gemini-1.5-flash",        // Fast, free, very reliable
    "gemini-1.5-flash-8b",     // Smaller, even faster fallback
    "gemini-1.0-pro",          // Older but stable fallback
  ];

  var BASE = "https://generativelanguage.googleapis.com/v1beta/models/";

  var SYSTEM = "You are EXAMORA AI Tutor — expert at SAT, ACT, IELTS, TOEFL, GRE, GMAT, A-Levels, GCSE, IB Diploma, JAMB, WAEC, NECO, and professional certifications worldwide. Be concise, accurate, encouraging. No markdown headers (##). Under 280 words.";

  async function callGemini(model, prompt, maxTokens) {
    var url = BASE + model + ":generateContent?key=" + GEMINI_KEY;
    var ctrl = new AbortController();
    var tid = setTimeout(function(){ ctrl.abort(); }, 18000);

    var res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: maxTokens || 500,
          temperature: 0.3
        },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT",        threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH",       threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
      }),
      signal: ctrl.signal
    });
    clearTimeout(tid);

    if (!res.ok) {
      var body = "";
      try { body = await res.text(); } catch(_){}
      throw new Error("HTTP " + res.status + " from " + model + ": " + body.slice(0, 100));
    }

    var data = await res.json();
    // Extract text from Gemini response
    var text = "";
    try {
      text = data.candidates[0].content.parts[0].text.trim();
    } catch(_) {
      // Check for blocked content
      var reason = (data.candidates && data.candidates[0] && data.candidates[0].finishReason) || "unknown";
      if (reason === "SAFETY") throw new Error("Content filtered by safety settings");
      throw new Error("Could not parse Gemini response from " + model);
    }

    if (!text || text.length < 2) throw new Error("Empty response from " + model);
    return text;
  }

  // Core call — accepts string OR [{role,content}] array (backward compat)
  async function call(promptOrMessages, maxTokens, _unused) {
    if (!GEMINI_KEY || GEMINI_KEY === "YOUR_GEMINI_API_KEY") {
      throw new Error("AI_KEY_MISSING");
    }
    // Convert message array to single prompt string if needed
    var promptText;
    if (Array.isArray(promptOrMessages)) {
      promptText = promptOrMessages.map(function(m){
        return (m.role === "system" ? "[Context] " : m.role === "assistant" ? "Tutor: " : "Student: ") + m.content;
      }).join("
");
    } else {
      promptText = promptOrMessages;
    }

    var lastErr = "";
    for (var i = 0; i < MODELS.length; i++) {
      try {
        var text = await callGemini(MODELS[i], promptText, maxTokens);
        return { text: text, model: MODELS[i] };
      } catch(e) {
        lastErr = MODELS[i] + ": " + (e.message || "error");
        if (e.name === "AbortError") lastErr = MODELS[i] + ": timeout";
        if (e.message && e.message.indexOf("API_KEY_INVALID") >= 0) throw new Error("Invalid Gemini API key");
        // Short wait before next model
        try { await new Promise(function(r){ setTimeout(r, 500); }); } catch(_){}
      }
    }
    throw new Error("All Gemini models failed. Last error: " + lastErr);
  }

  // chat() compatible with message-array format (for AI chat widget)
  async function chat(userMsg, context, history) {
    var ctx = context ? "\nContext: " + context : "";
    var hist = "";
    if (history && history.length > 0) {
      hist = "\nPrevious messages:\n" + history.slice(-6).map(function(m){
        return (m.role === "user" ? "Student" : "Tutor") + ": " + m.content;
      }).join("\n") + "\n";
    }
    var prompt = SYSTEM + ctx + hist + "\n\nStudent: " + userMsg + "\n\nTutor:";
    return call(prompt, 400);
  }

  function optsText(opts) {
    if (!opts) return "";
    return Object.entries(opts).map(function(e){ return e[0] + ". " + e[1]; }).join("\n");
  }

  function parseJson(text) {
    text = text.trim()
      .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "")
      .replace(/,\s*\}/g, "}").replace(/,\s*\]/g, "]").trim();
    return JSON.parse(text);
  }

  // Explain a wrong answer
  async function explainAnswer(o) {
    var prompt = SYSTEM + "\n\nA student got this " + (o.category||"exam") + " " + (o.subject||"") + " question wrong" + (o.year ? " (" + o.year + ")" : "") + ".\n\nQuestion: " + o.question + "\n\nOptions:\n" + optsText(o.options) + "\n\nCorrect answer: " + o.correctAnswer + ". " + ((o.options||{})[o.correctAnswer]||"") + "\nStudent chose: " + (o.userAnswer ? o.userAnswer + ". " + ((o.options||{})[o.userAnswer]||"") : "did not answer") + "\n\nExplain:\n1. Why the correct answer is right\n2. Why the student's choice was wrong\n3. The key concept to remember\n4. A memory tip if helpful\n\nEnd with one encouraging sentence.";
    return call(prompt, 480);
  }

  // Give a hint without revealing the answer
  async function getHint(o) {
    var prompt = SYSTEM + "\n\nGive a 2-3 sentence hint for this " + (o.category||"exam") + " " + (o.subject||"") + " question. Do NOT reveal which letter is correct or give the answer away.\n\nQuestion: " + o.question + "\n\nOptions:\n" + optsText(o.options) + "\n\nHint only — guide through logic or key concept:";
    return call(prompt, 180);
  }

  // Generate practice questions on any topic
  async function generateQuestions(o) {
    var prompt = SYSTEM + "\n\nGenerate exactly " + (o.count||5) + " multiple-choice questions about \"" + o.topic + "\" for " + (o.category||"general") + " " + (o.subject||"exam") + ". Difficulty: " + (o.difficulty||"medium") + ".\n\nReturn ONLY a valid JSON array:\n[{\"question\":\"...\",\"options\":{\"A\":\"...\",\"B\":\"...\",\"C\":\"...\",\"D\":\"...\"},\"answer\":\"A\",\"explanation\":\"brief reason\"}]\n\nJSON array only. Nothing else.";
    var r = await call(prompt, 1000);
    try {
      var q = parseJson(r.text);
      return { questions: Array.isArray(q) ? q : [q], model: r.model };
    } catch(_) {
      return { questions: null, rawText: r.text, model: r.model };
    }
  }

  // 7-day study plan
  async function generateStudyPlan(o) {
    var weak = (o.weakSubjects||[]).map(function(s){ return s.subject + ": " + s.score + "%"; }).join(", ");
    var prompt = SYSTEM + "\n\nCreate a 7-day study plan for a " + (o.examType||"exam") + " student.\nCurrent average: " + o.avgScore + "% | Target: " + (o.targetScore||75) + "% | Sessions done: " + o.totalExams + " | Weak areas: " + (weak||"general revision") + "\n\nReturn ONLY a JSON array of 7 objects:\n[{\"day\":1,\"title\":\"Focus area\",\"tasks\":\"Task 1|Task 2|Task 3\",\"duration\":\"2 hrs\"}]\n\nJSON only.";
    var r = await call(prompt, 750);
    try { return { plan: parseJson(r.text), model: r.model }; }
    catch(_) { return { plan: null, rawText: r.text, model: r.model }; }
  }

  // Predict exam score
  async function predictScore(o) {
    var prompt = SYSTEM + "\n\nPredict this student's " + (o.examType||"exam") + " performance.\nPractice average: " + o.avgScore + "% | Sessions: " + o.totalExams + " | Trend: " + (o.recentTrend >= 0 ? "+" : "") + o.recentTrend + "% | Weak areas: " + ((o.weakSubjects||[]).join(", ")||"none") + "\n\nReturn ONLY this JSON:\n{\"predictedScore\":75,\"confidence\":\"Medium\",\"range\":\"70-80%\",\"tip\":\"One specific improvement tip\"}\n\nJSON only.";
    var r = await call(prompt, 200);
    try { return { data: parseJson(r.text), model: r.model }; }
    catch(_) { return { data: null, model: r.model }; }
  }

  // Spaced repetition — no API needed, pure client logic
  function getSpacedRepetitionQueue(questions, history) {
    var now = Date.now(), DAY = 86400000;
    return questions.map(function(q) {
      var h = (history||{})[q.id] || { correct:0, wrong:0, lastSeen:0 };
      var total = h.correct + h.wrong;
      var acc = total > 0 ? h.correct / total : 0;
      var age = (now - (h.lastSeen||0)) / DAY;
      var priority;
      if (total === 0)    priority = 50 + Math.random() * 10;
      else if (acc < 0.5) priority = 80 + age;
      else if (acc < 0.8) priority = 40 + age * 0.5;
      else                priority = 5 + age * 0.2;
      return Object.assign({}, q, { _priority:priority, _accuracy:acc, _seen:total });
    }).sort(function(a, b){ return b._priority - a._priority; });
  }

  return {
    call: call,
    chat: chat,
    explainAnswer: explainAnswer,
    getHint: getHint,
    generateQuestions: generateQuestions,
    generateStudyPlan: generateStudyPlan,
    predictScore: predictScore,
    getSpacedRepetitionQueue: getSpacedRepetitionQueue
  };
})();
