FROM node:5.10.1

WORKDIR /app
ADD . /app

CMD ["npm", "run", "start"]
