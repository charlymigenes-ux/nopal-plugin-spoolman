"""Endpoints del plugin Materiales (NOPAL × Spoolman), bajo /api/spoolman.

Lectura: cualquier usuario logueado (require_auth). Escritura (configurar
el servidor, asignar spool a una impresora, crear/borrar reservas):
solo admin (require_role("admin")) -- mismo criterio que camera-viewer al
registrar cámaras.
"""

import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Form, HTTPException

from backend.auth_deps import require_auth, require_role

from .services import config_service, consumption_service, discovery_service, reservation_service, spool_link_service
from .services.spoolman_client import SpoolmanClient

logger = logging.getLogger(__name__)
router = APIRouter()


def _require_client() -> SpoolmanClient:
    client = config_service.get_client()
    if client is None:
        raise HTTPException(status_code=400, detail="Spoolman no está configurado todavía")
    return client


def _spool_label(spool: Dict[str, Any]) -> str:
    filament = spool.get("filament") or {}
    label = " ".join(part for part in [filament.get("material"), filament.get("name")] if part)
    return f"{label or 'Spool'} (#{spool.get('id')})"


def _with_reservation_fields(spool: Dict[str, Any]) -> Dict[str, Any]:
    reserved = reservation_service.reserved_grams_for_spool(spool["id"])
    remaining = spool.get("remaining_weight") or 0
    spool["reserved_weight"] = reserved
    spool["available_weight"] = max(remaining - reserved, 0)
    return spool


# ── Configuración de conexión ──

@router.get("/api/spoolman/config")
async def get_config_endpoint(user: dict = Depends(require_auth)):
    config = config_service.get_config()
    if not config:
        return {"configured": False, "connected": False, "host": None, "port": None, "info": None}
    client = SpoolmanClient(config["host"], config["port"])
    info = client.get_info()
    return {
        "configured": True,
        "connected": info is not None,
        "host": config["host"],
        "port": config["port"],
        "low_stock_threshold_g": config.get("low_stock_threshold_g", config_service.DEFAULT_LOW_STOCK_THRESHOLD_G),
        "info": info,
    }


@router.post("/api/spoolman/config")
async def save_config_endpoint(
    host: str = Form(...),
    port: int = Form(...),
    low_stock_threshold_g: Optional[float] = Form(None),
    user: dict = Depends(require_role("admin")),
):
    client = SpoolmanClient(host, port)
    info = client.get_info()
    if info is None:
        raise HTTPException(status_code=400, detail="No se pudo conectar con Spoolman en esa dirección")
    config = config_service.save_config(host, port, low_stock_threshold_g)
    return {"configured": True, "connected": True, "info": info, **config}


@router.delete("/api/spoolman/config")
async def delete_config_endpoint(user: dict = Depends(require_role("admin"))):
    config_service.clear_config()
    return {"success": True}


@router.get("/api/spoolman/discover")
async def discover_config_endpoint(user: dict = Depends(require_auth)):
    """Sondea localhost y la red local en busca de servidores Spoolman
    reales, para ofrecerlos como opción antes de forzar tipear host/puerto."""
    instances = await discovery_service.discover()
    return {"instances": instances}


# ── Spools (Spoolman es la fuente; acá solo se le suma reserved/available) ──

@router.get("/api/spoolman/spools")
async def list_spools_endpoint(allow_archived: bool = False, user: dict = Depends(require_auth)):
    client = _require_client()
    spools = client.list_spools(allow_archived=allow_archived)
    return {"spools": [_with_reservation_fields(spool) for spool in spools]}


@router.get("/api/spoolman/spools/{spool_id}")
async def get_spool_endpoint(spool_id: int, user: dict = Depends(require_auth)):
    client = _require_client()
    spool = client.get_spool(spool_id)
    if spool is None:
        raise HTTPException(status_code=404, detail="Spool no encontrado")
    return _with_reservation_fields(spool)


# ── Resumen y alertas (calculados en vivo, nada inventado) ──

@router.get("/api/spoolman/summary")
async def summary_endpoint(user: dict = Depends(require_auth)):
    client = _require_client()
    spools = client.list_spools(allow_archived=False)
    threshold = config_service.get_low_stock_threshold_g()
    consumption_service.reconcile(spools)

    total_remaining_g = sum(s.get("remaining_weight") or 0 for s in spools)
    total_reserved_g = sum(reservation_service.reserved_grams_for_spool(s["id"]) for s in spools)
    low_stock_count = sum(1 for s in spools if (s.get("remaining_weight") or 0) < threshold)
    month_total_g = sum(consumption_service.monthly_summary().values())

    return {
        "active_spools": len(spools),
        "available_kg": round(max(total_remaining_g - total_reserved_g, 0) / 1000, 2),
        "low_stock_count": low_stock_count,
        "reserved_kg": round(total_reserved_g / 1000, 2),
        "consumption_month_kg": round(month_total_g / 1000, 2),
    }


@router.get("/api/spoolman/alerts")
async def alerts_endpoint(user: dict = Depends(require_auth)):
    client = _require_client()
    spools = client.list_spools(allow_archived=False)
    threshold = config_service.get_low_stock_threshold_g()
    alerts = []

    for spool in spools:
        remaining = spool.get("remaining_weight") or 0
        if remaining < threshold:
            alerts.append({
                "severity": "warning",
                "message": f"{_spool_label(spool)} por debajo de {int(threshold)} g ({int(remaining)} g restantes)",
            })

    # Déficit por material: reservas activas vs. lo que realmente hay en
    # spools de ese material -- la "predicción" que le importaba al
    # usuario, calculada con datos que ya trackeamos, no adivinada.
    spools_by_id = {spool["id"]: spool for spool in spools}
    available_by_material: Dict[str, float] = {}
    for spool in spools:
        material = (spool.get("filament") or {}).get("material") or "Sin material"
        available_by_material[material] = available_by_material.get(material, 0) + (spool.get("remaining_weight") or 0)

    reserved_by_material: Dict[str, float] = {}
    for reservation in reservation_service.list_reservations():
        spool = spools_by_id.get(reservation["spool_id"])
        material = ((spool or {}).get("filament") or {}).get("material") or "Sin material"
        reserved_by_material[material] = reserved_by_material.get(material, 0) + reservation["grams"]

    for material, reserved_g in reserved_by_material.items():
        available_g = available_by_material.get(material, 0)
        if reserved_g > available_g:
            alerts.append({
                "severity": "error",
                "message": (
                    f"Déficit de {material}: se reservaron {round(reserved_g / 1000, 2)} kg "
                    f"pero solo hay {round(available_g / 1000, 2)} kg disponibles"
                ),
            })

    return {"alerts": alerts}


# ── Spool activo por impresora (Klipper únicamente por ahora) ──

@router.get("/api/spoolman/printers/active-spools")
async def all_active_spools_endpoint(user: dict = Depends(require_auth)):
    return {"links": spool_link_service.get_all_links()}


@router.get("/api/spoolman/printers/{port}/active-spool")
async def get_active_spool_endpoint(port: int, user: dict = Depends(require_auth)):
    link = spool_link_service.get_link(port)
    if link is None:
        return {"linked": False, "spool": None}
    client = _require_client()
    spool = client.get_spool(link["spool_id"])
    return {"linked": True, "spool_id": link["spool_id"], "assigned_at": link["assigned_at"], "spool": spool}


@router.post("/api/spoolman/printers/{port}/active-spool")
async def set_active_spool_endpoint(
    port: int, spool_id: int = Form(...), user: dict = Depends(require_role("admin")),
):
    client = _require_client()
    if client.get_spool(spool_id) is None:
        raise HTTPException(status_code=404, detail="Spool no encontrado en Spoolman")
    return {"success": True, **spool_link_service.set_link(port, spool_id)}


@router.delete("/api/spoolman/printers/{port}/active-spool")
async def clear_active_spool_endpoint(port: int, user: dict = Depends(require_role("admin"))):
    if not spool_link_service.clear_link(port):
        raise HTTPException(status_code=404, detail="Esta impresora no tiene spool asignado")
    return {"success": True}


# ── Reservas de material para producción ──

@router.get("/api/spoolman/reservations")
async def list_reservations_endpoint(user: dict = Depends(require_auth)):
    return {"reservations": reservation_service.list_reservations()}


@router.post("/api/spoolman/reservations")
async def create_reservation_endpoint(
    quote_id: str = Form(...),
    quote_label: str = Form(...),
    spool_id: int = Form(...),
    grams: float = Form(...),
    note: str = Form(""),
    scheduled_for: Optional[str] = Form(None),
    user: dict = Depends(require_role("admin")),
):
    client = _require_client()
    spool = client.get_spool(spool_id)
    if spool is None:
        raise HTTPException(status_code=404, detail="Spool no encontrado en Spoolman")
    remaining = spool.get("remaining_weight") or 0
    already_reserved = reservation_service.reserved_grams_for_spool(spool_id)
    available = max(remaining - already_reserved, 0)
    try:
        return reservation_service.create_reservation(
            quote_id, quote_label, spool_id, grams, available, note, scheduled_for,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/api/spoolman/reservations/{reservation_id}")
async def delete_reservation_endpoint(reservation_id: str, user: dict = Depends(require_role("admin"))):
    if not reservation_service.delete_reservation(reservation_id):
        raise HTTPException(status_code=404, detail="Reserva no encontrada")
    return {"success": True}


# ── Consumo mensual ──

@router.get("/api/spoolman/consumption/monthly")
async def consumption_monthly_endpoint(user: dict = Depends(require_auth)):
    client = _require_client()
    spools = client.list_spools(allow_archived=True)
    consumption_service.reconcile(spools)
    return {"by_material": consumption_service.monthly_summary()}
