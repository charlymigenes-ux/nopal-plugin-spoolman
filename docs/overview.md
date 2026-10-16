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

## Integración con el Cotizador

Si el plugin Cotizador está instalado, un `material_id` con la forma `spoolman:<id_de_carrete>` enviado a `POST /api/pricing/quote` toma su costo desde este plugin en lugar de `pricing_config.json`.

## Comprobación de Moonraker

El plugin puede revisar, por cada impresora Klipper con un carrete vinculado en NOPAL, si **Moonraker** (y no NOPAL) tiene activo su propio componente `[spoolman]`.

[Instalación](installation.md) · [Configuración](configuration.md) · [API](api.md) · [Solución de problemas](troubleshooting.md)
