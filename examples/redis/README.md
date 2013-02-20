
# A Redis based configuration

This example uses two redis-based moscas, but the
second is deployed using the prefix '/a'

1. Start redis
2. cd in this folder
3. Run `mosca -c firsConfig.js -v`
4. Run `mosca -c secondConfig.js -v`
5. run `mosquitto_sub -p 4883  -t "/a/#" -v`
6. run `mosquitto_pub -t "hello/world" -m "dd" -p 4884`
