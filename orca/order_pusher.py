import os
import requests
from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment variables
load_dotenv()

# Trello API credentials
TRELLO_KEY = os.getenv('TRELLO_API_KEY')
TRELLO_TOKEN = os.getenv('TRELLO_TOKEN')
BOARD_ID = os.getenv('TRELLO_BOARD_ID')
LIST_ID = os.getenv('TRELLO_LIST_ID')

# Hardcoded order_lines.id
ORDER_LINE_ID = '71874245-d3f2-420e-8128-811e027a497e'  # Replace with actual ID for testing

# Supabase credentials
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_KEY')

# Ensure Supabase credentials are set
if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Supabase URL and Key must be set in the environment variables.")

# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Function to fetch order data from Supabase
def fetch_order_data(order_line_id):
    response = supabase.from_('order_lines').select(
        'id, product_name, quantity, unit, delivery_date, orders_structured(customer_name, order_date, special_notes)'
    ).eq('id', order_line_id).execute()

    print(response.data)  # Debugging line to check fetched data

    if response.data:
        return response.data[0]
    else:
        return None

# Function to create a Trello card
def create_trello_card(order_data):
    print(f"Trello Key: {TRELLO_KEY}")  # Debugging line
    print(f"Trello Token: {TRELLO_TOKEN}")  # Debugging line

    customer_name = order_data['orders_structured'].get('customer_name', 'Unknown Customer')
    product_name = order_data.get('product_name', 'Unknown Product')

    url = f'https://api.trello.com/1/cards'
    headers = {
        'Accept': 'application/json'
    }
    query = {
        'key': TRELLO_KEY,
        'token': TRELLO_TOKEN,
        'idList': LIST_ID,
        'name': f"Order {customer_name} {product_name}",
        'desc': f"""
        Order ID: {order_data['id']}
        Product Name: {order_data['product_name']}
        Quantity: {order_data['quantity']} {order_data['unit']}
        Delivery Date: {order_data['delivery_date']}
        Customer Name: {customer_name}
        Order Date: {order_data['orders_structured']['order_date']}
        Special Notes: {order_data['orders_structured']['special_notes']}
        """
    }
    response = requests.post(url, headers=headers, params=query)
    if response.status_code == 200:
        print('Card created successfully!')
    else:
        print('Failed to create card:', response.text)

# Main function
def main():
    order_data = fetch_order_data(ORDER_LINE_ID)
    create_trello_card(order_data)

if __name__ == '__main__':
    main() 