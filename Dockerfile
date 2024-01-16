FROM node:14-buster-slim

RUN apt-get -y update && \
    apt-get -y install curl unzip && \
    curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" && \
    unzip awscliv2.zip && \
    ./aws/install

WORKDIR /app

COPY package*.json /app/

RUN npm i --only=production

COPY script.mjs .

# Uncomment while developing to make sure the docker runs on openshift
# RUN useradd -ms /bin/bash user && usermod -a -G root user
# USER user

CMD ["npx", "zx", "./script.mjs"]