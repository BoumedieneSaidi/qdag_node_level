# pull official base image
FROM docker.io/node:14-alpine 

# set working directory
WORKDIR /app

# install app dependencies
COPY package.json ./
RUN npm install  --no-audit

# add app
COPY . ./
EXPOSE 3005
# start app
CMD ["npm", "start"]
