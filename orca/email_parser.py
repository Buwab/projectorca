import os
from imapclient import IMAPClient
import email
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from supabase_client import store_email

# 🔧 Load .env settings
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
        print(f"📬 Gevonden ongelezen mails: {len(messages)}")

        for uid, msg_data in server.fetch(messages, ["RFC822"]).items():
            raw_email = msg_data[b"RFC822"]
            msg = email.message_from_bytes(raw_email)

            subject = msg.get("Subject", "")
            sender = msg.get("From", "")
            message_id = msg.get("Message-ID", "")
            in_reply_to = msg.get("In-Reply-To", "")
            message_references = msg.get("References", "")

            body = extract_body(msg)

            print(f"✉️ Verwerk e-mail: {subject} van {sender}")
            store_email(
                subject=subject,
                sender=sender,
                body=body,
                message_id=message_id,
                in_reply_to=in_reply_to,
                message_references=message_references
            )

            server.add_flags(uid, [b"\\Seen"])

def run():
    process_emails()

if __name__ == "__main__":
    run()
