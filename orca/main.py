from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Dict, Any
import logging

from order_pusher import create_trello_card, update_product_sent_status
from email_parser import run as run_email_parser
from llm_parser import run as run_llm_parser
from import_structured_orders import run as run_import_orders
from supabase_client import supabase
from get_clients import get_clients

# 🔧 Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# 🛡️ CORS config — allow everything for now (dev)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 🩵 Health check
@app.get("/")
def root():
    return {"message": "API is running."}

# 📥 Process all emails
@app.post("/process-all")
def process_all():
    try:
        email_result = run_email_parser()
        llm_result = run_llm_parser()
        import_result = run_import_orders()

        return {
            "status": "done",
            "email": email_result,
            "llm": llm_result,
            "import": import_result
        }

    except Exception as e:
        logger.error(f"❌ Error in /process-all: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"status": "error", "message": str(e)}
        )

# 📤 Trello export endpoint
class SendOrderRequest(BaseModel):
    order_id: str
    product: Dict[str, Any]
    product_index: int

@app.post("/send-to-trello")
def send_to_trello(request: SendOrderRequest):
    try:
        logger.info(f"📨 Incoming Trello request for order {request.order_id}")

        # 1. Create Trello card
        card_created = create_trello_card(request.order_id, request.product)
        if not card_created:
            logger.error("❌ Failed to create Trello card")
            return JSONResponse(
                status_code=500,
                content={"status": "error", "message": "Failed to create Trello card"}
            )

        # 2. Update Supabase product export status
        status_updated = update_product_sent_status(request.product)
        if not status_updated:
            logger.error("❌ Failed to update export status")
            return JSONResponse(
                status_code=500,
                content={"status": "error", "message": "Failed to update sent status"}
            )

        logger.info("✅ Trello card created & status updated")
        return {"status": "success", "message": "Order sent to Trello successfully"}

    except Exception as e:
        logger.error(f"❌ Exception in /send-to-trello: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"status": "error", "message": str(e)}
        )

@app.get("/clients")
def clients_endpoint():
    return get_clients()