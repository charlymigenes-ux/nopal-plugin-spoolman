from backend.services.klipper_service import MoonrakerClient
from backend.services.spoolman_spoolman_client import SpoolmanClient

SAMPLE_SPOOL = {
    "id": 17,
    "filament": {"id": 2, "material": "PLA", "name": "Blanco", "vendor": {"id": 2, "name": "SUNLU"}, "density": 1.24, "diameter": 1.75, "weight": 1000, "price": 320},
    "price": 320,
    "remaining_weight": 812,
    "initial_weight": 1000,
    "used_weight": 188,
    "archived": False,
}


def _configure(client, monkeypatch):
    monkeypatch.setattr(SpoolmanClient, "get_info", lambda self: {"version": "x"})
    monkeypatch.setattr(SpoolmanClient, "get_spool", lambda self, spool_id: dict(SAMPLE_SPOOL))
    client.post("/api/spoolman/config", data={"host": "h", "port": 7912})


class TestActiveSpool:
    def test_no_link_by_default(self, client, as_admin, monkeypatch):
        _configure(client, monkeypatch)
        response = client.get("/api/spoolman/printers/7125/active-spool")
        assert response.status_code == 200
        assert response.json() == {"linked": False, "spool": None}

    def test_assign_and_read_back(self, client, as_admin, monkeypatch):
        _configure(client, monkeypatch)
        assign = client.post("/api/spoolman/printers/7125/active-spool", data={"spool_id": 17})
        assert assign.status_code == 200

        response = client.get("/api/spoolman/printers/7125/active-spool")
        body = response.json()
        assert body["linked"] is True
        assert body["spool_id"] == 17
        assert body["spool"]["id"] == 17

    def test_assign_sincroniza_con_moonraker_si_responde(self, client, as_admin, monkeypatch):
        """El fixture no_real_moonraker_calls (conftest) hace que esto
        devuelva False por default -- acá se pisa esa vez para probar el
        camino en que Moonraker sí tiene [spoolman] configurado."""
        _configure(client, monkeypatch)
        vistos = []
        monkeypatch.setattr(MoonrakerClient, "set_spoolman_active_spool",
                             lambda self, spool_id: vistos.append((self.port, spool_id)) or True)
        respuesta = client.post("/api/spoolman/printers/7125/active-spool", data={"spool_id": 17})
        assert respuesta.status_code == 200
        assert respuesta.json()["moonraker_synced"] is True
        assert vistos == [(7125, 17)]

    def test_assign_sin_moonraker_configurado_igual_guarda_el_vinculo(self, client, as_admin, monkeypatch):
        """El fixture no_real_moonraker_calls ya simula esto por default:
        Moonraker sin [spoolman] no debe romper la asignación en NOPAL."""
        _configure(client, monkeypatch)
        respuesta = client.post("/api/spoolman/printers/7125/active-spool", data={"spool_id": 17})
        assert respuesta.status_code == 200
        assert respuesta.json()["moonraker_synced"] is False
        assert client.get("/api/spoolman/printers/7125/active-spool").json()["linked"] is True

    def test_clear_reporta_si_sincronizo_con_moonraker(self, client, as_admin, monkeypatch):
        _configure(client, monkeypatch)
        client.post("/api/spoolman/printers/7125/active-spool", data={"spool_id": 17})
        monkeypatch.setattr(MoonrakerClient, "set_spoolman_active_spool", lambda self, spool_id: True)
        respuesta = client.delete("/api/spoolman/printers/7125/active-spool")
        assert respuesta.status_code == 200
        assert respuesta.json()["moonraker_synced"] is True

    def test_assign_unknown_spool_rejected(self, client, as_admin, monkeypatch):
        monkeypatch.setattr(SpoolmanClient, "get_info", lambda self: {"version": "x"})
        monkeypatch.setattr(SpoolmanClient, "get_spool", lambda self, spool_id: None)
        client.post("/api/spoolman/config", data={"host": "h", "port": 7912})
        response = client.post("/api/spoolman/printers/7125/active-spool", data={"spool_id": 999})
        assert response.status_code == 404

    def test_clear_link(self, client, as_admin, monkeypatch):
        _configure(client, monkeypatch)
        client.post("/api/spoolman/printers/7125/active-spool", data={"spool_id": 17})
        response = client.delete("/api/spoolman/printers/7125/active-spool")
        assert response.status_code == 200
        assert client.get("/api/spoolman/printers/7125/active-spool").json()["linked"] is False

    def test_clear_link_not_found(self, client, as_admin):
        response = client.delete("/api/spoolman/printers/9999/active-spool")
        assert response.status_code == 404

    def test_bulk_links_endpoint(self, client, as_admin, monkeypatch):
        _configure(client, monkeypatch)
        client.post("/api/spoolman/printers/7125/active-spool", data={"spool_id": 17})
        response = client.get("/api/spoolman/printers/active-spools")
        assert response.status_code == 200
        assert "7125" in response.json()["links"]

    def test_write_endpoints_require_admin(self, client, as_operator):
        response = client.post("/api/spoolman/printers/7125/active-spool", data={"spool_id": 17})
        assert response.status_code == 403


class TestMaterialResuelto:
    """El panel muestra qué material tiene cargado cada impresora. Resolverlo
    de una sola pasada evita una consulta a Spoolman por máquina solo para
    pintar una línea de texto en la ficha."""

    def test_resuelve_material_color_y_restante(self, client, as_admin, monkeypatch):
        _configure(client, monkeypatch)
        monkeypatch.setattr(SpoolmanClient, "list_spools",
                            lambda self, allow_archived=False: [dict(SAMPLE_SPOOL)])
        client.post("/api/spoolman/printers/7125/active-spool", data={"spool_id": 17})

        entrada = client.get("/api/spoolman/printers/active-spools?resolve=true").json()["links"]["7125"]
        assert entrada["label"] == "Blanco"      # el nombre comercial es lo que se reconoce
        assert entrada["material"] == "PLA"
        assert entrada["vendor"] == "SUNLU"
        assert entrada["diameter"] == 1.75
        assert entrada["remaining_weight"] == 812

    def test_resuelve_filamento_multicolor(self, client, as_admin, monkeypatch):
        """Un filamento multicolor no tiene color_hex (queda None) -- sus
        colores viven en multi_color_hexes, separados por comas."""
        multicolor_spool = {
            "id": 9,
            "filament": {
                "id": 5, "material": "PLA", "name": " VER/AMA",
                "vendor": {"id": 1, "name": "KINGROOM "},
                "density": 1.5, "diameter": 1.75, "weight": 980,
                "color_hex": None,
                "multi_color_hexes": "37c53e,f2dd1d",
                "multi_color_direction": "coaxial",
            },
            "remaining_weight": 980, "initial_weight": 980, "used_weight": 0, "archived": False,
        }
        _configure(client, monkeypatch)
        monkeypatch.setattr(SpoolmanClient, "list_spools",
                            lambda self, allow_archived=False: [multicolor_spool])
        client.post("/api/spoolman/printers/7125/active-spool", data={"spool_id": 9})

        entrada = client.get("/api/spoolman/printers/active-spools?resolve=true").json()["links"]["7125"]
        assert entrada["color_hex"] is None
        assert entrada["multi_color_hexes"] == ["37c53e", "f2dd1d"]
        assert entrada["multi_color_direction"] == "coaxial"

    def test_sin_resolve_devuelve_solo_el_vinculo(self, client, as_admin, monkeypatch):
        """El comportamiento anterior no cambia para quien ya lo usaba."""
        _configure(client, monkeypatch)
        client.post("/api/spoolman/printers/7125/active-spool", data={"spool_id": 17})
        entrada = client.get("/api/spoolman/printers/active-spools").json()["links"]["7125"]
        assert entrada["spool_id"] == 17
        assert "material" not in entrada

    def test_si_spoolman_no_responde_no_se_rompe_la_ficha(self, client, as_admin, monkeypatch):
        """Quedarse sin el dato del material es muy distinto a quedarse sin
        ficha: se devuelven los vínculos igual."""
        _configure(client, monkeypatch)
        client.post("/api/spoolman/printers/7125/active-spool", data={"spool_id": 17})

        def _cae(self, allow_archived=False):
            raise RuntimeError("Spoolman no responde")

        monkeypatch.setattr(SpoolmanClient, "list_spools", _cae)
        respuesta = client.get("/api/spoolman/printers/active-spools?resolve=true")
        assert respuesta.status_code == 200
        assert respuesta.json()["links"]["7125"]["spool_id"] == 17
