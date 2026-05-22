import os
import requests
from flask import Flask, request, jsonify, render_template, send_from_directory
from locator_engine import LocatorEngine

app = Flask(__name__, template_folder='templates', static_folder='static')

# Ensure directories exist
os.makedirs('templates', exist_ok=True)
os.makedirs('static', exist_ok=True)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/analyze', methods=['POST'])
def analyze():
    data = request.get_json() or {}
    html_content = data.get('html', '')
    url = data.get('url', '')
    
    if url:
        try:
            # Fetch URL using requests with standard browser headers to avoid blocks
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
            }
            response = requests.get(url, headers=headers, timeout=15)
            response.raise_for_status()
            html_content = response.text
        except Exception as e:
            return jsonify({'error': f'Failed to fetch URL: {str(e)}'}), 400

    if not html_content.strip():
        return jsonify({'error': 'No HTML content or URL provided'}), 400

    try:
        engine = LocatorEngine(html_content)
        return jsonify({
            'success': True,
            'elements': engine.elements,
            'url': url or 'Pasted HTML'
        })
    except Exception as e:
        return jsonify({'error': f'Parsing error: {str(e)}'}), 500

if __name__ == '__main__':
    # Support dynamic port binding (required for platforms like Hugging Face Spaces)
    port = int(os.environ.get('PORT', 5000))
    # Bind to 0.0.0.0 in deployment (when PORT is present) to make it publicly accessible
    host = '0.0.0.0' if os.environ.get('PORT') else '127.0.0.1'
    app.run(debug=not os.environ.get('PORT'), host=host, port=port)
