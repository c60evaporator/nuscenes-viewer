FROM python:3.12-slim AS base

WORKDIR /app
RUN pip install uv

COPY requirements.txt .

# ── Development stage ──────────────────────────────
FROM base AS development

RUN uv pip install --system --no-cache -r requirements.txt

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# ── Production stage ───────────────────────────────
FROM base AS production

RUN uv pip install --system --no-cache -r requirements.txt

RUN adduser --disabled-password --no-create-home appuser
COPY --chown=appuser:appuser . .
USER appuser

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
