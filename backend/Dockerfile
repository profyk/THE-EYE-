FROM python:3.12-slim

WORKDIR /app

# pyproject.toml's [tool.setuptools.packages.find] needs the actual app/
# package present to resolve, so source must be copied before pip install --
# can't split into a separate cached dependency-install layer the way a
# requirements.txt setup would.
COPY . .
RUN pip install --no-cache-dir .

ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
