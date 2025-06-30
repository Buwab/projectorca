import os
import json
from uuid import uuid4
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
                "sender": order.get("sender"),
                "order_number": parsed.get("order_number"),
                "customer_name": parsed.get("customer_name"),
                "order_date": parsed.get("order_date"),
                "delivery_date": parsed.get("delivery_date"),
                "special_notes": parsed.get("special_notes"),
                "parent_order_id": parsed.get("parent_order_id"),
                "update_probability": parsed.get("update_probability"),
                "products": parsed.get("products")
            }

            response_structured = supabase.table("orders_structured").insert(order_structured_data).execute()
            structured_id = response_structured.data[0]["id"]

            print(f"✅ Order ingevoerd: {order['subject']} → order_id = {structured_id}")

            # ⬇️ Insert alle regels in order_lines
            products = parsed.get("products", [])
            for product in products:
                change_type = product.get("change_type", "add")
                modifies_line_id = product.get("modifies_line_id")
                line_group_id = product.get("line_group_id")

                # 🔁 Haal bestaande group_id op bij update/remove
                if change_type in ("update", "remove") and modifies_line_id and not line_group_id:
                    try:
                        resp = supabase.table("order_lines") \
                            .select("line_group_id") \
                            .eq("id", modifies_line_id).limit(1).execute()
                        line_group_id = resp.data[0]["line_group_id"] if resp.data else None
                    except Exception as e:
                        print(f"⚠️ Kon line_group_id niet ophalen voor regel {modifies_line_id}: {e}")
                        line_group_id = None

                # ➕ Genereer nieuwe group_id voor 'add'
                if change_type == "add" and not line_group_id:
                    line_group_id = str(uuid4())

                line_data = {
                    "order_id": structured_id,
                    "product_name": product.get("name") or product.get("product_name"),
                    "quantity": product.get("quantity"),
                    "unit": product.get("unit"),
                    "delivery_date": product.get("delivery_date") or parsed.get("delivery_date"),
                    "change_type": change_type,
                    "modifies_line_id": modifies_line_id,
                    "line_group_id": line_group_id
                }

                print(f"📦 Invoeren regel: {line_data}")
                supabase.table("order_lines").insert(line_data).execute()

            # ✅ Markeer originele mail als verwerkt
            supabase.table("orders").update({"structured_imported": True}).eq("id", email_id).execute()

        except Exception as e:
            print(f"❌ Fout bij importeren van order '{order.get('subject', '')}': {e}")


def run():
    import_structured_orders()


if __name__ == "__main__":
    run()
