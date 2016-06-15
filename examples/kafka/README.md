Kafka MQTT Bridge Example
=========================

Here is a Mosca example to expose an MQTT interface to [kafka](//kafka.apache.org). Try it right now in docker!

Quickstart
----------

1. To try out the example with no changes, start a kafka server:

        docker run -d --env ADVERTISED_HOST=kafka01 --hostname=kafka01 --env ADVERTISED_PORT=9092 --name=kafka01 spotify/kafka

2. Once the kafka is running, use the console producer to create some expected topics.

        for topic in spiddal-ctd \
                     spiddal-fluorometer \
                     airmar-rinville-1 \
                     ais-rinville-1-geojson \
                     spiddal-hydrophone
          do docker exec -i -t kafka01 /bin/bash -c \
                  "date | /opt/kafka_*/bin/kafka-console-producer.sh \
                            --broker-list kafka01:9092 --topic $topic"
        done

3. Now start the kakfka mqtt bridge, linked to the kafka instance.

        docker run -d -p 2298:80 --link kafka01:kafka01 --link kafka01:kafka02 --link kafka01:kafka03 fullergalway/kafkamqtt

4. Open up your browser and go to http://server:2298 for example [http://localhost:2298](http://localhost:2298)

5. Finally, publish some data to your kafka topics by repeating step 2 above, and watch the data appear in your browser.

Building
--------

Before building, you might like to modify [auth.json](auth.json) and [index.html](index.html) to reference your own topics.

    docker build -f examples/kafka/Dockerfile -t kafkamqtt .


Running
--------

To run the mosca mqtt server connected to your own kafka, provide the ip addresses when launching your docker container. (You'll need to add all three hosts (kafka01,kafka02,kafka03); repeat the ip address if you have fewer than three nodes in your cluster).

    docker run -d --name=kafkamqtt -p 2298:80 --add-host="kafka01:172.17.1.86" --add-host="kafka02:172.17.1.87" --add-host="kafka03:172.17.1.88" kafkamqtt


Credits
-------

* [Matteo Collina](//twitter.com/matteocollina)
* [Robert Fuller](//github.com/fullergalway)
* [Adam Leadbetter](//twitter.com/adamleadbetter)
* [Damian Smyth](//ie.linkedin.com/in/damian-smyth-4b85563)
* [Eoin O'Grady](//ie.linkedin.com/in/eoin-o-grady-6177b)
