    #!/bin/bash
    set -e
    #_Change_Working_Directory
    cd /home/ubuntu/express-app

    #_Remove_Unused_Code
    rm -rf node_modules

    sudo rm -rf /home/ubuntu/express-app/*



    #Install_node_modules_&_Make_React_Build
    npm  install --force
