"""Datos extra, escrituras y herramientas de IA, contra un Spoolman FALSO.

Las escrituras (medir, usar, mover, archivar, crear, respaldo) cambian datos
reales, así que estos tests nunca las dirigen a un Spoolman de verdad: levantan
un servidor HTTP local mínimo que imita las rutas de la API v1 y guarda su
estado en memoria. Así se prueba también el cliente real (requests, JSON,
códigos de error) y no solo el router.
"""

import asyncio
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest


def _spool(spool_id, material="PLA", name="Blanco", remaining=800.0, initial=1000.0, price=300.0, location="Estante"):
    return {
        "id": spool_id, "price": price, "remaining_weight": remaining, "initial_weight": initial,
        "used_weight": initial - remaining, "location": location, "archived": False, "comment": "",
        "filament": {"id": spool_id, "material": material, "name": name, "vendor": {"name": "SUNLU"}, "weight": initial, "price": price},
    }


class FakeSpoolman:
    def __init__(self):
        self.spools = {1: _spool(1), 2: _spool(2, "PETG", "Negro", 120.0, 1000.0, 400.0, "Caja")}
        self.currency = '"MXN"'
        self.backups = 0
        self.fail_with = None  # (status, body) para simular un rechazo
        self.requests = []

    def handle(self, method, path, body):
        self.requests.append((method, path, body))
        if self.fail_with and method != "GET":
            return self.fail_with
        if path == "/api/v1/info":
            return 200, {"version": "0.27.0"}
        if path.startswith("/api/v1/spool") and method == "GET" and path.rstrip("/") == "/api/v1/spool":
            return 200, [s for s in self.spools.values() if not s["archived"]]
        if path == "/api/v1/location":
            return 200, ["Estante", "Caja"]
        if path == "/api/v1/setting/currency":
            return 200, {"value": self.currency, "is_set": True, "type": "string"}
        if path == "/api/v1/filament":
            return 200, [{"id": 7, "name": "Rojo", "material": "PLA", "vendor": {"name": "eSun"}, "color_hex": "ff0000", "weight": 1000}]
        if path == "/api/v1/backup" and method == "POST":
            self.backups += 1
            return 200, {"path": "/backups/spoolman.db"}
        if path == "/api/v1/spool" and method == "POST":
            new_id = max(self.spools) + 1
            spool = _spool(new_id, remaining=body.get("initial_weight", 1000), initial=body.get("initial_weight", 1000),
                           location=body.get("location", ""))
            self.spools[new_id] = spool
            return 201, spool
        parts = path.split("/")  # ['', 'api', 'v1', 'spool', '<id>', ...]
        if len(parts) >= 5 and parts[3] == "spool" and parts[4].isdigit():
            spool = self.spools.get(int(parts[4]))
            if spool is None:
                return 404, {"message": "No spool with ID %s found." % parts[4]}
            action = parts[5] if len(parts) > 5 else None
            if method == "GET":
                return 200, spool
            if action == "measure":
                spool["remaining_weight"] = max(body["weight"] - 120.0, 0)
            elif action == "use":
                spool["remaining_weight"] -= body["use_weight"]
                spool["used_weight"] += body["use_weight"]
            elif method == "PATCH":
                spool.update(body)
            return 200, spool
        return 404, {"message": "ruta desconocida"}


@pytest.fixture
def fake(client, as_admin):
    state = FakeSpoolman()

    class Handler(BaseHTTPRequestHandler):
        def _do(self):
            length = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(length)) if length else None
            status, payload = state.handle(self.command, self.path.split("?")[0], body)
            data = json.dumps(payload).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        do_GET = do_POST = do_PUT = do_PATCH = _do

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    response = client.post("/api/spoolman/config", data={"host": "127.0.0.1", "port": server.server_address[1]})
    assert response.status_code == 200, response.text
    state.requests.clear()
    yield state
    server.shutdown()
    server.server_close()


class TestLecturaExtra:
    def test_ubicaciones(self, client, fake):
        assert client.get("/api/spoolman/locations").json() == {"locations": ["Estante", "Caja"]}

    def test_filamentos_resumidos(self, client, fake):
        filament = client.get("/api/spoolman/filaments").json()["filaments"][0]
        assert filament["vendor"] == "eSun" and filament["id"] == 7

    def test_resumen_trae_valor_y_moneda(self, client, fake):
        body = client.get("/api/spoolman/summary").json()
        # 300 * 0.8 + 400 * 0.12 = 288
        assert body["inventory_value"] == 288.0
        assert body["currency"] == "MXN"

    def test_changes_token_cambia_solo_si_hay_cambio(self, client, fake):
        first = client.get("/api/spoolman/changes").json()["token"]
        assert client.get("/api/spoolman/changes").json()["token"] == first
        fake.spools[1]["remaining_weight"] = 700.0
        assert client.get("/api/spoolman/changes").json()["token"] != first


class TestEscrituras:
    def test_medir(self, client, fake):
        response = client.put("/api/spoolman/spools/1/measure", data={"weight": 620})
        assert response.status_code == 200
        assert response.json()["remaining_weight"] == 500.0
        assert response.json()["available_weight"] == 500.0  # sin reservas

    def test_usar(self, client, fake):
        response = client.put("/api/spoolman/spools/1/use", data={"use_weight": 50})
        assert response.json()["remaining_weight"] == 750.0

    def test_mover_y_archivar(self, client, fake):
        response = client.patch("/api/spoolman/spools/2", data={"location": "Estante 2", "archived": "true"})
        assert response.status_code == 200
        assert fake.spools[2]["location"] == "Estante 2" and fake.spools[2]["archived"] is True
        # Solo viaja lo pedido: nada de campos que no se tocaron.
        method, path, body = fake.requests[-1]
        assert (method, body) == ("PATCH", {"location": "Estante 2", "archived": True})

    def test_patch_sin_campos_es_400(self, client, fake):
        assert client.patch("/api/spoolman/spools/1").status_code == 400
        assert not [r for r in fake.requests if r[0] == "PATCH"]

    def test_crear_spool(self, client, fake):
        response = client.post("/api/spoolman/spools", data={"filament_id": 7, "initial_weight": 900, "location": "Caja"})
        assert response.status_code == 200
        assert fake.requests[-1][2] == {"filament_id": 7, "initial_weight": 900.0, "location": "Caja"}

    def test_respaldo(self, client, fake):
        assert client.post("/api/spoolman/backup").json()["success"] is True
        assert fake.backups == 1

    @pytest.mark.parametrize("value", ["0", "-5", "999999"])
    def test_pesos_absurdos_no_llegan_a_spoolman(self, client, fake, value):
        assert client.put("/api/spoolman/spools/1/measure", data={"weight": value}).status_code == 400
        assert client.put("/api/spoolman/spools/1/use", data={"use_weight": value}).status_code == 400
        assert not [r for r in fake.requests if r[0] != "GET"]

    def test_spool_inexistente_es_404(self, client, fake):
        assert client.put("/api/spoolman/spools/99/use", data={"use_weight": 5}).status_code == 404

    def test_rechazo_de_spoolman_se_ve_como_error(self, client, fake):
        fake.fail_with = (422, {"message": "peso inválido"})
        response = client.put("/api/spoolman/spools/1/use", data={"use_weight": 5})
        assert response.status_code == 400
        assert "peso inválido" in response.json()["detail"]

    def test_spoolman_caido_es_502(self, client, fake):
        fake.fail_with = (500, {})
        assert client.post("/api/spoolman/backup").status_code == 502

    def test_operador_no_puede_escribir(self, client, fake, as_operator):
        assert client.put("/api/spoolman/spools/1/use", data={"use_weight": 5}).status_code == 403
        assert client.patch("/api/spoolman/spools/1", data={"location": "x"}).status_code == 403
        assert client.post("/api/spoolman/spools", data={"filament_id": 7}).status_code == 403
        assert client.post("/api/spoolman/backup").status_code == 403
        assert not [r for r in fake.requests if r[0] != "GET"]


class TestHerramientasDeIA:
    def _tools(self):
        import sys
        router = sys.modules["backend.api.spoolman"]
        return {t.name: t for t in router.AI_TOOLS}

    def test_contrato(self, client, fake):
        from backend.services.authorization_policy import Action
        tools = self._tools()
        assert set(tools) == {"find_spools", "get_printer_spools"}
        for tool in tools.values():
            assert tool.policy_action == Action.USE_PLUGIN
            assert tool.read_only is True

    def test_find_spools_filtra(self, client, fake):
        result = asyncio.run(self._tools()["find_spools"].handler(material="petg"))
        assert result["count"] == 1
        assert result["spools"][0]["remaining_g"] == 120.0

    def test_find_spools_sin_filtro_devuelve_todo(self, client, fake):
        assert asyncio.run(self._tools()["find_spools"].handler())["count"] == 2

    def test_impresoras(self, client, fake):
        client.post("/api/spoolman/printers/7125/active-spool", data={"spool_id": 1})
        result = asyncio.run(self._tools()["get_printer_spools"].handler())
        assert result["printers"][0]["material"] == "PLA"

    def test_sin_configurar_no_inventa(self, client, as_admin):
        client.delete("/api/spoolman/config")
        assert asyncio.run(self._tools()["find_spools"].handler())["available"] is False
