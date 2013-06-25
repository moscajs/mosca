
module.exports = {
  topicPatterns: function(topic) {
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

};
