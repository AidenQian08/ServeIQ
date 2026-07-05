# ServeIQ — Tennis Serve AI

Real-time tennis serve advisor using Thompson Sampling (multi-armed bandit).
Tracks serve location, in%, win%, and detects predictability streaks.

---

## Stack

| Layer     | Tech                              |
|-----------|-----------------------------------|
| Backend   | Python · FastAPI · SQLAlchemy     |
| Database  | SQLite (local) → PostgreSQL (prod)|
| Auth      | JWT (30-day tokens) + bcrypt      |
| Frontend  | React 18 · Vite · React Router    |

---

## Quick Start (Local Dev)

### 1. Backend

```bash
cd serveiq/backend

# Create virtual environment
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start the API server
uvicorn main:app --reload
```

API is now running at **http://localhost:8000**
Interactive docs at **http://localhost:8000/docs**

---

### 2. Frontend

```bash
cd serveiq/frontend

npm install
npm run dev
```

App is now running at **http://localhost:5173**

---

## Project Structure

```
serveiq/
├── backend/
│   ├── main.py             # FastAPI app, CORS, router mounting
│   ├── database.py         # SQLAlchemy engine + session factory
│   ├── models.py           # User, MatchSession, Point ORM models
│   ├── schemas.py          # Pydantic request/response types + stats
│   ├── auth_utils.py       # JWT creation/validation, bcrypt
│   ├── requirements.txt
│   └── routers/
│       ├── auth.py         # POST /auth/register, /login  GET /auth/me
│       ├── sessions.py     # CRUD for match sessions
│       └── points.py       # Point logging + Thompson Sampling engine
│
└── frontend/
    ├── index.html
    ├── vite.config.js      # Proxy /api → localhost:8000
    ├── package.json
    └── src/
        ├── main.jsx
        ├── App.jsx          # Routes + auth guards
        ├── index.css        # Design tokens (CSS variables)
        ├── api/
        │   └── client.js    # Axios + JWT interceptor + auto-logout
        ├── context/
        │   └── AuthContext.jsx   # Login/register/logout state
        ├── components/
        │   └── UI.jsx       # Logo, Card, Btn, Input, Modal, Toast, etc.
        └── pages/
            ├── LoginPage.jsx
            ├── RegisterPage.jsx
            ├── DashboardPage.jsx   # Session list + create new session
            └── SessionPage.jsx     # Full point tracker + AI card

```

---

## API Endpoints

### Auth
| Method | Path            | Description       |
|--------|-----------------|-------------------|
| POST   | /auth/register  | Create account    |
| POST   | /auth/login     | Get JWT token     |
| GET    | /auth/me        | Current user info |

### Sessions
| Method | Path               | Description          |
|--------|--------------------|----------------------|
| GET    | /sessions          | List your sessions   |
| POST   | /sessions          | Create a session     |
| GET    | /sessions/{id}     | Get one session      |
| DELETE | /sessions/{id}     | Delete a session     |

### Points
| Method | Path                            | Description                   |
|--------|---------------------------------|-------------------------------|
| POST   | /points                         | Log a point                   |
| GET    | /points/session/{id}            | Get all points in a session   |
| GET    | /points/session/{id}/stats      | Full stats + AI recommendation|
| DELETE | /points/{id}                    | Delete a point (undo)         |

---

## How the AI Works

Each serve location is treated as a "bandit arm". For every location the AI tracks:

- **In%** — how often that serve lands in (`in_made / in_att`)
- **Win%** — how often you win the point when it lands in (`wins / win_att`)
- **Eff%** — `Win% × In%` — the true expected value of choosing that location

**Thompson Sampling** (3000 simulations per recommendation):
- Samples from `Beta(wins+1, losses+1)` for win rate
- Samples from `Beta(in_made+1, missed+1)` for in rate
- Multiplies them for effective value
- Location that wins the most simulations = recommendation

**Streak / predictability penalty:**
- Detects consecutive same-location 1st serves for the current side
- Applies a smooth penalty: `1 - e^(-0.65 × (streak - 1.2))`
- 2 in a row → ~25% penalty · 3 → ~50% · 5+ → ~72%
- AI may still recommend the same location if others are clearly inferior

---

## Deploying to Production

### Backend → Railway
1. Push `backend/` to a GitHub repo
2. Create a new Railway project → deploy from GitHub
3. Add a PostgreSQL plugin
4. Set env vars:
   ```
   DATABASE_URL=postgresql://...  (auto-set by Railway plugin)
   SECRET_KEY=your-random-secret-here
   ```

### Frontend → Vercel
1. Push `frontend/` to GitHub
2. Import to Vercel
3. Set env var:
   ```
   VITE_API_URL=https://your-railway-backend.up.railway.app
   ```
4. Update `vite.config.js` proxy target to match

---

## Future Features

- [ ] Expo / React Native mobile app (shared API)
- [ ] Coach sharing — share session link with a coach
- [ ] Match history charts (win% over time per location)
- [ ] Contextual bandits (score pressure, deuce vs ad deep in set)
- [ ] Opponent scouting — track opponent return patterns
