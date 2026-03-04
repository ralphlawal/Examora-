// ═══════════════════════════════════════════════════════════════
// EXAMORA AI Engine v6.0 — OpenRouter · Multi-Key Rotation
// Add as many keys as you want — rotates automatically if one fails
// Get free keys at: openrouter.ai/keys
//
// Powered by NexaCore Labs
// ═══════════════════════════════════════════════════════════════

const EXAMORA_AI = (() => {

  // ── ADD YOUR OPENROUTER KEYS HERE ───────────────────────────
  // Add multiple keys — engine rotates through them automatically
  // If key 1 fails (rate limited / exhausted), tries key 2, then key 3, etc.
  var API_KEYS = [
    "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",   // Primary key
    "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",   // Fallback key 2
    "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",   // Fallback key 3
    // Add more keys below as needed — no limit
  ];

  // ── MODELS (tried in order per key) ─────────────────────────
  // All :free models — zero cost on any key
  var MODELS = [
    "google/gemini-2.0-flash-exp:free",
    "google/gemini-flash-1.5-8b:free",
    "meta-llama/llama-3.1-8b-instruct:free",
    "mistralai/mistral-7b-instruct:free",
    "qwen/qwen-2-7b-instruct:free",
  ];

  var URL  = "https://openrouter.ai/api/v1/chat/completions";
  var BRAND = "NexaCore Labs"; // Displayed to users

  var SYSTEM = "You are an AI exam tutor built by NexaCore Labs. You help students worldwide prepare for SAT, ACT, IELTS, TOEFL, GRE, GMAT, A-Levels, GCSE, IB, JAMB, WAEC, NECO, and professional certifications. Be concise, accurate, encouraging. No markdown headers. Under 280 words.";

  // ── Key rotation state ───────────────────────────────────────
  var _keyIndex   = 0;   // which key we're currently on
  var _modelIndex = 0;   // which model we're currently on

  function getValidKeys() {
    return API_KEYS.filter(function(k){ return k && k !== "YOUR_OPENROUTER_KEY_1" && k !== "YOUR_OPENROUTER_KEY_2" && k !== "YOUR_OPENROUTER_KEY_3" && k.length > 10; });
  }

  // ── Core call — rotates keys × models until something works ─
  async function call(promptOrMessages, maxTokens, temperature) {
    maxTokens   = maxTokens   || 500;
    temperature = temperature !== undefined ? temperature : 0.3;

    var validKeys = getValidKeys();
    if (validKeys.length === 0) throw new Error("AI_KEY_MISSING");

    // Build messages array
    var messages;
    if (Array.isArray(promptOrMessages)) {
      messages = promptOrMessages;
    } else {
      messages = [{ role: "user", content: String(promptOrMessages) }];
    }

    var errors = [];

    // Outer loop: each key
    for (var ki = 0; ki < validKeys.length; ki++) {
      var keyIdx = (_keyIndex + ki) % validKeys.length;
      var key    = validKeys[keyIdx];

      // Inner loop: each model
      for (var mi = 0; mi < MODELS.length; mi++) {
        var model = MODELS[mi];

        try {
          var ctrl = new AbortController();
          var tid  = setTimeout(function(){ ctrl.abort(); }, 16000);

          var res = await fetch(URL, {
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
          clearTimeout(tid);

          // Rate limited on this key — try next key
          if (res.status === 429) {
            errors.push("Key" + (keyIdx+1) + "/" + model + ": rate limited");
            break; // break inner model loop → try next key
          }

          // Auth error on this key — try next key
          if (res.status === 401 || res.status === 403) {
            errors.push("Key" + (keyIdx+1) + ": auth failed");
            break;
          }

          // Model unavailable — try next model
          if (res.status === 503 || res.status === 502) {
            errors.push("Key" + (keyIdx+1) + "/" + model + ": unavailable");
            continue;
          }

          if (!res.ok) {
            var errBody = "";
            try { errBody = await res.text(); } catch(_){}
            errors.push("Key" + (keyIdx+1) + "/" + model + ": HTTP " + res.status);
            continue;
          }

          var data = await res.json();
          var text = "";
          try { text = data.choices[0].message.content.trim(); } catch(_){}

          if (!text || text.length < 2) {
            errors.push("Key" + (keyIdx+1) + "/" + model + ": empty response");
            continue;
          }

          // Success — advance key index for next call (round-robin)
          _keyIndex = (keyIdx + 1) % validKeys.length;

          return { text: text, model: model, keyIndex: keyIdx + 1 };

        } catch(e) {
          if (e.name === "AbortError") {
            errors.push("Key" + (keyIdx+1) + "/" + model + ": timeout");
            continue;
          }
          errors.push("Key" + (keyIdx+1) + "/" + model + ": " + (e.message||"error").slice(0,60));
        }
      }
    }

    throw new Error("AI unavailable. Tried " + validKeys.length + " key(s) × " + MODELS.length + " models. " + errors.slice(-3).join(" | "));
  }

  // ── Helpers ──────────────────────────────────────────────────
  function optsText(opts) {
    if (!opts) return "";
    return Object.entries(opts).map(function(e){ return e[0] + ". " + e[1]; }).join("\n");
  }

  function parseJson(text) {
    text = text.trim()
      .replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/\s*```$/,"")
      .replace(/,\s*\}/g,"}").replace(/,\s*\]/g,"]").trim();
    return JSON.parse(text);
  }

  // ── Public API ───────────────────────────────────────────────

  async function chat(userMsg, context, history) {
    var sys = SYSTEM + (context ? "\nContext: " + context : "");
    var msgs = [{ role: "system", content: sys }]
      .concat((history||[]).slice(-8))
      .concat([{ role: "user", content: userMsg }]);
    return call(msgs, 420, 0.5);
  }

  async function explainAnswer(o) {
    var prompt = SYSTEM + "\n\nA student got this " + (o.category||"exam") + " " + (o.subject||"") + " question wrong" + (o.year?" ("+o.year+")":"") + ".\n\nQuestion: " + o.question + "\n\nOptions:\n" + optsText(o.options) + "\n\nCorrect: " + o.correctAnswer + ". " + ((o.options||{})[o.correctAnswer]||"") + "\nStudent chose: " + (o.userAnswer ? o.userAnswer+". "+((o.options||{})[o.userAnswer]||"") : "did not answer") + "\n\nExplain:\n1. Why correct answer is right\n2. Why student's choice was wrong\n3. Key concept to remember\n4. Memory tip if helpful\n\nEnd with one short encouraging sentence.";
    return call([{role:"user",content:prompt}], 480);
  }

  async function getHint(o) {
    var prompt = SYSTEM + "\n\nHint for this " + (o.category||"exam") + " " + (o.subject||"") + " question — do NOT give away the answer or say which letter is correct.\n\nQuestion: " + o.question + "\n\nOptions:\n" + optsText(o.options) + "\n\n2-3 sentence hint guiding through logic or key concept only:";
    return call([{role:"user",content:prompt}], 200);
  }

  async function generateQuestions(o) {
    var prompt = SYSTEM + "\n\nGenerate exactly " + (o.count||5) + " multiple-choice questions about \"" + o.topic + "\" for " + (o.category||"general") + " " + (o.subject||"exam") + ". Difficulty: " + (o.difficulty||"medium") + ".\n\nReturn ONLY a JSON array:\n[{\"question\":\"...\",\"options\":{\"A\":\"...\",\"B\":\"...\",\"C\":\"...\",\"D\":\"...\"},\"answer\":\"A\",\"explanation\":\"brief reason\"}]\n\nJSON array only. Nothing else.";
    var r = await call([{role:"user",content:prompt}], 1000, 0.4);
    try {
      var q = parseJson(r.text);
      return { questions: Array.isArray(q)?q:[q], model:r.model };
    } catch(_) {
      return { questions:null, rawText:r.text, model:r.model };
    }
  }

  async function generateStudyPlan(o) {
    var weak = (o.weakSubjects||[]).map(function(s){ return s.subject+": "+s.score+"%"; }).join(", ");
    var prompt = SYSTEM + "\n\nCreate a 7-day study plan for a " + (o.examType||"exam") + " student.\nAverage: " + o.avgScore + "% | Target: " + (o.targetScore||75) + "% | Sessions: " + o.totalExams + " | Weak: " + (weak||"general revision") + "\n\nReturn ONLY a JSON array:\n[{\"day\":1,\"title\":\"Focus area\",\"tasks\":\"Task 1|Task 2|Task 3\",\"duration\":\"2 hrs\"}]\n\nJSON only.";
    var r = await call([{role:"user",content:prompt}], 750, 0.3);
    try { return { plan:parseJson(r.text), model:r.model }; }
    catch(_) { return { plan:null, rawText:r.text, model:r.model }; }
  }

  async function predictScore(o) {
    var prompt = SYSTEM + "\n\nPredict " + (o.examType||"exam") + " score.\nAvg: " + o.avgScore + "% | Sessions: " + o.totalExams + " | Trend: " + (o.recentTrend>=0?"+":"") + o.recentTrend + "% | Weak: " + ((o.weakSubjects||[]).join(", ")||"none") + "\n\nReturn ONLY this JSON:\n{\"predictedScore\":75,\"confidence\":\"Medium\",\"range\":\"70-80%\",\"tip\":\"one improvement tip\"}\n\nJSON only.";
    var r = await call([{role:"user",content:prompt}], 200, 0.2);
    try { return { data:parseJson(r.text), model:r.model }; }
    catch(_) { return { data:null, model:r.model }; }
  }

  function getSpacedRepetitionQueue(questions, history) {
    var now = Date.now(), DAY = 86400000;
    return questions.map(function(q) {
      var h = (history||{})[q.id] || {correct:0,wrong:0,lastSeen:0};
      var total = h.correct + h.wrong;
      var acc   = total > 0 ? h.correct/total : 0;
      var age   = (now - (h.lastSeen||0)) / DAY;
      var p = total===0 ? 50+Math.random()*10 : acc<0.5 ? 80+age : acc<0.8 ? 40+age*0.5 : 5+age*0.2;
      return Object.assign({},q,{_priority:p,_accuracy:acc,_seen:total});
    }).sort(function(a,b){ return b._priority-a._priority; });
  }

  // ── Expose key status (for admin/debug) ─────────────────────
  function getKeyStatus() {
    var keys = getValidKeys();
    return {
      totalKeys:    keys.length,
      currentKey:   _keyIndex + 1,
      hasKeys:      keys.length > 0,
      brand:        BRAND
    };
  }

  return {
    call:                    call,
    chat:                    chat,
    explainAnswer:           explainAnswer,
    getHint:                 getHint,
    generateQuestions:       generateQuestions,
    generateStudyPlan:       generateStudyPlan,
    predictScore:            predictScore,
    getSpacedRepetitionQueue: getSpacedRepetitionQueue,
    getKeyStatus:            getKeyStatus,
    BRAND:                   BRAND
  };
})();
