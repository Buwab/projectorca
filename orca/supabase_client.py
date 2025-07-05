from supabase import create_client
import os
from dotenv import load_dotenv

# Laad .env bestand
load_dotenv()

# Haal de credentials op
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# Basic validatie
if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Supabase credentials ontbreken. Check je .env bestand.")

# create client
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

def store_email(subject, sender, body, sent_at=None, status="raw"):
    data = {
        "subject": subject,
        "sender": sender,
        "email_body": body,
        "status": status,
    }
    if sent_at:
        data["email_timestamp"] = sent_at
    try:
        response = supabase.table("orders").insert(data).execute()
        print("✅ Order opgeslagen in Supabase:", response.data)
    except Exception as e:
        print("❌ Fout bij opslaan in Supabase:", e)
