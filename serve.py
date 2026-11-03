#!/usr/bin/env python3
"""
Servidor de desenvolvimento do MinhaIA.

Por que não `python3 -m http.server` puro:
  - módulos ES (.mjs) precisam de MIME text/javascript — em alguns sistemas a
    tabela MIME do Python devolve application/octet-stream e o navegador recusa
    carregar o motor do modelo;
  - cache do navegador atrapalha ao editar (aqui tudo vai com no-store);
  - o preview precisa escutar em 0.0.0.0, não em 127.0.0.1.

Uso:
    python3 serve.py                # porta 5173, escuta em 0.0.0.0
    python3 serve.py --port 8000
"""

import argparse
import http.server
import os
import socketserver

MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".bin": "application/octet-stream",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/plain; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
}


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, **MIME}

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def log_message(self, fmt, *args):
        # log curto: só o essencial
        print(f"{self.address_string()} {fmt % args}", flush=True)


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=int(os.environ.get("PORT", 5173)))
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--dir", default=os.path.dirname(os.path.abspath(__file__)))
    args = ap.parse_args()

    handler = lambda *a, **kw: Handler(*a, directory=args.dir, **kw)  # noqa: E731
    with Server((args.host, args.port), handler) as httpd:
        print(f"MinhaIA em http://localhost:{args.port} (escutando em {args.host})", flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nencerrado")


if __name__ == "__main__":
    main()
