import os
import json
from dotenv import load_dotenv
from supabase import create_client

# ⬇️ Laad env-variabelen
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

def import_structured_orders():
    # ⬇️ Selecteer orders met LLM output die nog niet zijn geïmporteerd
    response = supabase.table("orders") \
        .select("*") \
        .eq("llm_processed", True) \
        .eq("structured_imported", False) \
        .execute()

    orders = response.data
    print(f"📥 Orders klaar voor import: {len(orders)}")

    imported = 0
    new_orders = []

    for order in orders:
        try:
            email_id = order["id"]
            parsed = order["parsed_data"]

            if not parsed:
                print(f"⚠️ Geen parsed_data bij e-mail: {order['subject']}")
                continue

            # ⬇️ Insert in orders_structured
            order_structured_data = {
                "email_id": email_id,
                "order_number": parsed.get("order_number"),
                "customer_name": parsed.get("customer_name"),
                "order_date": parsed.get("order_date"),
                "special_notes": parsed.get("special_notes"),
            }

            response_structured = supabase.table("orders_structured").insert(order_structured_data).execute()
            structured_id = response_structured.data[0]["id"]

            print(f"✅ Order ingevoerd: {order['subject']} → order_id = {structured_id}")

            # ⬇️ Insert alle producten in order_lines
            products = parsed.get("products", [])
            for product in products:
                line_data = {
                    "order_id": structured_id,
                    "product_name": product.get("name"),
                    "quantity": product.get("quantity"),
                    "delivery_date": product.get("delivery_date"),
                    "unit": product.get("unit"),
                }
                supabase.table("order_lines").insert(line_data).execute()

            # ⬇️ Markeer originele mail als verwerkt
            supabase.table("orders").update({"structured_imported": True}).eq("id", email_id).execute()

            # ⬆️ Voeg toe aan resultaat
            imported += 1
            new_orders.append({
                "id": email_id,
                "subject": order["subject"],
                "customer_name": parsed.get("customer_name"),
                "order_date": parsed.get("order_date"),
            })

        except Exception as e:
            print(f"❌ Fout bij importeren van order '{order.get('subject', '')}': {e}")

    return imported, new_orders


def run():
    imported, new_orders = import_structured_orders()
    return {
        "orders_imported": imported,
        "new_orders": new_orders
    }


if __name__ == "__main__":
    run()
