"""Endpoints del plugin Materiales (NOPAL × Spoolman), bajo /api/spoolman.

Lectura: cualquier usuario logueado (require_auth). Escritura (configurar
el servidor, asignar spool a una impresora, crear/borrar reservas):
solo admin (require_role("admin")) -- mismo criterio que camera-viewer al
registrar cámaras.
"""

import asyncio
import hashlib
import json
import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Form, HTTPException

from backend.auth_deps import require_auth, require_role

from .services import config_service, consumption_service, discovery_service, reservation_service, spool_link_service
from .services.spoolman_client import SpoolmanClient, SpoolmanWriteError

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
    # Valor del inventario: precio del carrete proporcional a lo que queda.
    # Solo cuenta los carretes con precio y peso inicial; no inventa el resto.
    inventory_value = 0.0
    for s in spools:
        price, initial = s.get("price"), s.get("initial_weight")
        if price and initial:
            inventory_value += price * min((s.get("remaining_weight") or 0) / initial, 1)

    return {
        "active_spools": len(spools),
        "available_kg": round(max(total_remaining_g - total_reserved_g, 0) / 1000, 2),
        "low_stock_count": low_stock_count,
        "reserved_kg": round(total_reserved_g / 1000, 2),
        "consumption_month_kg": round(month_total_g / 1000, 2),
        "inventory_value": round(inventory_value, 2),
        "currency": client.get_currency(),
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
async def all_active_spools_endpoint(resolve: bool = False, user: dict = Depends(require_auth)):
    """Qué carrete tiene cargado cada impresora.

    Con `resolve=true` se devuelve además el material y el color de cada
    uno, resueltos de una sola pasada. El panel muestra eso en la ficha de
    cada impresora: sin este parámetro tendría que pedir un spool por
    máquina, y con varias impresoras eso son varias consultas a Spoolman
    para pintar una línea de texto.

    Si Spoolman no está configurado o no responde, se devuelven los
    vínculos igual y sin material -- la ficha se queda sin ese dato en vez
    de romperse entera.
    """
    links = spool_link_service.get_all_links()
    if not resolve or not links:
        return {"links": links}

    try:
        client = _require_client()
        spools = {str(s.get("id")): s for s in client.list_spools()}
    except Exception as exc:
        logger.warning(f"No se pudo resolver el material cargado: {exc}")
        return {"links": links}

    resueltos = {}
    for port, link in links.items():
        spool = spools.get(str(link.get("spool_id")))
        filamento = (spool or {}).get("filament") or {}
        # Un filamento multicolor no tiene color_hex (queda None) -- Spoolman
        # guarda sus colores en multi_color_hexes, una lista separada por
        # comas ("37c53e,f2dd1d"), más la técnica (multi_color_direction:
        # "coaxial" o "longitudinal"). Sin esto, un filamento multicolor
        # real se veía sin color en la ficha en vez de con los suyos.
        multi_hex = filamento.get("multi_color_hexes")
        resueltos[port] = {
            **link,
            "material": filamento.get("material"),
            "color_hex": filamento.get("color_hex"),
            "multi_color_hexes": [h.strip() for h in multi_hex.split(",") if h.strip()] if multi_hex else None,
            "multi_color_direction": filamento.get("multi_color_direction"),
            # El nombre comercial ("PLA Verde") es lo que el usuario
            # reconoce; el material suelto ("PLA") es el respaldo.
            "label": filamento.get("name") or filamento.get("material"),
            "vendor": (filamento.get("vendor") or {}).get("name"),
            "diameter": filamento.get("diameter"),
            "remaining_weight": (spool or {}).get("remaining_weight"),
        }
    return {"links": resueltos}


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
    """Asigna el carrete que la ficha de NOPAL muestra para esta impresora.

    De paso intenta fijar el mismo carrete como "activo" en el componente
    [spoolman] de Moonraker (moonraker_synced=True si funcionó) -- ese es
    el que de verdad descuenta gramos reales mientras imprime. Si Moonraker
    no tiene [spoolman] configurado, esto falla en silencio y el vínculo de
    NOPAL se guarda igual (moonraker_synced=False): quedarse sin
    sincronización no debe romper la asignación que se ve en la ficha, ver
    /api/spoolman/moonraker-check para avisar de eso por separado.
    """
    from backend.services.klipper_service import MoonrakerClient

    client = _require_client()
    if client.get_spool(spool_id) is None:
        raise HTTPException(status_code=404, detail="Spool no encontrado en Spoolman")
    sincronizado = MoonrakerClient(port).set_spoolman_active_spool(spool_id)
    return {"success": True, "moonraker_synced": sincronizado, **spool_link_service.set_link(port, spool_id)}


@router.delete("/api/spoolman/printers/{port}/active-spool")
async def clear_active_spool_endpoint(port: int, user: dict = Depends(require_role("admin"))):
    from backend.services.klipper_service import MoonrakerClient

    if not spool_link_service.clear_link(port):
        raise HTTPException(status_code=404, detail="Esta impresora no tiene spool asignado")
    sincronizado = MoonrakerClient(port).set_spoolman_active_spool(None)
    return {"success": True, "moonraker_synced": sincronizado}


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


# ── Diagnóstico: ¿Moonraker reporta consumo real? ──

@router.get("/api/spoolman/moonraker-check")
async def moonraker_spoolman_check_endpoint(user: dict = Depends(require_auth)):
    """Por cada impresora Klipper con un carrete vinculado en NOPAL, revisa si
    Moonraker (no NOPAL) tiene su propio componente [spoolman] activo.

    Vincular un carrete acá solo le dice a NOPAL qué mostrar en la ficha --
    quien de verdad resta gramos de Spoolman al terminar una impresión es
    Moonraker, con su [spoolman] configurado en moonraker.conf. Sin eso,
    "Peso Usado" se queda en 0 para siempre aunque se impriman trabajos
    reales, y no es un bug de NOPAL: es una pieza de configuración externa
    que falta. /server/info de Moonraker lista sus componentes activos por
    nombre; si "spoolman" no está ahí, no está configurado.
    """
    from backend.services.klipper_service import MoonrakerClient

    links = spool_link_service.get_all_links()
    resultado = []
    for port_str in links:
        try:
            port = int(port_str)
        except ValueError:
            continue
        info = MoonrakerClient(port).get_server_info()
        resultado.append({
            "port": port,
            # info vacío (Moonraker no respondió) no es lo mismo que
            # "sin spoolman": no se afirma nada que no se pudo comprobar.
            "reachable": bool(info),
            "moonraker_spoolman_configured": "spoolman" in (info.get("components") or []),
        })
    return {"printers": resultado}


# ── Más datos de Spoolman (solo lectura) ──

@router.get("/api/spoolman/locations")
async def locations_endpoint(user: dict = Depends(require_auth)):
    return {"locations": _require_client().list_locations()}


@router.get("/api/spoolman/filaments")
async def filaments_endpoint(user: dict = Depends(require_auth)):
    filaments = _require_client().list_filaments()
    return {"filaments": [
        {
            "id": f.get("id"),
            "name": f.get("name"),
            "material": f.get("material"),
            "vendor": (f.get("vendor") or {}).get("name"),
            "color_hex": f.get("color_hex"),
            "weight": f.get("weight"),
            "spool_weight": f.get("spool_weight"),
            "price": f.get("price"),
        }
        for f in filaments
    ]}


@router.get("/api/spoolman/changes")
async def changes_endpoint(user: dict = Depends(require_auth)):
    """Huella barata del inventario, para que el panel sepa si algo cambió
    (por Spoolman, por Moonraker al terminar una impresión, por otra
    persona) sin repintar todo cada vez. No es un canal push: el panel la
    consulta cada pocos segundos y solo recarga cuando `token` cambia."""
    client = _require_client()
    spools = client.list_spools(allow_archived=True)
    huella = [
        [s.get("id"), s.get("remaining_weight"), s.get("used_weight"), s.get("location"), s.get("archived"), s.get("last_used")]
        for s in spools
    ]
    token = hashlib.sha1(json.dumps(huella, sort_keys=True, default=str).encode()).hexdigest()[:12]
    return {"token": token, "spools": len(spools)}


# ── Escrituras sobre el inventario (solo admin) ──
#
# Todas modifican datos reales de Spoolman, por eso exigen admin y devuelven
# el error de Spoolman si no se aplicaron (nunca un "ok" falso).

def _write_error(exc: SpoolmanWriteError) -> HTTPException:
    status = 404 if exc.status == 404 else 400 if exc.status in (400, 422) else 502
    return HTTPException(status_code=status, detail=str(exc))


def _positive(value: float, name: str) -> float:
    if not 0 < value <= 100000:
        raise HTTPException(status_code=400, detail=f"{name} debe ser mayor que 0 y razonable")
    return value


@router.put("/api/spoolman/spools/{spool_id}/measure")
async def measure_spool_endpoint(spool_id: int, weight: float = Form(...), user: dict = Depends(require_role("admin"))):
    """Peso bruto medido en la báscula (carrete + filamento); Spoolman
    descuenta el peso del carrete vacío y calcula lo que queda."""
    client = _require_client()
    try:
        return _with_reservation_fields(client.measure_spool(spool_id, _positive(weight, "El peso")))
    except SpoolmanWriteError as exc:
        raise _write_error(exc)


@router.put("/api/spoolman/spools/{spool_id}/use")
async def use_spool_endpoint(spool_id: int, use_weight: float = Form(...), user: dict = Depends(require_role("admin"))):
    client = _require_client()
    try:
        return _with_reservation_fields(client.use_spool(spool_id, _positive(use_weight, "El consumo")))
    except SpoolmanWriteError as exc:
        raise _write_error(exc)


@router.patch("/api/spoolman/spools/{spool_id}")
async def update_spool_endpoint(
    spool_id: int,
    location: Optional[str] = Form(None),
    archived: Optional[bool] = Form(None),
    comment: Optional[str] = Form(None),
    user: dict = Depends(require_role("admin")),
):
    """Solo ubicación, archivado y comentario: lo que el panel necesita.
    El resto de los campos se edita en la interfaz de Spoolman."""
    fields: Dict[str, Any] = {}
    if location is not None:
        fields["location"] = location.strip()
    if archived is not None:
        fields["archived"] = archived
    if comment is not None:
        fields["comment"] = comment
    if not fields:
        raise HTTPException(status_code=400, detail="No hay nada que cambiar")
    client = _require_client()
    try:
        return _with_reservation_fields(client.update_spool(spool_id, fields))
    except SpoolmanWriteError as exc:
        raise _write_error(exc)


@router.post("/api/spoolman/spools")
async def create_spool_endpoint(
    filament_id: int = Form(...),
    initial_weight: Optional[float] = Form(None),
    location: str = Form(""),
    user: dict = Depends(require_role("admin")),
):
    fields: Dict[str, Any] = {"filament_id": filament_id}
    if initial_weight is not None:
        fields["initial_weight"] = _positive(initial_weight, "El peso inicial")
    if location.strip():
        fields["location"] = location.strip()
    client = _require_client()
    try:
        return _with_reservation_fields(client.create_spool(fields))
    except SpoolmanWriteError as exc:
        raise _write_error(exc)


@router.post("/api/spoolman/backup")
async def backup_endpoint(user: dict = Depends(require_role("admin"))):
    """Pide a Spoolman una copia de su base de datos (la guarda él, en su
    propio equipo; NOPAL no la descarga)."""
    client = _require_client()
    try:
        return {"success": True, "result": client.backup()}
    except SpoolmanWriteError as exc:
        raise _write_error(exc)


# ── Herramientas para NOPAL Intelligence (solo lectura) ──
#
# Contrato en docs/NOPAL_INTELLIGENCE.md del core. Se declaran solo si el
# core es lo bastante nuevo para tener `Tool` y `Action`; en uno anterior el
# plugin sigue funcionando sin ellas.

def _tool_find_spools(material: str = "", color: str = "", vendor: str = "", location: str = "") -> Dict[str, Any]:
    client = config_service.get_client()
    if client is None:
        return {"available": False, "reason": "Spoolman no está configurado"}
    wanted = {"material": material, "color": color, "vendor": vendor, "location": location}
    wanted = {k: v.strip().lower() for k, v in wanted.items() if v and v.strip()}
    found = []
    for spool in client.list_spools():
        filament = spool.get("filament") or {}
        fields = {
            "material": filament.get("material") or "",
            "color": filament.get("name") or "",
            "vendor": (filament.get("vendor") or {}).get("name") or "",
            "location": spool.get("location") or "",
        }
        if all(text in fields[key].lower() for key, text in wanted.items()):
            spool = _with_reservation_fields(spool)
            found.append({
                "id": spool.get("id"),
                **fields,
                "remaining_g": spool.get("remaining_weight"),
                "available_g": spool.get("available_weight"),
            })
    return {"available": True, "count": len(found), "spools": found[:30]}


def _tool_printer_spools() -> Dict[str, Any]:
    client = config_service.get_client()
    if client is None:
        return {"available": False, "reason": "Spoolman no está configurado"}
    spools = {str(s.get("id")): s for s in client.list_spools()}
    printers = []
    for port, link in spool_link_service.get_all_links().items():
        spool = spools.get(str(link.get("spool_id")))
        filament = (spool or {}).get("filament") or {}
        printers.append({
            "printer_port": port,
            "spool_id": link.get("spool_id"),
            "material": filament.get("material"),
            "color": filament.get("name"),
            "remaining_g": (spool or {}).get("remaining_weight"),
        })
    return {"available": True, "printers": printers}


def _declare_ai_tools():
    try:
        from backend.services.ai_tools import Tool
        from backend.services.authorization_policy import Action
    except ImportError:
        return []

    async def find_spools(material: str = "", color: str = "", vendor: str = "", location: str = ""):
        return await asyncio.get_event_loop().run_in_executor(
            None, lambda: _tool_find_spools(material, color, vendor, location),
        )

    async def printer_spools():
        return await asyncio.get_event_loop().run_in_executor(None, _tool_printer_spools)

    def text(description: str) -> Dict[str, str]:
        return {"type": "string", "description": description}

    return [
        Tool(
            "find_spools",
            "Busca carretes de filamento en el inventario (Spoolman) por material, color o nombre, marca o ubicación. "
            "Devuelve los gramos que quedan y los realmente disponibles tras las reservas.",
            find_spools,
            {"type": "object", "required": [], "properties": {
                "material": text("Material, p. ej. PLA o PETG"), "color": text("Color o nombre del filamento"),
                "vendor": text("Marca"), "location": text("Ubicación"),
            }},
            policy_action=Action.USE_PLUGIN,
        ),
        Tool(
            "get_printer_spools",
            "Dice qué carrete tiene cargado cada impresora y cuánto filamento le queda.",
            printer_spools,
            policy_action=Action.USE_PLUGIN,
        ),
    ]


AI_TOOLS = _declare_ai_tools()
