"""Consumo mensual real de filamento -- construido a partir de deltas
observados, no inventado.

Spoolman no expone historial de uso por fecha en su API REST básica (eso
requiere integración con Prometheus, que NOPAL no instala). Lo único que
da es `used_weight`: un acumulado de por vida por spool. Para tener un
"consumo de este mes" honesto, este servicio compara ese acumulado contra
el último valor que vio (spoolman_usage_log.json) cada vez que se le
pregunta, y si subió, registra la diferencia con la fecha de HOY antes de
responder -- es una reconciliación perezosa (se dispara con cada consulta,
no con un loop de fondo nuevo), sin plumbing adicional de tareas
programadas. El primer día que se instala el plugin el consumo del mes
arranca en 0: no hay historia previa que inventar, y eso es correcto, no
un bug.
"""

import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List

logger = logging.getLogger(__name__)

LOG_PATH = "spoolman_usage_log.json"


def _load() -> Dict[str, Any]:
    try:
        with open(LOG_PATH, "r", encoding="utf-8") as handle:
            data = json.load(handle)
            return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _save(data: Dict[str, Any]) -> None:
    with open(LOG_PATH, "w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2)


def reconcile(spools: List[Dict[str, Any]]) -> None:
    """Compara used_weight actual de cada spool contra el último visto y
    loggea la diferencia positiva del día de hoy. Se llama antes de leer
    cualquier resumen de consumo (ver router.py)."""
    log = _load()
    today = datetime.now(timezone.utc).date().isoformat()
    changed = False

    for spool in spools:
        spool_id = str(spool["id"])
        used_weight = spool.get("used_weight", 0) or 0
        material = (spool.get("filament") or {}).get("material") or "Sin material"

        entry = log.get(spool_id)
        if entry is None:
            # Primera vez que se ve este spool: se guarda como línea base,
            # sin generar una entrada de consumo (no sabemos cuánto de ese
            # used_weight ya existía antes de instalar el plugin).
            log[spool_id] = {"last_used_weight": used_weight, "material": material, "entries": []}
            changed = True
            continue

        entry["material"] = material
        delta = used_weight - entry.get("last_used_weight", 0)
        if delta > 0:
            entries = entry.setdefault("entries", [])
            if entries and entries[-1]["date"] == today:
                entries[-1]["delta_g"] += delta
            else:
                entries.append({"date": today, "delta_g": delta})
            entry["last_used_weight"] = used_weight
            changed = True

    if changed:
        _save(log)


def monthly_summary() -> Dict[str, float]:
    """{"PLA": 2800.0, "PETG": 2100.0, ...} en gramos, del mes calendario
    actual -- llamar reconcile(spools) antes de esto con los spools recién
    leídos de Spoolman."""
    log = _load()
    now = datetime.now(timezone.utc)
    month_prefix = f"{now.year:04d}-{now.month:02d}"

    totals: Dict[str, float] = {}
    for entry in log.values():
        material = entry.get("material") or "Sin material"
        month_total = sum(
            item["delta_g"] for item in entry.get("entries", []) if item["date"].startswith(month_prefix)
        )
        if month_total:
            totals[material] = totals.get(material, 0) + month_total
    return totals
