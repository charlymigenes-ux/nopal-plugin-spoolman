from backend.services.spoolman_spoolman_client import SpoolmanClient


class TestGetConfig:
    def test_not_configured_by_default(self, client, as_admin):
        response = client.get("/api/spoolman/config")
        assert response.status_code == 200
        body = response.json()
        assert body["configured"] is False
        assert body["connected"] is False


class TestSaveConfig:
    def test_saves_when_reachable(self, client, as_admin, monkeypatch):
        monkeypatch.setattr(SpoolmanClient, "get_info", lambda self: {"version": "0.20.0"})
        response = client.post("/api/spoolman/config", data={"host": "192.168.1.50", "port": 7912})
        assert response.status_code == 200
        body = response.json()
        assert body["configured"] is True
        assert body["connected"] is True
        assert body["host"] == "192.168.1.50"
        assert body["port"] == 7912

    def test_rejects_unreachable_host(self, client, as_admin, monkeypatch):
        monkeypatch.setattr(SpoolmanClient, "get_info", lambda self: None)
        response = client.post("/api/spoolman/config", data={"host": "10.0.0.1", "port": 7912})
        assert response.status_code == 400
        assert client.get("/api/spoolman/config").json()["configured"] is False

    def test_requires_admin(self, client, as_operator, monkeypatch):
        monkeypatch.setattr(SpoolmanClient, "get_info", lambda self: {"version": "x"})
        response = client.post("/api/spoolman/config", data={"host": "h", "port": 7912})
        assert response.status_code == 403


class TestDeleteConfig:
    def test_clears_saved_config(self, client, as_admin, monkeypatch):
        monkeypatch.setattr(SpoolmanClient, "get_info", lambda self: {"version": "x"})
        client.post("/api/spoolman/config", data={"host": "h", "port": 7912})
        response = client.delete("/api/spoolman/config")
        assert response.status_code == 200
        assert client.get("/api/spoolman/config").json()["configured"] is False

    def test_requires_admin(self, client, as_operator):
        response = client.delete("/api/spoolman/config")
        assert response.status_code == 403
