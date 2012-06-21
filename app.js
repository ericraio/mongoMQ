var express = require('express')
  , mongoose = require('mongoose')
  , message = require('./models/message')
  , routes = require('./routes')
  , sockets = require('./sockets')
  , connect = require('express/node_modules/connect')
  , RedisStore = require('connect-redis')(express)
  , sessionStore = new RedisStore()
  , app = express.createServer()
  , mongoUrl
  , sio;

app.configure(function () {
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.favicon());
  app.use(express.logger('dev'));
  app.use(require('stylus').middleware({ src: __dirname + '/public' }));
  app.use(express.static(__dirname + '/public'));
  app.use(express.cookieParser('keyboard cat'));
  app.use(express.session({
    secret: 'keyboard cat',
    key: 'express.sid',
    store: sessionStore
  }));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
});

app.configure('development', function(){
  mongoUrl = "mongodb://localhost/core_api_development";
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('test', function(){
  mongoUrl = "mongodb://localhost/core_api_test";
  app.set('port', 2001)
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function(){
  mongoUrl = "mongodb://localhost/core_api_production";
  app.use(express.errorHandler());
});

routes.init(app);

app.listen(3000);

sio = require('socket.io').listen(app);
sockets.init(sio, sessionStore, mongoUrl);

console.log("Express server listening on port 3000");
