"""Diagnóstico: ¿Moonraker tiene su propio [spoolman] configurado?

Vincular un carrete en NOPAL (active-spool) solo actualiza qué muestra la
ficha -- quien de verdad resta gramos reales de Spoolman al terminar una
impresión es el componente [spoolman] de Moonraker, configurado aparte en
moonraker.conf. Sin eso, "Peso Usado" nunca cambia aunque se impriman
trabajos reales de verdad, y NOPAL no puede arreglarlo por su cuenta: solo
puede avisar que falta ese paso.
"""

import sys

from backend.services.klipper_service import MoonrakerClient

spool_link_service = sys.modules["backend.services.spoolman_spool_link_service"]


class TestMoonrakerSpoolmanCheck:
    def test_sin_vinculos_no_hay_nada_que_revisar(self, client, as_admin):
        respuesta = client.get("/api/spoolman/moonraker-check")
        assert respuesta.status_code == 200
        assert respuesta.json()["printers"] == []

    def test_detecta_moonraker_sin_spoolman_configurado(self, client, as_admin, monkeypatch):
        spool_link_service.set_link(7125, 3)
        monkeypatch.setattr(
            MoonrakerClient, "get_server_info",
            lambda self: {"components": ["history", "update_manager"]},
        )
        respuesta = client.get("/api/spoolman/moonraker-check").json()
        assert respuesta["printers"] == [
            {"port": 7125, "reachable": True, "moonraker_spoolman_configured": False},
        ]

    def test_detecta_moonraker_con_spoolman_configurado(self, client, as_admin, monkeypatch):
        spool_link_service.set_link(7125, 3)
        monkeypatch.setattr(
            MoonrakerClient, "get_server_info",
            lambda self: {"components": ["history", "spoolman"]},
        )
        respuesta = client.get("/api/spoolman/moonraker-check").json()
        assert respuesta["printers"][0]["moonraker_spoolman_configured"] is True

    def test_moonraker_inalcanzable_no_afirma_nada(self, client, as_admin, monkeypatch):
        """Sin respuesta de Moonraker no se puede decir "sin spoolman" -- eso
        sería inventar un dato que no se pudo comprobar."""
        spool_link_service.set_link(7125, 3)
        monkeypatch.setattr(MoonrakerClient, "get_server_info", lambda self: {})
        respuesta = client.get("/api/spoolman/moonraker-check").json()
        assert respuesta["printers"][0]["reachable"] is False
        assert respuesta["printers"][0]["moonraker_spoolman_configured"] is False
