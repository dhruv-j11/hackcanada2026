import os
import re
import json
import requests
from dotenv import load_dotenv

load_dotenv("CityLens/.env")
api_key = os.environ.get("VITE_GEMINI_API_KEY")

with open("CityLens/src/services/geminiService.ts", "r") as f:
    content = f.read()

# Extract prompt
prompt_match = re.search(r"const GEMINI_SYSTEM_PROMPT = `(.*?)`;", content, re.DOTALL)
GEMINI_SYSTEM_PROMPT = prompt_match.group(1) if prompt_match else "FAILED TO PARSE"

query = "Build a shopping mall on King st"

print(f"Testing Gemini API with key: {api_key[:5]}...")

response = requests.post(
    f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key={api_key}",
    headers={"Content-Type": "application/json"},
    json={
        "system_instruction": {"parts": {"text": GEMINI_SYSTEM_PROMPT}},
        "contents": [{"role": "user", "parts": [{"text": query}]}],
        "generationConfig": {
            "temperature": 0.2,
            "response_mime_type": "application/json"
        }
    }
)

if response.status_code == 200:
    print(json.dumps(response.json(), indent=2))
else:
    print(response.status_code, response.text)
