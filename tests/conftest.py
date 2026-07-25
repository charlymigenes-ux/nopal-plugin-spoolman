"""Fixtures para los tests de este plugin.

Este plugin corre EN PROCESO con NOPAL (no está sandboxeado -- su router usa
`backend.auth_deps` y `backend.services.plugin_loader_service` de NOPAL core
en tiempo de ejecución, import absoluto e intencional). Para correr estos
tests hace falta un checkout de NOPAL core accesible:

- Por convención, este repo se clona dentro de plugins/spoolman/ de ese
  checkout, en cuyo caso NOPAL core está 2 niveles arriba de tests/.
- Si se corre desde otro lado, seteá NOPAL_CORE_ROOT apuntando al checkout.

Carga backend/router.py de este plugin con la misma técnica que usa
backend/services/plugin_loader_service.py de NOPAL core (duplicada acá,
self-contained) -- así los tests ejercitan el router igual que en
producción. Los submódulos de servicios quedan además alias-eados bajo
nombres predecibles (backend.services.spoolman_<nombre>) para que los
archivos de test puedan importarlos directo.
"""

import importlib.util
import os
import sys
import types
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

PLUGIN_ROOT = Path(__file__).resolve().parents[1]
NOPAL_CORE_ROOT = Path(os.environ.get("NOPAL_CORE_ROOT") or PLUGIN_ROOT.parents[1])
# Pytest ya insertó PLUGIN_ROOT en sys.path[0] antes de llegar acá (para
# poder importar el paquete tests/ de este plugin) -- si corremos desde la
# raíz del repo, "python -m pytest" también insertó esa raíz, pero MÁS
# ATRÁS que PLUGIN_ROOT. Un simple "insertar si no está" no alcanza: si
# NOPAL_CORE_ROOT ya estaba en sys.path en una posición posterior,
# `import backend` sigue resolviendo primero contra
# PLUGIN_ROOT/backend/__init__.py (que existe, vacío) en vez del backend
# real de NOPAL core. Por eso se garantiza la posición 0 siempre,
# sacándolo primero si ya estaba en otro lado.
core_root_str = str(NOPAL_CORE_ROOT)
if core_root_str in sys.path:
    sys.path.remove(core_root_str)
sys.path.insert(0, core_root_str)

try:
    from backend.auth_deps import require_auth
except ImportError as e:
    raise RuntimeError(
        "No se pudo importar backend.auth_deps de NOPAL core. Este plugin no es "
        "standalone (corre en proceso con NOPAL) -- corré estos tests desde un "
        "checkout de NOPAL con este repo en plugins/spoolman/, o seteá "
        "NOPAL_CORE_ROOT apuntando a uno."
    ) from e

ADMIN_USER = {"id": "test-admin", "username": "test-admin", "role": "admin"}
OPERATOR_USER = {"id": "test-operator", "username": "test-operator", "role": "operator"}

_TEST_NAMESPACE = "nopal_plugin_test_spoolman"
_SERVICE_MODULES = ["config_service", "spool_link_service", "reservation_service", "consumption_service", "spoolman_client"]


def _install_alias(dotted_name: str, module: types.ModuleType) -> None:
    sys.modules[dotted_name] = module
    parent_name, _, child_name = dotted_name.rpartition(".")
    if not parent_name:
        return
    parent_module = sys.modules.get(parent_name)
    if parent_module is None:
        parent_module = types.ModuleType(parent_name)
        parent_module.__path__ = []
        _install_alias(parent_name, parent_module)
    setattr(parent_module, child_name, module)


def _load_router():
    if _TEST_NAMESPACE not in sys.modules:
        ns_module = types.ModuleType(_TEST_NAMESPACE)
        ns_module.__path__ = []
        sys.modules[_TEST_NAMESPACE] = ns_module

    backend_dir = PLUGIN_ROOT / "backend"
    pkg_name = f"{_TEST_NAMESPACE}.pkg"
    pkg_spec = importlib.util.spec_from_file_location(
        pkg_name, backend_dir / "__init__.py", submodule_search_locations=[str(backend_dir)],
    )
    pkg_module = importlib.util.module_from_spec(pkg_spec)
    sys.modules[pkg_name] = pkg_module
    pkg_spec.loader.exec_module(pkg_module)

    module_name = f"{pkg_name}.router"
    module_spec = importlib.util.spec_from_file_location(module_name, backend_dir / "router.py")
    module = importlib.util.module_from_spec(module_spec)
    module.__package__ = pkg_name
    sys.modules[module_name] = module
    module_spec.loader.exec_module(module)

    for service_name in _SERVICE_MODULES:
        _install_alias(f"backend.services.spoolman_{service_name}", sys.modules[f"{pkg_name}.services.{service_name}"])
    _install_alias("backend.api.spoolman", module)
    return module


_ROUTER_MODULE = _load_router()


@pytest.fixture(scope="session")
def app():
    fastapi_app = FastAPI()
    fastapi_app.include_router(_ROUTER_MODULE.router)
    return fastapi_app


@pytest.fixture(scope="session")
def client(app):
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def as_admin(app):
    app.dependency_overrides[require_auth] = lambda: ADMIN_USER
    yield ADMIN_USER
    app.dependency_overrides.pop(require_auth, None)


@pytest.fixture
def as_operator(app):
    app.dependency_overrides[require_auth] = lambda: OPERATOR_USER
    yield OPERATOR_USER
    app.dependency_overrides.pop(require_auth, None)


@pytest.fixture(autouse=True)
def isolated_registries(tmp_path, monkeypatch):
    """Aísla los 4 archivos de datos de este plugin a un directorio temporal
    por test -- mismo criterio que NOPAL core: nunca tocar los archivos
    reales del checkout donde se corran los tests."""
    config_service = sys.modules["backend.services.spoolman_config_service"]
    spool_link_service = sys.modules["backend.services.spoolman_spool_link_service"]
    reservation_service = sys.modules["backend.services.spoolman_reservation_service"]
    consumption_service = sys.modules["backend.services.spoolman_consumption_service"]
    monkeypatch.setattr(config_service, "CONFIG_PATH", str(tmp_path / "spoolman_config.json"))
    monkeypatch.setattr(spool_link_service, "REGISTRY_PATH", str(tmp_path / "spoolman_printer_links.json"))
    monkeypatch.setattr(reservation_service, "REGISTRY_PATH", str(tmp_path / "spoolman_reservations.json"))
    monkeypatch.setattr(consumption_service, "LOG_PATH", str(tmp_path / "spoolman_usage_log.json"))
    yield tmp_path
