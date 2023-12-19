#!/bin/bash
set -e
​
sudo chmod -R 777 /home/ubuntu/express-app/*
​
sudo pm2 update
​
cd /home/ubuntu/express-app/BE
​
npm install --force
sudo pm2 reload ecosystem.config.js --update-env
sudo pm2 save