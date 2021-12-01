# pull official base image
FROM node:14-alpine 

# set working directory
WORKDIR /app
ENV NODE_ENV production

# install app dependencies
COPY package.json ./
RUN npm install --production

# add app
COPY . ./
EXPOSE 3005
# start app
CMD ["npm", "start"]
