# Chai Analysis Application

Chai Analysis Application is a professional, AI-powered data analysis and isolated dashboard platform. Users can upload CSV or Excel files, ask analytical questions using natural language, execute read-only SQL queries, and construct interactive dashboards inside independent workspace scopes.

## Architecture & Structure

```text
Chai_Analysis/
├── backend/             # FastAPI server, SQLAlchemy ORM models, analysis agents
├── frontend/            # Next.js client, Tailwind CSS, Lucide icons, Zustand stores
├── scripts/             # Database seeding and initialization SQL script
└── docker-compose.yml   # Complete system orchestration container configuration
```

## Features

- **Interactive Dashboard Workspace**: Drag-and-drop, resize, and configure analytics widgets.
- **AI Chat Agent**: Natural language data queries powered by local calculations and LLM reasoning.
- **Data Explorer**: Safe read-only SQL editor and charting.
- **Dataset Ingestion**: Upload, inspect, and preview CSV, XLS, and XLSX datasets.
- **Multi-Tenant Scoping**: Isolated dashboards and data context boundaries.

## Getting Started

### 1. Environment Setup

Copy `.env.example` to `.env` in the root folder of the project:

```powershell
cp .env.example .env
```

Update the database credentials and API keys in `.env` for your environment.

### 2. Run With Docker

To spin up the full stack including PostgreSQL, Redis, Backend API, and Next.js Frontend:

```powershell
docker compose up --build
```

Services:

- Frontend App: http://localhost:4000
- Backend API: http://localhost:8000
- FastAPI API Documentation: http://localhost:8000/api/docs
- PostgreSQL Database Port: `5433`
- Redis Cache Port: `6379`

### 3. Local Development

Backend:

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:4000 in your browser.
