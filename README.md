# SejarahMate AI 🏛️
### *Jelajah Sejarah, Teroka Ilmu!*

A fully rule-based, interactive History learning chatbot for Malaysian students (Gen Z & Gen Alpha). No LLM API. No paid services. Runs locally and is ready for Telegram integration.

---

## 📦 Project Structure

```
sejarahmate/
├── data/                        ← Knowledge base JSON files
│   ├── topics_malaysia.json     ← Malaysian History topics
│   ├── topics_sabah_sarawak.json
│   ├── topics_world.json        ← World History & concepts
│   └── topics_skills.json       ← Historical thinking skills + intents + static responses
├── public/                      ← Static frontend
│   ├── index.html
│   ├── style.css
│   └── app.js
├── src/
│   ├── chatbot.js               ← Rule-based engine (shared by web + Telegram)
│   └── server.js                ← Express backend + Telegram webhook
├── .env.example                 ← Environment variable template
├── .gitignore
└── package.json
```

---

## 🚀 Quick Start (Local)

### Prerequisites
- Node.js 16+ (https://nodejs.org)
- npm

### 1. Install dependencies
```bash
cd sejarahmate
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Open .env — you can leave TELEGRAM_BOT_TOKEN as-is for local testing
```

### 3. Start the server
```bash
npm start
```

### 4. Open in browser
```
http://localhost:3000
```

### 5. Development mode (auto-restart)
```bash
npm run dev
```

---

## 💬 How to Use the Chatbot

| Action | What to type |
|---|---|
| Ask about a topic | `Kesultanan Melayu Melaka`, `British colonialism`, `WW2` |
| Get a definition | `Apa itu nasionalisme?`, `What is colonialism?` |
| Start a quiz | `kuiz`, `quiz`, `start quiz` |
| View timeline | `garis masa kemerdekaan`, `timeline Melaka` |
| Switch language | `english`, `melayu`, `mandarin` |
| See all topics | `topik`, `topics` |
| Get more detail | After a topic reply, type `lebih lanjut` or `more` |
| Help | `bantuan`, `help` |

---

## 🧠 Knowledge Base Topics

### 🇲🇾 Malaysian History
- Kesultanan Melayu Melaka (~1400–1511)
- Penjajahan British di Tanah Melayu
- Malayan Union 1946
- Kemerdekaan Tanah Melayu 1957
- Pembentukan Malaysia 1963

### 🏔️ Sabah & Sarawak
- Sejarah Sabah (SBBU, Sandakan Death March)
- Sejarah Sarawak (Dinasti Brooke / Rajah Putih)

### 🌏 World History
- Perang Dunia Kedua (1939–1945)
- Tamadun Mesir Purba
- Nasionalisme
- Kolonialisme

### 🧠 Skills
- Kemahiran Pemikiran Sejarah (KPS) — 6 skills

---

## ➕ Adding New Topics

Edit any JSON file in `data/` or create a new one following this schema:

```json
{
  "category": "Your Category Name",
  "topics": [
    {
      "id": "unique_topic_id",
      "title": "Topic Title (BM)",
      "title_en": "Topic Title (English)",
      "title_zh": "主题标题",
      "keywords": ["keyword1", "keyword2", "synonym"],
      "short_explanation": "One paragraph summary (BM)",
      "short_explanation_en": "One paragraph summary (EN)",
      "short_explanation_zh": "摘要",
      "detailed_explanation": "Full multi-paragraph explanation (BM)",
      "important_dates": [
        { "year": "1900", "event": "Something happened" }
      ],
      "historical_figures": [
        { "name": "Name", "role": "Their role" }
      ],
      "related_topics": ["other_topic_id"],
      "quiz_questions": [
        {
          "id": "q_yourtopic_1",
          "question": "MCQ question text",
          "question_en": "English version",
          "type": "mcq",
          "options": ["A", "B", "C", "D"],
          "answer": 0,
          "explanation": "Why the answer is correct"
        },
        {
          "id": "q_yourtopic_2",
          "question": "True/false question",
          "type": "truefalse",
          "answer": true,
          "explanation": "Explanation"
        }
      ]
    }
  ]
}
```

Then **restart the server** — no code changes needed.

---

## 📱 Telegram Bot Setup (When Ready)

### Step 1 — Create a bot via @BotFather
1. Open Telegram → search `@BotFather`
2. Send `/newbot`
3. Follow instructions — choose name & username
4. Copy the **bot token** (looks like `123456789:ABCdef...`)

### Step 2 — Configure token
```bash
# In sejarahmate/.env
TELEGRAM_BOT_TOKEN=123456789:ABCdef...
PUBLIC_URL=https://your-app.onrender.com
```

### Step 3 — Deploy to a public HTTPS host

**Option A: Render.com (Free)**
1. Push this repo to GitHub
2. Create a new **Web Service** on render.com
3. Root directory: `sejarahmate`
4. Build command: `npm install`
5. Start command: `npm start`
6. Add environment variables: `TELEGRAM_BOT_TOKEN`, `PUBLIC_URL`

**Option B: Railway.app (Free tier)**
Similar — connect GitHub repo, set env vars.

**Option C: Local testing with ngrok**
```bash
# Install ngrok: https://ngrok.com
ngrok http 3000
# Copy the https URL → PUBLIC_URL
```

### Step 4 — Register the webhook
```bash
# Replace TOKEN and URL with your values
curl -X POST "https://api.telegram.org/botTOKEN/setWebhook" \
  -d "url=https://your-app.onrender.com/telegram/webhook/TOKEN"
```

### Step 5 — Test in Telegram
- Send `/start` to your bot
- Try: `/topics`, `/quiz`, `/help`
- Ask history questions in Bahasa Melayu, English, or 中文

### Supported Telegram Commands
| Command | Action |
|---|---|
| `/start` | Welcome message |
| `/help` | Usage instructions |
| `/topics` | List all History topics |
| `/quiz` | Start a History quiz |
| `/language` | Switch language |

---

## 🔌 API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Server health check |
| `POST` | `/api/chat` | Send a chat message |
| `POST` | `/api/reset` | Reset session state |
| `GET` | `/api/topics` | List all topics |
| `GET` | `/api/quiz` | Get 5 random quiz questions |
| `GET` | `/api/quiz/:topicId` | Get questions for a topic |

### POST /api/chat — Request body
```json
{ "message": "Apa itu nasionalisme?", "sessionId": "user123" }
```

### POST /api/chat — Response
```json
{
  "text": "📖 **Nasionalisme**\n\nNasionalisme ialah...",
  "suggestions": ["Lebih Lanjut", "Kuiz Topik Ini", "Garis Masa", "Topik Lain"]
}
```

---

## 🧪 Testing

### Manual web test
1. `npm start`
2. Open `http://localhost:3000`
3. Test these inputs:
   - `"Kesultanan Melayu Melaka"` → topic explanation
   - `"Apa itu nasionalisme?"` → concept definition
   - `"garis masa kemerdekaan"` → timeline
   - `"kuiz"` → quiz modal opens
   - `"english"` → language switch
   - `"xyz123nonsense"` → fallback message
   - `"lebih lanjut"` (after a topic) → detailed explanation

### API test with curl
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"melaka","sessionId":"test1"}'
```

### Health check
```bash
curl http://localhost:3000/api/health
```

---

## 🛡️ Guardrails & Safety

- **Academic dishonesty**: Detected and redirected politely
- **Out-of-scope**: Honest "not in knowledge base" response
- **Fallback**: Two-stage (rephrase → suggest teacher contact)
- **No LLM**: Purely keyword/intent matching — no hallucinations
- **Tokens**: Always stored in `.env`, never in frontend code

---

## 📝 License
MIT — Free for educational use.
