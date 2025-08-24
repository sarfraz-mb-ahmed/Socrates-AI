# main.py

import os
import logging
from flask import Flask, request, jsonify
from flask_cors import CORS
from groq import Groq, APIStatusError
from dotenv import load_dotenv

# --- Basic Configuration ---

# Load environment variables from .env file
load_dotenv()

# Set up basic logging to see errors in console or log files
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Flask App Initialization ---

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}}) 

# --- Groq API Client Initialization ---

try:
    # Initialize the Groq client with the API key from the environment
    groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
    logging.info("Groq client initialized successfully.")
except Exception as e:
    # This will stop the app if the API key is missing or invalid on startup
    logging.critical(f"FATAL: Could not configure Groq client. Check GROQ_API_KEY. Error: {e}")
 
    groq_client = None


SOCRATIC_PROMPT = """
You are Socrates AI, a tutor who uses the Socratic method. Your goal is to help the user understand a concept deeply by asking guiding questions. Your entire persona is built on guiding, not telling.

Follow these core principles strictly:
1.  **Never, under any circumstances, give a direct answer, definition, summary, or fact.** Your purpose is to elicit knowledge from the user, not provide it yourself.
2.  Ask one open-ended, thought-provoking question at a time. The question should build directly upon the user's last statement.
3.  If the user is incorrect, gently guide them toward the correct path with a question that helps them spot their own error. For example, if a user says 'plants get food from the soil,' you might ask, 'What role does sunlight play in that process?'
4.  Keep your responses concise and maintain a patient, encouraging, and conversational tone.

**Handling difficult situations:**
* **If the user directly asks for the answer:** Do not provide it. Instead, gently deflect and turn it back into a question. For example, say 'That's an excellent question to explore. To start, what part of it do you find most confusing?'
* **If the user says 'I don't know':** Do not give up. Reframe the question in a simpler way or use an analogy. For example, ask 'Let's try a different angle. What happens to a plant if you leave it in a dark room?'
* **Starting the conversation:** When the user first enters a topic, begin with a broad, inviting question. For example, if the topic is 'photosynthesis,' start with 'An excellent subject to delve into. To begin, what are your initial thoughts on how a tiny seed grows into a giant tree?'
"""

# --- API Endpoint ---

@app.route('/api/chat', methods=['POST'])
def chat():
    # 1. Input Validation
    if not groq_client:
        logging.error("Groq client is not available.")
        return jsonify({"error": "AI service is not configured correctly."}), 503 # Service Unavailable

    if not request.is_json:
        return jsonify({"error": "Invalid request: Content-Type must be application/json"}), 415

    data = request.get_json()
    user_prompt = data.get('prompt')
    history = data.get('history', [])

    if not user_prompt or not isinstance(user_prompt, str):
        return jsonify({"error": "Invalid request: 'prompt' must be a non-empty string."}), 400
    if not isinstance(history, list):
        return jsonify({"error": "Invalid request: 'history' must be a list."}), 400

    # 2. Prepare Messages for LLM
    messages = [
        {"role": "system", "content": SOCRATIC_PROMPT},
        *history,
        {"role": "user", "content": user_prompt}
    ]

    # 3. Stream Response from Groq
    try:
        response_stream = groq_client.chat.completions.create(
            model="llama3-70b-8192",
            messages=messages,
            temperature=0.7,
            max_tokens=1024,
            stream=True,
        )
        
        def generate():
            for chunk in response_stream:
                content = chunk.choices[0].delta.content
                if content:
                    yield content
        
        # Return the streaming response
        return app.response_class(generate(), mimetype='text/plain')

    except APIStatusError as e:
        # Handle specific Groq API errors (like rate limits, authentication)
        logging.error(f"Groq API Error: {e.status_code} - {e.message}")
        if e.status_code == 429:
            return jsonify({"error": "API rate limit exceeded. Please try again later."}), 429
        return jsonify({"error": f"An API error occurred: {e.message}"}), e.status_code
    
    except Exception as e:
        # Handle other unexpected errors (network issues....)
        logging.error(f"An unexpected error occurred: {e}")
        return jsonify({"error": "An unexpected server error occurred."}), 500

# --- Standard Error Handlers ---

@app.errorhandler(404)
def not_found(error):
    return jsonify({"error": "Not Found: The requested URL was not found on the server."}), 404

@app.errorhandler(405)
def method_not_allowed(error):
    return jsonify({"error": "Method Not Allowed: The method is not allowed for the requested URL."}), 405


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)