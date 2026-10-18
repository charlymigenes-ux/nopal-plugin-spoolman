"""Cliente HTTP hacia un servidor Spoolman externo.

Mismo criterio que MoonrakerClient (backend/services/klipper_service.py de
NOPAL core): timeout corto, nunca lanza hacia quien llama, loggea y
devuelve un default seguro del tipo correcto. Spoolman no tiene
autenticación por defecto -- mismo modelo de confianza-en-LAN que ya usa
NOPAL con Moonraker y las placas GRBL.
"""

import json
import logging
from typing import Any, Dict, List, Optional
from urllib.parse import quote

import requests

logger = logging.getLogger(__name__)


class SpoolmanWriteError(Exception):
    """Spoolman rechazó o no pudo atender una escritura.

    A diferencia de las lecturas (que devuelven un valor vacío), una
    escritura fallida NO puede pasar en silencio: quien llama tiene que
    saber que el inventario no cambió. `status` es el código HTTP de
    Spoolman, o None si no hubo respuesta.
    """

    def __init__(self, message: str, status: Optional[int] = None):
        super().__init__(message)
        self.status = status


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

    # ── Datos extra (solo lectura) ──

    def list_locations(self) -> List[str]:
        """GET /location -- ubicaciones en uso (lista de nombres)."""
        result = self._get("/location")
        if not isinstance(result, list):
            return []
        names = [(item.get("name") if isinstance(item, dict) else item) for item in result]
        return [name for name in names if isinstance(name, str) and name]

    def get_currency(self) -> Optional[str]:
        """GET /setting/currency -- Spoolman guarda el valor como texto JSON
        (comillas incluidas). None si no está definida o no responde."""
        result = self._get("/setting/currency")
        if not isinstance(result, dict) or not result.get("is_set"):
            return None
        value = result.get("value")
        try:
            value = json.loads(value) if isinstance(value, str) else value
        except ValueError:
            pass
        return value if isinstance(value, str) and value else None

    def list_filaments(self) -> List[Dict[str, Any]]:
        """GET /filament -- catálogo de filamentos (para crear un spool)."""
        result = self._get("/filament")
        return result if isinstance(result, list) else []

    # ── Escrituras: lanzan SpoolmanWriteError si no se aplicaron ──

    def _send(self, method: str, endpoint: str, body: Optional[Dict[str, Any]] = None) -> Any:
        try:
            response = requests.request(method, f"{self.base_url}{endpoint}", json=body, timeout=self.timeout)
        except requests.exceptions.RequestException as e:
            logger.warning(f"[spoolman {self.host}:{self.port}] {method} {endpoint}: {e}")
            raise SpoolmanWriteError("No se pudo conectar con Spoolman") from e
        if not response.ok:
            detail = None
            try:
                payload = response.json()
                detail = payload.get("message") or payload.get("detail") if isinstance(payload, dict) else None
            except ValueError:
                pass
            raise SpoolmanWriteError(
                detail if isinstance(detail, str) else f"Spoolman respondió {response.status_code}", response.status_code,
            )
        try:
            return response.json()
        except ValueError:
            return None

    def measure_spool(self, spool_id: int, weight: float) -> Dict[str, Any]:
        """PUT /spool/{id}/measure -- peso bruto medido en la báscula;
        Spoolman calcula el restante."""
        return self._send("PUT", f"/spool/{quote(str(spool_id))}/measure", {"weight": weight})

    def use_spool(self, spool_id: int, use_weight: float) -> Dict[str, Any]:
        """PUT /spool/{id}/use -- descuenta gramos usados."""
        return self._send("PUT", f"/spool/{quote(str(spool_id))}/use", {"use_weight": use_weight})

    def update_spool(self, spool_id: int, fields: Dict[str, Any]) -> Dict[str, Any]:
        """PATCH /spool/{id} -- solo los campos indicados."""
        return self._send("PATCH", f"/spool/{quote(str(spool_id))}", fields)

    def create_spool(self, fields: Dict[str, Any]) -> Dict[str, Any]:
        """POST /spool."""
        return self._send("POST", "/spool", fields)

    def backup(self) -> Optional[Dict[str, Any]]:
        """POST /backup -- Spoolman guarda una copia de su base de datos."""
        return self._send("POST", "/backup")
