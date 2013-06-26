var LRU = require("lru-cache");
var cache = LRU({
  max: 10000,  
  maxAge: 1000 * 60 * 60
});

/**
 * Generate the possible patterns that might match a topic.
 *
 * @param {String} the topic
 * @return the list of the patterns
 */
function _topicPatterns(topic) {
  var parts = topic.split("/");
  var patterns = [topic];
  var i, a = [], b = [], j, k, h, list = [];

  for (j=1; j < parts.length; j++) {
    list.length = 0; // clear the array

    for (i=0; i < parts.length; i++) {
      a.length = 0;
      b.length = 0;

      list.push(i);
      for (h = 1; list.length < j; h++) {
        list.unshift(parts.length - h);
      }

      for (k=0; k < parts.length; k++) {
        if (list.indexOf(k) >= 0) {
          a.push(parts[k]);
          b.push(parts[k]);
        } else {
          if (k === 0 || a[a.length - 1] !== "#") {
            a.push("#");
          }
          b.push("+");
        }
      }

      patterns.push(a.join("/"));
      patterns.push(b.join("/"));
      list.shift();
    }
  }

  return patterns;
}

/**
 * Generate the possible patterns that might match a topic.
 * Memozied version.
 *
 * @param {String} the topic
 * @return the list of the patterns
 */
function topicPatterns(topic) {
  var result = cache.get(topic);
  if (!result) {
    result = _topicPatterns(topic);
  }
  cache.set(topic, result);
  return result;
}


module.exports.topicPatterns = topicPatterns;
