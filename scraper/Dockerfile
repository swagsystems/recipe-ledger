FROM python:3.12-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends cron ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY recipe_tracker ./recipe_tracker
COPY entrypoint.sh /usr/local/bin/recipe-tracker-scraper
RUN chmod +x /usr/local/bin/recipe-tracker-scraper

ENV PYTHONUNBUFFERED=1
ENTRYPOINT ["recipe-tracker-scraper"]
