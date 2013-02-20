
# Moscas in the trees

This example uses three moscas deployed as a tree of broker:
 * The first is the "root" and operates on port 4883.
 * The second is a leaf of the first and operates on port 4884.
   It publishes every message it receives to the first broker using prefix
   '/s'.
 * The third is a leaf of the second and operates on port 4885.
   It publishes every message it receives to the second broker using prefix
   '/t'.

1. Start redis
2. cd in this folder
3. Run `mosca -c firsConfig.js -v`
4. Run `mosca -c secondConfig.js -v`
5. run `mosquitto_sub -p 4883  -t "/#" -v`
6. run `mosquitto_pub -t "hello/world" -m "dd" -p 4885`
