import logging
from fastapi.responses import JSONResponse
from supabase_client import supabase

# Configure logging
logger = logging.getLogger(__name__)

def get_clients():
    """
    Fetch all non-deleted clients from the database.
    
    Returns:
        dict: Success response with clients list
        JSONResponse: Error response with status code and message
    """
    try:
        response = supabase.table("clients").select("id, name").is_("deleted_at", None).execute()
        if response.data is None:
            return JSONResponse(status_code=404, content={"status": "error", "message": "No clients found"})
        return {"clients": response.data}
    except Exception as e:
        logger.error(f"❌ Error fetching clients: {e}", exc_info=True)
        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)}) 