#!/bin/bash

# Exit immediately if a command fails
set -e

echo "============================================="
echo "       STARTING CODEXA EXAM NETWORK SERVER   "
echo "============================================="

# Get script directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "Error: npm/Node.js is not installed on this system."
    echo "Please install Node.js to run Codexa."
    read -p "Press Enter to exit..."
    exit 1
fi

# 1. Install dependencies if not present
if [ ! -d "$DIR/backend/node_modules" ]; then
    echo "Installing backend dependencies (first time setup)..."
    cd "$DIR/backend" && npm install
fi

if [ ! -d "$DIR/frontend/node_modules" ]; then
    echo "Installing frontend dependencies (first time setup)..."
    cd "$DIR/frontend" && npm install
fi

# 2. Setup local offline SQLite database
echo "Initializing local database..."
cd "$DIR/backend"
npm run db:local

# 3. Build projects if builds don't exist
if [ ! -d "$DIR/backend/dist" ]; then
    echo "Building backend..."
    npm run build
fi

if [ ! -d "$DIR/frontend/.next" ]; then
    echo "Building frontend..."
    cd "$DIR/frontend" && npm run build
fi

# 4. Start servers in background
echo "Starting Codexa Backend..."
cd "$DIR/backend"
npm run start:prod > /dev/null 2>&1 &
BACKEND_PID=$!

echo "Starting Codexa Frontend..."
cd "$DIR/frontend"
npm run start:lan > /dev/null 2>&1 &
FRONTEND_PID=$!

# Function to clean up background processes on exit
cleanup() {
    echo ""
    echo "Shutting down Codexa servers..."
    kill $BACKEND_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    echo "Servers stopped. Goodbye!"
    exit 0
}

# Trap exit signals to run cleanup
trap cleanup SIGINT SIGTERM EXIT

# 5. Wait for servers to spin up
echo "Waiting for servers to start..."
sleep 4

# 6. Get local IP addresses to show the lecturer
echo "============================================="
echo "Codexa is now running!"
echo "Lecturer Dashboard: http://localhost:3000"
echo ""
echo "Student Entrance (LAN) URLs:"

# Find the interface with the default route
DEFAULT_INTERFACE=$(ip route show | grep default | head -n 1 | awk '{print $5}')

IP_FOUND=false
while read -r line; do
    iface=$(echo "$line" | awk '{print $1}')
    ip=$(echo "$line" | awk '{print $2}')
    
    # Skip loopback
    if [ "$iface" = "lo" ]; then
        continue
    fi
    
    # Categorize interface type for display clarity
    if [[ "$iface" =~ ^(docker|br-|veth|virbr) ]]; then
        type="Virtual/Docker"
    elif [[ "$iface" =~ ^(wlan|wlp|wl|ap) ]]; then
        type="Wi-Fi / Hotspot"
    elif [[ "$iface" =~ ^(eth|enp|en) ]]; then
        type="Ethernet / Wired"
    else
        type="Other network"
    fi
    
    # Highlight the default interface
    if [ "$iface" = "$DEFAULT_INTERFACE" ]; then
        echo " - [DEFAULT] $type ($iface): http://$ip:3000/exam/[code]"
    else
        echo " - $type ($iface): http://$ip:3000/exam/[code]"
    fi
    IP_FOUND=true
done < <(ip -4 -o addr show | awk '{split($4, a, "/"); print $2, a[1]}')

if [ "$IP_FOUND" = false ]; then
    FALLBACK_IP=$(hostname -I | awk '{print $1}')
    if [ -n "$FALLBACK_IP" ]; then
        echo " - Fallback: http://$FALLBACK_IP:3000/exam/[code]"
    else
        echo " - Local Host: http://localhost:3000/exam/[code]"
    fi
fi
echo "============================================="
echo "Note: If students cannot connect to the server:"
echo "1. Wi-Fi / AP Isolation (Very common on Hostel/Public Wi-Fi):"
echo "   Public/shared routers block local devices from communicating."
echo "   Solution: Turn on your laptop's Mobile Hotspot and connect"
echo "   the student devices/phones directly to it."
echo "2. Firewall:"
echo "   Ensure your firewall allows incoming traffic on ports 3000 & 3002."
echo "   Linux: sudo ufw allow 3000/tcp && sudo ufw allow 3002/tcp"
echo "============================================="
echo "Opening Lecturer Dashboard in browser..."

# Open default browser
if command -v xdg-open &> /dev/null; then
    xdg-open "http://localhost:3000" &>/dev/null &
fi

echo "Keep this window open during the exam."
echo "Press Ctrl+C in this terminal to stop the servers."

# Keep script running to maintain processes
while true; do
    sleep 1
done
