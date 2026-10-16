---
title: Materiales (Spoolman): instalación
status: draft
verified_against: "nopal-plugin-spoolman@26fea1b (0.2.0) · nopal@4346f72"
---


# Instalación

## Requisitos

Un **servidor Spoolman** corriendo y accesible desde tu red. Por defecto expone el puerto **7912** si lo publicas como en este ejemplo con Docker:

```bash
mkdir -p ~/spoolman-data && sudo chown 1000:1000 ~/spoolman-data
```

```bash
docker run -d --name spoolman \
  -v ~/spoolman-data:/home/app/.local/share/spoolman \
  -p 7912:8000 \
  -e TZ=America/Mexico_City \
  ghcr.io/donkie/spoolman:latest
```

## Pasos

1. **Configuración → Galería de plugins → Materiales → Instalar.**
2. **Reinicia NOPAL** para cargar el backend.
3. Configura la dirección de tu servidor Spoolman en la sección **Materiales**. El plugin puede **descubrir** servidores Spoolman en `localhost` y en la red local.

Para **desarrollo local**, copia el plugin a `plugins/spoolman/` y regístralo en `data/plugins/installed.json`.

## Solo impresoras Klipper

El plugin declara compatibilidad únicamente con **impresión 3D**, y la asignación de carretes está pensada para impresoras **Klipper**.
