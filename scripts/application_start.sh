#!/bin/bash

# Give more restrictive permissions
sudo chmod -R 755 /home/ubuntu/express-app

#_Change_Working_Directory
cd /home/ubuntu/express-app

#_Delete_Old_PM2_Service
#sudo pm2 delete Frontend
#sudo pm2 start server.js --name Frontend
pm2 delete Backend
pm2 start index.js --name Backend
