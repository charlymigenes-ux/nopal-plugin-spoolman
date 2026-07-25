from backend.services.spoolman_spoolman_client import SpoolmanClient

SAMPLE_SPOOL = {
    "id": 41,
    "filament": {
        "id": 1, "material": "PETG", "name": "Negro",
        "vendor": {"id": 1, "name": "eSUN"},
        "density": 1.27, "diameter": 1.75, "weight": 1000, "price": 389,
    },
    "price": 389,
    "remaining_weight": 694,
    "initial_weight": 1000,
    "used_weight": 306,
    "archived": False,
}


def _configure(client, monkeypatch):
    monkeypatch.setattr(SpoolmanClient, "get_info", lambda self: {"version": "x"})
    client.post("/api/spoolman/config", data={"host": "h", "port": 7912})


class TestListSpools:
    def test_requires_config(self, client, as_admin):
        response = client.get("/api/spoolman/spools")
        assert response.status_code == 400

    def test_lists_with_reservation_fields(self, client, as_admin, monkeypatch):
        _configure(client, monkeypatch)
        monkeypatch.setattr(SpoolmanClient, "list_spools", lambda self, allow_archived=False: [dict(SAMPLE_SPOOL)])
        response = client.get("/api/spoolman/spools")
        assert response.status_code == 200
        spool = response.json()["spools"][0]
        assert spool["id"] == 41
        assert spool["reserved_weight"] == 0
        assert spool["available_weight"] == 694

    def test_available_weight_subtracts_active_reservations(self, client, as_admin, monkeypatch):
        _configure(client, monkeypatch)
        monkeypatch.setattr(SpoolmanClient, "list_spools", lambda self, allow_archived=False: [dict(SAMPLE_SPOOL)])
        monkeypatch.setattr(SpoolmanClient, "get_spool", lambda self, spool_id: dict(SAMPLE_SPOOL))
        client.post(
            "/api/spoolman/reservations",
            data={"quote_id": "Q-1", "quote_label": "Pedido 1", "spool_id": 41, "grams": 200},
        )
        response = client.get("/api/spoolman/spools")
        spool = response.json()["spools"][0]
        assert spool["reserved_weight"] == 200
        assert spool["available_weight"] == 494


class TestGetSpool:
    def test_not_found(self, client, as_admin, monkeypatch):
        _configure(client, monkeypatch)
        monkeypatch.setattr(SpoolmanClient, "get_spool", lambda self, spool_id: None)
        response = client.get("/api/spoolman/spools/999")
        assert response.status_code == 404

    def test_found(self, client, as_admin, monkeypatch):
        _configure(client, monkeypatch)
        monkeypatch.setattr(SpoolmanClient, "get_spool", lambda self, spool_id: dict(SAMPLE_SPOOL))
        response = client.get("/api/spoolman/spools/41")
        assert response.status_code == 200
        assert response.json()["available_weight"] == 694
