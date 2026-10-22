'use strict';

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const chatbot = require('./chatbot');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ── Web session store ─────────────────────────────────────────────────────────
const sessions = {};
function getSession(id) {
  if (!sessions[id]) sessions[id] = newSession();
  return sessions[id];
}
function newSession() {
  return { lang:'bm', fallbackCount:0, lastTopic:null, quizMode:false, quizQuestions:[], quizIndex:0, quizScore:0 };
}

// ── REST API ──────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ status:'ok', service:'SejarahMate AI', timestamp:new Date().toISOString() }));

app.post('/api/chat', (req, res) => {
  const { message, sessionId } = req.body;
  if (!message || typeof message !== 'string') return res.status(400).json({ error:'message is required' });
  try {
    const result = chatbot.processMessage(message.trim(), getSession(sessionId || 'default'));
    res.json({ text: result.text, suggestions: result.suggestions || [] });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ text:'Maaf, berlaku ralat. Sila cuba lagi.', suggestions:[] });
  }
});

app.post('/api/reset', (req, res) => { delete sessions[req.body.sessionId || 'default']; res.json({ ok:true }); });

app.get('/api/topics', (_req, res) => {
  res.json({ topics: chatbot.getAllTopics().map(t => ({ id:t.id, title:t.title, title_en:t.title_en, title_zh:t.title_zh })) });
});

app.get('/api/quiz/:topicId?', (req, res) => {
  const all  = chatbot.getAllQuizQuestions();
  const pool = req.params.topicId ? all.filter(q => q.id.includes(req.params.topicId.split('_')[0])) : all;
  res.json({ questions: [...(pool.length >= 3 ? pool : all)].sort(() => Math.random() - 0.5).slice(0, 5) });
});

// ── Start web server ──────────────────────────────────────────────────────────
app.listen(PORT, () => console.log(`\n🌐 SejarahMate AI web server: http://localhost:${PORT}`));

// ── Telegram Bot (Long Polling) ───────────────────────────────────────────────
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN || TOKEN === 'YOUR_BOT_TOKEN_HERE') {
  console.log('ℹ️  TELEGRAM_BOT_TOKEN not set — Telegram bot disabled.');
} else {
  initTelegram(TOKEN);
}

// ─────────────────────────────────────────────────────────────────────────────
function initTelegram(token) {
  let TelegramBot;
  try { TelegramBot = require('node-telegram-bot-api'); }
  catch { console.error('❌ node-telegram-bot-api not found. Run: npm install'); return; }

  const bot        = new TelegramBot(token, { polling: true });
  const tgSessions = {};

  function sess(chatId) {
    if (!tgSessions[chatId]) tgSessions[chatId] = { ...newSession(), tgQuiz: null };
    return tgSessions[chatId];
  }

  // ── /start ──────────────────────────────────────────────────────────────────
  bot.onText(/\/start/, async msg => {
    await tgSend(bot, msg.chat.id,
      '*SejarahMate AI* 🏛\nJelajah Sejarah, Teroka Ilmu!\n\nArahan:\n/topics — Topik Sejarah\n/quiz — Mula Kuiz\n/language — Tukar Bahasa\n/help — Bantuan',
      mainKb());
  });

  // ── /help ───────────────────────────────────────────────────────────────────
  bot.onText(/\/help/, async msg => {
    const r = chatbot.processMessage('bantuan', sess(msg.chat.id));
    await tgSend(bot, msg.chat.id, mdv1(r.text), suggKb(r.suggestions));
  });

  // ── /topics ─────────────────────────────────────────────────────────────────
  bot.onText(/\/topics/, async msg => {
    const r = chatbot.processMessage('topik', sess(msg.chat.id));
    await tgSend(bot, msg.chat.id, mdv1(r.text), suggKb(r.suggestions));
  });

  // ── /quiz ───────────────────────────────────────────────────────────────────
  bot.onText(/\/quiz/, async msg => startQuiz(bot, msg.chat.id, sess(msg.chat.id)));

  // ── /language ───────────────────────────────────────────────────────────────
  bot.onText(/\/language/, async msg => {
    await tgSend(bot, msg.chat.id, '🌐 *Pilih Bahasa / Select Language*', {
      inline_keyboard: [
        [{ text:'🇲🇾 Bahasa Melayu', callback_data:'melayu'   }],
        [{ text:'🇬🇧 English',       callback_data:'english'  }],
        [{ text:'🇨🇳 中文 Mandarin', callback_data:'mandarin' }],
      ]
    });
  });

  // ── Regular text messages ───────────────────────────────────────────────────
  bot.on('message', async msg => {
    if (!msg.text || msg.text.startsWith('/')) return;
    const chatId  = msg.chat.id;
    const session = sess(chatId);

    if (session.tgQuiz) {
      await quizTextAnswer(bot, chatId, session, msg.text);
      return;
    }
    const r = chatbot.processMessage(msg.text, session);
    await tgSend(bot, chatId, mdv1(r.text), suggKb(r.suggestions));
  });

  // ── Inline keyboard callbacks ───────────────────────────────────────────────
  bot.on('callback_query', async cq => {
    const chatId  = cq.message.chat.id;
    const data    = cq.data;
    const session = sess(chatId);
    await bot.answerCallbackQuery(cq.id).catch(() => {});

    if (session.tgQuiz) {
      if (data.startsWith('qa:') || data.startsWith('qtf:')) {
        await quizCallbackAnswer(bot, chatId, session, data);
        return;
      }
      if (data === '__next__') { session.tgQuiz.index++; await sendQ(bot, chatId, session); return; }
      if (data === '__restart__') { startQuiz(bot, chatId, session); return; }
    }
    if (data === '__restart__') { startQuiz(bot, chatId, session); return; }

    const r = chatbot.processMessage(data, session);
    await tgSend(bot, chatId, mdv1(r.text), suggKb(r.suggestions));
  });

  // ── Polling error ───────────────────────────────────────────────────────────
  bot.on('polling_error', err => {
    if (err.message && err.message.includes('409'))
      console.error('❌ Conflict (409): another instance is running. Kill all node processes and restart.');
    else
      console.error('Telegram polling error:', err.message);
  });

  console.log('\n✅ Telegram bot connected (long-polling)!');
  console.log('   Open Telegram and send /start to your bot.\n');

  // ── Quiz flow ───────────────────────────────────────────────────────────────
  function startQuiz(bot, chatId, session) {
    const pool = [...chatbot.getAllQuizQuestions()].sort(() => Math.random() - 0.5).slice(0, 5);
    session.tgQuiz = { pool, index:0, score:0 };
    tgSend(bot, chatId, '🎯 *Kuiz Sejarah Bermula!*\nSedia untuk 5 soalan!', null)
      .then(() => setTimeout(() => sendQ(bot, chatId, session), 500));
  }

  async function sendQ(bot, chatId, session) {
    const { pool, index } = session.tgQuiz;
    if (index >= pool.length) { await quizResult(bot, chatId, session); return; }

    const q   = pool[index];
    const num = index + 1;
    const tot = pool.length;
    const hdr = `*Soalan ${num}/${tot}*\n_(${safeStr(q.topic_title || 'Sejarah')})_\n\n${safeStr(q.question)}`;

    let kb;
    if (q.type === 'mcq') {
      kb = { inline_keyboard: q.options.map((opt, i) => [{
        text: String.fromCharCode(65+i) + ') ' + opt,
        callback_data: 'qa:' + i,
      }])};
    } else {
      kb = { inline_keyboard: [
        [{ text:'✅ Benar / True',  callback_data:'qtf:true'  }],
        [{ text:'❌ Salah / False', callback_data:'qtf:false' }],
      ]};
    }
    await tgSend(bot, chatId, hdr, kb);
  }

  async function quizCallbackAnswer(bot, chatId, session, data) {
    const q = session.tgQuiz.pool[session.tgQuiz.index];
    let correct;

    if (data.startsWith('qa:')) {
      const idx = parseInt(data.split(':')[1], 10);
      correct   = idx === q.answer;
    } else {
      const chosen = data.split(':')[1] === 'true';
      correct      = chosen === q.answer;
    }

    if (correct) session.tgQuiz.score++;
    const correctLabel = q.type === 'mcq'
      ? String.fromCharCode(65 + q.answer) + ') ' + q.options[q.answer]
      : (q.answer ? 'Benar' : 'Salah');

    const fb = (correct ? '✅ *Betul!*' : '❌ *Salah.* Jawapan: *' + safeStr(correctLabel) + '*')
             + '\n\n' + safeStr(q.explanation);

    const isLast = session.tgQuiz.index >= session.tgQuiz.pool.length - 1;
    await tgSend(bot, chatId, fb, {
      inline_keyboard: [[{ text: isLast ? '🏆 Lihat Keputusan' : 'Seterusnya →', callback_data:'__next__' }]]
    });
  }

  async function quizTextAnswer(bot, chatId, session, text) {
    const t = text.trim().toLowerCase();
    const q = session.tgQuiz.pool[session.tgQuiz.index];

    let correct = null;
    if (q.type === 'mcq') {
      const map = { a:0, b:1, c:2, d:3 };
      if (!(t in map)) { await bot.sendMessage(chatId, 'Taip A, B, C atau D untuk menjawab.'); return; }
      correct = map[t] === q.answer;
    } else {
      const isTrue  = ['benar','true','ya','betul'].includes(t);
      const isFalse = ['salah','false','tidak','no'].includes(t);
      if (!isTrue && !isFalse) { await bot.sendMessage(chatId, 'Taip Benar atau Salah untuk menjawab.'); return; }
      correct = isTrue === q.answer;
    }

    if (correct) session.tgQuiz.score++;
    const correctLabel = q.type === 'mcq'
      ? String.fromCharCode(65 + q.answer) + ') ' + q.options[q.answer]
      : (q.answer ? 'Benar' : 'Salah');

    const fb = (correct ? '✅ *Betul!*' : '❌ *Salah.* Jawapan: *' + safeStr(correctLabel) + '*')
             + '\n\n' + safeStr(q.explanation);

    const isLast = session.tgQuiz.index >= session.tgQuiz.pool.length - 1;
    await tgSend(bot, chatId, fb, {
      inline_keyboard: [[{ text: isLast ? '🏆 Lihat Keputusan' : 'Seterusnya →', callback_data:'__next__' }]]
    });
    session.tgQuiz.index++;
    if (isLast) { await quizResult(bot, chatId, session); }
  }

  async function quizResult(bot, chatId, session) {
    const { score, pool } = session.tgQuiz;
    session.tgQuiz = null;
    const pct   = Math.round((score / pool.length) * 100);
    const emoji = pct >= 80 ? '🥇' : pct >= 60 ? '🥈' : '🥉';
    const grade = pct >= 80 ? 'Cemerlang! Tahniah!' : pct >= 60 ? 'Bagus! Teruskan usaha!' : 'Cuba lagi! Anda pasti boleh!';
    await tgSend(bot, chatId,
      emoji + ' *Kuiz Selesai!*\n\nMarkah: *' + score + '/' + pool.length + '* (' + pct + '%)\n' + grade,
      { inline_keyboard: [
          [{ text:'🔄 Cuba Lagi',    callback_data:'__restart__' }],
          [{ text:'📚 Lihat Topik',  callback_data:'topik'       }],
        ]
      }
    );
  }
}

// ── Telegram send helper ──────────────────────────────────────────────────────
async function tgSend(bot, chatId, text, replyMarkup) {
  const opts = { parse_mode:'Markdown' };
  if (replyMarkup) opts.reply_markup = replyMarkup;
  try {
    await bot.sendMessage(chatId, text, opts);
  } catch (e) {
    // fallback: plain text
    try {
      await bot.sendMessage(chatId, text.replace(/[*_`]/g, ''), { reply_markup: replyMarkup });
    } catch (e2) {
      console.error('tgSend error:', e2.message);
    }
  }
}

// Convert **bold** → *bold*, strip chars that break Telegram Markdown v1
function mdv1(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '*$1*')   // **bold** → *bold*
    .replace(/`([^`]*)`/g, '`$1`')        // preserve inline code
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1: $2') // [text](url) → text: url
    .replace(/[_]/g, ' ')                  // underscores cause italic issues in Telegram
    .replace(/\n{3,}/g, '\n\n');           // collapse blank lines
}

// Safe string: remove chars that break Telegram Markdown v1 in plain contexts
function safeStr(str) {
  if (!str) return '';
  return str.replace(/[*_`]/g, '');
}

function mainKb() {
  return { inline_keyboard: [
    [{ text:'📚 Topik',      callback_data:'topik'                     },
     { text:'🎯 Kuiz',       callback_data:'kuiz'                      }],
    [{ text:'📅 Garis Masa', callback_data:'garis masa kemerdekaan'    },
     { text:'🆘 Bantuan',    callback_data:'bantuan'                   }],
  ]};
}

function suggKb(suggestions) {
  if (!suggestions || !suggestions.length) return mainKb();
  const rows = [];
  for (let i = 0; i < Math.min(suggestions.length, 4); i += 2)
    rows.push(suggestions.slice(i, i + 2).map(s => ({ text:s, callback_data:s })));
  return { inline_keyboard: rows };
}

module.exports = app;
