# email_parser.py

from imapclient import IMAPClient
import email
import email.utils
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from datetime import datetime
from email.utils import parsedate_tz, mktime_tz
import os
from supabase_client import store_email

# 🔧 Laad .env variabelen
load_dotenv()

HOST = os.getenv("IMAP_SERVER")
PORT = int(os.getenv("IMAP_PORT")) 
USER = os.getenv("EMAIL_USER")
PASSWORD = os.getenv("EMAIL_PASSWORD")

def extract_body(msg):
    """Extract text or HTML body from email message"""
    if msg.is_multipart():
        for part in msg.walk():
            ctype = part.get_content_type()
            if ctype == "text/plain":
                return part.get_payload(decode=True).decode()
            elif ctype == "text/html":
                html = part.get_payload(decode=True).decode()
                soup = BeautifulSoup(html, "html.parser")
                return soup.get_text()
    else:
        return msg.get_payload(decode=True).decode()

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
            # Extract forwarder (client) from Return-Path
            return_path = msg.get("Return-Path")
            forwarder_name, forwarder_email = email.utils.parseaddr(return_path) if return_path else (None, None)
            body = extract_body(msg)

            sent_at = extract_sent_at(msg)

            if not sent_at:
                sent_at = datetime.now().isoformat()
                print(f"📆 Fallback naar huidige tijd: {sent_at}")

            print(f"✉️ Verwerk e-mail: {subject} van {sender_email} verzonden op {sent_at} (forwarded by {forwarder_email})")
            store_email(subject, sender_email, sender_name, body, sent_at, forwarder_email, forwarder_name)

            server.add_flags(uid, [b"\\Seen"])

    return len(messages)

def run():
    return {"emails_found": process_emails()}