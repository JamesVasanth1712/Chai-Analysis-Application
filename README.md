# Chai Analysis Application

Chai Analysis Application is a professional, AI-powered data-analysis and isolated dashboard platform. Users can upload CSV or Excel files, ask analytical questions using natural language, execute read-only SQL queries, and construct interactive dashboards inside independent workspace scopes.

## Architecture & Structure

```text
Chai_Analysis/
├── backend/       # FastAPI server, SQLAlchemy ORM models, analysis agents
├── frontend/      # Next.js client, Tailwind CSS, Lucide icons, Zustan state stores
├── scripts/       # Database seeding and initialization SQL script
└── docker-compose.yml # Complete system orchestration container configuration
```

## Features

- **Interactive Dashboard Workspace**: Drag-and-drop, resize, and configure analytics widgets.
- **AI Chat Agent**: Natural language data queries powered by local calculations and LLM reasoning.
- **Data Explorer**: Safe read-only SQL editor and charting.
- **Dataset Ingestion**: Upload, inspect, and preview CSV, XLS, and XLSX datasets.
- **Multi-Tenant Scoping**: Isolated dashboards and data context boundaries.

---

## Getting Started

### 1. Environment Setup

Copy `.env.example` to `.env` in the root folder of the project:

```powershell
cp .env.example .env
```

Ensure the database connection details are correct. The default password is `Vasanth13`:
```env
APP_NAME=Chai Analysis Application
APP_VERSION=1.0.0
DEBUG=false
SECRET_KEY=Vasanth13
POSTGRES_PASSWORD=Vasanth13
REDIS_PASSWORD=Vasanth13
DATABASE_URL=postgresql+asyncpg://mass_analysis:Vasanth13@localhost:5433/mass_analysis
REDIS_URL=redis://:Vasanth13@localhost:6379/0
OPENROUTER_API_KEY=your_key_here
```

---

### 2. Run with Docker (Recommended)

To spin up the entire application stack including PostgreSQL, Redis, Backend API, and Next.js Frontend:

```powershell
docker compose up --build
```

#### Services & URLs
- **Frontend App**: [http://localhost:4000](http://localhost:4000)
- **Backend API**: [http://localhost:8000](http://localhost:8000)
- **FastAPI API Documentation**: [http://localhost:8000/api/docs](http://localhost:8000/api/docs)
- **PostgreSQL Database Port**: `5433` (maps to internal container `5432`)
- **Redis Cache Port**: `6379`

---

### 3. Local Development (Manual Setup)

#### A. Backend Setup
1. Navigate to the backend directory:
   ```powershell
   cd backend
   ```
2. Create and activate a Python virtual environment:
   ```powershell
   python -m venv venv
   # On Windows:
   .\venv\Scripts\Activate.ps1
   # On macOS/Linux:
   source venv/bin/activate
   ```
3. Install the dependencies:
   ```powershell
   pip install -r requirements.txt
   ```
4. Start the live-reloading backend API server:
   ```powershell
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

#### B. Frontend Setup
1. Navigate to the frontend directory:
   ```powershell
   cd ../frontend
   ```
2. Install Node dependencies:
   ```powershell
   npm install
   ```
3. Start the Next.js dev server:
   ```powershell
   npm run dev
   ```
   Open [http://localhost:4000](http://localhost:4000) in your browser.
