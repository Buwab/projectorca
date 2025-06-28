# main.py
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from order_pusher import create_trello_card, update_product_sent_status
from pydantic import BaseModel
from typing import Dict, Any
import logging
from email_parser import run as run_email_parser
from llm_parser import run as run_llm_parser
from import_structured_orders import run as run_import_orders

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# 🛡️ CORS: More specific configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for now to fix the CORS issue
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"message": "API is running."}

@app.post("/process-all")
def process_all():
    try:
        email_result = run_email_parser()         # bijv. {"emails_found": 2}
        llm_result = run_llm_parser()             # bijv. {"parsed": 2}
        import_result = run_import_orders()       # bijv. {"orders_imported": 2}

        return {
            "status": "done",
            "email": email_result,
            "llm": llm_result,
            "import": import_result
        }

    except Exception as e:
        return {"status": "error", "message": str(e)}


class SendOrderRequest(BaseModel):
    order_id: str
    product: Dict[str, Any]
    product_index: int

@app.get("/")
def root():
    return {"message": "API is running."}

@app.post("/send-to-trello")
def send_to_trello(request: SendOrderRequest):
    try:
        logger.info(f"Received request to send order {request.order_id} to Trello")
        
        # Create the Trello card
        logger.info("Attempting to create Trello card")
        card_created = create_trello_card(request.order_id, request.product)
        if not card_created:
            logger.error("Failed to create Trello card")
            raise HTTPException(status_code=500, detail="Failed to create Trello card")
            
        # Update the sent status in the database
        logger.info("Attempting to update product sent status")
        logger.info(f"Product data being sent to update function: {request.product}")
        status_updated = update_product_sent_status(request.product)
        if not status_updated:
            logger.error("Failed to update sent status")
            raise HTTPException(status_code=500, detail="Failed to update sent status")
            
        logger.info("Successfully processed Trello request")
        return {"status": "success", "message": "Order sent to Trello successfully"}
        
    except Exception as e:
        logger.error(f"Error processing Trello request: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))