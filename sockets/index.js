(function (exports) {

  "use strict";

    var mongo       = require('mongodb')
    , ObjectID      = mongo.ObjectID
    , connect       = require('express/node_modules/connect')
    , parseCookie   = connect.utils.parseCookie
    , Session       = connect.middleware.session.Session
    , crud          = require('./crud')
    , store         = require('redis').createClient()
    , pub           = require('redis').createClient()
    , sub           = require('redis').createClient();

  var QueryCommand  = mongo.QueryCommand
    , Cursor        = mongo.Cursor
    , Collection    = mongo.Collection;

  function readAndSend (socket, db, collection) {
    collection.find({}, {'tailable': 1, 'sort': [['$natural', 1]]}, function(err, cursor) {
      cursor.intervalEach(100, function(err, item) {
        if(item != null) {
          db.collection (item["message_type"], function (err, collection) {
            collection.findOne({_id: new ObjectID(item["message_id"])}, function(err, result) {
              socket.emit('all', result);
            });
          });
        }
      });
    });
  }

  Collection.prototype.isCapped = function isCapped(callback) {
    this.options(function(err, document) {
      if(err != null) {
        callback(err);
      } else if (document == null) {
        callback ("Collection.isCapped options document is null.");
      } else {
        callback(null, document.capped);
      }
    });
  }

  Cursor.prototype.intervalEach = function(interval, callback) {
    var self = this;
    if (!callback) {
      throw new Error('callback is mandatory');
    }

    if(this.state != Cursor.CLOSED) {
      setTimeout(function(){
        self.nextObject(function(err, item) {
          if(err != null) return callback(err, null);

          if(item != null) {
            callback(null, item);
            self.intervalEach(interval, callback);
          } else {
            self.state = Cursor.CLOSED;
            callback(err, null);
          }

          item = null;
        });
      }, interval);
    } else {
      callback(new Error("Cursor is closed"), null);
    }
  }


  exports.init = function (sio, sessionStore, mongoUrl) {

    // ----------------------------------------------------
    // Autherization
    //
    sio.set('authorization', function (data, callback) {

      // Without a cookie that holds the user's session id
      // the user can not be authorized.
      if (!data.headers.cookie) {
        return callback('No cookie transmitted.', false);
      }

      data.cookie = parseCookie(data.headers.cookie);
      data.sessionID = data.cookie['express.sid'];
      data.sessionStore = sessionStore;

      // Using the session id found in the cookie, find the
      // session in Redis.  The authorization will fail if the
      // session is not found.
      sessionStore.get(data.sessionID, function (err, session) {
        if (err || !session) {
          return callback('Error', false);
        } else {
          data.session = new Session(data, session);
          return callback(null, true);
        }
      });

    });

    // ----------------------------------------------------
    // Connection
    //
    sio.on('connection', function (socket) {
      var hs = socket.handshake
        , sessionID = hs.sessionID
        , watchedModels = [];


      // Generic message handler to receive all messages
      // published via Redis, convert the message to an object
      // using JSON and emit it through the user's connected
      // socket.  Backbone Sync will receive this object and
      // update the appropriate models based on the 'key'
      sub.on('message', function (channel, message) {
        var msg = JSON.parse(message);
        if (msg && msg.key) {
          socket.emit(msg.key, msg.data);
        }
      });

      // ----------------------------------------------------
      // Connect
      //
      socket.on('connect', function (data, callback) {
        var i, len, d = {};

        watchedModels = data;

        function fillData(model, count) {
          d[model] = { locks: [] };
          return function (err, result) {
            d[model].locks = result;
            // When all of the information has been collected
            // send it back to the client through their callback.
            if (Object.keys(d).length === count) {
              callback(null, d);
            }
          };
        }

        // Return to the client an object containing all of
        // the locks currently maintained that the client is
        // interested in.  The client will use this info to
        // initialize the app with locks if any were created
        // before they got to the app.
        for (i = 0, len = data.length; i < len; i++) {
          store.hkeys(data[i], fillData(data[i], len));
        }

      });

      // ----------------------------------------------------
      // Disconnect
      //
      socket.on('disconnect', function (data, callback) {

        // When a client disconnects remove any locks they
        // might have created by looping through all keys
        // and comparing the session id of the key to the
        // session id of the user who disconnected.
        function removeLocks(val) {
          var key = val;
          return function (err, result) {
            var keys, id, i;
            if (!err && result) {
              keys = Object.keys(result);
              i = keys.length;
              while (i--) {
                id = keys[i];
                if (result[id] === sessionID) {
                  store.hdel(key, id);
                  pub.publish('cms', '/' + key + '/' + id + ':unlock');
                }
              }
            }
          };
        }

        // Only check for locks in the models that the client
        // could have created keys for.
        watchedModels.forEach(function (val, idx, array) {
          store.hgetall(val, removeLocks(val));
        });

      });

      mongo.Db.connect (mongoUrl, function (err, db) {
        db.collection ("messages", function (err, collection) {
          collection.isCapped(function (err, capped) {
            if (err) {
              console.log ("Error when detecting capped collection.  Aborting.  Capped collections are necessary for tailed cursors.");
              process.exit(1);
            }
            if (!capped) {
              console.log (collection + " is not a capped collection. Aborting.  Please use a capped collection for tailable cursors.");
              process.exit(2);
            }
            console.log ("Success connecting to " + mongoUrl);
            readAndSend(socket, db, collection);
          });
        });
      });

    });

  };

}(exports));
