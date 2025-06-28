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


def extract_latest_message(email_body):
    for delimiter in ["\nOn ", "\r\nOn ", "\n> On "]:
        if delimiter in email_body:
            return email_body.split(delimiter)[0].strip()
    return email_body.strip()


def extract_order_from_email(email_body):
    prompt = f"""
Je bent een slimme order-assistent. Haal de orderinformatie uit de onderstaande e-mail en geef het resultaat als JSON.

🎯 Belangrijke instructies:
- Zet alle datums in formaat "YYYY-MM-DD" (ISO 8601).
- Reken relatieve termen zoals "morgen", "maandag", "dinsdag" enz. om naar echte datums, gerekend vanaf vandaag: {today}.
- **Als er meerdere datums genoemd worden (zoals 'maandag', 'dinsdag', etc.), geef dan elke regel met producten een eigen `delivery_date`.**
- Laat het algemene veld `delivery_date` leeg (null) als je productregels met eigen datums gebruikt.
- Gebruik alleen JSON – geen tekst, uitleg of markdown.

E-mail:
\"\"\"
{email_body}
\"\"\"

Geef als output exact dit JSON-format:

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
        messages=[
            {"role": "system", "content": "Je bent een behulpzame order-parser."},
            {"role": "user", "content": prompt}
        ],
        temperature=0
    )
    return response.choices[0].message.content



def is_update_like_email(email_body):
    prompt = f"""
Is deze e-mail waarschijnlijk een toevoeging of wijziging op een eerdere bestelling?

\"\"\"{email_body}\"\"\"

Beantwoord met JSON:
{{
  "is_update_intent": true/false,
  "reason": "korte uitleg"
}}
"""
    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "Je beoordeelt of een e-mail een update is."},
                {"role": "user", "content": prompt}
            ],
            temperature=0
        )
        raw = response.choices[0].message.content.strip()
        if raw.startswith("```"):
            lines = raw.strip("`").splitlines()
            if lines and lines[0].startswith("json"):
                lines = lines[1:]
            raw = "\n".join(lines).strip()
        return json.loads(raw)
    except Exception as e:
        print("❌ GPT intent-analyse mislukt:", e)
        return {"is_update_intent": False, "reason": "fallback"}


def match_previous_order(sender_email, delivery_date, products):
    try:
        resp = supabase.table("orders_structured") \
            .select("id, delivery_date, created_at, products") \
            .eq("sender", sender_email) \
            .order("created_at", desc=True).limit(10).execute()

        previous_orders = resp.data or []
        current_date = None
        if delivery_date:
            try:
                current_date = datetime.strptime(delivery_date, "%Y-%m-%d")
            except:
                pass

        best_match = None
        best_score = 0.0

        for order in previous_orders:
            try:
                created_at = dateparser.parse(order["created_at"]).replace(tzinfo=timezone.utc)
                if (datetime.now(timezone.utc) - created_at) > timedelta(hours=48):
                    continue

                score = 0.0
                log = []

                # Leverdatum
                if current_date and order["delivery_date"]:
                    try:
                        prev_delivery = datetime.strptime(order["delivery_date"], "%Y-%m-%d")
                        delta = abs((current_date - prev_delivery).days)
                        if delta == 0:
                            score += 0.4
                            log.append("📅 Leverdatum = exact → +0.4")
                        elif delta == 1:
                            score += 0.2
                            log.append("📅 Leverdatum ±1 dag → +0.2")
                        else:
                            log.append("📅 Leverdatum >1 dag verschil → +0")
                    except:
                        log.append("📅 Fout in leverdatum → +0")
                else:
                    score += 0.1
                    log.append("📅 Geen leverdatum → +0.1")

                # Productanalyse: overlap is goed, maar geen harde vereiste
                prev_products = order.get("products") or []
                if prev_products and products:
                    prev_names = {p["name"].lower() for p in prev_products if p.get("name")}
                    curr_names = {p["name"].lower() for p in products if p.get("name")}
                    name_overlap = prev_names.intersection(curr_names)
                    if name_overlap:
                        score += 0.2
                        log.append(f"🛒 Enige overlap in productnamen: {name_overlap} → +0.2")
                    else:
                        log.append("🛒 Geen overlap — maar mogelijk wel toevoeging")

                print(f"\n🧮 Evaluatie order {order['id']}")
                for l in log:
                    print("   ", l)
                print(f"   ➕ Totale score: {round(score, 2)}")

                if score > best_score:
                    best_score = score
                    best_match = order["id"]

            except Exception as e:
                print("⚠️ Fout bij eerdere order:", e)

        if best_score >= 0.4:
            return best_match, round(best_score, 2)

    except Exception as e:
        print("❌ Match-fout:", e)

    return None, 0.0



def find_previous_order_in_thread(in_reply_to, message_references):
    candidates = []
    if in_reply_to:
        candidates.append(in_reply_to.strip())
    if message_references:
        refs = message_references.split()
        candidates.extend([r.strip() for r in refs])

    for msg_id in candidates:
        try:
            email_resp = supabase.table("orders").select("id").eq("message_id", msg_id).limit(1).execute()
            if email_resp.data:
                origin_email_id = email_resp.data[0]["id"]
                structured_resp = supabase.table("orders_structured").select("id") \
                    .eq("email_id", origin_email_id).limit(1).execute()
                if structured_resp.data:
                    return structured_resp.data[0]["id"]
        except Exception as e:
            print("⚠️ Thread fallback fout:", e)

    return None


def clean_json_output(raw_text):
    if raw_text.startswith("```"):
        raw_text = raw_text.strip().strip("`")
        lines = raw_text.splitlines()
        if lines and lines[0].startswith("json"):
            lines = lines[1:]
        return "\n".join(lines)
    return raw_text


def process_raw_emails():
    response = supabase.table("orders").select("*").eq("llm_processed", False).execute()
    emails = response.data
    print(f"🔍 Gevonden ongeparste e-mails: {len(emails)}")

    for mail in emails:
        try:
            email_id = mail["id"]
            sender = mail.get("sender")
            subject = mail.get("subject", "")
            body = mail.get("email_body", "")
            in_reply_to = mail.get("in_reply_to")
            message_refs = mail.get("message_references")

            print(f"\n🧠 Parsing mail: {subject}")
            print(f"✉️ Afzender: {sender}")

            short_body = extract_latest_message(body)
            raw_output = extract_order_from_email(short_body)
            parsed_json = json.loads(clean_json_output(raw_output))

            delivery_date = parsed_json.get("delivery_date")
            products = parsed_json.get("products", [])
            parent_order_id = None
            update_probability = 0.0

            print(f"🔁 RE in subject? {'✅' if subject.lower().startswith('re:') else '❌'}")

            intent = is_update_like_email(body)
            print(f"✍️  Tekst lijkt update? {'✅' if intent['is_update_intent'] else '❌'} — {intent['reason']}")
            if intent["is_update_intent"]:
                parent_order_id, update_probability = match_previous_order(sender, delivery_date, products)

                if not parent_order_id:
                    print("🔗 Geen directe match — probeer thread fallback")
                    parent_order_id = find_previous_order_in_thread(in_reply_to, message_refs)
                    if parent_order_id:
                        update_probability = 0.95
                        print(f"🔁 Thread fallback match: {parent_order_id}")
                    else:
                        print("🔗 Geen fallback match gevonden")
            else:
                print("⛔ Geen update intent gedetecteerd")

            parsed_json["parent_order_id"] = parent_order_id
            parsed_json["update_probability"] = update_probability
            parsed_json["update_reason"] = intent["reason"]

            supabase.table("orders").update({
                "parsed_data": parsed_json,
                "llm_processed": True
            }).eq("id", email_id).execute()

            print(f"✅ Order verwerkt als {'update' if parent_order_id else 'nieuw'}")

        except Exception as e:
            print(f"❌ Fout bij mail '{mail.get('subject', '')}': {e}")


if __name__ == "__main__":
    process_raw_emails()
