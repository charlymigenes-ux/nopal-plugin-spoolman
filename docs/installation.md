---
title: Materiales (Spoolman): instalación
status: draft
verified_against: "nopal-plugin-spoolman@26fea1b (0.2.0) · nopal@a5853dc · Spoolman v0.27.0 (wiki consultada el 2026-10-18)"
---


# Instalación

El plugin **Materiales** no incluye Spoolman: se conecta a un **servidor Spoolman** que ya tengas en marcha. Primero instala Spoolman y después el plugin.

## 1. Un servidor Spoolman

La guía oficial y al día está en la [wiki de Spoolman](https://github.com/Donkie/Spoolman/wiki/Installation). Estas son las opciones que describe, resumidas:

| Método | Cuándo |
|---|---|
| **Docker Compose** | Recomendado. Funciona en cualquier sistema con Docker |
| **Standalone** | Linux, con un script de instalación que crea un servicio `systemd` |
| **Desde el código fuente** | Avanzado: la rama `master`, con Node.js 20 o superior |

### Docker Compose (recomendado)

Crea una carpeta para Spoolman con este `docker-compose.yml`:

```yaml
services:
  spoolman:
    image: ghcr.io/donkie/spoolman:latest
    restart: unless-stopped
    volumes:
      - type: bind
        source: ./data
        target: /home/app/.local/share/spoolman
    ports:
      - "7912:8000"
    environment:
      - TZ=America/Mexico_City
```

- La imagen también está en Docker Hub como `donkieyo/spoolman:latest`.
- `TZ` es opcional; por omisión es UTC.
- El puerto **7912** del equipo apunta al 8000 del contenedor. Es el que usa NOPAL por defecto.

Prepara la carpeta de datos y arranca:

```bash
mkdir data && chown 1000:1000 data
```

```bash
docker compose up -d
```

La interfaz queda en `http://<ip-del-servidor>:7912`. Comprueba que aparece `spoolman.db` dentro de `data/`: si no, tus datos no se están guardando en la carpeta montada y se perderían al actualizar.

Para **actualizar**:

```bash
docker compose pull && docker compose up -d
```

Si cambias variables de entorno, usa `docker compose up -d`: un simple `docker compose restart` no las aplica. En versiones antiguas de Docker el comando es `docker-compose`, con guion.

### Standalone (Linux)

Desde tu carpeta personal, con `curl` y `unzip` instalados:

```bash
mkdir -p ./Spoolman && \
curl -s https://api.github.com/repos/Donkie/Spoolman/releases/latest | \
grep -o 'https://[^"]*spoolman.zip' | \
xargs curl -sSL -o temp.zip && \
unzip -o temp.zip -d ./Spoolman && \
rm temp.zip && \
cd ./Spoolman && \
bash ./scripts/install.sh
```

El instalador crea un archivo `.env` en la carpeta de Spoolman para sus ajustes (el puerto por defecto es 7912) y un servicio `Spoolman`. Para aplicar cambios: `sudo systemctl restart Spoolman`. Los datos (SQLite) quedan en `~/.local/share/spoolman`.

:::warning Actualizar con el comando de la wiki: ojo con la carpeta
El comando de actualización de la wiki trabaja sobre la carpeta **`~/Spoolman`** (con mayúscula). Detiene y deshabilita el servicio actual, mueve esa carpeta a `Spoolman_old` e instala la última versión. Si tu Spoolman vive en **otra carpeta** (por ejemplo `~/spoolman`, en minúsculas, que en Linux es una carpeta distinta), el comando puede detener y deshabilitar tu servicio sin llegar a actualizar nada. Antes de ejecutarlo, comprueba con `systemctl cat Spoolman` cuál es el `WorkingDirectory` de tu servicio. Tus datos no corren riesgo: están aparte, en `~/.local/share/spoolman`.

Si te pasó, vuelve a arrancarlo con `sudo systemctl start Spoolman` y, para que arranque con el equipo, `sudo systemctl enable Spoolman`.
:::

:::note Versión revisada
La última versión de Spoolman al revisar esta guía era la **0.27.0** (25 de septiembre de 2026). Las notas de las últimas versiones no anuncian cambios incompatibles en su API. El plugin usa la API `v1` (`/info`, `/spool`, …) y **no se ha probado de forma específica con la 0.27.0**. Si algo no cuadra, ver [Solución de problemas](troubleshooting.md).
:::

## 2. Lo que el plugin espera de Spoolman

El plugin habla con Spoolman por **HTTP plano**, con la dirección `http://<host>:<puerto>/api/v1`, sin credenciales y con una espera corta (4 segundos). Eso tiene consecuencias:

- **Spoolman no tiene autenticación.** Cualquiera que llegue a su puerto puede leer y modificar tu inventario. Mantenlo en tu red local y no reenvíes su puerto directamente a internet. Si lo expones fuera, la propia wiki recomienda un proxy inverso con autenticación.
- **El plugin no puede entrar por un proxy que pida usuario y contraseña, ni por HTTPS, ni por una subruta** (`SPOOLMAN_BASE_PATH`). Apunta NOPAL a la dirección interna de Spoolman, la de HTTP plano.
- **`SPOOLMAN_ALLOWED_HOSTS`.** Si lo activas, Spoolman solo responde a los nombres de equipo listados. Las direcciones IP y los nombres de una sola palabra o `.local` se aceptan solos. Si configuras en NOPAL un nombre de dominio real que no esté en la lista, Spoolman responderá `400`.
- **`SPOOLMAN_CORS_ORIGIN`** solo afecta a navegadores en otra dirección. NOPAL consulta a Spoolman desde su servidor, sin cabecera `Origin`, así que no le afecta.

## 3. El plugin

1. **Configuración → Galería de plugins → Materiales → Instalar.**
2. **Reinicia NOPAL** para cargar el backend.
3. Configura la dirección de tu servidor Spoolman en la sección **Materiales**. El plugin puede **descubrir** servidores Spoolman en `localhost` y en la red local.

Para **desarrollo local**, copia el plugin a `plugins/spoolman/` y regístralo en `data/plugins/installed.json`.

## Solo impresoras Klipper

El plugin declara compatibilidad únicamente con **impresión 3D**, y la asignación de carretes está pensada para impresoras **Klipper**.
