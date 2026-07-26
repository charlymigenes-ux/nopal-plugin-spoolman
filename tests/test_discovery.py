import sys

discovery_service = sys.modules["backend.services.spoolman_discovery_service"]


class TestDiscoverEndpoint:
    def test_returns_found_instances(self, client, as_admin, monkeypatch):
        async def fake_discover():
            return [{"host": "127.0.0.1", "port": 7912, "info": {"version": "0.20.0"}}]

        monkeypatch.setattr(discovery_service, "discover", fake_discover)
        response = client.get("/api/spoolman/discover")
        assert response.status_code == 200
        assert response.json() == {"instances": [{"host": "127.0.0.1", "port": 7912, "info": {"version": "0.20.0"}}]}

    def test_returns_empty_when_nothing_found(self, client, as_admin, monkeypatch):
        async def fake_discover():
            return []

        monkeypatch.setattr(discovery_service, "discover", fake_discover)
        response = client.get("/api/spoolman/discover")
        assert response.status_code == 200
        assert response.json() == {"instances": []}

    def test_available_to_operator(self, client, as_operator, monkeypatch):
        async def fake_discover():
            return []

        monkeypatch.setattr(discovery_service, "discover", fake_discover)
        response = client.get("/api/spoolman/discover")
        assert response.status_code == 200


class TestProbe:
    def test_probe_returns_none_when_unreachable(self, monkeypatch):
        from backend.services.spoolman_spoolman_client import SpoolmanClient

        monkeypatch.setattr(SpoolmanClient, "get_info", lambda self: None)
        assert discovery_service._probe("10.0.0.1", 7912, timeout=0.1) is None

    def test_probe_returns_entry_when_reachable(self, monkeypatch):
        from backend.services.spoolman_spoolman_client import SpoolmanClient

        monkeypatch.setattr(SpoolmanClient, "get_info", lambda self: {"version": "0.20.0"})
        result = discovery_service._probe("10.0.0.1", 7912, timeout=0.1)
        assert result == {"host": "10.0.0.1", "port": 7912, "info": {"version": "0.20.0"}}
