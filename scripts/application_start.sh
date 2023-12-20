#!/bin/bash
set -e
#_Change_Working_Directory
sudo chmod -R 777 /home/ubuntu/express-app/*


cd /home/ubuntu/express-app

sudo pm2 status

sudo pm2 update

#_Delete_Old_PM2_Service
#sudo pm2 delete Frontend
#sudo pm2 start server.js --name Frontend
pwd
sudo pm2 restart default 

update-env
sudo pm2 save
sudo pm2 startup
