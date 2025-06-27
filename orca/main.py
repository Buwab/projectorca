# main.py
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from order_pusher import create_trello_card, update_product_sent_status
from pydantic import BaseModel
from typing import Dict, Any
import logging

# Add imports for email processing pipeline
from email_parser import process_emails
from llm_parser import process_raw_emails
from import_structured_orders import import_structured_orders

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

@app.post("/process-all")
def process_all_emails():
    """
    Orchestrates the complete email processing pipeline:
    1. Fetch new emails from IMAP
    2. Parse emails with LLM
    3. Import structured data
    """
    try:
        logger.info("Starting email processing pipeline")
        
        # Step 1: Fetch new emails
        logger.info("Step 1: Fetching new emails from IMAP")
        emails_found = 0
        try:
            process_emails()
            # Note: We can't easily get the count without modifying email_parser.py
            # For now, we'll assume some emails were processed
            emails_found = "unknown"  # Could be improved by modifying email_parser.py to return count
        except Exception as e:
            logger.error(f"Error fetching emails: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to fetch emails: {str(e)}")
        
        # Step 2: Parse emails with LLM
        logger.info("Step 2: Parsing emails with LLM")
        parsed_count = 0
        try:
            process_raw_emails()
            # Note: We can't easily get the count without modifying llm_parser.py
            parsed_count = "unknown"  # Could be improved by modifying llm_parser.py to return count
        except Exception as e:
            logger.error(f"Error parsing emails: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to parse emails: {str(e)}")
        
        # Step 3: Import structured data
        logger.info("Step 3: Importing structured order data")
        imported_count = 0
        try:
            import_structured_orders()
            # Note: We can't easily get the count without modifying import_structured_orders.py
            imported_count = "unknown"  # Could be improved by modifying import_structured_orders.py to return count
        except Exception as e:
            logger.error(f"Error importing structured orders: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to import structured orders: {str(e)}")
        
        logger.info("Email processing pipeline completed successfully")
        
        return {
            "status": "success",
            "email": {"emails_found": emails_found},
            "llm": {"parsed": parsed_count}, 
            "import": {"orders_imported": imported_count}
        }
        
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        logger.error(f"Unexpected error in email processing pipeline: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

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
