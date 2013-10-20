var BboxCollection = require('./bbox');

// extens BboxCollection s.t. models corresponding to link endpoints are also
// pulled in. Models that are added as link endpoints are automatically watched
// for changes.
module.exports = BboxCollection.extend({
  // initialize respects the key 'byAliasUrl' and all options that can be
  // passed to BboxCollection (bbox is mandatory!)
  initialize: function (models, options) {
    _.extend(this, _.pick(options, 'byAliasUrl'));
    BboxCollection.prototype.initialize.call(this, arguments);
  },
  fetch_links: function(models) {
    // TODO respect models parameter :)
    var models_inbbox = this.filter(function(model) {
      var loc = model.get('location');
      return this.bbox.contains(loc.lat, loc.lon);
    }.bind(this));
    var links = _.without(
      _.map(models_inbbox, function(model){
        return model.get('links');
      }), undefined);
    var aliases = _.map(_.flatten(links), function(link) {
      return _.pick(link, 'alias', 'type');
    });

    var known_aliases_strings = _.map(_.flatten(
        _.without(this.pluck('aliases'), undefined)
      ), JSON.stringify).sort();

    var unknown_aliases = _.reject(aliases, function (alias) {
      return _.indexOf(known_aliases_strings, JSON.stringify(alias))>=0;
    });

    console.log('debug: fetch missing links: '+JSON.stringify(unknown_aliases));

    return $.ajax({
      url: this.byAliasUrl,
      // use POST because GET potentially has a low maximal length of the
      // query string
      type: "post",
      data: JSON.stringify({"keys": unknown_aliases}),
      dataType: "json",
      contentType: "application/json",
      success: function(data) {
        var docs = _.pluck(data.rows, 'value');
        this.set(docs, {remove: false});
        this.watch_abort();
        this.watch();
      }.bind(this),
      error: function(jqxhr, msg_status, msg_err) {
        console.log('fetch_links: failed ('+msg_status+'): '+msg_err);
      }
    });
  }
});
