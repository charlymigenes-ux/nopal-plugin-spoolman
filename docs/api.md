---
title: Materiales: API
status: draft
verified_against: "nopal-plugin-spoolman@26fea1b (0.2.0) · nopal@4346f72"
generated: true
---

# Materiales: API

> Página **generada** desde el código del plugin. No la edites a mano.

Prefijo(s) de ruta: `/api/spoolman` · 17 rutas (Sesión (admin u operador): 11; Solo admin: 6; Pública: 0).

| Método | Ruta | Acceso | Política | Descripción |
|---|---|---|---|---|
| GET | `/api/spoolman/alerts` | Sesión (admin u operador) | — | — |
| GET | `/api/spoolman/config` | Sesión (admin u operador) | — | — |
| POST | `/api/spoolman/config` | Solo admin | — | — |
| DELETE | `/api/spoolman/config` | Solo admin | — | — |
| GET | `/api/spoolman/consumption/monthly` | Sesión (admin u operador) | — | — |
| GET | `/api/spoolman/discover` | Sesión (admin u operador) | — | Sondea localhost y la red local en busca de servidores Spoolman reales, para ofrecerlos como opción antes de forzar tipear host/puerto. |
| GET | `/api/spoolman/moonraker-check` | Sesión (admin u operador) | — | Por cada impresora Klipper con un carrete vinculado en NOPAL, revisa si Moonraker (no NOPAL) tiene su propio componente [spoolman] activo. |
| GET | `/api/spoolman/printers/{port}/active-spool` | Sesión (admin u operador) | — | — |
| POST | `/api/spoolman/printers/{port}/active-spool` | Solo admin | — | Asigna el carrete que la ficha de NOPAL muestra para esta impresora. |
| DELETE | `/api/spoolman/printers/{port}/active-spool` | Solo admin | — | — |
| GET | `/api/spoolman/printers/active-spools` | Sesión (admin u operador) | — | Qué carrete tiene cargado cada impresora. |
| GET | `/api/spoolman/reservations` | Sesión (admin u operador) | — | — |
| POST | `/api/spoolman/reservations` | Solo admin | — | — |
| DELETE | `/api/spoolman/reservations/{reservation_id}` | Solo admin | — | — |
| GET | `/api/spoolman/spools` | Sesión (admin u operador) | — | — |
| GET | `/api/spoolman/spools/{spool_id}` | Sesión (admin u operador) | — | — |
| GET | `/api/spoolman/summary` | Sesión (admin u operador) | — | — |

El acceso mostrado es el declarado en cada ruta (`require_auth`, `require_role("admin")`). Una comprobación de rol dentro del cuerpo de la función no se detecta.
