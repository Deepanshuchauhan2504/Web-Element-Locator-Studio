# Use official lightweight Python image
FROM python:3.11-slim

# Set working directory in container
WORKDIR /app

# Install system dependencies (curl can be used for health check if needed)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy only requirements to leverage Docker cache
COPY requirements.txt .

# Install python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY . .

# Hugging Face Spaces default port is 7860
ENV PORT=7860
EXPOSE 7860

# Command to launch the Flask application
CMD ["python", "app.py"]
