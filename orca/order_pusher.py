import os
import requests
from dotenv import load_dotenv
from supabase import create_client, Client
from typing import Dict, Any, Optional, Union
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Trello API credentials with defaults for development
TRELLO_KEY = os.getenv('TRELLO_API_KEY')
TRELLO_TOKEN = os.getenv('TRELLO_TOKEN')
BOARD_ID = os.getenv('TRELLO_BOARD_ID', 'default_board_id')
LIST_ID = os.getenv('TRELLO_LIST_ID', 'default_list_id')

# Supabase credentials
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_KEY')

# Initialize Supabase client if credentials are available
supabase: Optional[Client] = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        logger.info("Successfully initialized Supabase client")
    except Exception as e:
        logger.error(f"Failed to initialize Supabase client: {str(e)}")
else:
    logger.warning("Supabase credentials not found in environment variables")

def create_trello_card(order_id: str, product: Dict[str, Any]) -> bool:
    """Create a Trello card for a specific product from an order"""
    try:
        if not all([TRELLO_KEY, TRELLO_TOKEN]):
            logger.error("Missing Trello credentials")
            return False

        logger.info(f"Creating Trello card for order {order_id} and product {product.get('name')}")
        
        # Fetch the order details
        if not supabase:
            logger.error("Supabase client not initialized")
            return False
            
        response = supabase.from_('emails').select('*').eq('id', order_id).is_('deleted_at', None).execute()
        if not response.data:
            logger.error(f"Email {order_id} not found in database")
            return False
            
        order = response.data[0]
        logger.info(f"Found email in database: {order['subject']}")
        
        # Use sender_name or sender_email for display
        sender_display = order.get('sender_name') or order.get('sender_email', 'Unknown')
        
        url = f'https://api.trello.com/1/cards'
        headers = {
            'Accept': 'application/json'
        }
        query = {
            'key': TRELLO_KEY,
            'token': TRELLO_TOKEN,
            'idList': LIST_ID,
            'name': f"Order: {product.get('name', 'Unknown')} - {product.get('delivery_date', 'No date')}",
            'desc': f"""
            Order from: {sender_display}
            Product: {product.get('name', 'Unknown')}
            Quantity: {product.get('quantity', 0)} {product.get('unit', '')}
            Delivery Date: {product.get('delivery_date', 'No date')}
            
            Original Email Subject: {order.get('subject', 'No subject')}
            Order Created: {order.get('created_at', 'Unknown')}
            """
        }
        
        logger.info("Sending request to Trello API")
        response = requests.post(url, headers=headers, params=query)
        logger.info(f"Trello API response status: {response.status_code}")
        
        if response.status_code == 200:
            logger.info('Card created successfully in Trello')
            return True
        else:
            logger.error(f'Failed to create card in Trello. Response: {response.text}')
            return False
    except Exception as e:
        logger.error(f"Error creating Trello card: {str(e)}", exc_info=True)
        return False

def update_product_sent_status(product: Dict[str, Any], sent: bool = True) -> bool:
    """Update the sent status of a specific product using order_line_id"""
    try:
        if not supabase:
            logger.error("Supabase client not initialized")
            return False
            
        order_line_id = product.get('order_line_id')
        if not order_line_id:
            logger.error("No order_line_id provided in product data")
            logger.error(f"Product data received: {product}")
            logger.error("Available product keys: %s", list(product.keys()))
            return False
            
        logger.info(f"Updating export status for order_line_id {order_line_id} to {sent}")
        
        # First, verify the order line exists
        check_response = supabase.table('order_lines').select('id, product_name, is_exported').eq('id', order_line_id).is_('deleted_at', None).execute()
        
        if not check_response.data:
            logger.error(f"Order line with id {order_line_id} not found in database")
            return False
            
        existing_line = check_response.data[0]
        logger.info(f"Found order line: {existing_line['product_name']} (current exported status: {existing_line['is_exported']})")
        
        # Update the is_exported status directly using order_line_id
        update_response = supabase.table('order_lines').update({
            'is_exported': sent
        }).eq('id', order_line_id).execute()
        
        logger.info(f"Update response: {update_response}")
        
        if update_response.data and len(update_response.data) > 0:
            updated_line = update_response.data[0]
            logger.info(f"Successfully updated order_line {order_line_id} exported status from {existing_line['is_exported']} to {updated_line['is_exported']}")
            return True
        else:
            logger.error(f"Update succeeded but no data returned for order line {order_line_id}")
            logger.error(f"Update response: {update_response}")
            return False
            
    except Exception as e:
        logger.error(f"Error updating product export status: {e}", exc_info=True)
        return False 