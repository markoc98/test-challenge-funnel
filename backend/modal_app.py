import os
from pathlib import Path

import modal
from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent
REQUIREMENTS_PATH = BASE_DIR / "requirements.txt"
load_dotenv(BASE_DIR / ".env")

def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


APP_NAME = os.getenv("MODAL_APP_NAME", "ai-image-service-backend")
API_LABEL = os.getenv("MODAL_API_LABEL", "ai-image-service-api")
SECRET_NAME = require_env("MODAL_SECRET_NAME")

image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install_from_requirements(str(REQUIREMENTS_PATH))
    .add_local_python_source("app")
)

app = modal.App(APP_NAME)


@app.function(
    image=image,
    secrets=[modal.Secret.from_name(SECRET_NAME)],
    cpu=1.0,
    memory=2048,
    timeout=300,
    container_idle_timeout=120,
)
@modal.asgi_app(label=API_LABEL)
def fastapi_app():
    from app.main import app as api

    return api
