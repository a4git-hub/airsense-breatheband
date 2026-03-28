#!/bin/bash

# ==========================================
# TEACHING MOMENT: Virtual Environments
# Python projects often need specific libraries. 
# We use a "Virtual Environment" (venv) to keep these 
# libraries inside this project folder, instead of messy
# global installations.
# ==========================================

echo "🔧 Setting up AirSense Backend..."

# 1. Check if 'venv' exists
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
fi

# 2. Activate the virtual environment
# This tells the terminal to use the python inside 'venv'
source venv/bin/activate

# 3. Install the tools we need (FastAPI, Uvicorn)
echo "⬇️  Installing dependencies..."
pip install -r requirements.txt

# 4. Run the Server
echo "🚀 Starting AirSense Server..."
echo "--------------------------------"
echo "Stop the server by pressing: Ctrl + C"
echo "--------------------------------"
uvicorn main:app --reload --host 0.0.0.0 --port 8000
