"""Búsqueda de servidores Spoolman en localhost y en la red local.

Mismo patrón que el descubrimiento de placas láser ESP3D en NOPAL core
(backend/services/laser_service.py: detectar la subred /24 propia y sondear
en paralelo con ThreadPoolExecutor) pero validando cada candidato con
SpoolmanClient.get_info() en vez de un comando ESP3D -- así la pantalla de
onboarding del plugin puede ofrecer instancias reales para elegir en vez de
forzar tipear host/puerto a mano desde el primer momento.
"""

import asyncio
import logging
import socket
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict, List, Optional

from .spoolman_client import SpoolmanClient

logger = logging.getLogger(__name__)

DEFAULT_PORT = 7912


def _local_ip_and_subnet() -> tuple:
    """IP propia del servidor y su prefijo /24 (ej. ('192.168.0.86', '192.168.0'))."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            local_ip = sock.getsockname()[0]
        return local_ip, ".".join(local_ip.split(".")[:3])
    except Exception:
        return None, "192.168.0"


def _probe(host: str, port: int, timeout: float) -> Optional[Dict[str, Any]]:
    info = SpoolmanClient(host, port, timeout=timeout).get_info()
    if info is None:
        return None
    return {"host": host, "port": port, "info": info}


def _discover_sync(timeout: float = 0.3, max_workers: int = 60) -> List[Dict[str, Any]]:
    found: List[Dict[str, Any]] = []

    # localhost primero -- caso más común (Spoolman corriendo en el mismo
    # servidor que NOPAL). Timeout algo mayor porque acá no compite con las
    # otras ~250 IPs del barrido de red.
    loopback = _probe("127.0.0.1", DEFAULT_PORT, timeout=1.0)
    if loopback:
        found.append(loopback)

    local_ip, subnet = _local_ip_and_subnet()
    candidates = [f"{subnet}.{i}" for i in range(1, 255) if f"{subnet}.{i}" != local_ip]
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        for result in executor.map(lambda ip: _probe(ip, DEFAULT_PORT, timeout), candidates):
            if result:
                found.append(result)
    return found


async def discover() -> List[Dict[str, Any]]:
    """Escanea localhost + la red local (en un hilo aparte) buscando servidores Spoolman."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _discover_sync)
