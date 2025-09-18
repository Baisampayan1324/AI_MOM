import uvicorn
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

if __name__ == "__main__":
    host = os.getenv("HOST", "localhost")
    port = int(os.getenv("PORT", 8000))
    
    uvicorn.run(
        "app.main:app",
        host=host,
        port=port,
        reload=True,  # Enable auto-reload during development
        log_level="info",
        ws="websockets",  # Explicitly specify WebSocket implementation
        ws_ping_interval=20,  # Ping interval in seconds
        ws_ping_timeout=20,   # Ping timeout in seconds
    )