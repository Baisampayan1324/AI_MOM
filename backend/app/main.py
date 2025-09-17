from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import router as api_router
from app.api.websocket import router as websocket_router

app = FastAPI(
    title="Meeting Minutes Real-time System",
    description="A system for real-time transcription and summarization of meeting audio",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(api_router, prefix="/api", tags=["api"])
app.include_router(websocket_router, tags=["websocket"])

@app.get("/")
async def root():
    return {"message": "Meeting Minutes Real-time System API"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}