# llm_parser.py

import os
import json
from dotenv import load_dotenv
from supabase import create_client
from openai import OpenAI
from datetime import datetime, timedelta, timezone
from dateutil import parser as dateparser

# 🌍 Setup
load_dotenv()
supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
today = datetime.today().strftime("%Y-%m-%d")


def extract_latest_message(email_body: str) -> str:
    for delimiter in ["\nOn ", "\r\nOn ", "\n> On "]:
        if delimiter in email_body:
            return email_body.split(delimiter)[0].strip()
    return email_body.strip()


def clean_json_output(raw_text: str) -> str:
    if raw_text.startswith("```"):
        lines = raw_text.strip().splitlines()
        if lines[0].startswith("```json"):
            lines = lines[1:]
        return "\n".join(line for line in lines if not line.startswith("```"))
    return raw_text


def extract_order_from_email(email_body: str) -> dict:
    prompt = f"""
Je bent een slimme order-assistent. Haal de orderinformatie uit de onderstaande e-mail en geef het resultaat als JSON.

🎯 Instructies:
- Gebruik ISO-datums: YYYY-MM-DD.
- Zet woorden als "morgen", "maandag" etc. om naar datums vanaf vandaag ({today}).
- Laat `delivery_date` leeg als er regelspecifieke datums zijn.

E-mail:
\"\"\"{email_body}\"\"\"

JSON-format:

{{
  "order_number": null,
  "customer_name": "...",
  "order_date": "{today}",
  "delivery_date": null,
  "special_notes": "...",
  "products": [
    {{
      "name": "...",
      "quantity": ...,
      "unit": "...",
      "delivery_date": "YYYY-MM-DD"
    }}
  ]
}}
"""
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "system", "content": "Je bent een order-parser."}, {"role": "user", "content": prompt}],
        temperature=0,
    )
    return json.loads(clean_json_output(response.choices[0].message.content))


def is_update_like_email(email_body: str) -> dict:
    prompt = f"""Is deze e-mail waarschijnlijk een wijziging op een eerdere bestelling?

\"\"\"{email_body}\"\"\"

Antwoord als JSON:
{{"is_update_intent": true/false, "reason": "..."}}"""

    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "system", "content": "Je beoordeelt of iets een update is."}, {"role": "user", "content": prompt}],
            temperature=0,
        )
        raw = clean_json_output(response.choices[0].message.content)
        return json.loads(raw)
    except Exception as e:
        print("⚠️ Intent-analyse mislukt:", e)
        return {"is_update_intent": False, "reason": "fallback"}


def find_previous_order(sender: str, delivery_date: str, products: list) -> str | None:
    try:
        response = supabase.table("orders_structured").select("*").eq("sender", sender).order("created_at", desc=True).limit(10).execute()
        candidates = response.data or []
        best_score, best_id = 0.0, None

        for order in candidates:
            score = 0.0
            prev_products = order.get("products") or []
            prev_names = {p["name"].lower() for p in prev_products if p.get("name")}
            curr_names = {p["name"].lower() for p in products if p.get("name")}

            if prev_names & curr_names:
                score += 0.2
            if delivery_date and order.get("delivery_date") == delivery_date:
                score += 0.4
            elif not delivery_date:
                score += 0.1

            if score > best_score:
                best_score = score
                best_id = order["id"]

        return best_id if best_score >= 0.4 else None
    except Exception as e:
        print("⚠️ Match-fout:", e)
        return None


def thread_fallback(in_reply_to: str, message_refs: str) -> str | None:
    candidates = [in_reply_to] if in_reply_to else []
    candidates += message_refs.split() if message_refs else []

    for msg_id in candidates:
        try:
            email_resp = supabase.table("orders").select("id").eq("message_id", msg_id.strip()).limit(1).execute()
            if email_resp.data:
                origin_email_id = email_resp.data[0]["id"]
                structured_resp = supabase.table("orders_structured").select("id").eq("email_id", origin_email_id).limit(1).execute()
                if structured_resp.data:
                    return structured_resp.data[0]["id"]
        except Exception as e:
            print("⚠️ Thread fallback fout:", e)
    return None


def match_order_lines(parent_order_id: str | None, products: list) -> list:
    matched_lines = []
    used_prev_ids = set()
    previous_lines = []

    if parent_order_id:
        resp = supabase.table("order_lines").select("*").eq("order_id", parent_order_id).execute()
        previous_lines = resp.data or []

    only_one_prev_line = len(previous_lines) == 1

    for product in products:
        name = product.get("name")
        unit = product.get("unit")
        delivery_date = product.get("delivery_date")
        matched_prev = None

        for prev in previous_lines:
            if prev["id"] in used_prev_ids:
                continue

            prev_name = prev.get("product_name")
            prev_unit = prev.get("unit")
            prev_date = prev.get("delivery_date")

            is_same_product = name == prev_name and unit == prev_unit
            is_exact_match = delivery_date == prev_date
            is_fallback_match = delivery_date is None and only_one_prev_line

            if is_same_product and (is_exact_match or is_fallback_match):
                matched_prev = prev
                break

        if matched_prev:
            matched_lines.append({
                **product,
                "delivery_date": delivery_date or matched_prev.get("delivery_date"),
                "change_type": "update",
                "modifies_line_id": matched_prev["id"],
                "line_group_id": matched_prev.get("line_group_id")
            })
            used_prev_ids.add(matched_prev["id"])
        else:
            # Fallback: als mogelijk eerdere datum beschikbaar
            fallback_date = next(
                (prev.get("delivery_date") for prev in previous_lines if name == prev.get("product_name")),
                delivery_date
            )
            matched_lines.append({
                **product,
                "delivery_date": fallback_date,
                "change_type": "add",
                "modifies_line_id": None,
                "line_group_id": None
            })

    # Detecteer verwijderde regels
    new_keys = {(p["name"], p["unit"], p.get("delivery_date")) for p in products}
    for prev in previous_lines:
        key = (prev.get("product_name"), prev.get("unit"), prev.get("delivery_date"))
        if key not in new_keys and prev["id"] not in used_prev_ids:
            matched_lines.append({
                "product_name": prev["product_name"],
                "quantity": 0,
                "unit": prev["unit"],
                "delivery_date": prev["delivery_date"],
                "change_type": "remove",
                "modifies_line_id": prev["id"],
                "line_group_id": prev.get("line_group_id")
            })

    return matched_lines



def process_raw_emails():
    response = supabase.table("orders").select("*").eq("llm_processed", False).execute()
    emails = response.data or []

    print(f"🔍 {len(emails)} ongeparste e-mails gevonden")

    for mail in emails:
        try:
            short = extract_latest_message(mail["email_body"])
            parsed = extract_order_from_email(short)
            delivery_date = parsed.get("delivery_date")
            products = parsed.get("products", [])
            parsed["order_date"] = today

            intent = is_update_like_email(mail["email_body"])
            print(f"\n🧠 Parsing '{mail['subject']}' — Intent: {'✅' if intent['is_update_intent'] else '❌'}")

            parent_order_id = None
            if intent["is_update_intent"]:
                parent_order_id = find_previous_order(mail["sender"], delivery_date, products) or \
                                  thread_fallback(mail.get("in_reply_to"), mail.get("message_references"))

            matched = match_order_lines(parent_order_id, products)
            parsed["parent_order_id"] = parent_order_id
            parsed["update_reason"] = intent["reason"]
            parsed["matched_lines"] = matched

            supabase.table("orders").update({
                "parsed_data": parsed,
                "llm_processed": True
            }).eq("id", mail["id"]).execute()

            print(f"✅ Order verwerkt als {'update' if parent_order_id else 'nieuw'}")
            for l in matched:
                print(f"🔸 {l['change_type'].upper():<6} {l.get('product_name') or l.get('name')} → {l['quantity']} stuks @ {l.get('delivery_date')}")

        except Exception as e:
            print("❌ Fout bij mail:", e)


if __name__ == "__main__":
    process_raw_emails()
