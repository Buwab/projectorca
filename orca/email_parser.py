
# email_parser.py

from imapclient import IMAPClient
import email
import email.utils
from dotenv import load_dotenv
from datetime import datetime
from email.utils import parsedate_tz, mktime_tz
import os
from supabase_client import store_email, supabase

# 🔧 Laad .env variabelen
load_dotenv()

HOST = os.getenv("IMAP_SERVER")
PORT = int(os.getenv("IMAP_PORT")) 
USER = os.getenv("EMAIL_USER")
PASSWORD = os.getenv("EMAIL_PASSWORD")

def get_client_by_return_path(return_path):
    """Look up client by return_path from the clients table"""
    if not return_path:
        return None
    
    try:
        response = supabase.table("clients").select("id").eq("return_path", return_path).is_("deleted_at", None).execute()
        if response.data:
            client_id = response.data[0]["id"]
            print(f"✅ Client gevonden voor return_path '{return_path}': client_id = {client_id}")
            return client_id
        else:
            print(f"⚠️ Geen client gevonden voor return_path: '{return_path}'")
            return None
    except Exception as e:
        print(f"❌ Fout bij opzoeken client voor return_path '{return_path}': {e}")
        return None

def extract_body(msg):
    """Return the HTML body if available, otherwise fallback to plain text."""
    html_body = None
    text_body = None

    if msg.is_multipart():
        for part in msg.walk():
            ctype = part.get_content_type()
            disp = str(part.get("Content-Disposition", "")).lower()
            if "attachment" in disp:
                continue
            if ctype == "text/html" and html_body is None:
                html_body = part.get_payload(decode=True).decode(errors="replace")
            elif ctype == "text/plain" and text_body is None:
                text_body = part.get_payload(decode=True).decode(errors="replace")
    else:
        ctype = msg.get_content_type()
        payload = msg.get_payload(decode=True).decode(errors="replace")
        if ctype == "text/html":
            html_body = payload
        elif ctype == "text/plain":
            text_body = payload

    print("[extract_body] Extracted HTML body:", (html_body[:200] + '...') if html_body else "None")
    print("[extract_body] Extracted plain body:", (text_body[:200] + '...') if text_body else "None")
    return {"plain": text_body, "html": html_body}

def extract_sent_at(msg):
    """Extract the sent timestamp from the email's Date header"""
    raw_date = msg.get("Date") or msg.get("date")
    print(f"📅 Ruwe 'Date' header: {raw_date}")

    if raw_date:
        try:
            parsed_date = parsedate_tz(raw_date)
            if parsed_date:
                timestamp = mktime_tz(parsed_date)
                sent_at = datetime.fromtimestamp(timestamp).isoformat()
                return sent_at
        except Exception as e:
            print(f"⚠️ Fout bij parsen 'Date': {raw_date} ({e})")
    
    print("⚠️ Geen geldige verzenddatum gevonden in headers.")
    return None


def process_emails():
    with IMAPClient(HOST, ssl=True) as server:
        server.login(USER, PASSWORD)
        server.select_folder("INBOX")

        messages = server.search(["UNSEEN"])
        print(f"✉️ Gevonden ongelezen mails: {len(messages)}")

        for uid, msg_data in server.fetch(messages, ["RFC822"]).items():
            raw_email = msg_data[b"RFC822"]
            msg = email.message_from_bytes(raw_email)

            subject = msg["subject"]
            sender = msg["from"]
            sender_name, sender_email = email.utils.parseaddr(sender)

            # Extract return_path (client) from Return-Path
            return_path_header = msg.get("Return-Path")
            _, return_path = email.utils.parseaddr(return_path_header) if return_path_header else (None, None)
            
            # Look up client by return_path
            client_id = get_client_by_return_path(return_path)
            
            bodies = extract_body(msg)
            plain_body = bodies.get("plain")
            html_body = bodies.get("html")

            sent_at = extract_sent_at(msg)

            if not sent_at:
                sent_at = datetime.now().isoformat()
                print(f"📆 Fallback naar huidige tijd: {sent_at}")

            print(f"✉️ Verwerk e-mail: {subject} van {sender_email} verzonden op {sent_at} (return-path: {return_path}, client_id: {client_id} with HTML body: {html_body is not None})")
            store_email(subject, sender_email, sender_name, plain_body, sent_at, email_body_html=html_body, return_path=return_path, client_id=client_id)

            server.add_flags(uid, [b"\\Seen"])

    return len(messages)

def run():
    return {"emails_found": process_emails()}