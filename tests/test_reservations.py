from backend.services.spoolman_spoolman_client import SpoolmanClient

SAMPLE_SPOOL = {
    "id": 41,
    "filament": {"id": 1, "material": "PETG", "name": "Negro", "vendor": {"id": 1, "name": "eSUN"}, "density": 1.27, "diameter": 1.75, "weight": 1000, "price": 389},
    "price": 389,
    "remaining_weight": 214,
    "initial_weight": 1000,
    "used_weight": 786,
    "archived": False,
}


def _configure(client, monkeypatch, spool=None):
    monkeypatch.setattr(SpoolmanClient, "get_info", lambda self: {"version": "x"})
    monkeypatch.setattr(SpoolmanClient, "get_spool", lambda self, spool_id: dict(spool or SAMPLE_SPOOL))
    client.post("/api/spoolman/config", data={"host": "h", "port": 7912})


class TestCreateReservation:
    def test_creates_when_within_available(self, client, as_admin, monkeypatch):
        _configure(client, monkeypatch)
        response = client.post(
            "/api/spoolman/reservations",
            data={"quote_id": "Q-1", "quote_label": "Caja ESP32", "spool_id": 41, "grams": 180},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["grams"] == 180
        assert body["quote_label"] == "Caja ESP32"

    def test_rejects_when_exceeds_available(self, client, as_admin, monkeypatch):
        # El caso del mockup: 286g pedidos, solo 214g en el spool.
        _configure(client, monkeypatch)
        response = client.post(
            "/api/spoolman/reservations",
            data={"quote_id": "Q-1", "quote_label": "Caja Nopal", "spool_id": 41, "grams": 286},
        )
        assert response.status_code == 400

    def test_rejects_unknown_spool(self, client, as_admin, monkeypatch):
        monkeypatch.setattr(SpoolmanClient, "get_info", lambda self: {"version": "x"})
        monkeypatch.setattr(SpoolmanClient, "get_spool", lambda self, spool_id: None)
        client.post("/api/spoolman/config", data={"host": "h", "port": 7912})
        response = client.post(
            "/api/spoolman/reservations",
            data={"quote_id": "Q-1", "quote_label": "X", "spool_id": 999, "grams": 10},
        )
        assert response.status_code == 404

    def test_requires_admin(self, client, as_operator):
        response = client.post(
            "/api/spoolman/reservations",
            data={"quote_id": "Q-1", "quote_label": "X", "spool_id": 41, "grams": 10},
        )
        assert response.status_code == 403


class TestDeleteReservation:
    def test_deletes_existing(self, client, as_admin, monkeypatch):
        _configure(client, monkeypatch)
        created = client.post(
            "/api/spoolman/reservations",
            data={"quote_id": "Q-1", "quote_label": "X", "spool_id": 41, "grams": 50},
        ).json()
        response = client.delete(f"/api/spoolman/reservations/{created['id']}")
        assert response.status_code == 200
        assert client.get("/api/spoolman/reservations").json()["reservations"] == []

    def test_not_found(self, client, as_admin):
        response = client.delete("/api/spoolman/reservations/does-not-exist")
        assert response.status_code == 404
