#!/bin/bash
set -e
#_Change_Working_Directory
cd /home/ubuntu/express-app

pm2 status
#_Delete_Old_PM2_Service
#sudo pm2 delete Frontend
#sudo pm2 start server.js --name Frontend
pwd
pm2 restart default 
pm2 save
pm2 startup
