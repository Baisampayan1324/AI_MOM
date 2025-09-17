"""
Simple HTTP Server for Testing
Run this script to serve your frontend files on localhost
"""

import http.server
import socketserver
import os

# Set the port
PORT = 8080

# Change to the frontend directory
os.chdir('frontend')

# Create the server
Handler = http.server.SimpleHTTPRequestHandler
Handler.extensions_map.update({
    '.webapp': 'application/x-web-app-manifest+json',
})

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Server running at http://localhost:{PORT}/")
    print("Press Ctrl+C to stop the server")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
