var Backbone = require('backbone');
var _ = require('underscore');
var $ = require('jquery');
var common = require('libremap-common');

// fetches models based on bounding boxes and keeps them up-to-date
// (realized with spatial index via GeoCouch and CouchDB's changes feed)
module.exports = Backbone.Collection.extend({
  // initialize respects the following keys in options:
  // * bbox (mandatory): a valid common.bbox (see libremap-common)
  // The following options can also be set by setting them as properties in
  // collections that inherit from this one:
  // * url: url of the GeoCouch spatial index
  // * changesUrl: url of the CouchDB changes feed
  // * changesFilter: name of the CouchDB filter function that filters documents
  //                  that lie in a given bounding box or whose id is contained
  //                  in a given array of document ids.
  initialize: function (models, options) {
    _.extend(this, _.pick(options, 'bbox', 'url', 'changesUrl', 'changesFilter'));
    Backbone.Collection.prototype.initialize.call(this, arguments);
    this.on('sync', function() {
      this.watch_abort();
      this.watch();
    });
  },
  // fetches all models in the bounding box from couchdb
  // (uses the spatial view)
  fetch: function (options) {
    options = _.extend(options || {}, {
      data: {
        bbox: this.bbox.toGeocouch().toString()
      }
    });
    Backbone.Collection.prototype.fetch.call(this, options);
  },
  // parse output of couchdb's spatial view
  parse: function (response, options) {
    this.update_seq = response.update_seq;
    return _.map(response.rows, function(row) {
      return row.value;
    });
  },
  // sets up live changes from couchdb's _changes feed.
  // sends a bounding box and a list of ids whose nodes are outside the
  // bounding box to the filter function
  watch: function () {
    (function poll() {
      // gather all ids of routers that are inside the collection but outside
      // the current bounding box
      var ids_outside = _.map(
        this.filter(function(model) {
          var loc = model.get('location');
          return !this.bbox.contains(loc.lat, loc.lon);
        }.bind(this)),
        function(model) {
          return model.id;
        });
      // create a new request to the changes feed
      this.changes_request = $.ajax({
        url: this.changesUrl + '?' + $.param({
          filter: this.changesFilter,
          feed: 'longpoll',
          include_docs: 'true',
          since: this.update_seq || 0
        }),
        // use POST because GET potentially has a low maximal length of the
        // query string
        type: "post",
        data: JSON.stringify({
          "ids": ids_outside,
          "bbox": this.bbox.toGeocouch()
        }),
        dataType: "json",
        contentType: "application/json",
        timeout: 65000,
        success: function(data) {
          // update update_seq, merge the changes and set up a new changes
          // request
          this.update_seq = data.last_seq;
          var docs = _.map(data.results, function(row) {
            return row.doc;
          });
          this.set(docs, {remove: false});
          poll.bind(this)();
        }.bind(this),
        error: function(jqxhr, msg_status, msg_err) {
          // if not aborted via watch_abort: retry after 10s
          // otherwise: do nothing :)
          if (this.changes_request) {
            this.changes_request = null;
            console.log('changes feed: failed ('+msg_status+'): '+msg_err);
            console.log('changes feed: retrying in 10s...');
            setTimeout(poll.bind(this), 10000);
          }
        }.bind(this)
      });
    }).bind(this)();
  },
  // abort watch
  watch_abort: function() {
    if (this.changes_request) {
      var request = this.changes_request;
      this.changes_request = null;
      request.abort();
    }
  },
  // change the bounding box and fetch
  // bbox has to be a valid common.bbox
  set_bbox: function(bbox, options) {
    this.bbox = bbox;
    this.fetch( _.extend(options||{}, {remove: false}));
  },
});

/*
var api_base_url = 'http://libremap.net/api';
LibreMap.RouterBboxCollection =  LibreMap.BboxCollection.extend({
  url: api_base_url + '/routers_by_location_stripped',
  byAliasUrl: api_base_url + '/routers_by_alias_stripped',
  changesUrl: api_base_url + '/changes',
  changesFilter: 'libremap-api/by_id_or_bbox',
  model: LibreMap.RouterStripped
});
*/
