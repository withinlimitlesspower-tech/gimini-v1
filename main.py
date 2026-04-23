import os
import uuid
import json
import logging
from typing import Dict, List
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel
import httpx
from dotenv import load_dotenv

load_dotenv()

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")
if not DEEPSEEK_API_KEY:
    raise ValueError("Missing DEEPSEEK_API_KEY environment variable")

DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1"
MODEL = "deepseek-reasoner"  # or "deepseek-chat" with reasoning_effort="high"

app = FastAPI()

# In-memory conversation store
conversations: Dict[str, List[dict]] = {}

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ChatRequest(BaseModel):
    message: str
    session_id: str = None


class HealthResponse(BaseModel):
    status: str = "healthy"


@app.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse()


@app.get("/")
async def index():
    return FileResponse("templates/index.html")


@app.post("/chat")
async def chat(req: ChatRequest):
    session_id = req.session_id or str(uuid.uuid4())
    user_message = req.message.strip()
    if not user_message:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    # Initialize conversation if new session
    if session_id not in conversations:
        conversations[session_id] = [
            {"role": "system", "content": "You are a helpful AI assistant like Gemini, think step-by-step logically, provide accurate and concise answers. Use chain-of-thought reasoning for complex questions."}
        ]

    # Add user message
    conversations[session_id].append({"role": "user", "content": user_message})

    # Prepare API request
    url = f"{DEEPSEEK_BASE_URL}/chat/completions"
    headers = {
        "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": MODEL,
        "messages": conversations[session_id],
        "stream": True,
        # "reasoning_effort": "high"  # if using deepseek-chat
    }

    async def generate():
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                async with client.stream("POST", url, headers=headers, json=payload) as response:
                    response.raise_for_status()
                    full_content = ""
                    async for chunk in response.aiter_lines():
                        if chunk.startswith("data: "):
                            data = chunk[6:]
                            if data == "[DONE]":
                                break
                            try:
                                json_data = json.loads(data)
                                choices = json_data.get("choices", [])
                                if choices:
                                    delta = choices[0].get("delta", {})
                                    content = delta.get("content", "")
                                    if content:
                                        full_content += content
                                        yield f"data: {json.dumps({'type': 'content', 'data': content})}\n\n"
                            except json.JSONDecodeError:
                                continue
                    # Add assistant message to history
                    conversations[session_id].append({"role": "assistant", "content": full_content})
                    # Signal end
                    yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except Exception as e:
            logger.error(f"Error during streaming: {e}", exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'data': str(e)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
