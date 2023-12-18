#!/bin/bash

# Stop existing Node.js servers
NODE_PROCESSES=$(pgrep -f "node")

if [ -n "$NODE_PROCESSES" ]; then
  echo "Stopping existing Node.js servers: $NODE_PROCESSES"
  kill -TERM $NODE_PROCESSES
else
  echo "No existing Node.js servers found"
fi
