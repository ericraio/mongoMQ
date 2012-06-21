(function (module) {

  "use strict";

  var mongoose = require('mongoose')
    , MessageSchema;

  MessageSchema = new mongoose.Schema({});

  module.exports = mongoose.model('Message', MessageSchema);

}(module));
