# MongoMQ with Node

This application was built to connect to a MongoDB and Poll for changes on a set interval against a Mongo Capped Collection. 
The collection has tailable cursors incase the collection becomes full. After polling for data, socket.io is used to push the data to the browser. 
This Allowed a great polyglot application set up.


# Install

* Install NodeJS
* Install NPM
* npm install