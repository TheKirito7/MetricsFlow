import json
import logging
import time
import uuid

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api import analytics, auth, customers, subscriptions, transactions
from app.core.config import get_settings
from app.core.database import get_db

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("metricsflow")
app = FastAPI(
    title="MetricsFlow API",
    version="1.0.0",
    description="Tenant-scoped subscription operations and analytics. All monetary records use EUR integer cents.",
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    started = time.monotonic()
    request_id = str(uuid.uuid4())
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        allowed = {origin.strip() for origin in get_settings().allowed_origins.split(",")}
        if request.headers.get("origin") not in allowed:
            return JSONResponse(status_code=403, content={"detail": "Untrusted request origin"})
    response = await call_next(request)
    response.headers.update(
        {
            "X-Request-ID": request_id,
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "Referrer-Policy": "strict-origin-when-cross-origin",
            "Cache-Control": "no-store",
        }
    )
    logger.info(
        json.dumps(
            {
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "duration_ms": round((time.monotonic() - started) * 1000),
            }
        )
    )
    return response


@app.exception_handler(IntegrityError)
async def integrity_error(_request: Request, _exc: IntegrityError):
    return JSONResponse(
        status_code=409,
        content={
            "detail": "This record conflicts with existing data or violates a data constraint. Check its unique fields and linked records."
        },
    )


@app.exception_handler(RequestValidationError)
async def validation_error(_request: Request, exc: RequestValidationError):
    # Do not echo submitted passwords or other sensitive request bodies.
    errors = [{"field": ".".join(str(p) for p in e["loc"]), "message": e["msg"]} for e in exc.errors()]
    return JSONResponse(
        status_code=422, content={"detail": "Please check the submitted fields", "errors": errors}
    )


@app.exception_handler(Exception)
async def unexpected_error(_request: Request, exc: Exception):
    logger.error(json.dumps({"event": "unhandled_error", "type": type(exc).__name__}))
    return JSONResponse(
        status_code=500, content={"detail": "An unexpected error occurred. Please try again."}
    )


@app.get("/api/v1/health", tags=["Health"])
def health(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ok"}


for router in (auth.router, customers.router, subscriptions.router, transactions.router, analytics.router):
    app.include_router(router, prefix="/api/v1")
