/*
Copyright (c) 2013-2016 Matteo Collina, http://matteocollina.com

Permission is hereby granted, free of charge, to any person
obtaining a copy of this software and associated documentation
files (the "Software"), to deal in the Software without
restriction, including without limitation the rights to use,
copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.
*/
"use strict";

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
