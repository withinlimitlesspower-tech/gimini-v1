# Gemini-style AI Chatbot

A real-time streaming chatbot using FastAPI and DeepSeek API with logical reasoning (deep mode).

## Setup

1. Clone the repository.
2. Create a `.env` file in the root directory and add:
   ```
   DEEPSEEK_API_KEY=your_deepseek_api_key_here
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Run the server:
   ```bash
   uvicorn main:app --reload
   ```
5. Open `http://localhost:8000` in your browser.

## Features
- Streaming responses (word-by-word) using Server-Sent Events.
- Chain-of-thought reasoning for complex questions.
- Dark glassmorphism UI with markdown rendering and code block copying.
- Conversation history per session (in memory).
- Health check endpoint at `/health`.

## Environment Variables
- `DEEPSEEK_API_KEY`: Your DeepSeek API key (required).

## API Endpoints
- `GET /` : Serve the frontend.
- `POST /chat` : Send a message and receive streaming response.
- `GET /health` : Health check.
