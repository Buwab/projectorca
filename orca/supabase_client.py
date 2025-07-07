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

def store_email(subject, sender_email, sender_name, body, status="raw"):
    """Store email with parsed sender information"""
    data = {
        "subject": subject,
        "sender_email": sender_email,
        "sender_name": sender_name,
        "email_body": body,
        "status": status,
    }
    try:
        response = supabase.table("emails").insert(data).execute()
        print("✅ Email opgeslagen in Supabase:", response.data)
        return response.data[0] if response.data else None
    except Exception as e:
        print("❌ Fout bij opslaan in Supabase:", e)
        return None
