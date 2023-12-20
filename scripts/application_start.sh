#!/bin/bash
set -e
#_Change_Working_Directory
chmod -R 777 /home/ubuntu/express-app/*


cd /home/ubuntu/express-app

#_Delete_Old_PM2_Service
#sudo pm2 delete Frontend
#sudo pm2 start server.js --name Frontend
pwd
pm2 restart default 

