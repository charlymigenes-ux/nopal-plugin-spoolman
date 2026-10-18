---
title: Materiales (Spoolman): visión general
status: draft
verified_against: "nopal-plugin-spoolman@26fea1b (0.2.0) · nopal@4346f72"
---


# Materiales (Spoolman)

Conecta NOPAL con un servidor [Spoolman](https://github.com/Donkie/Spoolman) para:

- Ver tu **inventario real** de carretes de filamento.
- **Asignar** un carrete a cada impresora Klipper.
- **Reservar material** para producción.
- Usar los **costos reales** del carrete en el Cotizador.

**Spoolman sigue siendo el dueño del inventario físico** (carrete, fabricante, peso, costo, ubicación). El plugin añade la capa de negocio encima y **no duplica esos datos**: solo guarda identificadores de referencia (impresora → carrete asignado, pedido → material reservado).

## Qué más puede hacer (0.3.0)

- **Más datos del carrete**: ubicación, peso inicial y usado, valor restante, temperatura sugerida y etiquetas NFC. El resumen suma el **valor del inventario** con la moneda que tenga definida Spoolman, y la lista se puede filtrar por **ubicación**.
- **Escribir en Spoolman desde NOPAL** (solo administradores, siempre con confirmación): **pesar** (peso bruto en la báscula), **registrar uso**, **mover** de ubicación y **archivar**. Los cambios los hace Spoolman; NOPAL solo se los pide.
- **Respaldo**: un botón en la configuración pide a Spoolman una copia de su base de datos. La guarda él, en su propio equipo.
- **Cambios en vivo**: el panel consulta cada 10 segundos una huella barata del inventario y solo se recarga si algo cambió (por ejemplo, cuando Moonraker descuenta filamento al terminar una impresión). No es un canal push.
- **NOPAL Intelligence**: dos herramientas de **solo lectura**, `find_spools` (buscar carretes por material, color, marca o ubicación) y `get_printer_spools` (qué carrete tiene cada impresora). Requieren un núcleo de NOPAL que admita `AI_TOOLS`; en uno anterior el plugin funciona igual sin ellas.

## Integración con el Cotizador

Si el plugin Cotizador está instalado, un `material_id` con la forma `spoolman:<id_de_carrete>` enviado a `POST /api/pricing/quote` toma su costo desde este plugin en lugar de `pricing_config.json`.

## Comprobación de Moonraker

El plugin puede revisar, por cada impresora Klipper con un carrete vinculado en NOPAL, si **Moonraker** (y no NOPAL) tiene activo su propio componente `[spoolman]`.

[Instalación](installation.md) · [Configuración](configuration.md) · [API](api.md) · [Solución de problemas](troubleshooting.md)
