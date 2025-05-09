from fastapi import FastAPI, Request
import os

app = FastAPI()

@app.get("/")
def read_root():
    return {"Raizin MCP": "online"}

@app.post("/run-agent")
async def run_agent(request: Request):
    data = await request.json()
    task = data.get("task")

    if task == "get_paypal_credentials":
        return {
            "client_id": os.getenv("PAYPAL_CLIENT_ID"),
            "secret": os.getenv("PAYPAL_SECRET")
        }
    return {"message": f"Task '{task}' not recognized."}
