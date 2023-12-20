#!/bin/bash
set -e
#_Change_Working_Directory
cd /home/ubuntu/express-app

sudo pm2 status
#_Delete_Old_PM2_Service
#sudo pm2 delete Frontend
#sudo pm2 start server.js --name Frontend
pwd
sudo pm2 start index.js
sudo pm2 save
sudo pm2 startup
