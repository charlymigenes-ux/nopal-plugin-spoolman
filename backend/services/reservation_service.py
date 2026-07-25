"""Reservas de material para producción -- concepto que Spoolman no
representa (solo sabe de inventario físico, no de "estos gramos ya están
comprometidos para el pedido X"). NOPAL es dueño de este estado; Spoolman
sigue siendo dueño de `remaining_weight` real de cada spool.

Una reserva referencia una cotización de Cotizador por `quote_id` -- sin
acoplar los backends: quien arma el payload (ver router.py) ya trae
`quote_label` resuelto desde `GET /api/pricing/quotes` de Cotizador, así
este servicio no necesita importar nada de ese plugin.
"""

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

REGISTRY_PATH = "spoolman_reservations.json"


def _load() -> List[Dict[str, Any]]:
    try:
        with open(REGISTRY_PATH, "r", encoding="utf-8") as handle:
            data = json.load(handle)
            return data if isinstance(data, list) else []
    except (OSError, json.JSONDecodeError):
        return []


def _save(entries: List[Dict[str, Any]]) -> None:
    with open(REGISTRY_PATH, "w", encoding="utf-8") as handle:
        json.dump(entries, handle, indent=2)


def list_reservations(spool_id: Optional[int] = None) -> List[Dict[str, Any]]:
    entries = _load()
    if spool_id is not None:
        entries = [e for e in entries if e["spool_id"] == spool_id]
    return entries


def reserved_grams_for_spool(spool_id: int) -> float:
    return sum(entry["grams"] for entry in list_reservations(spool_id))


def create_reservation(
    quote_id: str,
    quote_label: str,
    spool_id: int,
    grams: float,
    available_grams: float,
    note: str = "",
    scheduled_for: Optional[str] = None,
) -> Dict[str, Any]:
    """`available_grams` la calcula el llamador (router.py) contra el spool
    real de Spoolman menos lo ya reservado -- este servicio no habla con
    Spoolman directamente, solo valida el número que le dan."""
    if grams <= 0:
        raise ValueError("Los gramos a reservar deben ser mayores a 0")
    if grams > available_grams:
        raise ValueError(
            f"No hay suficiente material disponible: se pidieron {grams}g, hay {available_grams}g disponibles"
        )
    entry = {
        "id": uuid.uuid4().hex[:12],
        "quote_id": quote_id,
        "quote_label": quote_label,
        "spool_id": spool_id,
        "grams": grams,
        "note": note,
        "scheduled_for": scheduled_for,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    entries = _load()
    entries.append(entry)
    _save(entries)
    return entry


def delete_reservation(reservation_id: str) -> bool:
    entries = _load()
    filtered = [e for e in entries if e["id"] != reservation_id]
    if len(filtered) == len(entries):
        return False
    _save(filtered)
    return True
