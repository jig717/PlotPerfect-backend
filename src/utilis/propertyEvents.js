const EventEmitter = require("events");

const propertyEvents = new EventEmitter();

const emitPropertyEvent = (event, payload) => {
  propertyEvents.emit("property:event", {
    event,
    payload,
    emittedAt: new Date().toISOString(),
  });
};

module.exports = {
  propertyEvents,
  emitPropertyEvent,
};
