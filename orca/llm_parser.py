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

def extract_order_from_email(email_body):
    prompt = f"""
Je bent een slimme order-assistent. Haal de volgende informatie uit de onderstaande e-mail en geef het resultaat als JSON.

- Geef datums altijd in formaat "YYYY-MM-DD" (ISO 8601).
- measuring unitis komt eigenlijk altijd in stuks, tenzij anders vermeld, dus 10 broden is product brood en quantity 10 stuks
- Vertaal relatieve termen zoals "morgen", "dinsdag" of "volgende week" naar een echte datum, gerekend vanaf vandaag: {today}.
- de order_date is de verzenddatum van de email, msg_data in the email_parser.py
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

    for mail in emails:
        try:
            email_id = mail["id"]
            body = mail["email_body"]

            print(f"\n🧠 Parsing mail: {mail['subject']}")

            raw_output = extract_order_from_email(body)
            print("🔎 LLM output:")
            print(raw_output)

            cleaned_output = clean_json_output(raw_output)
            parsed_json = json.loads(cleaned_output)

            supabase.table("orders").update({
                "parsed_data": parsed_json,
                "llm_processed": True
            }).eq("id", email_id).execute()

            print(f"✅ Order verwerkt voor mail: {mail['subject']}")

        except Exception as e:
            print(f"❌ Fout bij verwerken van mail '{mail.get('subject', '')}': {e}")

def run():
    process_raw_emails()

if __name__ == "__main__":
    run()
