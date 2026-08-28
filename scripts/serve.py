#!/usr/bin/env python3
"""Local dev server for Nepal Flood Help static site."""

import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

os.chdir(ROOT)

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

print(f"Serving at http://localhost:{PORT}")
print("Press Ctrl+C to stop")
http.server.HTTPServer(("", PORT), Handler).serve_forever()
