from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
import models  # noqa: F401 – ensures models are registered before create_all

from routers import auth, matches, points

Base.metadata.create_all(bind=engine)

app = FastAPI(title="ServeIQ API", version="1.0.0")

from fastapi.middleware.cors import CORSMiddleware
import re

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,    prefix="/auth",    tags=["auth"])
app.include_router(matches.router, prefix="/matches", tags=["matches"])
app.include_router(points.router,  prefix="/points",  tags=["points"])


@app.get("/health")
def health():
    return {"status": "ok"}
