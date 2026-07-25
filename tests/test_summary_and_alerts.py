from backend.services.spoolman_spoolman_client import SpoolmanClient

LOW_SPOOL = {
    "id": 1,
    "filament": {"id": 1, "material": "PETG", "name": "Negro", "vendor": {"id": 1, "name": "eSUN"}, "density": 1.27, "diameter": 1.75, "weight": 1000, "price": 389},
    "price": 389, "remaining_weight": 180, "initial_weight": 1000, "used_weight": 820, "archived": False,
}
OK_SPOOL = {
    "id": 2,
    "filament": {"id": 2, "material": "PLA", "name": "Blanco", "vendor": {"id": 2, "name": "SUNLU"}, "density": 1.24, "diameter": 1.75, "weight": 1000, "price": 320},
    "price": 320, "remaining_weight": 812, "initial_weight": 1000, "used_weight": 188, "archived": False,
}


def _configure(client, monkeypatch, spools):
    monkeypatch.setattr(SpoolmanClient, "get_info", lambda self: {"version": "x"})
    monkeypatch.setattr(SpoolmanClient, "list_spools", lambda self, allow_archived=False: [dict(s) for s in spools])
    monkeypatch.setattr(SpoolmanClient, "get_spool", lambda self, spool_id: next((dict(s) for s in spools if s["id"] == spool_id), None))
    client.post("/api/spoolman/config", data={"host": "h", "port": 7912})


class TestSummary:
    def test_requires_config(self, client, as_admin):
        response = client.get("/api/spoolman/summary")
        assert response.status_code == 400

    def test_computes_totals(self, client, as_admin, monkeypatch):
        _configure(client, monkeypatch, [LOW_SPOOL, OK_SPOOL])
        response = client.get("/api/spoolman/summary")
        assert response.status_code == 200
        body = response.json()
        assert body["active_spools"] == 2
        assert body["low_stock_count"] == 1
        assert body["available_kg"] == round((180 + 812) / 1000, 2)


class TestAlerts:
    def test_low_stock_alert(self, client, as_admin, monkeypatch):
        _configure(client, monkeypatch, [LOW_SPOOL, OK_SPOOL])
        response = client.get("/api/spoolman/alerts")
        assert response.status_code == 200
        alerts = response.json()["alerts"]
        assert any(a["severity"] == "warning" and "180" in a["message"] for a in alerts)

    def test_deficit_alert_when_reservations_exceed_material(self, client, as_admin, monkeypatch):
        _configure(client, monkeypatch, [LOW_SPOOL])
        # Reserva más PETG del que hay en total (180g) -> déficit.
        response = client.post(
            "/api/spoolman/reservations",
            data={"quote_id": "Q-1", "quote_label": "Pedido grande", "spool_id": 1, "grams": 179},
        )
        assert response.status_code == 200
        alerts = client.get("/api/spoolman/alerts").json()["alerts"]
        # No hay déficit todavía (179 <= 180 remaining), pero sí bajo inventario.
        assert any(a["severity"] == "warning" for a in alerts)
        assert not any(a["severity"] == "error" for a in alerts)


class TestConsumption:
    def test_starts_empty_first_time(self, client, as_admin, monkeypatch):
        """El primer poll de un spool nunca visto establece la línea base
        (sin inventar consumo previo) -- el mes arranca en 0, no un bug."""
        _configure(client, monkeypatch, [OK_SPOOL])
        response = client.get("/api/spoolman/consumption/monthly")
        assert response.status_code == 200
        assert response.json()["by_material"] == {}

    def test_logs_delta_on_second_poll(self, client, as_admin, monkeypatch):
        _configure(client, monkeypatch, [OK_SPOOL])
        client.get("/api/spoolman/consumption/monthly")  # baseline

        used_more = dict(OK_SPOOL)
        used_more["used_weight"] = 250  # +62g desde la línea base (188)
        monkeypatch.setattr(SpoolmanClient, "list_spools", lambda self, allow_archived=False: [used_more])

        response = client.get("/api/spoolman/consumption/monthly")
        assert response.json()["by_material"].get("PLA") == 62
