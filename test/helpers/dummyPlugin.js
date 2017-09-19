function DummyPlugin (config) {
  this.handlers = {}
  this.transfers = []
  this.prefix = config.prefix
}

DummyPlugin.prototype = {
  on (eventName, callback) {
    this.handlers[eventName] = callback
  },
  sendRequest (message) {
    if (message.to === this.prefix + 'connie' && Buffer.from(message.ilp, 'base64').toString('ascii') === 'Is your name connie?') {
      return Promise.resolve({
        id: message.id,
        from: message.to,
        to: message.from,
        ledger: message.ledger,
        ilp: Buffer.from('011c000000000754d4c00e672e75732e6e657875732e626f620304104100', 'hex').toString('base64'),
        custom: {}
      })
    }
  },
  sendTransfer (transfer) {
    this.transfers.push(transfer)
    return Promise.resolve(null)
  },
  connect () {
    this.connected = true
  },
  disconnect () {
    this.connected = false
  },
  registerRequestHandler () {},
  getAccount () { return this.prefix + 'dummy-account' },
  getInfo () { return { prefix: this.prefix } },
  getBalance () { return Promise.resolve('260') },
  fulfillCondition (transferId, conditionBase64) {
    return Promise.resolve(this.successCallback(transferId, conditionBase64))
  },
  rejectIncomingTransfer (transferId, rejectionReasonObj) {
    return Promise.resolve(this.failureCallback(transferId, rejectionReasonObj))
  }
}

module.exports = DummyPlugin
