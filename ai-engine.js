// ═══════════════════════════════════════════════════════════════
// EXAMORA AI Engine v9.0 — NexaCore Labs
// Live model discovery · Cool personality · No truncation
// ═══════════════════════════════════════════════════════════════

const EXAMORA_AI = (() => {

  // ── Your OpenRouter keys (add more via Admin Panel) ───────────
  var API_KEYS = [
    "YOUR_OPENROUTER_KEY_1",
  ];

  var OR_URL  = "https://openrouter.ai/api/v1/chat/completions";
  var BRAND   = "NexaCore Labs";

  // ── NOVA — EXAMORA's AI persona ──────────────────────────────
  var SYSTEM = `You are NOVA, EXAMORA's AI study companion — sharp, warm, and deeply knowledgeable about Nigerian and international exams.

Your personality:
- You speak like a brilliant older sibling who aced JAMB, WAEC, and university — not like a cold textbook
- You're encouraging but honest: you celebrate progress AND call out weak areas kindly
- Use occasional Nigerian flair naturally (e.g. "e get why!", "you go fit do this!") but keep it professional
- You love making complex concepts click with clever analogies and real-life Nigerian examples
- When someone gets something wrong, you never just correct — you explain WHY and help them understand deeply
- Keep responses focused and complete — never cut off mid-sentence or mid-explanation

Your expertise covers: JAMB UTME, WAEC SSCE, NECO SSCE, Post-UTME, SAT, ACT, IELTS, TOEFL, GRE, GMAT, A-Levels, GCSE, IB, BECE, and professional certifications.

Rules:
- Always finish your response completely — never stop mid-sentence
- For math/science: show working steps clearly numbered
- For English: give examples in context
- End explanations with a quick "memory hook" when helpful
- If asked something outside academics, gently redirect back to exam prep`;

  // ── Fallback free models (updated July 2025) ─────────────────
  var FALLBACK_MODELS = [
    "google/gemini-2.0-flash-exp:free",
    "deepseek/deepseek-r1:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "qwen/qwen-2.5-72b-instruct:free",
    "microsoft/phi-4:free",
    "mistralai/mistral-small-3.1-24b-instruct:free",
    "google/gemma-3-27b-it:free",
    "meta-llama/llama-3.2-11b-vision-instruct:free",
    "qwen/qwen3-8b:free",
  ];

  var _keyIndex    = 0;
  var _liveModels  = null;
  var _modelsFetch = null;

  // ── Get valid keys ────────────────────────────────────────────
  function validKeys() {
    var stored = [];
    try { var r = localStorage.getItem("examora_ai_keys"); if(r) stored = JSON.parse(r); } catch(_){}
    var bad = ["YOUR_OPENROUTER_KEY_1","YOUR_OPENROUTER_KEY_2","YOUR_OPENROUTER_KEY_3",""];
    return API_KEYS.concat(stored).filter(k => typeof k==="string" && k.length>=20 && !bad.includes(k.trim()));
  }

  // ── Live model discovery ──────────────────────────────────────
  async function fetchLiveModels(key) {
    if (_liveModels) return _liveModels;
    if (_modelsFetch) return _modelsFetch;
    _modelsFetch = (async () => {
      try {
        var r = await fetch("https://openrouter.ai/api/v1/models", {
          headers: { "Authorization": "Bearer " + key }
        });
        if (!r.ok) return FALLBACK_MODELS;
        var d = await r.json();
        var free = (d.data||[])
          .filter(m => m.id && m.id.endsWith(":free") && (m.context_length||0) >= 4096)
          .map(m => m.id);
        if (!free.length) return FALLBACK_MODELS;
        _liveModels = free;
        return free;
      } catch(_) { return FALLBACK_MODELS; }
    })();
    return _modelsFetch;
  }

  // ── Core call — tries every key × every model ─────────────────
  async function call(promptOrMessages, maxTokens, temperature) {
    maxTokens   = maxTokens   || 900;   // Higher default — no more truncation
    temperature = temperature !== undefined ? temperature : 0.35;

    var keys = validKeys();
    if (!keys.length) throw new Error("AI_KEY_MISSING: No OpenRouter key configured. Go to Admin → AI Keys.");

    var messages = Array.isArray(promptOrMessages)
      ? promptOrMessages
      : [{ role:"user", content: String(promptOrMessages) }];

    var models = await fetchLiveModels(keys[0]);
    var errors = [];

    for (var ki = 0; ki < keys.length; ki++) {
      var kIdx = (_keyIndex + ki) % keys.length;
      var key  = keys[kIdx];

      for (var mi = 0; mi < models.length; mi++) {
        var model = models[mi];
        var tag   = "Key" + (kIdx+1) + "/" + model.split("/").pop();

        try {
          var ctrl  = new AbortController();
          var timer = setTimeout(() => ctrl.abort(), 30000);  // 30s timeout

          var resp = await fetch(OR_URL, {
            method: "POST",
            headers: {
              "Content-Type":  "application/json",
              "Authorization": "Bearer " + key,
              "HTTP-Referer":  "https://examora.com.ng",
              "X-Title":       "EXAMORA by NexaCore Labs"
            },
            body: JSON.stringify({
              model, messages, max_tokens: maxTokens, temperature,
              // Ask model to complete fully
              stop: null
            }),
            signal: ctrl.signal
          });
          clearTimeout(timer);

          if (resp.status === 429) { errors.push(tag+":rate_limit"); continue; }
          if (resp.status === 401 || resp.status === 403) { errors.push(tag+":bad_key"); break; }
          if (!resp.ok) {
            var eb = "";
            try { var ej=await resp.json(); eb=(ej.error?.message||"HTTP "+resp.status).slice(0,80); } catch(_){eb="HTTP "+resp.status;}
            if (resp.status===404 || eb.includes("No endpoints") || eb.includes("not found")) {
              _liveModels=null; _modelsFetch=null; // invalidate cache
            }
            errors.push(tag+":"+eb); continue;
          }

          var data = await resp.json();
          var text = "";
          try { text = (data.choices[0].message?.content || data.choices[0].text || "").trim(); } catch(_){}

          // Check finish_reason — if "length", the response was cut by token limit
          var finish = "";
          try { finish = data.choices[0].finish_reason || ""; } catch(_){}

          if (!text) { errors.push(tag+":empty"); continue; }

          // If truncated by token limit and we have budget, retry with more tokens
          if (finish === "length" && maxTokens < 1800) {
            errors.push(tag+":retrying_with_more_tokens");
            maxTokens = Math.min(maxTokens * 2, 2000);
            // continue to next attempt with same model via retry
          }

          _keyIndex = (kIdx + 1) % keys.length;
          return { text, model, brand: BRAND, finish };

        } catch(e) {
          if (e.name==="AbortError") { errors.push(tag+":timeout"); continue; }
          errors.push(tag+":"+(e.message||"err").slice(0,50));
        }
      }
    }
    throw new Error("AI_FAILED: " + errors.slice(-5).join(" | "));
  }

  // ── Helpers ───────────────────────────────────────────────────
  function optsText(opts) {
    if (!opts) return "";
    return Object.entries(opts).map(([k,v]) => k+". "+v).join("\n");
  }
  function cleanJson(raw) {
    var t = raw.trim()
      .replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/\s*```$/,"")
      .replace(/,\s*\}/g,"}").replace(/,\s*\]/g,"]").trim();
    return JSON.parse(t);
  }

  // ── Chat (NOVA) ───────────────────────────────────────────────
  async function chat(userMsg, context, history) {
    var sysMsg = SYSTEM + (context ? "\n\nContext about this student: " + context : "");
    var msgs = [{ role:"system", content: sysMsg }]
      .concat((history||[]).slice(-10))   // keep more history
      .concat([{ role:"user", content: userMsg }]);
    return call(msgs, 1000, 0.5);   // 1000 tokens — full responses
  }

  // ── Explain answer ────────────────────────────────────────────
  async function explainAnswer(o) {
    var msg = [
      { role: "system", content: SYSTEM },
      { role: "user", content:
        "A student got this " + (o.category||"exam") + " " + (o.subject||"") + " question wrong" + (o.year?" ("+o.year+")":"") + ".\n\n"
        + "Question: " + o.question + "\n\nOptions:\n" + optsText(o.options) + "\n\n"
        + "Correct answer: " + o.correctAnswer + ". " + ((o.options||{})[o.correctAnswer]||"") + "\n"
        + "Student chose: " + (o.userAnswer ? o.userAnswer+". "+((o.options||{})[o.userAnswer]||"") : "skipped") + "\n\n"
        + "Please:\n1. Explain clearly why the correct answer is right\n2. Explain why the student's choice was wrong (if applicable)\n3. State the key concept being tested\n4. Give a memory hook to remember this\n5. End with an encouraging line"
      }
    ];
    return call(msg, 700, 0.3);
  }

  // ── Hint ──────────────────────────────────────────────────────
  async function getHint(o) {
    var msg = [
      { role:"system", content: SYSTEM },
      { role:"user", content:
        "Give a helpful 2-3 sentence hint for this " + (o.category||"exam") + " " + (o.subject||"") + " question.\n"
        + "IMPORTANT: Do NOT reveal the answer or name the correct option letter.\n\n"
        + "Question: " + o.question + "\n\nOptions:\n" + optsText(o.options)
      }
    ];
    return call(msg, 250, 0.4);
  }

  // ── Generate questions ────────────────────────────────────────
  async function generateQuestions(o) {
    var msg = [
      { role:"system", content: SYSTEM },
      { role:"user", content:
        'Generate exactly ' + (o.count||5) + ' multiple-choice questions on "' + o.topic + '" for '
        + (o.category||"general") + " " + (o.subject||"exam") + ". Difficulty: " + (o.difficulty||"medium") + ".\n\n"
        + "Return ONLY a JSON array, no extra text:\n"
        + '[{"question":"...","options":{"A":"...","B":"...","C":"...","D":"..."},"answer":"A","explanation":"brief reason"}]'
      }
    ];
    var r = await call(msg, 1400, 0.4);
    try { var q=cleanJson(r.text); return {questions:Array.isArray(q)?q:[q], model:r.model}; }
    catch(_) { return {questions:null, rawText:r.text, model:r.model}; }
  }

  // ── Study plan ────────────────────────────────────────────────
  async function generateStudyPlan(o) {
    var weak = (o.weakSubjects||[]).map(s => s.subject+": "+s.score+"%").join(", ");
    var msg = [
      { role:"system", content: SYSTEM },
      { role:"user", content:
        "Create a practical 7-day study plan for a Nigerian student.\n"
        + "Exam: " + (o.examType||"JAMB") + " | Current avg: " + (o.avgScore||0) + "% | Target: " + (o.targetScore||75) + "%"
        + " | Exams taken: " + (o.totalExams||0) + " | Weak subjects: " + (weak||"needs assessment") + "\n\n"
        + "Return ONLY a JSON array:\n"
        + '[{"day":1,"title":"Focus area","tasks":"Task 1|Task 2|Task 3","duration":"2 hrs","tip":"motivational tip"}]'
      }
    ];
    var r = await call(msg, 900, 0.35);
    try { return {plan:cleanJson(r.text), model:r.model}; }
    catch(_) { return {plan:null, rawText:r.text, model:r.model}; }
  }

  // ── Score prediction ──────────────────────────────────────────
  async function predictScore(o) {
    var msg = [
      { role:"system", content: SYSTEM },
      { role:"user", content:
        "Predict this student's exam score based on their practice data.\n"
        + "Exam: " + (o.examType||"JAMB") + " | Avg: " + (o.avgScore||0) + "% | Sessions: " + (o.totalExams||0)
        + " | Trend: " + (o.recentTrend>=0?"+":"") + (o.recentTrend||0) + "% | Weak: " + ((o.weakSubjects||[]).join(", ")||"none") + "\n\n"
        + 'Return ONLY JSON: {"predictedScore":75,"confidence":"Medium","range":"70-80%","tip":"one actionable tip"}'
      }
    ];
    var r = await call(msg, 250, 0.2);
    try { return {data:cleanJson(r.text), model:r.model}; }
    catch(_) { return {data:null, model:r.model}; }
  }

  // ── Vocabulary builder ────────────────────────────────────────
  async function buildVocabulary(topic, count, subject) {
    var msg = [
      { role:"system", content: SYSTEM },
      { role:"user", content:
        "Generate " + (count||10) + " key vocabulary words/terms for '" + topic + "'" + (subject?" in "+subject:"") + " for exam preparation.\n\n"
        + "Return ONLY a JSON array:\n"
        + '[{"word":"...","definition":"...","example":"...","tip":"memory trick to remember this"}]'
      }
    ];
    var r = await call(msg, 900, 0.4);
    try { return {words:cleanJson(r.text), model:r.model}; }
    catch(_) { return {words:null, rawText:r.text, model:r.model}; }
  }

  // ── Step-by-step solver ───────────────────────────────────────
  async function solveStepByStep(problem, subject) {
    var msg = [
      { role:"system", content: SYSTEM },
      { role:"user", content:
        "Solve this " + (subject||"") + " problem step by step.\n"
        + "Show every step clearly numbered. Box the final answer at the end.\n\n"
        + "Problem:\n" + problem
      }
    ];
    return call(msg, 800, 0.2);
  }

  // ── Essay / answer checker ────────────────────────────────────
  async function checkEssay(essay, question, subject) {
    var msg = [
      { role:"system", content: SYSTEM },
      { role:"user", content:
        "Check this student's exam answer for a " + (subject||"") + " question.\n\n"
        + "Question: " + (question||"(not provided)") + "\n\n"
        + "Student's answer:\n" + essay + "\n\n"
        + "Provide:\n1. Score out of 10 with justification\n2. Key strengths\n3. Missing or wrong points\n4. An improved model answer (2-3 sentences)\n5. One examiner tip\n\nStart your response with 'Score: X/10'"
      }
    ];
    return call(msg, 800, 0.3);
  }

  // ── Concept explainer ─────────────────────────────────────────
  async function explainConcept(concept, subject, level) {
    var msg = [
      { role:"system", content: SYSTEM },
      { role:"user", content:
        "Explain '" + concept + "' for a " + (level||"O-Level") + " " + (subject||"") + " student in Nigeria.\n"
        + "Use:\n- Simple, clear language\n- A real-life Nigerian example\n- A visual analogy if helpful\n"
        + "End with 3 likely exam questions about this topic."
      }
    ];
    return call(msg, 700, 0.4);
  }

  // ── Past question analyser ────────────────────────────────────
  async function analysePastQuestion(question, subject, year, category) {
    var msg = [
      { role:"system", content: SYSTEM },
      { role:"user", content:
        "Analyse this " + (category||"") + " " + (subject||"") + (year?" ("+year+")":"") + " past question:\n\n"
        + question + "\n\n"
        + "Provide:\n1. The concept/topic being tested\n2. How to approach this type of question\n3. Common mistakes students make\n4. Related topics to review\n5. Similar question types to practise"
      }
    ];
    return call(msg, 600, 0.3);
  }

  // ── Spaced repetition queue ───────────────────────────────────
  function getSpacedRepetitionQueue(questions, history) {
    var now = Date.now(), DAY = 86400000;
    return questions.map(q => {
      var h = (history||{})[q.id] || {correct:0,wrong:0,lastSeen:0};
      var total = h.correct + h.wrong;
      var acc   = total>0 ? h.correct/total : 0;
      var age   = (now-(h.lastSeen||0)) / DAY;
      var p = total===0       ? 50+Math.random()*10
            : acc<0.5         ? 80+age
            : acc<0.8         ? 40+age*0.5
            :                    5+age*0.2;
      return Object.assign({}, q, {_priority:p, _accuracy:acc, _seen:total});
    }).sort((a,b) => b._priority - a._priority);
  }

  // ── Summarise topic/notes into key points ─────────────────────
  async function summariseTopic(topic, level) {
    level = level || "JAMB/WAEC";
    var msg = [
      { role:"system", content: SYSTEM },
      { role:"user", content:
        "Summarise \"" + topic + "\" for a " + level + " student in Nigeria.\n\n"
        + "Return ONLY a JSON object (no extra text):\n"
        + '{"title":"string","keyfacts":["5-8 bullet strings"],'
        + '"mnemonics":"memory trick string","examtips":"string"}' }
    ];
    var r = await call(msg, 700, 0.3);
    try { return { json: cleanJson(r.text), model: r.model }; }
    catch(_) { return { rawText: r.text, model: r.model }; }
  }

  // ── Generate mnemonics for hard topics ────────────────────────
  async function generateMnemonic(topic, items) {
    var itemsStr = Array.isArray(items) ? items.join(", ") : (items || "");
    var msg = [
      { role:"system", content: SYSTEM },
      { role:"user", content:
        "Create 3 creative mnemonics to help Nigerian students remember: \"" + topic + "\""
        + (itemsStr ? "\nItems to remember: " + itemsStr : "") + "\n\n"
        + "Return ONLY JSON (no extra text):\n"
        + '{"topic":"string","mnemonics":[{"device":"ACRONYM|STORY|RHYME","text":"string","explanation":"string"}]}' }
    ];
    var r = await call(msg, 500, 0.6);
    try { return { json: cleanJson(r.text), model: r.model }; }
    catch(_) { return { rawText: r.text, model: r.model }; }
  }

  // ── Wrong answer deep-drill ───────────────────────────────────
  async function drillWrongAnswers(wrongList) {
    // wrongList: [{question, options, userAnswer, correctAnswer, subject}]
    var qText = wrongList.slice(0,5).map((q,i) =>
      (i+1)+". Q: "+q.question+"\n   Options: "+JSON.stringify(q.options||{})+
      "\n   Student picked: "+q.userAnswer+"\n   Correct: "+q.correctAnswer
    ).join("\n\n");
    var msg = [
      { role:"system", content: SYSTEM },
      { role:"user", content:
        "A Nigerian student got these questions wrong. For each one:\n"
        + "1. Explain WHY their answer was wrong\n"
        + "2. Explain WHY the correct answer is right (with working if needed)\n"
        + "3. Give a quick memory tip to not repeat this mistake\n\n"
        + qText + "\n\n"
        + "Return ONLY JSON:\n"
        + '{"analyses":[{"num":1,"whyWrong":"string","whyCorrect":"string","tip":"string"}]}' }
    ];
    var r = await call(msg, 900, 0.3);
    try { return { json: cleanJson(r.text), model: r.model }; }
    catch(_) { return { rawText: r.text, model: r.model }; }
  }

  // ── Model answer writer ───────────────────────────────────────
  async function writeModelAnswer(question, subject, exam) {
    exam = exam || "WAEC";
    var msg = [
      { role:"system", content: SYSTEM },
      { role:"user", content:
        "Write a perfect model answer for this " + exam + " " + subject + " question:\n\n"
        + "\"" + question + "\"\n\n"
        + "Format: clear paragraphs, show all working for calculations, "
        + "use correct terminology, match the mark scheme style. "
        + "End with a 'Key Points' summary." }
    ];
    return call(msg, 1000, 0.3);
  }

  // ── Exam readiness report ─────────────────────────────────────
  async function examReadinessReport(stats) {
    // stats: {subject, totalQ, correct, weakTopics:[], strongTopics:[]}
    var msg = [
      { role:"system", content: SYSTEM },
      { role:"user", content:
        "Generate a personalised exam readiness report for a Nigerian student.\n\n"
        + "Stats: " + JSON.stringify(stats) + "\n\n"
        + "Return ONLY JSON:\n"
        + '{"overallScore":0-100,"readinessLevel":"Not Ready|Almost Ready|Ready|Exam-Ready",'
        + '"strengths":["string"],"gaps":["string"],'
        + '"weeklyPlan":["Day 1: string","Day 2: string","Day 3: string","Day 4: string","Day 5: string"],'
        + '"motivationalNote":"short encouraging string in NOVA style"}' }
    ];
    var r = await call(msg, 800, 0.35);
    try { return { json: cleanJson(r.text), model: r.model }; }
    catch(_) { return { rawText: r.text, model: r.model }; }
  }

  // ── Translate exam question to simple English ─────────────────
  async function simplifyQuestion(question, subject) {
    var msg = [
      { role:"system", content: SYSTEM },
      { role:"user", content:
        "A Nigerian student is confused by this " + (subject||"exam") + " question:\n\n"
        + "\"" + question + "\"\n\n"
        + "1. Rewrite it in simple plain English\n"
        + "2. Identify exactly what is being asked\n"
        + "3. List the key information given\n"
        + "4. Suggest what formula/approach to use\n\n"
        + "Be clear and encouraging." }
    ];
    return call(msg, 600, 0.3);
  }

  function getStatus() {
    return {keys:validKeys().length, keyIndex:_keyIndex+1, brand:BRAND, persona:"NOVA"};
  }

  // Pre-warm model list
  setTimeout(() => { var k=validKeys(); if(k.length) fetchLiveModels(k[0]); }, 1500);

  return {
    call, chat, explainAnswer, getHint,
    generateQuestions, generateStudyPlan, predictScore,
    getSpacedRepetitionQueue, buildVocabulary, solveStepByStep,
    checkEssay, explainConcept, analysePastQuestion,
    summariseTopic, generateMnemonic, drillWrongAnswers,
    writeModelAnswer, examReadinessReport, simplifyQuestion,
    getStatus, BRAND, SYSTEM
  };
})();
