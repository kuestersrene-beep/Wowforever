FROM python:3.12-slim
WORKDIR /bot
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# Alle Module, damit ein neues nicht wieder vergessen wird (.env und data schließt .dockerignore aus)
COPY *.py ./
ENV PYTHONUNBUFFERED=1 DATEN_ORDNER=/bot/data
CMD ["python", "bot.py"]
