from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, List
import json
import asyncio
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        # Store active connections per meeting
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, meeting_id: str):
        await websocket.accept()
        if meeting_id not in self.active_connections:
            self.active_connections[meeting_id] = []
        self.active_connections[meeting_id].append(websocket)
        logger.info(f"WebSocket connection established for meeting {meeting_id}")

    def disconnect(self, websocket: WebSocket, meeting_id: str):
        if meeting_id in self.active_connections:
            if websocket in self.active_connections[meeting_id]:
                self.active_connections[meeting_id].remove(websocket)
            if not self.active_connections[meeting_id]:
                del self.active_connections[meeting_id]
        logger.info(f"WebSocket connection closed for meeting {meeting_id}")

    async def send_personal_message(self, message: str, websocket: WebSocket):
        try:
            await websocket.send_text(message)
        except Exception as e:
            logger.error(f"Error sending personal message: {e}")

    async def broadcast(self, meeting_id: str, message: dict):
        if meeting_id in self.active_connections:
            # Send to all connections in this meeting
            disconnected = []
            for connection in self.active_connections[meeting_id]:
                try:
                    await connection.send_text(json.dumps(message))
                except Exception as e:
                    logger.error(f"Error sending message to WebSocket: {e}")
                    disconnected.append(connection)
            
            # Remove disconnected clients
            for connection in disconnected:
                if meeting_id in self.active_connections and connection in self.active_connections[meeting_id]:
                    self.active_connections[meeting_id].remove(connection)
            
            # Clean up empty meeting connections
            if meeting_id in self.active_connections and not self.active_connections[meeting_id]:
                del self.active_connections[meeting_id]

# Initialize connection manager
manager = ConnectionManager()

# Create router
router = APIRouter()

@router.websocket("/ws/meeting/{meeting_id}")
async def websocket_endpoint(websocket: WebSocket, meeting_id: str):
    await manager.connect(websocket, meeting_id)
    try:
        while True:
            # Keep the connection alive and process messages
            data = await websocket.receive_text()
            logger.info(f"Received WebSocket message for meeting {meeting_id}: {data}")
            # Echo back for testing
            await manager.send_personal_message(f"Echo: {data}", websocket)
    except WebSocketDisconnect as e:
        logger.info(f"WebSocket disconnected for meeting {meeting_id}: {e}")
        manager.disconnect(websocket, meeting_id)
    except Exception as e:
        logger.error(f"WebSocket error for meeting {meeting_id}: {e}")
        manager.disconnect(websocket, meeting_id)