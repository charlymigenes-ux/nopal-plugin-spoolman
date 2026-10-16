---
title: Materiales (Spoolman): solución de problemas
status: draft
verified_against: "nopal-plugin-spoolman@26fea1b (0.2.0) · nopal@4346f72"
---


# Solución de problemas

| Problema | Qué hacer |
|---|---|
| No aparece el inventario | Comprueba que el servidor Spoolman esté en marcha y accesible desde el equipo de NOPAL, y que la dirección configurada sea correcta (por defecto, puerto 7912 con el ejemplo de Docker) |
| No encuentro mi servidor Spoolman | Usa el **descubrimiento**, que sondea `localhost` y la red local; si está en otra subred, escribe su dirección a mano |
| Quiero saber si Moonraker también gestiona el carrete | Usa la **comprobación de Moonraker**: indica si tiene su propio componente `[spoolman]` activo |
| El Cotizador no usa el costo del carrete | El `material_id` debe tener la forma `spoolman:<id_de_carrete>` y el plugin Cotizador debe estar instalado |
| Tras actualizar el plugin no cambia el comportamiento | Si se tocó `backend/`, **reinicia NOPAL** |
