# Deleted the old project before new deploy
#!/bin/bash
redis-cli flushall

sudo rm -rf /home/ubuntu/express-app/*
#_Change_Working_Directory
cd /home/ubuntu/express-app

#_Update_&_Set_Node_Version
curl -sL https://deb.nodesource.com/setup_18.x | sudo -E bash -

#_Download_Node_&NPM
sudo apt-get install -y nodejs

#_Download_PM2
npm install pm2@latest -g

