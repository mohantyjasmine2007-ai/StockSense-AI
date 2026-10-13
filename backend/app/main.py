from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.api.health import router as health_router
from app.api.data_routes import router as data_router
from app.api.signals_routes import router as signals_router
from app.api.forecast_routes import router as forecast_router
from app.api.rebalance_routes import router as rebalance_router

app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="AI Demand Forecasting and Inventory Re-balancing Engine",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins for local hackathon development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(health_router, prefix="/api")
app.include_router(data_router, prefix="/api")
app.include_router(signals_router, prefix="/api")
app.include_router(forecast_router, prefix="/api")
app.include_router(rebalance_router, prefix="/api")

@app.get("/")
def root():
    return {
        "app": settings.app_name,
        "version": "1.0.0",
        "status": "online",
        "docs": "/docs",
        "api_health": "/api/health"
    }
