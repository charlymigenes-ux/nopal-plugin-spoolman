---
title: Materiales (Spoolman): configuración
status: draft
verified_against: "nopal-plugin-spoolman@26fea1b (0.2.0) · nopal@a5853dc"
---


# Configuración

## Permisos declarados (informativos)

- Conectar con un servidor Spoolman en tu red.
- Guardar qué carrete está cargado en cada impresora.
- Guardar reservas de material para producción.

## Archivos que crea el plugin

En la raíz de la instalación de NOPAL:

| Archivo | Contenido |
|---|---|
| `spoolman_config.json` | Dirección del servidor Spoolman. **Solo el administrador** puede cambiarla |
| `spoolman_printer_links.json` | Qué carrete está asignado a cada impresora |
| `spoolman_reservations.json` | Reservas de material para producción |
| `spoolman_usage_log.json` | Registro de consumo |

Estos archivos se incluyen en los **respaldos de configuración** de NOPAL (grupo *Materiales (Spoolman)*), con excepción del registro de consumo.

## Roles

Ver y consultar el inventario y las alertas está abierto a cualquier usuario con sesión; **guardar o borrar la configuración** y otras acciones de gestión exigen el rol de administrador. El detalle por ruta está en [API](api.md).
