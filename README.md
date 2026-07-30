# Materiales (plugin NOPAL × Spoolman)

Conecta [NOPAL](https://github.com/charlymigenes-ux/nopal) con un servidor
[Spoolman](https://github.com/Donkie/Spoolman) para ver tu inventario real
de spools de filamento, asignarlos a tus impresoras Klipper, reservar
material para producción y usar sus costos reales en el Cotizador de NOPAL.

<img width="1672" height="941" alt="Materiales" src="https://github.com/user-attachments/assets/df8bf76e-9fcc-43cb-aeb3-53499926690a" />


Spoolman sigue siendo el dueño del inventario físico (spool, fabricante,
peso, costo, ubicación); este plugin agrega la capa de negocio encima
(impresora → spool asignado, pedido → material reservado, cotización →
costo real), sin duplicar esos datos — solo guarda IDs de referencia.

## Requisitos

Un servidor Spoolman corriendo y alcanzable en tu red (por defecto expone
el puerto `7912`):

```bash
mkdir -p ~/spoolman-data && sudo chown 1000:1000 ~/spoolman-data
docker run -d --name spoolman \
  -v ~/spoolman-data:/home/app/.local/share/spoolman \
  -p 7912:8000 \
  -e TZ=America/Mexico_City \
  ghcr.io/donkie/spoolman:latest
```

## Instalación

Desde NOPAL → Configuración → Galería de plugins → Materiales → Instalar
(o, en desarrollo local, cloná/copiá esta carpeta directo a
`plugins/spoolman/` y registrala en `data/plugins/installed.json`).

## Desarrollo

Este plugin corre **en proceso con NOPAL** (no está sandboxeado): su backend
importa `backend.auth_deps` de NOPAL core, y depende de que NOPAL lo cargue
vía `backend/services/plugin_loader_service.py`.

Integra opcionalmente con el plugin **Cotizador** (si está instalado): un
`material_id` con el formato `"spoolman:<spool_id>"` en
`POST /api/pricing/quote` resuelve su costo real desde este plugin en vez
de `pricing_config.json` — ver `plugins/cotizador/backend/services/pricing_service.py`.

### Tests

```bash
pip install -r requirements-dev.txt  # desde la raíz de NOPAL
pytest plugins/spoolman/tests
```

Por convención, este repo se clona dentro de `plugins/spoolman/` de un
checkout de NOPAL. Si corrés los tests desde otro lado, seteá
`NOPAL_CORE_ROOT` apuntando a ese checkout.
