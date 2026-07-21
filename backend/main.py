from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
import models  # noqa: F401 – ensures models are registered before create_all
import os

from routers import auth, matches, points

Base.metadata.create_all(bind=engine)

app = FastAPI(title="ServeIQ API", version="1.0.0")

# Explicit allow-list — the actual production frontend, plus local dev.
# Add any other trusted origins via the ALLOWED_ORIGINS env var (comma-separated).
_default_origins = [
    "https://serve-iq-delta.vercel.app",
    "http://localhost:5173",
]
_extra_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
allow_origins = _default_origins + _extra_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    # Preview deployments (e.g. serve-iq-git-branch-aiden-qian.vercel.app) are scoped
    # to this specific Vercel account/team slug — NOT every *.vercel.app site.
    allow_origin_regex=r"https://.*-aiden-qian\.vercel\.app",
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth.router,    prefix="/auth",    tags=["auth"])
app.include_router(matches.router, prefix="/matches", tags=["matches"])
app.include_router(points.router,  prefix="/points",  tags=["points"])


@app.get("/health")
def health():
    return {"status": "ok"}
