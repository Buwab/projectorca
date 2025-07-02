import os
import json
from dotenv import load_dotenv
from supabase import create_client
from openai import OpenAI
from datetime import datetime
from email.utils import parsedate_tz, mktime_tz

# �� Load .env settings
load_dotenv()

# 📦 Supabase setup
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# 🤖 OpenAI setup
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# 📅 Huidige datum (voor relatieve datums zoals 'dinsdag')
today = datetime.today().strftime("%Y-%m-%d")

def extract_order_from_email(email_body, email_timestamp):
    today = datetime.today().strftime("%Y-%m-%d")  # Keep this inside for flexibility
    
    # Format the timestamp to just a date string (e.g. 2025-07-02)
    # Handle RFC 2822 email timestamp format
    try:
        # Parse RFC 2822 timestamp (e.g., "Mon, 01 Jan 2024 12:00:00 +0000")
        timestamp_tuple = parsedate_tz(email_timestamp)
        if timestamp_tuple:
            timestamp = mktime_tz(timestamp_tuple)
            email_date = datetime.fromtimestamp(timestamp).date().isoformat()
        else:
            # Fallback to current date if parsing fails
            email_date = today
    except:
        # Fallback to current date if any error occurs
        email_date = today
    
    prompt = f"""
Je bent een slimme order-assistent. Haal de volgende informatie uit de onderstaande e-mail en geef het resultaat als JSON.

- Geef datums altijd in formaat "YYYY-MM-DD" (ISO 8601).
- measuring unitis komt eigenlijk altijd in stuks, tenzij anders vermeld, dus 10 broden is product brood en quantity 10 stuks
- Vertaal relatieve termen zoals "morgen", "dinsdag" of "volgende week" naar een echte datum, gerekend vanaf vandaag: {today}.
- "order_date" is altijd de verzenddatum van de e-mail: {email_date}.
- Als een datum niet genoemd wordt, gebruik null.
- Gebruik geen Markdown, geen codeblokken – alleen de JSON zelf.

Email:
\"\"\"
{email_body}
\"\"\"

Antwoord in exact dit JSON-format:

{{
  "order_number": null,
  "customer_name": "...",
  "order_date": "YYYY-MM-DD",
  "special_notes": "...",
  "products": [
    {{
      "name": "...",
      "quantity": ...,
      "unit": "...",
      "delivery_date": "YYYY-MM-DD",
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

def clean_json_output(raw_text):
    if raw_text.startswith("```"):
        raw_text = raw_text.strip().strip("`")
        lines = raw_text.splitlines()
        if lines and lines[0].startswith("json"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "":
            lines = lines[:-1]
        return "\n".join(lines)
    return raw_text

def process_raw_emails():
    response = supabase.table("orders").select("*").eq("llm_processed", False).execute()
    emails = response.data

    print(f"🔍 Gevonden ongeparste e-mails: {len(emails)}")
    processed_count = 0

    for mail in emails:
        try:
            email_id = mail["id"]
            body = mail["email_body"]
            timestamp = mail["email_timestamp"]

            print(f"\n🧠 Parsing mail: {mail['subject']}")

            raw_output = extract_order_from_email(body, timestamp)
            print("🔎 LLM output:")
            print(raw_output)

            cleaned_output = clean_json_output(raw_output)
            parsed_json = json.loads(cleaned_output)

            supabase.table("orders").update({
                "parsed_data": parsed_json,
                "llm_processed": True
            }).eq("id", email_id).execute()

            print(f"✅ Order verwerkt voor mail: {mail['subject']}")
            processed_count += 1

        except Exception as e:
            print(f"❌ Fout bij verwerken van mail '{mail.get('subject', '')}': {e}")

    return processed_count


def run():
    return {"parsed": process_raw_emails()}


if __name__ == "__main__":
    run()
