'use strict';

const path = require('path');
const fs   = require('fs');

// ─── Load knowledge base ───────────────────────────────────────────────────
function loadKB() {
  const dataDir = path.join(__dirname, '../data');
  const files   = ['topics_malaysia.json', 'topics_sabah_sarawak.json', 'topics_world.json', 'topics_skills.json'];
  const all     = { topics: [], intents: [], static_responses: {} };

  for (const f of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf-8'));
    if (raw.topics)           all.topics.push(...raw.topics);
    if (raw.intents)          all.intents.push(...raw.intents);
    if (raw.static_responses) Object.assign(all.static_responses, raw.static_responses);
  }
  return all;
}

const KB = loadKB();

// Flat quiz pool (all questions from all topics)
const QUIZ_POOL = KB.topics.flatMap(t => (t.quiz_questions || []).map(q => ({ ...q, topic_title: t.title })));

// ─── Helpers ────────────────────────────────────────────────────────────────
function normalize(str) {
  return str.toLowerCase()
    .replace(/[?？。！!.,;:'"()（）]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreKeywords(text, keywords) {
  let score = 0;
  for (const kw of keywords) {
    if (text.includes(normalize(kw))) score += kw.split(' ').length; // longer matches score higher
  }
  return score;
}

function pickLang(topic, lang) {
  if (lang === 'en') return { title: topic.title_en, short: topic.short_explanation_en, detail: topic.detailed_explanation };
  if (lang === 'zh') return { title: topic.title_zh, short: topic.short_explanation_zh, detail: topic.detailed_explanation };
  return { title: topic.title, short: topic.short_explanation, detail: topic.detailed_explanation };
}

// ─── Intent matcher ─────────────────────────────────────────────────────────
function matchIntent(text) {
  const t = normalize(text);

  // Academic dishonesty guardrail
  if (/buat (tugasan|kerja|esei|essay|assignment)|siapkan (tugasan|jawapan)|jawabkan (soalan|peperiksaan)|tulis (esei|karangan) (untuk|bagi) saya/.test(t)) {
    return { type: 'guardrail', key: 'academic_dishonesty' };
  }

  // Check static intents first
  // Use whole-word matching for short patterns (≤ 4 chars) to avoid substring false-positives
  for (const intent of KB.intents) {
    for (const p of intent.patterns) {
      const np = normalize(p);
      const matched = np.length <= 4
        ? new RegExp(`(?<![a-z])${np.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z])`).test(t)
        : t.includes(np);
      if (matched) {
        return { type: 'intent', key: intent.response_key };
      }
    }
  }

  // Check topic keywords
  let bestTopic = null;
  let bestScore = 0;
  for (const topic of KB.topics) {
    const score = scoreKeywords(t, topic.keywords);
    if (score > bestScore) {
      bestScore = score;
      bestTopic = topic;
    }
  }
  if (bestTopic && bestScore >= 1) {
    return { type: 'topic', topic: bestTopic };
  }

  return { type: 'fallback' };
}

// ─── Timeline builder ───────────────────────────────────────────────────────
function buildTimeline(topic, lang) {
  if (!topic.important_dates || topic.important_dates.length === 0) return null;
  const { title } = pickLang(topic, lang);
  const lines = topic.important_dates.map(d => `**${d.year}** — ${d.event}`).join('\n');
  return `📅 **Garis Masa: ${title}**\n\n${lines}`;
}

// ─── Topic response builder ─────────────────────────────────────────────────
function buildTopicResponse(topic, lang, detail = false) {
  const { title, short, detail: detailText } = pickLang(topic, lang);

  let msg = `📖 **${title}**\n\n${short}`;

  if (detail && detailText) {
    msg += `\n\n${detailText}`;
  } else {
    msg += '\n\n_Taip "lebih lanjut" atau "more" untuk penerangan terperinci._';
  }

  if (topic.important_dates && topic.important_dates.length > 0) {
    msg += '\n\n📅 _Taip "garis masa [topik]" untuk melihat garis masa._';
  }

  return msg;
}

// ─── Quiz helpers ────────────────────────────────────────────────────────────
function getQuizQuestion(topicId, index) {
  let pool = topicId
    ? QUIZ_POOL.filter(q => q.id.startsWith('q_' + topicId.split('_')[1]) || q.id.includes(topicId.split('_')[0]))
    : QUIZ_POOL;
  if (pool.length === 0) pool = QUIZ_POOL;

  // Shuffle
  pool = [...pool].sort(() => Math.random() - 0.5);
  const q = pool[index % pool.length];
  return { question: q, total: Math.min(pool.length, 5), pool };
}

function formatQuestion(q, num, total) {
  let msg = `❓ **Soalan ${num} / ${total}**\n_(${q.topic_title})_\n\n**${q.question}**\n\n`;
  if (q.type === 'mcq') {
    q.options.forEach((opt, i) => { msg += `${String.fromCharCode(65 + i)}) ${opt}\n`; });
    msg += '\n_Taip A, B, C atau D untuk menjawab._';
  } else {
    msg += '_Taip **Benar** atau **Salah** untuk menjawab._';
  }
  return msg;
}

function checkAnswer(q, userInput) {
  const t = normalize(userInput);
  let userAns;

  if (q.type === 'mcq') {
    const letterMap = { a: 0, b: 1, c: 2, d: 3 };
    if (t in letterMap) userAns = letterMap[t];
    else {
      // try matching option text
      const idx = q.options.findIndex(o => normalize(o).includes(t) || t.includes(normalize(o).split(' ')[0]));
      userAns = idx;
    }
    return { correct: userAns === q.answer, correctAnswer: q.options[q.answer] };
  } else {
    const isTrue = ['benar', 'true', 'ya', 'yes', 'betul', '是'].some(w => t.includes(w));
    const isFalse = ['salah', 'false', 'tidak', 'no', 'bukan', '不是', '否'].some(w => t.includes(w));
    if (!isTrue && !isFalse) return { correct: null, correctAnswer: q.answer ? 'Benar' : 'Salah' };
    return { correct: isTrue === q.answer, correctAnswer: q.answer ? 'Benar' : 'Salah' };
  }
}

// ─── Main process function ───────────────────────────────────────────────────
/**
 * Process a user message.
 * @param {string} message
 * @param {object} session  — mutable session state per user
 * @returns {{ text: string, suggestions: string[], quizState?: object }}
 */
function processMessage(message, session = {}) {
  if (!session.lang)           session.lang           = 'bm';
  if (!session.fallbackCount)  session.fallbackCount  = 0;
  if (!session.lastTopic)      session.lastTopic      = null;
  if (!session.quizMode)       session.quizMode       = false;

  const lang = session.lang;
  const t    = normalize(message);

  // ── Quiz mode active ──────────────────────────────────────────────────────
  if (session.quizMode) {
    return handleQuizAnswer(message, session);
  }

  // ── Language switch ───────────────────────────────────────────────────────
  // Only trigger when the message is clearly a language command (short, no topic keywords).
  // Use word-count guard: <= 4 words to avoid matching "Kesultanan Melayu Melaka".
  const wordCount = t.split(/\s+/).filter(Boolean).length;
  const isLangCmd = wordCount <= 4;
  if (isLangCmd && (/^(english|inggeris)$/.test(t) || /\b(tukar bahasa|change language|language english|language inggeris)\b/.test(t) || t === 'en' || t === '2')) {
    session.lang = 'en';
    return reply('🇬🇧 Language switched to **English**! How can I help you?', ['Topics', 'Quiz', 'Timeline', 'Help']);
  }
  if (isLangCmd && (/^(melayu|bahasa melayu|bahasa malaysia|bm|malay)$/.test(t) || /\b(tukar bahasa melayu|language melayu)\b/.test(t) || t === '1')) {
    session.lang = 'bm';
    return reply('🇲🇾 Bahasa ditukar ke **Bahasa Melayu**! Apa yang ingin anda pelajari?', ['Topik', 'Kuiz', 'Garis Masa', 'Bantuan']);
  }
  if (isLangCmd && (/\b(mandarin|chinese|cina|中文|华语)\b/.test(t) || t === 'zh' || t === '3')) {
    session.lang = 'zh';
    return reply('🇨🇳 语言已切换为**中文**！您想学什么？', ['主题', '测验', '时间线', '帮助']);
  }

  // ── "more / lebih lanjut" on last topic ───────────────────────────────────
  if (session.lastTopic && /\b(lebih lanjut|more|detail|terperinci|explain more|hurai)\b/.test(t)) {
    const resp = buildTopicResponse(session.lastTopic, lang, true);
    const figs = session.lastTopic.historical_figures;
    const extra = figs && figs.length
      ? '\n\n👤 **Tokoh Penting:**\n' + figs.map(f => `• ${f.name} — ${f.role}`).join('\n')
      : '';
    session.fallbackCount = 0;
    return reply(resp + extra, defaultSuggestions(lang));
  }

  // ── Timeline request ──────────────────────────────────────────────────────
  if (/garis masa|timeline|chronology|kronologi/.test(t)) {
    // Try to identify topic in the same message
    let bestTopic = null, bestScore = 0;
    for (const topic of KB.topics) {
      const s = scoreKeywords(t, topic.keywords);
      if (s > bestScore) { bestScore = s; bestTopic = topic; }
    }
    if (bestTopic && bestScore >= 1) {
      const tl = buildTimeline(bestTopic, lang);
      session.fallbackCount = 0;
      return reply(tl || `_Tiada garis masa khusus untuk topik ini._`, defaultSuggestions(lang));
    }
    return reply(KB.static_responses.timeline_prompt, topicSuggestions());
  }

  // ── Quiz start ────────────────────────────────────────────────────────────
  if (/\b(kuiz|quiz|soalan latihan|soal latihan|mula kuiz|start quiz|begin quiz)\b/.test(t)) {
    return startQuiz(null, session);
  }

  // ── Topic-specific quiz ───────────────────────────────────────────────────
  if (/\b(soalan|soal)\b/.test(t) || /\bpractice question\b/.test(t)) {
    let bestTopic = null, bestScore = 0;
    for (const topic of KB.topics) {
      const s = scoreKeywords(t, topic.keywords);
      if (s > bestScore) { bestScore = s; bestTopic = topic; }
    }
    if (bestTopic && bestScore >= 1) return startQuiz(bestTopic.id, session);
    return startQuiz(null, session);
  }

  // ── Intent matching ───────────────────────────────────────────────────────
  const match = matchIntent(message);

  if (match.type === 'guardrail') {
    session.fallbackCount = 0;
    return reply(KB.static_responses[match.key], defaultSuggestions(lang));
  }

  if (match.type === 'intent') {
    session.fallbackCount = 0;
    const resp = KB.static_responses[match.key] || KB.static_responses['fallback'];
    const sugg = match.key === 'topic_list'       ? topicSuggestions()
               : match.key === 'quiz_prompt'       ? quizTopicSuggestions()
               : match.key === 'timeline_prompt'   ? topicSuggestions()
               : defaultSuggestions(lang);
    return reply(resp, sugg);
  }

  if (match.type === 'topic') {
    session.lastTopic     = match.topic;
    session.fallbackCount = 0;
    const resp = buildTopicResponse(match.topic, lang);
    return reply(resp, ['Lebih Lanjut', 'Kuiz Topik Ini', 'Garis Masa', 'Topik Lain']);
  }

  // ── Fallback ──────────────────────────────────────────────────────────────
  session.fallbackCount++;
  if (session.fallbackCount >= 2) {
    return reply(KB.static_responses.fallback_2, ['Bantuan', 'Topik', 'Kuiz', 'Hubungi Guru']);
  }
  return reply(KB.static_responses.fallback, topicSuggestions());
}

// ─── Quiz flow ───────────────────────────────────────────────────────────────
function startQuiz(topicId, session) {
  const pool = topicId
    ? QUIZ_POOL.filter(q => {
        const tid = topicId.replace(/_/g, '');
        return q.id.includes(tid.substring(0, 5));
      })
    : [...QUIZ_POOL];
  const shuffled = pool.length >= 3 ? pool : [...QUIZ_POOL];
  const selected = shuffled.sort(() => Math.random() - 0.5).slice(0, 5);

  session.quizMode      = true;
  session.quizQuestions = selected;
  session.quizIndex     = 0;
  session.quizScore     = 0;

  const q   = selected[0];
  const msg = '🎯 **Kuiz Sejarah Bermula!**\n\n' + formatQuestion(q, 1, selected.length);
  return reply(msg, q.type === 'mcq' ? ['A', 'B', 'C', 'D'] : ['Benar', 'Salah']);
}

function handleQuizAnswer(message, session) {
  const q      = session.quizQuestions[session.quizIndex];
  const result = checkAnswer(q, message);

  if (result.correct === null) {
    return reply('⚠️ Jawapan tidak difahami. Sila taip A, B, C, D (untuk MCQ) atau Benar/Salah.',
      q.type === 'mcq' ? ['A', 'B', 'C', 'D'] : ['Benar', 'Salah']);
  }

  let feedback = result.correct
    ? `✅ **Betul!** Tahniah!\n\n📝 ${q.explanation}`
    : `❌ **Salah.** Jawapan betul ialah: **${result.correctAnswer}**\n\n📝 ${q.explanation}`;

  if (result.correct) session.quizScore++;
  session.quizIndex++;

  if (session.quizIndex >= session.quizQuestions.length) {
    // Quiz done
    session.quizMode = false;
    const pct   = Math.round((session.quizScore / session.quizQuestions.length) * 100);
    const grade = pct >= 80 ? '🥇 Cemerlang!' : pct >= 60 ? '🥈 Bagus!' : '🥉 Teruskan Usaha!';
    feedback += `\n\n---\n🏆 **Kuiz Selesai!**\nMarkah: **${session.quizScore}/${session.quizQuestions.length}** (${pct}%)\n${grade}`;
    return reply(feedback, ['Kuiz Semula', 'Topik Lain', 'Bantuan']);
  }

  const nextQ   = session.quizQuestions[session.quizIndex];
  const nextMsg = '\n\n---\n' + formatQuestion(nextQ, session.quizIndex + 1, session.quizQuestions.length);
  return reply(feedback + nextMsg,
    nextQ.type === 'mcq' ? ['A', 'B', 'C', 'D'] : ['Benar', 'Salah']);
}

// ─── Small helpers ────────────────────────────────────────────────────────────
function reply(text, suggestions = []) {
  return { text, suggestions };
}

function defaultSuggestions(lang) {
  if (lang === 'en') return ['Topics', 'Quiz', 'Timeline', 'Help'];
  if (lang === 'zh') return ['主题', '测验', '时间线', '帮助'];
  return ['Topik', 'Kuiz', 'Garis Masa', 'Bantuan'];
}

function topicSuggestions() {
  return ['Melaka', 'Kemerdekaan', 'Malaysia 1963', 'WW2', 'Mesir Purba'];
}

function quizTopicSuggestions() {
  return ['Kuiz Melaka', 'Kuiz Kemerdekaan', 'Kuiz WW2', 'Kuiz Umum'];
}

// ─── All quiz questions (used by /quiz endpoint) ──────────────────────────────
function getAllQuizQuestions() { return QUIZ_POOL; }
function getAllTopics()        { return KB.topics; }

module.exports = { processMessage, getAllQuizQuestions, getAllTopics };
