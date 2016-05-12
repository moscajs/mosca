local sum = 0
local messageId = KEYS[1]
local payload   = KEYS[2]
local packetTtl = tonumber(KEYS[3])
local listTtl   = tonumber(KEYS[4])

for i=1, #ARGV do
  local packetKey = 'packets:' .. ARGV[i] .. ':' .. messageId;
  local listKey = 'packets:' .. ARGV[i];
  redis.call("SET", packetKey, payload, "PX", packetTtl)
  redis.call("RPUSH", listKey, packetKey)
  redis.call("PEXPIRE", listKey, listTtl)
  sum = sum + 1
end

return sum