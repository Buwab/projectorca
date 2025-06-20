from fastapi import FastAPI
from email_parser import run as run_email_parser
from llm_parser import run as run_llm_parser
from import_structured_orders import run as run_import_orders

app = FastAPI()

@app.post("/process-all")
async def process_all():
    # In productie kun je deze in background tasks draaien voor snelheid
    run_email_parser()
    run_llm_parser()
    run_import_orders()
    return {"status": "done"}
