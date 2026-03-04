// ═══════════════════════════════════════════════════════════════
// EXAMORA AI Engine v4.0 — Bulletproof free model chain
// ALL models below are :free — zero cost, no billing needed
// Get your free key at: openrouter.ai/keys  (takes 2 minutes)
// ═══════════════════════════════════════════════════════════════

const EXAMORA_AI = (() => {
  var KEY = "YOUR_OPENROUTER_API_KEY";
  var URL = "https://openrouter.ai/api/v1/chat/completions";

  // Ordered by reliability — all free tier, no payment required
  var MODELS = [
    "google/gemini-2.0-flash-exp:free",
    "google/gemini-flash-1.5-8b:free",
    "meta-llama/llama-3.1-8b-instruct:free",
    "meta-llama/llama-3.2-3b-instruct:free",
    "mistralai/mistral-7b-instruct:free",
    "qwen/qwen-2-7b-instruct:free",
    "microsoft/phi-3-mini-128k-instruct:free"
  ];

  var SYSTEM = "You are EXAMORA AI Tutor — expert at SAT, ACT, IELTS, TOEFL, GRE, GMAT, A-Levels, GCSE, IB Diploma, JAMB, WAEC, NECO, and professional certifications worldwide. Be concise, accurate, encouraging. No markdown headers. Under 280 words.";

  // Core: tries every model until one works
  async function call(messages, maxTokens, temperature) {
    maxTokens = maxTokens || 500;
    temperature = (temperature !== undefined) ? temperature : 0.3;

    if (!KEY || KEY === "YOUR_OPENROUTER_API_KEY") {
      throw new Error("AI_KEY_MISSING");
    }

    var lastErr = "No models tried";

    for (var i = 0; i < MODELS.length; i++) {
      var model = MODELS[i];
      try {
        var ctrl = new AbortController();
        var tid = setTimeout(function(){ ctrl.abort(); }, 16000);

        var res = await fetch(URL, {
          method: "POST",
          headers: {
            "Content-Type":  "application/json",
            "Authorization": "Bearer " + KEY,
            "HTTP-Referer":  "https://examora.app",
            "X-Title":       "EXAMORA"
          },
          body: JSON.stringify({
            model: model,
            messages: messages,
            max_tokens: maxTokens,
            temperature: temperature
          }),
          signal: ctrl.signal
        });
        clearTimeout(tid);

        // Rate limited — skip to next model
        if (res.status === 429) { lastErr = model + ": rate limited"; continue; }
        // Model unavailable — skip
        if (res.status === 503 || res.status === 502) { lastErr = model + ": unavailable"; continue; }

        if (!res.ok) {
          var body = "";
          try { body = await res.text(); } catch(_){}
          lastErr = model + ": HTTP " + res.status;
          // Auth error — no point trying other models
          if (res.status === 401) throw new Error("Invalid API key — check openrouter.ai");
          continue;
        }

        var data = await res.json();
        var text = "";
        if (data && data.choices && data.choices[0] && data.choices[0].message) {
          text = (data.choices[0].message.content || "").trim();
        }

        if (!text || text.length < 2) { lastErr = model + ": empty response"; continue; }

        return { text: text, model: model };

      } catch(e) {
        if (e.name === "AbortError") { lastErr = model + ": timeout"; continue; }
        if (e.message && e.message.indexOf("Invalid API key") >= 0) throw e;
        lastErr = model + ": " + (e.message || "unknown error");
        // Short wait before next model
        try { await new Promise(function(r){ setTimeout(r, 300); }); } catch(_){}
      }
    }

    throw new Error("All " + MODELS.length + " AI models tried and failed. Last: " + lastErr);
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

  // Explain why a question was answered wrongly
  async function explainAnswer(o) {
    var msg = SYSTEM + "\n\nA student answered this " + (o.category||"exam") + " " + (o.subject||"") + " question incorrectly" + (o.year?" ("+o.year+")":"") + ".\n\nQuestion: " + o.question + "\n\nOptions:\n" + optsText(o.options) + "\n\nCorrect answer: " + o.correctAnswer + ". " + ((o.options||{})[o.correctAnswer]||"") + "\nStudent chose: " + (o.userAnswer ? o.userAnswer + ". " + ((o.options||{})[o.userAnswer]||"") : "did not answer") + "\n\nPlease explain:\n1. Why the correct answer is right\n2. Why the student's choice was wrong (if applicable)\n3. The key concept to understand\n4. A memory trick if helpful\n\nEnd with one encouraging sentence.";
    return call([{ role: "user", content: msg }], 480);
  }

  // Give a hint without revealing the answer
  async function getHint(o) {
    var msg = SYSTEM + "\n\nGive a 2-3 sentence hint for this " + (o.category||"exam") + " " + (o.subject||"") + " question. Do NOT give away the answer or say which letter is correct.\n\nQuestion: " + o.question + "\n\nOptions:\n" + optsText(o.options) + "\n\nHint only — guide through logic or key concept.";
    return call([{ role: "user", content: msg }], 180);
  }

  // Conversational study chat
  async function chat(userMsg, context, history) {
    var sys = SYSTEM + "\nYou are in a friendly study chat session. Be warm and conversational." + (context ? "\nCurrent context: " + context : "");
    var msgs = [{ role: "system", content: sys }]
      .concat((history||[]).slice(-8))
      .concat([{ role: "user", content: userMsg }]);
    return call(msgs, 420, 0.5);
  }

  // Generate practice questions from any topic
  async function generateQuestions(o) {
    var msg = SYSTEM + "\n\nGenerate exactly " + (o.count||5) + " multiple-choice practice questions about \"" + o.topic + "\" for a " + (o.category||"general") + " " + (o.subject||"exam") + " student. Difficulty: " + (o.difficulty||"medium") + ".\n\nReturn ONLY a valid JSON array, nothing else:\n[{\"question\":\"...\",\"options\":{\"A\":\"...\",\"B\":\"...\",\"C\":\"...\",\"D\":\"...\"},\"answer\":\"A\",\"explanation\":\"brief reason\"}]\n\nJSON array only. No text before or after.";
    var r = await call([{ role: "user", content: msg }], 1000, 0.4);
    try {
      var q = parseJson(r.text);
      return { questions: Array.isArray(q) ? q : [q], model: r.model };
    } catch(_) {
      return { questions: null, rawText: r.text, model: r.model };
    }
  }

  // 7-day personalised study plan
  async function generateStudyPlan(o) {
    var weak = (o.weakSubjects||[]).map(function(s){ return s.subject+": "+s.score+"%"; }).join(", ");
    var msg = SYSTEM + "\n\nCreate a 7-day study plan for a " + (o.examType||"exam") + " student.\nCurrent average: " + o.avgScore + "% | Target: " + (o.targetScore||75) + "% | Sessions done: " + o.totalExams + " | Weak areas: " + (weak||"general revision needed") + "\n\nReturn ONLY a JSON array of 7 objects:\n[{\"day\":1,\"title\":\"Focus area\",\"tasks\":\"Task 1|Task 2|Task 3\",\"duration\":\"2 hrs\"}]\n\nJSON only.";
    var r = await call([{ role: "user", content: msg }], 750, 0.3);
    try { return { plan: parseJson(r.text), model: r.model }; }
    catch(_) { return { plan: null, rawText: r.text, model: r.model }; }
  }

  // Predict exam performance
  async function predictScore(o) {
    var msg = SYSTEM + "\n\nPredict this student's " + (o.examType||"exam") + " performance.\nPractice average: " + o.avgScore + "% | Sessions: " + o.totalExams + " | Trend: " + (o.recentTrend>=0?"+":"") + o.recentTrend + "% | Weak areas: " + ((o.weakSubjects||[]).join(", ")||"none identified") + "\n\nReturn ONLY this JSON (no other text):\n{\"predictedScore\":75,\"confidence\":\"Medium\",\"range\":\"70-80%\",\"tip\":\"One specific improvement tip\"}\n\nJSON only.";
    var r = await call([{ role: "user", content: msg }], 200, 0.2);
    try { return { data: parseJson(r.text), model: r.model }; }
    catch(_) { return { data: null, model: r.model }; }
  }

  // Spaced repetition queue — pure client logic, no API needed
  function getSpacedRepetitionQueue(questions, history) {
    var now = Date.now(), DAY = 86400000;
    return questions.map(function(q) {
      var h = (history||{})[q.id] || { correct:0, wrong:0, lastSeen:0 };
      var total = h.correct + h.wrong;
      var acc = total > 0 ? h.correct/total : 0;
      var age = (now - (h.lastSeen||0)) / DAY;
      var priority;
      if (total === 0)    priority = 50 + Math.random()*10;  // never seen
      else if (acc < 0.5) priority = 80 + age;               // struggling
      else if (acc < 0.8) priority = 40 + age*0.5;           // needs review
      else                priority = 5  + age*0.2;            // mastered
      return Object.assign({}, q, { _priority:priority, _accuracy:acc, _seen:total });
    }).sort(function(a,b){ return b._priority - a._priority; });
  }

  return {
    call: call,
    explainAnswer: explainAnswer,
    getHint: getHint,
    chat: chat,
    generateQuestions: generateQuestions,
    generateStudyPlan: generateStudyPlan,
    predictScore: predictScore,
    getSpacedRepetitionQueue: getSpacedRepetitionQueue
  };
})();
