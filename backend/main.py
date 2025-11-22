from fastapi import FastAPI, UploadFile, File, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import io
import json
from typing import List, Dict
from backend.core.backtester import Backtester
from backend.models.schemas import BacktestReport

app = FastAPI(title="Stock Screener Backtester Pro")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # For dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "Stock Screener Backtester Pro API is running"}

@app.websocket("/ws/backtest")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        # Receive file content as bytes
        data = await websocket.receive_bytes()
        
        # We assume the client sends the file bytes directly
        try:
            df = pd.read_csv(io.BytesIO(data))
        except:
            try:
                df = pd.read_excel(io.BytesIO(data))
            except:
                await websocket.send_json({"type": "error", "message": "Invalid file format"})
                return

        # Normalize headers
        df.columns = [c.strip() for c in df.columns]
        signals = df.to_dict(orient="records")
        
        # Progress callback
        async def on_progress(current, total, symbol):
            await websocket.send_json({
                "type": "progress",
                "current": current,
                "total": total,
                "symbol": symbol
            })

        # Run Backtest
        report = await Backtester.run_backtest_async(signals, on_progress)
        
        # Send final report
        await websocket.send_json({
            "type": "complete",
            "report": report.dict()
        })
        
    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        import traceback
        traceback.print_exc()
        await websocket.send_json({"type": "error", "message": str(e)})

@app.post("/api/backtest", response_model=BacktestReport)
async def run_backtest_endpoint(file: UploadFile = File(...)):
    # Keep this for compatibility or non-WS clients
    try:
        contents = await file.read()
        
        if file.filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(contents))
        elif file.filename.endswith(('.xls', '.xlsx')):
            df = pd.read_excel(io.BytesIO(contents))
        else:
            raise HTTPException(status_code=400, detail="Invalid file format. Please upload CSV or Excel.")
            
        df.columns = [c.strip() for c in df.columns]
        signals = df.to_dict(orient="records")
        
        # Run Backtest (no progress callback for HTTP)
        report = await Backtester.run_backtest_async(signals)
        
        return report
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
