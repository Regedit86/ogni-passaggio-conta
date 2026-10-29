"""Server locale per provare il sito: come `python -m http.server`, ma dice al
browser di non tenere in cache i file, così ogni modifica si vede subito.

Uso, dalla cartella del progetto:  python scripts/server.py  (poi http://localhost:8080)
"""
import functools
import http.server
from pathlib import Path

RADICE = Path(__file__).resolve().parent.parent
PORTA = 8080


class SenzaCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    gestore = functools.partial(SenzaCache, directory=str(RADICE))
    with http.server.ThreadingHTTPServer(("127.0.0.1", PORTA), gestore) as server:
        print(f"Sito su http://localhost:{PORTA} (Ctrl+C per fermare)")
        server.serve_forever()
