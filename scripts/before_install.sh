#!/bin/bash

#_Change_Working_Directory
cd /home/ubuntu/express-app

sudo rm -rf /home/ubuntu/express-app/*


#_Update_&_Set_Node_Version
curl -sL https://deb.nodesource.com/setup_18.x | sudo -E bash -

#_Download_Node_&NPM
sudo apt-get install -y nodejs

#_Download_PM2
sudo npm install pm2@latest -g

# in before_install.sh


