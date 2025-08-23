from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

try:
    genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))
except Exception as e:
    print(f"Error: Could not configure Gemini API. Check your GOOGLE_API_KEY. Details: {e}")

SOCRATIC_PROMPT = """
You are Socrates AI, a tutor who uses the Socratic method. Your goal is to help the user understand a concept deeply by asking guiding questions.
Follow these rules strictly:
1.  **Never give a direct answer.**
2.  Ask one open-ended, thought-provoking question at a time.
3.  If the user is wrong, gently guide them toward the correct path with a question.
4.  Keep your responses concise and in a conversational tone.
"""

@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.json
    user_prompt = data.get('prompt')
    history_data = data.get('history', [])
    
    if not user_prompt:
        return jsonify({"error": "No prompt was provided"}), 400

    try:
        model = genai.GenerativeModel('gemini-1.5-flash', system_instruction=SOCRATIC_PROMPT)

        formatted_history = []
        for msg in history_data:
            role = 'user' if msg['role'] == 'user' else 'model'
            formatted_history.append({'role': role, 'parts': [msg['content']]})

        chat_session = model.start_chat(history=formatted_history)
        response_stream = chat_session.send_message(user_prompt, stream=True)
        
        def generate():
            for chunk in response_stream:
                yield chunk.text

        return app.response_class(generate(), mimetype='text/plain')

    except Exception as e:
        error_text = str(e)
        print(f"Error during API call: {error_text}")

        # Check if the error is a quota/rate limit error (429)
        if '429' in error_text and 'quota' in error_text.lower():
            return jsonify({"error": "API quota exceeded"}), 429
        else:
            return jsonify({"error": "Failed to get response from AI"}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)