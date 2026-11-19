FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir google-api-python-client==2.151.0 google-auth==2.36.0
WORKDIR /app
COPY main.py .
CMD ["python", "main.py"]
