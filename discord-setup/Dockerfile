FROM python:3.12-slim
WORKDIR /bot
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY bot.py .
ENV PYTHONUNBUFFERED=1 DATEN_ORDNER=/bot/data
CMD ["python", "bot.py"]
