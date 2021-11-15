#Create the image 
sudo docker build -t nodejs-app:dev .
#Start the container in background 
sudo docker run -itd -p 3005:3005 nodejs-app:dev
        #get into the container 
        sudo docker exec -it container-id sh
#Start the container in forground
sudo docker run -p 3005:3005 nodejs-app:dev
