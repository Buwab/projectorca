#!/usr/bin/env python3
"""
Test script to verify order_line_ids are properly set and accessible.
Run this to debug any issues with the ID matching system.
"""

import os
from dotenv import load_dotenv
from supabase import create_client

# Load environment variables
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

def test_order_line_ids():
    """Test that order_line_ids exist and can be matched properly"""
    
    print("🔍 Testing Order Line ID System")
    print("=" * 50)
    
    # Get some recent orders with parsed data
    orders_response = supabase.table("orders").select("*").eq("llm_processed", True).limit(3).execute()
    
    if not orders_response.data:
        print("❌ No orders found with llm_processed=True")
        return
    
    for order in orders_response.data:
        print(f"\n📧 Testing Order: {order['subject']}")
        print(f"   Email ID: {order['id']}")
        
        # Check if it has structured import
        structured_response = supabase.table("orders_structured").select("*").eq("email_id", order['id']).execute()
        
        if not structured_response.data:
            print("   ⚠️  No structured order found - run import_structured_orders.py first")
            continue
            
        structured_order = structured_response.data[0]
        print(f"   Structured ID: {structured_order['id']}")
        
        # Get order lines
        lines_response = supabase.table("order_lines").select("*").eq("order_id", structured_order['id']).execute()
        
        if not lines_response.data:
            print("   ❌ No order lines found")
            continue
            
        print(f"   📦 Found {len(lines_response.data)} order lines:")
        
        for i, line in enumerate(lines_response.data):
            print(f"      {i+1}. ID: {line['id']}")
            print(f"         Product: {line['product_name']}")
            print(f"         Quantity: {line['quantity']} {line['unit']}")
            print(f"         Exported: {line['is_exported']}")
        
        # Check if parsed data has products
        if order.get('parsed_data') and order['parsed_data'].get('products'):
            products = order['parsed_data']['products']
            print(f"   🎯 JSON has {len(products)} products:")
            
            for i, product in enumerate(products):
                print(f"      {i+1}. {product.get('name')} - {product.get('quantity')} {product.get('unit')}")
                
                # Try to find matching order line
                matching_line = None
                for line in lines_response.data:
                    if (line['product_name'] == product.get('name') and 
                        line['quantity'] == product.get('quantity') and 
                        line['unit'] == product.get('unit')):
                        matching_line = line
                        break
                
                if matching_line:
                    print(f"         ✅ Matches order_line_id: {matching_line['id']}")
                else:
                    print(f"         ❌ No matching order line found!")
        else:
            print("   ⚠️  No products in parsed_data")

def test_update_functionality():
    """Test the update functionality with a real order line"""
    
    print("\n\n🔧 Testing Update Functionality")
    print("=" * 50)
    
    # Get a random order line that's not exported
    lines_response = supabase.table("order_lines").select("*").eq("is_exported", False).limit(1).execute()
    
    if not lines_response.data:
        print("❌ No unexported order lines found to test with")
        return
    
    test_line = lines_response.data[0]
    print(f"📦 Testing with order line: {test_line['id']}")
    print(f"   Product: {test_line['product_name']}")
    print(f"   Current exported status: {test_line['is_exported']}")
    
    # Test the update function
    from order_pusher import update_product_sent_status
    
    # Create a mock product with the order_line_id
    mock_product = {
        'order_line_id': test_line['id'],
        'name': test_line['product_name'],
        'quantity': test_line['quantity'],
        'unit': test_line['unit']
    }
    
    print(f"\n🔄 Testing update to exported=True...")
    success = update_product_sent_status(mock_product, True)
    
    if success:
        print("✅ Update succeeded!")
        
        # Verify the update
        check_response = supabase.table("order_lines").select("is_exported").eq("id", test_line['id']).execute()
        if check_response.data and check_response.data[0]['is_exported']:
            print("✅ Database verification: is_exported = True")
        else:
            print("❌ Database verification failed")
    else:
        print("❌ Update failed!")
    
    # Reset it back
    print(f"\n🔄 Resetting back to exported=False...")
    reset_success = update_product_sent_status(mock_product, False)
    
    if reset_success:
        print("✅ Reset succeeded!")
    else:
        print("❌ Reset failed!")

if __name__ == "__main__":
    test_order_line_ids()
    test_update_functionality()
    print("\n🎯 Test completed!") 