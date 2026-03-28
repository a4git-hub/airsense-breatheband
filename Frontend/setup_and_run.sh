#!/bin/bash

# ==========================================
# TEACHING MOMENT: Modern Web Development
# For the frontend, we use Node.js tools.
# 'npx' allows us to run Node packages (like a web server)
# without installing them globally on your machine.
# ==========================================

echo "🔧 Setting up AirSense Frontend..."

# 1. Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install it from https://nodejs.org/"
    exit 1
fi

# 2. Install dependencies if package.json exists
# This is "future proofing" - right now we might not have one,
# but if we add libraries later, this handles it.
if [ -f "package.json" ]; then
    echo "📦 Installing frontend dependencies..."
    npm install
fi

# 3. Start the Server
echo "🚀 Starting AirSense Frontend..."
echo "--------------------------------"
echo "Stop the server by pressing: Ctrl + C"
echo "--------------------------------"

# We use 'http-server' which is a simple, zero-configuration command-line http server.
# -p 8080 checks port 8080 (common for frontends)
# -c-1 disables caching so you see changes immediately
# -y answers "yes" to any prompts (like installing http-server)
npx -y http-server -p 8080 -c-1
