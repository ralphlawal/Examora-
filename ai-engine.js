// ═══════════════════════════════════════════════════════════════
// EXAMORA AI Engine v7.0 — OpenRouter · Multi-Key Rotation
// Powered by NexaCore Labs
//
// HOW TO SET UP:
//   1. Go to https://openrouter.ai/keys  (free account)
//   2. Create a key — it's instant, no card needed
//   3. Paste it below replacing YOUR_OPENROUTER_KEY_1
//   4. Add more keys for automatic rotation / higher limits
// ═══════════════════════════════════════════════════════════════

const EXAMORA_AI = (() => {

  // ── YOUR KEYS GO HERE ───────────────────────────────────────
  var API_KEYS = [
    "YOUR_OPENROUTER_KEY_1",   // ← paste your key here
    // "sk-or-v1-xxxx",        // ← add more keys for rotation
    // "sk-or-v1-yyyy",
  ];

  // ── MODELS — specific free models that reliably return content ──
  // openrouter/auto sometimes returns empty for free accounts, so we
  // use explicit models and rotate through them.
  var MODELS = [
    "mistralai/mistral-small-3.1-24b-instruct:free",
    "deepseek/deepseek-r1-zero:free",
    "google/gemma-3-12b-it:free",
    "mistralai/mistral-7b-instruct:free",
    "openrouter/auto",
  ];

  var OR_URL = "https://openrouter.ai/api/v1/chat/completions";
  var BRAND  = "NexaCore Labs";

  var SYSTEM = "You are an AI tutor built by NexaCore Labs for EXAMORA. Help students prepare for SAT, ACT, IELTS, TOEFL, GRE, GMAT, A-Levels, GCSE, IB, JAMB, WAEC, NECO, and professional certifications. Be concise, accurate, and encouraging. No markdown headers. Under 280 words.";

  var _keyIndex = 0;

  function validKeys() {
    // Merge hardcoded keys with keys saved from Admin Panel (localStorage)
    var stored = [];
    try {
      var raw = localStorage.getItem("examora_ai_keys");
      if (raw) stored = JSON.parse(raw);
    } catch(_) {}
    var all = API_KEYS.concat(stored);
    var placeholders = ["YOUR_OPENROUTER_KEY_1","YOUR_OPENROUTER_KEY_2","YOUR_OPENROUTER_KEY_3"];
    return all.filter(function(k) {
      return typeof k === "string"
        && k.length >= 20
        && placeholders.indexOf(k) === -1
        && k.trim() !== "";
    });
  }

  // Core: tries every key × every model until one succeeds
  async function call(promptOrMessages, maxTokens, temperature) {
    maxTokens   = maxTokens   || 500;
    temperature = temperature !== undefined ? temperature : 0.3;

    var keys = validKeys();
    if (keys.length === 0) {
      throw new Error("AI_KEY_MISSING");
    }

    var messages = Array.isArray(promptOrMessages)
      ? promptOrMessages
      : [{ role: "user", content: String(promptOrMessages) }];

    var allErrors = [];

    for (var ki = 0; ki < keys.length; ki++) {
      var keyIdx = (_keyIndex + ki) % keys.length;
      var key    = keys[keyIdx];

      for (var mi = 0; mi < MODELS.length; mi++) {
        var model = MODELS[mi];
        var tag   = "Key" + (keyIdx+1) + "/" + model.split("/").pop();

        try {
          var ctrl = new AbortController();
          var timer = setTimeout(function() { ctrl.abort(); }, 18000);

          var resp = await fetch(OR_URL, {
            method: "POST",
            headers: {
              "Content-Type":  "application/json",
              "Authorization": "Bearer " + key,
              "HTTP-Referer":  "https://examora.app",
              "X-Title":       "EXAMORA by NexaCore Labs"
            },
            body: JSON.stringify({
              model:       model,
              messages:    messages,
              max_tokens:  maxTokens,
              temperature: temperature
            }),
            signal: ctrl.signal
          });
          clearTimeout(timer);

          if (resp.status === 429) {
            allErrors.push(tag + ": rate limited");
            break; // key exhausted, try next key
          }
          if (resp.status === 401 || resp.status === 403) {
            allErrors.push(tag + ": INVALID KEY — check your OpenRouter key");
            break; // bad key, skip to next
          }
          if (!resp.ok) {
            var errBody = "";
            try {
              var errJson = await resp.json();
              errBody = (errJson.error && errJson.error.message)
                ? errJson.error.message.slice(0, 80)
                : JSON.stringify(errJson).slice(0, 80);
            } catch(_) { errBody = "HTTP " + resp.status; }
            allErrors.push(tag + ": " + errBody);
            // 404 = model name wrong, 502/503 = model down — both: try next model
            continue;
          }

          var data = await resp.json();
          var text = "";
          try { text = (data.choices[0].message.content || "").trim(); } catch(_){}

          if (!text) {
            // Log the raw response so we can debug what OpenRouter actually returned
            var rawPreview = JSON.stringify(data).slice(0, 120);
            allErrors.push(tag + ": empty (raw: " + rawPreview + ")");
            continue;
          }

          // ✓ success — rotate key for next call
          _keyIndex = (keyIdx + 1) % keys.length;
          return { text: text, model: model, brand: BRAND };

        } catch(e) {
          if (e.name === "AbortError") {
            allErrors.push(tag + ": timeout");
            continue;
          }
          allErrors.push(tag + ": " + (e.message || "error").slice(0, 50));
        }
      }
    }

    throw new Error("AI_FAILED: " + allErrors.slice(-3).join(" | "));
  }

  // ── Helper: options list → text ─────────────────────────────
  function optsText(opts) {
    if (!opts) return "";
    return Object.entries(opts)
      .map(function(e) { return e[0] + ". " + e[1]; })
      .join("\n");
  }

  function cleanJson(raw) {
    var t = raw.trim()
      .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "")
      .replace(/,\s*\}/g, "}").replace(/,\s*\]/g, "]").trim();
    return JSON.parse(t);
  }

  // ── Public methods ───────────────────────────────────────────

  async function chat(userMsg, context, history) {
    var sysMsg = SYSTEM + (context ? "\nContext: " + context : "");
    var msgs = [{ role: "system", content: sysMsg }]
      .concat((history || []).slice(-8))
      .concat([{ role: "user", content: userMsg }]);
    return call(msgs, 420, 0.5);
  }

  async function explainAnswer(o) {
    var msg = SYSTEM + "\n\nA student got this " +
      (o.category||"exam") + " " + (o.subject||"") +
      " question wrong" + (o.year ? " (" + o.year + ")" : "") + ".\n\n" +
      "Question: " + o.question + "\n\nOptions:\n" + optsText(o.options) + "\n\n" +
      "Correct: " + o.correctAnswer + ". " + ((o.options||{})[o.correctAnswer]||"") + "\n" +
      "Student chose: " + (o.userAnswer
        ? o.userAnswer + ". " + ((o.options||{})[o.userAnswer]||"")
        : "did not answer") + "\n\n" +
      "Explain:\n1. Why the correct answer is right\n2. Why the student's choice was wrong\n" +
      "3. The key concept\n4. A memory tip\n\nEnd with one encouraging sentence.";
    return call([{ role: "user", content: msg }], 480);
  }

  async function getHint(o) {
    var msg = SYSTEM + "\n\nGive a 2-3 sentence hint for this " +
      (o.category||"exam") + " " + (o.subject||"") +
      " question. Do NOT give away the answer or name the correct letter.\n\n" +
      "Question: " + o.question + "\n\nOptions:\n" + optsText(o.options) + "\n\nHint:";
    return call([{ role: "user", content: msg }], 200);
  }

  async function generateQuestions(o) {
    var msg = SYSTEM + "\n\nGenerate exactly " + (o.count||5) +
      " multiple-choice questions about \"" + o.topic + "\" for " +
      (o.category||"general") + " " + (o.subject||"exam") +
      ". Difficulty: " + (o.difficulty||"medium") + ".\n\n" +
      "Return ONLY a JSON array — no other text:\n" +
      '[{"question":"...","options":{"A":"...","B":"...","C":"...","D":"..."},"answer":"A","explanation":"brief reason"}]';
    var r = await call([{ role: "user", content: msg }], 1000, 0.4);
    try {
      var q = cleanJson(r.text);
      return { questions: Array.isArray(q) ? q : [q], model: r.model };
    } catch(_) {
      return { questions: null, rawText: r.text, model: r.model };
    }
  }

  async function generateStudyPlan(o) {
    var weak = (o.weakSubjects||[])
      .map(function(s) { return s.subject + ": " + s.score + "%"; }).join(", ");
    var msg = SYSTEM + "\n\nCreate a 7-day study plan.\n" +
      "Exam: " + (o.examType||"general") + " | Avg: " + o.avgScore +
      "% | Target: " + (o.targetScore||75) + "% | Sessions: " + o.totalExams +
      " | Weak: " + (weak||"general revision") + "\n\n" +
      "Return ONLY a JSON array:\n" +
      '[{"day":1,"title":"Focus area","tasks":"Task 1|Task 2|Task 3","duration":"2 hrs"}]';
    var r = await call([{ role: "user", content: msg }], 750, 0.3);
    try { return { plan: cleanJson(r.text), model: r.model }; }
    catch(_) { return { plan: null, rawText: r.text, model: r.model }; }
  }

  async function predictScore(o) {
    var msg = SYSTEM + "\n\nPredict student exam performance.\n" +
      "Exam: " + (o.examType||"general") + " | Avg: " + o.avgScore +
      "% | Sessions: " + o.totalExams + " | Trend: " +
      (o.recentTrend >= 0 ? "+" : "") + o.recentTrend +
      "% | Weak: " + ((o.weakSubjects||[]).join(", ")||"none") + "\n\n" +
      'Return ONLY JSON: {"predictedScore":75,"confidence":"Medium","range":"70-80%","tip":"one tip"}';
    var r = await call([{ role: "user", content: msg }], 200, 0.2);
    try { return { data: cleanJson(r.text), model: r.model }; }
    catch(_) { return { data: null, model: r.model }; }
  }

  // Spaced repetition — no API call needed
  function getSpacedRepetitionQueue(questions, history) {
    var now = Date.now(), DAY = 86400000;
    return questions.map(function(q) {
      var h = (history||{})[q.id] || { correct:0, wrong:0, lastSeen:0 };
      var total = h.correct + h.wrong;
      var acc   = total > 0 ? h.correct / total : 0;
      var age   = (now - (h.lastSeen||0)) / DAY;
      var p = total === 0        ? 50 + Math.random() * 10
            : acc < 0.5          ? 80 + age
            : acc < 0.8          ? 40 + age * 0.5
            :                      5  + age * 0.2;
      return Object.assign({}, q, { _priority: p, _accuracy: acc, _seen: total });
    }).sort(function(a, b) { return b._priority - a._priority; });
  }

  function getStatus() {
    return { keys: validKeys().length, keyIndex: _keyIndex + 1, brand: BRAND };
  }

  return {
    call:                     call,
    chat:                     chat,
    explainAnswer:            explainAnswer,
    getHint:                  getHint,
    generateQuestions:        generateQuestions,
    generateStudyPlan:        generateStudyPlan,
    predictScore:             predictScore,
    getSpacedRepetitionQueue: getSpacedRepetitionQueue,
    getStatus:                getStatus,
    BRAND:                    BRAND
  };
})();
