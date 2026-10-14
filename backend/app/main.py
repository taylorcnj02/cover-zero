"""FastAPI application entry point."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.games import router as games_router
from app.routes.predictions import router as predictions_router

app = FastAPI(title="NFL Player Outlook API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(games_router)
app.include_router(predictions_router)


# A route connects an HTTP method and URL path to a Python function.
@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
