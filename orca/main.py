# main.py
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from order_pusher import create_trello_card, update_product_sent_status
from pydantic import BaseModel
from typing import Dict, Any
import logging

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
        logger.info(f"Product data: {request.product}")
        
        # Validate that we have an order_line_id
        if not request.product.get('order_line_id'):
            error_msg = "Product is missing order_line_id. This usually means the order hasn't been properly imported into the structured tables."
            logger.error(error_msg)
            logger.error(f"Product data received: {request.product}")
            raise HTTPException(status_code=400, detail=error_msg)
        
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
            raise HTTPException(status_code=500, detail="Failed to update sent status in database")
            
        logger.info("Successfully processed Trello request")
        return {"status": "success", "message": "Order sent to Trello successfully"}
        
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        logger.error(f"Error processing Trello request: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
