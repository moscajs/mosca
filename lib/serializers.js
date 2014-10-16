"use strict";

module.exports = {
  clientSerializer: clientSerializer,
  packetSerializer: packetSerializer
};

/**
 * Serializises a client for Bunyan.
 *
 * @api private
 */
function clientSerializer(client) {
  return client.id;
}

/**
 * Serializises a packet for Bunyan.
 *
 * @api private
 */
function packetSerializer(packet) {
  var result = {};

  if (packet.messageId) {
    result.messageId = packet.messageId;
  }

  if (packet.topic) {
    result.topic = packet.topic;
  }

  if (packet.qos) {
    result.qos = packet.qos;
  }

  if (packet.unsubscriptions) {
    result.unsubscriptions = packet.unsubscriptions;
  }

  if (packet.subscriptions) {
    result.subscriptions = packet.subscriptions;
  }

  return result;
}
