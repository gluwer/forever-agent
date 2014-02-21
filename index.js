module.exports = ForeverAgent
ForeverAgent.SSL = ForeverAgentSSL

var util = require('util')
  , Agent = require('http').Agent
  , net = require('net')
  , tls = require('tls')
  , AgentSSL = require('https').Agent

function ForeverAgent(options) {
  var self = this
  self.options = options || {}
  self.requests = {}
  self.sockets = {}
  self.freeSockets = {}
  self.maxSockets = self.options.maxSockets || Agent.defaultMaxSockets
  self.minSockets = self.options.minSockets || ForeverAgent.defaultMinSockets
  self.maxKeepAliveTime = self.options.maxKeepAliveTime || ForeverAgent.defaultMaxKeepAliveTime
  self.on('free', function(socket, host, port) {
    var name = host + ':' + port
    if (!socket.destroyed && self.requests[name] && self.requests[name].length) {
      self.requests[name].shift().onSocket(socket)
      if (self.requests[name].length === 0) {
        // don't leak
        delete self.requests[name]
      }
    } else if (!socket.destroyed && self.sockets[name].length < self.minSockets || self.maxKeepAliveTime > 0) {
      if (!self.freeSockets[name]) self.freeSockets[name] = []
      self.freeSockets[name].push(socket)
      
      // if an error happens while we don't use the socket anyway, meh, throw the socket away
      var onIdleError = function() {
        socket.destroy()
      }
      socket._onIdleError = onIdleError
      socket.on('error', onIdleError)
      if (self.maxKeepAliveTime && socket._events && Array.isArray(socket._events.timeout)) {
        socket.removeAllListeners('timeout');
        // Restore the socket's setTimeout() that was remove as collateral damage.
        socket.setTimeout(self.maxKeepAliveTime, socket._maxKeepAliveTimeout);
      }
    } else {
      socket.destroy()
    }
  })

}
util.inherits(ForeverAgent, Agent)

ForeverAgent.defaultMinSockets = 5
ForeverAgent.defaultMaxKeepAliveTime = 0; // 0 means it is turned off


ForeverAgent.prototype.createConnection = net.createConnection
ForeverAgent.prototype.addRequestNoreuse = Agent.prototype.addRequest
ForeverAgent.prototype.addRequest = function(req, host, port) {
  var name = host + ':' + port
  if (this.freeSockets[name] && this.freeSockets[name].length > 0) { //  && !req.useChunkedEncodingByDefault (not an issue if not streaming)
    var idleSocket = this.freeSockets[name].pop()
    idleSocket.removeListener('error', idleSocket._onIdleError)
    delete idleSocket._onIdleError
    req._reusedSocket = true
    req.onSocket(idleSocket)
  } else {
    this.addRequestNoreuse(req, host, port)
  }
}
Agent.prototype.createSocket = function (name, host, port, localAddress, req) {
  var self = this
  var socket = Agent.prototype.createSocket.call(this, name, host, port, localAddress, req)
  if (self.maxKeepAliveTime) {
    socket._maxKeepAliveTimeout = function () {
      socket.destroy()
    };
    socket.setTimeout(self.maxKeepAliveTime, socket._maxKeepAliveTimeout)
  }
  return socket;
};


ForeverAgent.prototype.removeSocket = function(s, name, host, port) {
  if (this.sockets[name]) {
    var index = this.sockets[name].indexOf(s)
    if (index !== -1) {
      this.sockets[name].splice(index, 1)
    }
  } else if (this.sockets[name] && this.sockets[name].length === 0) {
    // don't leak
    delete this.sockets[name]
    delete this.requests[name]
  }
  
  if (this.freeSockets[name]) {
    var index = this.freeSockets[name].indexOf(s)
    if (index !== -1) {
      this.freeSockets[name].splice(index, 1)
      if (this.freeSockets[name].length === 0) {
        delete this.freeSockets[name]
      }
    }
  }

  if (this.requests[name] && this.requests[name].length) {
    // If we have pending requests and a socket gets closed a new one
    // needs to be created to take over in the pool for the one that closed.
    this.createSocket(name, host, port).emit('free')
  }
}

function ForeverAgentSSL (options) {
  ForeverAgent.call(this, options)
}
util.inherits(ForeverAgentSSL, ForeverAgent)

ForeverAgentSSL.prototype.createConnection = createConnectionSSL
ForeverAgentSSL.prototype.addRequestNoreuse = AgentSSL.prototype.addRequest

function createConnectionSSL (port, host, options) {
  if (typeof port === 'object') {
    options = port;
  } else if (typeof host === 'object') {
    options = host;
  } else if (typeof options === 'object') {
    options = options;
  } else {
    options = {};
  }

  if (typeof port === 'number') {
    options.port = port;
  }

  if (typeof host === 'string') {
    options.host = host;
  }

  return tls.connect(options);
}
