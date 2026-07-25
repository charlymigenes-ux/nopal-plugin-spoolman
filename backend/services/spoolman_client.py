"""Cliente HTTP hacia un servidor Spoolman externo.

Mismo criterio que MoonrakerClient (backend/services/klipper_service.py de
NOPAL core): timeout corto, nunca lanza hacia quien llama, loggea y
devuelve un default seguro del tipo correcto. Spoolman no tiene
autenticación por defecto -- mismo modelo de confianza-en-LAN que ya usa
NOPAL con Moonraker y las placas GRBL.
"""

import logging
from typing import Any, Dict, List, Optional
from urllib.parse import quote

import requests

logger = logging.getLogger(__name__)


class SpoolmanClient:
    def __init__(self, host: str, port: int, timeout: float = 4.0):
        self.host = host
        self.port = port
        self.base_url = f"http://{host}:{port}/api/v1"
        self.timeout = timeout

    def _get(self, endpoint: str, params: Optional[Dict[str, Any]] = None) -> Any:
        try:
            response = requests.get(f"{self.base_url}{endpoint}", params=params, timeout=self.timeout)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.ConnectionError:
            return None
        except Exception as e:
            logger.warning(f"[spoolman {self.host}:{self.port}] {e}")
            return None

    def get_info(self) -> Optional[Dict[str, Any]]:
        """GET /info -- versión del servidor. Sirve como chequeo de conexión."""
        return self._get("/info")

    def list_spools(self, allow_archived: bool = False) -> List[Dict[str, Any]]:
        """GET /spool -- todos los spools que matchean el filtro."""
        result = self._get("/spool", params={"allow_archived": str(allow_archived).lower()})
        return result if isinstance(result, list) else []

    def get_spool(self, spool_id: int) -> Optional[Dict[str, Any]]:
        """GET /spool/{id}. None si no existe o el servidor no responde."""
        result = self._get(f"/spool/{quote(str(spool_id))}")
        return result if isinstance(result, dict) else None
