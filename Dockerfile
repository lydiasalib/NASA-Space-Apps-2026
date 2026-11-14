FROM python:3.12-slim

# System libraries required by rasterio / pyproj / GDAL wheels and curl for healthchecks
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    libexpat1 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first for Docker layer caching
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r /app/requirements.txt

# Copy curated site list and backend source
COPY sites.example.json /app/sites.example.json
COPY backend/ /app/backend/

# Ensure /app/data is writable by Hugging Face Spaces non-root user (uid=1000)
RUN mkdir -p /app/data/kernels /app/data/lola /app/data/out/sites /app/data/out/static && \
    chmod -R 777 /app/data

ENV PYTHONUNBUFFERED=1
EXPOSE 7860

CMD ["sh", "-c", "python backend/bootstrap_data.py && uvicorn app:app --app-dir backend --host 0.0.0.0 --port 7860"]
