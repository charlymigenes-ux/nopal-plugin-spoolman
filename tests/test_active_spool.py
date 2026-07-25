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
