# ============================================================
# RELY POS - Dockerfile de Producción
# Pozolería, Tacos y Enchiladas
# ============================================================

FROM python:3.12-slim AS base

# Metadata
LABEL maintainer="Corntech"
LABEL description="RELY POS - Sistema de Punto de Venta para Restaurantes"

# Environment
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

WORKDIR /app

# Install dependencies first (layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files (only what's needed)
COPY server.py .
COPY migrate_to_sqlite.py .
COPY index.html .
COPY app.js .
COPY style.css .
COPY manifest.json .

# Create data directory for persistent DB
RUN mkdir -p /app/data

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/')" || exit 1

# Run with uvicorn (production settings)
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--log-level", "info"]
