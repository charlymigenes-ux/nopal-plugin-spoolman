---
title: Materiales (Spoolman): solución de problemas
status: draft
verified_against: "nopal-plugin-spoolman@26fea1b (0.2.0) · nopal@a5853dc"
---


# Solución de problemas

| Problema | Qué hacer |
|---|---|
| No aparece el inventario | Comprueba que el servidor Spoolman esté en marcha y accesible desde el equipo de NOPAL, y que la dirección configurada sea correcta (por defecto, puerto 7912 con el ejemplo de Docker) |
| Spoolman responde `400` | Si activaste `SPOOLMAN_ALLOWED_HOSTS`, el nombre de equipo con el que NOPAL lo consulta debe estar en esa lista (las direcciones IP y los nombres `.local` se aceptan solos) |
| Spoolman está detrás de un proxy con usuario y contraseña, por HTTPS o en una subruta | El plugin solo habla HTTP plano con `host:puerto`, sin credenciales ni subruta. Apúntalo a la dirección interna de Spoolman |
| No encuentro mi servidor Spoolman | Usa el **descubrimiento**, que sondea `localhost` y la red local; si está en otra subred, escribe su dirección a mano |
| Quiero saber si Moonraker también gestiona el carrete | Usa la **comprobación de Moonraker**: indica si tiene su propio componente `[spoolman]` activo |
| El Cotizador no usa el costo del carrete | El `material_id` debe tener la forma `spoolman:<id_de_carrete>` y el plugin Cotizador debe estar instalado |
| Tras actualizar el plugin no cambia el comportamiento | Si se tocó `backend/`, **reinicia NOPAL** |
