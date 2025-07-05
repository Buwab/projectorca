# email_parser.py
from imapclient import IMAPClient
import email
from email.utils import parsedate_to_datetime
from bs4 import BeautifulSoup
from dotenv import load_dotenv
import os
from supabase_client import store_email

load_dotenv()

HOST = os.getenv("IMAP_SERVER")
PORT = int(os.getenv("IMAP_PORT")) 
USER = os.getenv("EMAIL_USER")
PASSWORD = os.getenv("EMAIL_PASSWORD")

def extract_body(msg):
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
            body = extract_body(msg)

            # Parse sent date
            raw_date = msg.get("Date")
            sent_at = None
            if raw_date:
                try:
                    sent_at = parsedate_to_datetime(raw_date).isoformat()
                except Exception as e:
                    print(f"⚠️ Kon verzenddatum niet parseren: {raw_date} ({e})")

            print(f"✉️ Verwerk e-mail: {subject} van {sender} verzonden op {sent_at}")
            store_email(subject, sender, body, sent_at)

            server.add_flags(uid, [b"\\Seen"])

    return len(messages)

def run():
    return {"emails_found": process_emails()}