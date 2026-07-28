# Autonomous Enterprise Obligation Agent (AEOA)

AI-powered contract obligation management system — SAP Hackathon Prototype.

## Quick Start

### 1. Configure API Keys
Edit `aeoa/.env`:
```env
GROQ_API_KEY=your_groq_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
```
Get a free Groq API key at: https://console.groq.com

### 2. Backend
```bash
cd aeoa/backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```
Backend runs at: http://localhost:8000  
API Docs: http://localhost:8000/docs

### 3. Frontend
```bash
cd aeoa/frontend
npm install
npm run dev
```
Frontend runs at: http://localhost:5173

---

## System Flow

```
Upload Contract (PDF/DOCX)
       ↓
  LangGraph Agent
       ↓
 extract_contract → score_contract → classify_tier → generate_reports → await_feedback
       ↓
  Green / Amber / Red

GREEN:  Agent decides → 4h countdown → Auditor affirms/revokes → Feedback
AMBER:  AI drafts email + Slack → Auditor edits & sends → Character diff stored
RED:    Agent suggests action → Auditor fills structured form → Similarity scored
```

## Features

- **Phase 1** — PDF/DOCX ingestion, LLM extraction of 13 contract fields, manual correction UI
- **Phase 2** — Weighted scoring engine (5 parameters, 100pt scale), hard override rules
- **Phase 3** — Tier-based actions: Green auto-execution with 4h delay, Amber side-by-side draft editor, Red structured action form
- **Phase 4** — Feedback loops: Green revocation, Amber rejection, Red similarity scoring; Admin dashboard
- **Phase 5** — Immutable audit log, filterable viewer

## Roles

Switch roles in the sidebar:
- **agent_auditor** — reviews contracts, affirm/revoke Green, edit/send Amber, submit Red actions
- **manager** — receives escalations when Amber contracts breach 48h SLA

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python, FastAPI, SQLAlchemy, SQLite |
| LLM Orchestration | LangGraph, Groq (llama3-70b) + Gemini fallback |
| Scheduling | APScheduler (SLA monitoring) |
| Frontend | React, Vite, Tailwind CSS |
| Auth | Mock role-based (query param) |

## Project Structure

```
aeoa/
├── backend/
│   ├── main.py          # FastAPI app + all routes
│   ├── agent.py         # LangGraph state graph
│   ├── models.py        # SQLAlchemy ORM
│   ├── schemas.py       # Pydantic v2 schemas
│   ├── scoring.py       # Composite scoring engine
│   ├── classifier.py    # Tier classification + overrides
│   ├── prompts.py       # All LLM prompt templates
│   ├── feedback.py      # Correction + similarity logic
│   ├── scheduler.py     # APScheduler SLA jobs
│   ├── audit.py         # Append-only audit log
│   └── config.py        # Settings (Pydantic + .env)
├── frontend/
│   └── src/
│       ├── pages/       # Dashboard, ContractDetail, AuditLog, AdminSettings
│       └── components/  # Cards, scoring, editor, forms, tray
├── uploads/             # Uploaded contract files
└── .env                 # API keys
```
