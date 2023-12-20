#!/bin/bash
set -e
#_Change_Working_Directory
cd /home/ubuntu/express-app

#_Remove_Unused_Code
sudo rm -rf node_modules

#Install_node_modules_&_Make_React_Build
sudo npm install --force


