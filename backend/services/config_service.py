"""Configuración de conexión al servidor Spoolman (host/puerto) y umbral de
bajo inventario -- persistida en spoolman_config.json en la raíz de NOPAL,
mismo criterio que camera_registry.json/laser_registry.json (gitignored,
estado de instalación, no código)."""

import json
import logging
from typing import Any, Dict, Optional

from .spoolman_client import SpoolmanClient

logger = logging.getLogger(__name__)

CONFIG_PATH = "spoolman_config.json"
DEFAULT_LOW_STOCK_THRESHOLD_G = 250


def get_config() -> Optional[Dict[str, Any]]:
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, json.JSONDecodeError):
        return None


def save_config(host: str, port: int, low_stock_threshold_g: Optional[float] = None) -> Dict[str, Any]:
    existing = get_config() or {}
    config = {
        "host": host,
        "port": port,
        "low_stock_threshold_g": low_stock_threshold_g
        if low_stock_threshold_g is not None
        else existing.get("low_stock_threshold_g", DEFAULT_LOW_STOCK_THRESHOLD_G),
    }
    with open(CONFIG_PATH, "w", encoding="utf-8") as handle:
        json.dump(config, handle, indent=2)
    return config


def clear_config() -> None:
    import os

    try:
        os.remove(CONFIG_PATH)
    except OSError:
        pass


def get_low_stock_threshold_g() -> float:
    config = get_config()
    if not config:
        return DEFAULT_LOW_STOCK_THRESHOLD_G
    return config.get("low_stock_threshold_g", DEFAULT_LOW_STOCK_THRESHOLD_G)


def get_client() -> Optional[SpoolmanClient]:
    """None si todavía no se configuró host/puerto -- el llamador decide
    cómo comunicar "no configurado" (distinto de "configurado pero
    inalcanzable", que sí intenta la conexión y falla)."""
    config = get_config()
    if not config:
        return None
    return SpoolmanClient(config["host"], config["port"])
