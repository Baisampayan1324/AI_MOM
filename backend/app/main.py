from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import time
import logging
from app.api.routes import router as api_router
from app.api.websocket import router as websocket_router

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize rate limiter
limiter = Limiter(key_func=get_remote_address)
app = FastAPI(
    title="Meeting Minutes Real-time System",
    description="A system for real-time transcription and summarization of meeting audio",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json"
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Add CORS middleware with WebSocket support
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_origin_regex="https?://.*",  # Allow WebSocket connections from any origin
)

# Add request/response logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    
    # Log request
    logger.info(f"Request: {request.method} {request.url} from {request.client.host}")
    
    # Process request
    response = await call_next(request)
    
    # Log response
    process_time = time.time() - start_time
    logger.info(f"Response: {response.status_code} for {request.method} {request.url} in {process_time:.4f}s")
    
    return response

# Include routers
app.include_router(api_router, prefix="/api", tags=["api"])
app.include_router(websocket_router, tags=["websocket"])

@app.get("/")
async def root():
    return {"message": "Meeting Minutes Real-time System API"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

@app.get("/health/detailed")
async def detailed_health_check():
    """Detailed health check endpoint for individual services."""
    import psutil
    import torch
    
    health_status = {
        "status": "healthy",
        "services": {
            "api": "healthy",
            "whisper_model": "healthy",
            "groq_api": "unknown",
            "database": "not_implemented",
            "websocket": "healthy"
        },
        "system": {
            "cpu_percent": psutil.cpu_percent(),
            "memory_percent": psutil.virtual_memory().percent,
            "disk_usage": psutil.disk_usage("/").percent
        },
        "gpu": {
            "available": torch.cuda.is_available(),
            "device_count": torch.cuda.device_count() if torch.cuda.is_available() else 0
        }
    }
    
    # Check Groq API if key is available
    try:
        from app.services.optimized_audio_processor import audio_processor
        if hasattr(audio_processor, 'model') and audio_processor.model is not None:
            health_status["services"]["whisper_model"] = "healthy"
        else:
            health_status["services"]["whisper_model"] = "degraded"
            health_status["status"] = "degraded"
    except Exception as e:
        health_status["services"]["whisper_model"] = f"error: {str(e)}"
        health_status["status"] = "degraded"
    
    return health_status

# Custom OpenAPI schema
def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    openapi_schema = get_openapi(
        title="Meeting Minutes Real-time System API",
        version="1.0.0",
        description="This is a REST API for real-time transcription and summarization of meeting audio.",
        routes=app.routes,
    )
    openapi_schema["info"]["x-logo"] = {
        "url": "https://fastapi.tiangolo.com/img/logo-margin/logo-teal.png"
    }
    app.openapi_schema = openapi_schema
    return app.openapi_schema

app.openapi = custom_openapi