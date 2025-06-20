# main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from email_parser import run as run_email_parser
from llm_parser import run as run_llm_parser
from import_structured_orders import run as run_import_orders

app = FastAPI()

# 🛡️ CORS: zodat je frontend (bijv. localhost:3000) mag aanroepen
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Of specifieker: ["http://localhost:3000"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"message": "API is running."}

@app.post("/process-all")
def process_all():
    try:
        email_result = run_email_parser()         # bijv. {"emails_found": 2}
        llm_result = run_llm_parser()             # bijv. {"parsed": 2}
        import_result = run_import_orders()       # bijv. {"orders_imported": 2}

        return {
            "status": "done",
            "email": email_result,
            "llm": llm_result,
            "import": import_result
        }

    except Exception as e:
        return {"status": "error", "message": str(e)}
