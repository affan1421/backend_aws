#!/bin/bash

# Give more restrictive permissions
sudo chmod -R 755 /home/ubuntu/express-app

# Navigate into our working directory
cd /home/ubuntu/express-app

# Add npm and node to path
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # loads nvm bash_completion (node is in path now)

# Install node modules
npm install --force

# Start our Node app using PM2 for better process management
# Adjust the application entry point and configuration based on your app structure
pm2 start index.js --name "my-app" --output app.out.log --error app.err.log
