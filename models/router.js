var Backbone = require('backbone');

module.exports = Backbone.Model.extend({
  urlRoot: '/api/router/',
  idAttribute: '_id'
});
