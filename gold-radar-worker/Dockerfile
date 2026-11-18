FROM python:3.12-slim
WORKDIR /worker
# nur Standardbibliothek: worker.py + das Analyse-Werkzeug aus WowForever-Gold (tool/, per tools/export_worker.py)
COPY worker.py blizzard.py blizzard_probe.py news.py ./
COPY tool ./tool
ENV PYTHONUNBUFFERED=1 DATA_DIR=/data
CMD ["python", "worker.py"]
