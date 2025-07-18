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

def store_email(subject, sender_email, sender_name, body, sent_at=None, status="raw", email_body_html=None, return_path=None, client_id=None):
    """Store email with parsed sender information, optional sent timestamp, optional HTML body, return_path, and client_id"""
    data = {
        "subject": subject,
        "sender_email": sender_email,
        "sender_name": sender_name,
        "email_body": body,
        "status": status,
        "return_path": return_path,
    }

    if sent_at:
        data["email_timestamp"] = sent_at  # ISO string uit de parser
    if email_body_html is not None:
        data["email_body_html"] = email_body_html
    if client_id is not None:
        data["client_id"] = client_id

    try:
        response = supabase.table("emails").insert(data).execute()
        print("✅ Email opgeslagen in Supabase:", response.data)
        return response.data[0] if response.data else None
    except Exception as e:
        print("❌ Fout bij opslaan in Supabase:", e)
        return None