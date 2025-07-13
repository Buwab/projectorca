import os
import json
from dotenv import load_dotenv
from supabase import create_client
from openai import OpenAI
from datetime import datetime

# 🔧 Load .env settings
load_dotenv()

# 📦 Supabase setup
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# 🤖 OpenAI setup
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# 📅 Huidige datum (voor relatieve datums zoals 'dinsdag')
today = datetime.today().strftime("%Y-%m-%d")

def extract_order_from_email(email_body, email_timestamp=None):
    # Format email timestamp to date if available
    email_date = None
    if email_timestamp:
        try:
            # Convert ISO timestamp to just the date part
            email_date = email_timestamp.split('T')[0]
        except:
            email_date = None
    
    prompt = f"""
Je bent een slimme order-assistent. Haal de volgende informatie uit de onderstaande e-mail en geef het resultaat als JSON.

- Geef datums altijd in formaat "YYYY-MM-DD" (ISO 8601).
- measuring units komt eigenlijk altijd in stuks, tenzij anders vermeld, dus 10 broden is product brood en quantity 10 stuks
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
    response = supabase.table("emails").select("*").eq("llm_processed", False).execute()
    emails = response.data

    print(f"🔍 Gevonden ongeparste e-mails: {len(emails)}")
    processed_count = 0

    for mail in emails:
        try:
            email_id = mail["id"]
            body = mail.get("email_body_html") or mail.get("email_body")
            email_timestamp = mail.get("email_timestamp")

            print(f"\n🧠 Parsing mail: {mail['subject']}")
            if email_timestamp:
                email_date = email_timestamp.split('T')[0]
                print(f"📅 Using email date: {email_date}")
            else:
                print("⚠️ No email timestamp available")

            raw_output = extract_order_from_email(body, email_timestamp)
            print("🔎 LLM output:")
            print(raw_output)

            cleaned_output = clean_json_output(raw_output)
            parsed_json = json.loads(cleaned_output)

            supabase.table("emails").update({
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