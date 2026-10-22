/* ═══════════════════════════════════════════════════════════════
   SejarahMate AI — Frontend Application Logic
   All chatbot communication through /api/chat REST endpoint
═══════════════════════════════════════════════════════════════ */
'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  sessionId: 'sess_' + Math.random().toString(36).slice(2, 10),
  lang: 'bm',
  quizData: null,     // { questions, index, score, answered }
};

// ── DOM refs ──────────────────────────────────────────────────────────────────
const chatWindow    = document.getElementById('chat-window');
const chatInput     = document.getElementById('chat-input');
const btnSend       = document.getElementById('btn-send');
const btnClear      = document.getElementById('btn-clear');
const suggBar       = document.getElementById('suggestion-bar');
const topicList     = document.getElementById('topic-list');
const quizModal     = document.getElementById('quiz-modal');
const quizModalBody = document.getElementById('quiz-modal-body');
const quizModalClose= document.getElementById('quiz-modal-close');

// ── Init ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  await loadTopicsSidebar();
  bindEvents();
});

// ── Events ────────────────────────────────────────────────────────────────────
function bindEvents() {
  btnSend.addEventListener('click', sendMessage);
  chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });
  btnClear.addEventListener('click', clearChat);
  quizModalClose.addEventListener('click', closeQuizModal);
  quizModal.querySelector('.modal-backdrop').addEventListener('click', closeQuizModal);

  // Language buttons
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const langMsg = btn.dataset.lang === 'en' ? 'english' : btn.dataset.lang === 'zh' ? 'mandarin' : 'melayu';
      sendMessageText(langMsg);
    });
  });

  // Quick sidebar buttons
  document.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => sendMessageText(btn.dataset.msg));
  });

  // Delegate chip / topic / quiz button clicks
  document.body.addEventListener('click', e => {
    const chip = e.target.closest('[data-msg]');
    if (chip && !chip.closest('.lang-btn') && !chip.closest('.quick-btn')) {
      sendMessageText(chip.dataset.msg);
    }
  });
}

// ── Load sidebar topics ────────────────────────────────────────────────────────
async function loadTopicsSidebar() {
  try {
    const res    = await fetch('/api/topics');
    const data   = await res.json();
    const topics = data.topics || [];

    // Group by category
    const groups = {};
    for (const t of topics) {
      const cat = t.category || 'Lain-lain';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(t);
    }

    let html = '';
    for (const [cat, ts] of Object.entries(groups)) {
      html += `<div class="topic-group-label" style="font-size:.68rem;color:var(--muted);margin:.5rem 0 .2rem;text-transform:uppercase;letter-spacing:.5px">${cat}</div>`;
      for (const t of ts) {
        const label = state.lang === 'en' ? t.title_en : state.lang === 'zh' ? t.title_zh : t.title;
        html += `<button class="topic-btn" data-msg="${escHtml(t.title)}">${escHtml(label)}</button>`;
      }
    }
    topicList.innerHTML = html;
  } catch (err) {
    topicList.innerHTML = '<p style="font-size:.78rem;color:var(--muted)">Gagal memuatkan topik.</p>';
  }
}

// ── Send message ──────────────────────────────────────────────────────────────
async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text) return;
  chatInput.value = '';
  await sendMessageText(text);
}

async function sendMessageText(text) {
  if (!text) return;

  // Detect quiz shortcut in frontend
  if (/^(kuiz|quiz|start quiz|mula kuiz)$/i.test(text.trim())) {
    await fetchAndStartQuizModal();
    return;
  }

  appendBubble('user', text);
  suggBar.innerHTML = '';
  const typingEl = appendTyping();

  try {
    const res  = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, sessionId: state.sessionId }),
    });
    const data = await res.json();
    typingEl.remove();
    appendBubble('bot', data.text, data.suggestions);
    updateSuggBar(data.suggestions);
  } catch {
    typingEl.remove();
    appendBubble('bot', '⚠️ Ralat sambungan. Pastikan pelayan berjalan dan cuba lagi.', []);
  }
}

// ── Quiz Modal ────────────────────────────────────────────────────────────────
async function fetchAndStartQuizModal() {
  try {
    const res  = await fetch('/api/quiz');
    const data = await res.json();
    state.quizData = { questions: data.questions, index: 0, score: 0, answered: false };
    quizModal.classList.remove('hidden');
    renderQuizQuestion();
  } catch {
    appendBubble('bot', '⚠️ Gagal memuatkan kuiz. Cuba lagi.', []);
  }
}

function closeQuizModal() {
  quizModal.classList.add('hidden');
  state.quizData = null;
}

function renderQuizQuestion() {
  const { questions, index } = state.quizData;
  if (index >= questions.length) { renderQuizResult(); return; }

  const q   = questions[index];
  const num = index + 1;
  const tot = questions.length;
  const pct = Math.round((index / tot) * 100);

  let optionsHtml = '';
  if (q.type === 'mcq') {
    optionsHtml = '<div class="quiz-options">' +
      q.options.map((opt, i) =>
        `<button class="quiz-option" data-idx="${i}"><span style="font-weight:700;color:var(--teal);margin-right:.4rem">${String.fromCharCode(65+i)})</span>${escHtml(opt)}</button>`
      ).join('') +
      '</div>';
  } else {
    optionsHtml = `<div class="quiz-tf">
      <button class="quiz-tf-btn" data-val="true">✅ Benar / True</button>
      <button class="quiz-tf-btn" data-val="false">❌ Salah / False</button>
    </div>`;
  }

  quizModalBody.innerHTML = `
    <div class="quiz-progress">Soalan ${num} daripada ${tot}</div>
    <div class="quiz-progress-bar"><div class="quiz-progress-fill" style="width:${pct}%"></div></div>
    <div class="quiz-topic-tag">📚 ${escHtml(q.topic_title || 'Sejarah')}</div>
    <div class="quiz-question">${escHtml(q.question)}</div>
    ${optionsHtml}
    <div class="quiz-explanation hidden" id="quiz-expl"></div>
    <div class="quiz-nav">
      <button class="btn-primary hidden" id="quiz-next">Seterusnya →</button>
    </div>`;

  state.quizData.answered = false;

  // Bind option clicks
  if (q.type === 'mcq') {
    quizModalBody.querySelectorAll('.quiz-option').forEach(btn => {
      btn.addEventListener('click', () => handleQuizOptionClick(btn, parseInt(btn.dataset.idx), q));
    });
  } else {
    quizModalBody.querySelectorAll('.quiz-tf-btn').forEach(btn => {
      btn.addEventListener('click', () => handleTFClick(btn, btn.dataset.val === 'true', q));
    });
  }

  document.getElementById('quiz-next').addEventListener('click', () => {
    state.quizData.index++;
    renderQuizQuestion();
  });
}

function handleQuizOptionClick(btn, idx, q) {
  if (state.quizData.answered) return;
  state.quizData.answered = true;

  const correct = idx === q.answer;
  if (correct) state.quizData.score++;

  quizModalBody.querySelectorAll('.quiz-option').forEach((b, i) => {
    b.disabled = true;
    if (i === q.answer) b.classList.add('correct');
    else if (i === idx && !correct) b.classList.add('wrong');
  });

  showExplanation(q.explanation, correct);
}

function handleTFClick(btn, chosen, q) {
  if (state.quizData.answered) return;
  state.quizData.answered = true;

  const correct = chosen === q.answer;
  if (correct) state.quizData.score++;

  quizModalBody.querySelectorAll('.quiz-tf-btn').forEach(b => {
    b.disabled = true;
    const bVal = b.dataset.val === 'true';
    if (bVal === q.answer) b.classList.add('correct');
    else if (bVal === chosen && !correct) b.classList.add('wrong');
  });

  showExplanation(q.explanation, correct);
}

function showExplanation(text, correct) {
  const expl = document.getElementById('quiz-expl');
  const next = document.getElementById('quiz-next');
  expl.textContent = (correct ? '✅ Betul! ' : '❌ Salah. ') + text;
  expl.classList.remove('hidden');
  next.classList.remove('hidden');
  const isLast = state.quizData.index >= state.quizData.questions.length - 1;
  next.textContent = isLast ? 'Lihat Keputusan 🏆' : 'Seterusnya →';
}

function renderQuizResult() {
  const { score, questions } = state.quizData;
  const pct   = Math.round((score / questions.length) * 100);
  const emoji = pct >= 80 ? '🥇' : pct >= 60 ? '🥈' : '🥉';
  const grade = pct >= 80 ? 'Cemerlang! Tahniah!' : pct >= 60 ? 'Bagus! Teruskan usaha!' : 'Cuba lagi! Anda pasti boleh!';

  quizModalBody.innerHTML = `
    <div class="quiz-result">
      <div class="result-emoji">${emoji}</div>
      <div class="result-score">${score} / ${questions.length}</div>
      <div class="result-pct">${pct}%</div>
      <div class="result-grade">${grade}</div>
      <div style="display:flex;gap:.6rem;justify-content:center;flex-wrap:wrap">
        <button class="btn-primary" id="quiz-restart">🔄 Cuba Lagi</button>
        <button class="btn-secondary" id="quiz-done">Tutup</button>
      </div>
    </div>`;

  document.getElementById('quiz-restart').addEventListener('click', async () => {
    await fetchAndStartQuizModal();
  });
  document.getElementById('quiz-done').addEventListener('click', closeQuizModal);
}

// ── Chat helpers ──────────────────────────────────────────────────────────────
function appendBubble(role, text, suggestions = []) {
  const wrap = document.createElement('div');
  wrap.className = `chat-bubble ${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'bubble-avatar';
  avatar.textContent = role === 'bot' ? '🏛️' : '👤';

  const content = document.createElement('div');
  content.className = 'bubble-content';
  content.innerHTML = renderMarkdown(text);

  if (suggestions && suggestions.length) {
    const chips = document.createElement('div');
    chips.className = 'suggestion-chips';
    for (const s of suggestions) {
      const btn = document.createElement('button');
      btn.className = 'chip';
      btn.dataset.msg = s;
      btn.textContent = s;
      chips.appendChild(btn);
    }
    content.appendChild(chips);
  }

  wrap.appendChild(avatar);
  wrap.appendChild(content);
  chatWindow.appendChild(wrap);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return wrap;
}

function appendTyping() {
  const wrap = document.createElement('div');
  wrap.className = 'chat-bubble bot typing-indicator';
  wrap.innerHTML = `
    <div class="bubble-avatar">🏛️</div>
    <div class="bubble-content">
      <div class="typing-dots"><span></span><span></span><span></span></div>
    </div>`;
  chatWindow.appendChild(wrap);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return wrap;
}

function updateSuggBar(suggestions) {
  suggBar.innerHTML = '';
  if (!suggestions || !suggestions.length) return;
  for (const s of suggestions) {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.dataset.msg = s;
    btn.textContent = s;
    suggBar.appendChild(btn);
  }
}

function clearChat() {
  // Keep only the welcome bubble
  const bubbles = chatWindow.querySelectorAll('.chat-bubble:not(#welcome-msg)');
  bubbles.forEach(b => b.remove());
  suggBar.innerHTML = '';
  // Reset server session
  fetch('/api/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: state.sessionId }),
  });
}

// ── Markdown-lite renderer ─────────────────────────────────────────────────────
function renderMarkdown(text) {
  // Escape HTML first, then apply transforms
  let h = escHtml(text);

  // **bold**
  h = h.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // _italic_
  h = h.replace(/\_(.*?)\_/g, '<em>$1</em>');
  // `code`
  h = h.replace(/`([^`]+)`/g, '<span class="md-code">$1</span>');
  // --- hr
  h = h.replace(/^---$/gm, '<hr class="md-hr">');
  // Bullet lists: lines starting with •
  h = h.replace(/^[•\-] (.+)/gm, '<li>$1</li>');
  h = h.replace(/(<li>.*<\/li>)/s, match => `<ul>${match}</ul>`);
  // Numbered lists: 1. 2. etc
  h = h.replace(/^\d+\. (.+)/gm, '<li>$1</li>');
  // Line breaks
  h = h.replace(/\n/g, '<br>');
  // Clean up br after li tags
  h = h.replace(/<\/li><br>/g, '</li>');
  h = h.replace(/<br><ul>/g, '<ul>');

  return h;
}

function escHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
