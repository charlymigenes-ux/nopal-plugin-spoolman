"""Qué spool de Spoolman está cargado en cada impresora Klipper de NOPAL.

Solo impresoras Klipper por ahora (identificadas por su `port`, igual que
backend/services/klipper_service.py de NOPAL core) -- Marlin/láser/otras
marcas quedan para una vuelta futura, mismo patrón (cambiar la clave de
"port" a un identificador compuesto por marca). Registro propio
(spoolman_printer_links.json) en vez de tocar los registros de cada marca:
Spoolman/NOPAL no duplican inventario entre sí, solo se referencian por ID.
"""

import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

REGISTRY_PATH = "spoolman_printer_links.json"


def _load() -> Dict[str, Dict[str, Any]]:
    try:
        with open(REGISTRY_PATH, "r", encoding="utf-8") as handle:
            data = json.load(handle)
            return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _save(links: Dict[str, Dict[str, Any]]) -> None:
    with open(REGISTRY_PATH, "w", encoding="utf-8") as handle:
        json.dump(links, handle, indent=2)


def get_link(port: int) -> Optional[Dict[str, Any]]:
    return _load().get(str(port))


def get_all_links() -> Dict[str, Dict[str, Any]]:
    return _load()


def set_link(port: int, spool_id: int) -> Dict[str, Any]:
    links = _load()
    entry = {"spool_id": spool_id, "assigned_at": datetime.now(timezone.utc).isoformat()}
    links[str(port)] = entry
    _save(links)
    return entry


def clear_link(port: int) -> bool:
    links = _load()
    if str(port) not in links:
        return False
    del links[str(port)]
    _save(links)
    return True
