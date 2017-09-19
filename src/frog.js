const BtpPacket = require('btp-packet')
const IlpPacket = require('ilp-packet')
const crypto = require('crypto')

function generateRequestId () {
  const buf = crypto.randomBytes(4)
  const hex = buf.toString('hex')
  return parseInt(hex, 16)
}

function MakeProtocolData (obj) {
  let protocolData = []
  if (obj.from) {
    protocolData.push({
      protocolName: 'from',
      contentType: BtpPacket.MIME_TEXT_PLAIN_UTF8,
      data: Buffer.from(obj.from, 'ascii')
    })
  }
  if (obj.to) {
    protocolData.push({
      protocolName: 'to',
      contentType: BtpPacket.MIME_TEXT_PLAIN_UTF8,
      data: Buffer.from(obj.to, 'ascii')
    })
  }
  if (obj.ilp) {
    protocolData.push({
      protocolName: 'ilp',
      contentType: BtpPacket.MIME_APPLICATION_OCTET_STREAM,
      data: Buffer.from(obj.ilp, 'base64')
    })
  } else {
    protocolData.push({
      protocolName: 'ccp',
      contentType: BtpPacket.MIME_APPLICATION_JSON,
      data: Buffer.from(JSON.stringify(obj.custom), 'ascii')
    })
  }
  return protocolData
}

function Frog (plugin, send) {
  this.plugin = plugin
  this.send = send
  this.registerPluginEventHandlers()
  this.requestsReceived = {}
}

Frog.prototype = {
  announceMyRoute () {
    const obj = {
      type: BtpPacket.TYPE_MESSAGE,
      requestId: 1,
      data: {
        protocolData: MakeProtocolData({
          custom: {
            type: 0,
            data: {
              new_routes: [
                {
                  destination_ledger: this.plugin.getInfo().prefix,
                  points: 'AAAAAAAAAAAAAAAAAAAAAP////////////////////8='
                }
              ]
            }
          }
        })
      }
    }
    return this.send(obj)
  },
  registerPluginEventHandlers () {
    this.plugin.on('incoming_prepare', (transfer) => {
      try {
        this.send({
          type: BtpPacket.TYPE_PREPARE,
          requestId: generateRequestId(),
          data: {
            transferId: transfer.id,
            expiresAt: new Date(transfer.expiresAt),
            amount: parseInt(transfer.amount),
            executionCondition: Buffer.from(transfer.executionCondition, 'base64'),
            protocolData: MakeProtocolData(transfer)
          }
        })
      } catch (e) {
        console.error(e)
      }
    })
    this.plugin.registerRequestHandler((request) => {
      const promise = new Promise((resolve, reject) => {
        this.requestsReceived[request.id] = { resolve, reject }
      })
      this.send({
        type: BtpPacket.TYPE_MESSAGE,
        requestId: request.id,
        data: {
          protocolData: MakeProtocolData(request)
        }
      })
      return promise
    })
    this.plugin.on('outgoing_fulfill', (transfer, fulfillment) => {
      try {
        this.send({
          type: BtpPacket.TYPE_FULFILL,
          requestId: generateRequestId(),
          data: {
            transferId: transfer.id,
            fulfillment: Buffer.from(fulfillment, 'base64'),
            protocolData: []
          }
        })
      } catch (e) {
        console.error(e)
      }
    })
    this.plugin.on('outgoing_reject', (transfer, rejectionReason) => {
      try {
        this.send({
          type: BtpPacket.TYPE_REJECT,
          requestId: generateRequestId(),
          data: {
            transferId: transfer.id,
            rejectionReason,
            protocolData: []
          }
        })
      } catch (e) {
        console.error(e)
      }
    })
  },

  _handleIlpMessage (obj, protocolDataAsObj) {
    const lpiRequest = {
      id: obj.requestId.toString(),
      from: this.plugin.getAccount(),
      to: protocolDataAsObj.to.data.toString('ascii'),
      ledger: this.plugin.getInfo().prefix,
      ilp: protocolDataAsObj.ilp.data.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
      custom: {}
    }
    this.plugin.sendRequest(lpiRequest).then((response) => {
      const responsePacketBuf = Buffer.from(response.ilp, 'base64')
      const ilpResponse = IlpPacket.deserializeIlpPacket(responsePacketBuf)
      const responseProtocolData = MakeProtocolData(response)
      if (ilpResponse.type === IlpPacket.TYPE_ILP_ERROR) {
        this.send({
          type: BtpPacket.TYPE_ERROR,
          requestId: obj.requestId,
          data: {
            rejectionReason: responsePacketBuf,
            protocolData: responseProtocolData
          }
        })
      } else {
        this.send({
          type: BtpPacket.TYPE_RESPONSE,
          requestId: obj.requestId,
          data: {
            protocolData: MakeProtocolData(response)
          }
        })
      }
    }, err => {
      this.send({
        type: BtpPacket.TYPE_ERROR,
        requestId: obj.requestId,
        data: {
          rejectionReason: err,
          protocolData: []
        }
      })
    })
  },

  _handleInfoMessage (obj, protocolDataAsObj) {
    if (obj.data.protocolData[0].data[0] === 0) {
      this.send({
        type: BtpPacket.TYPE_RESPONSE,
        requestId: obj.requestId,
        data: {
          protocolData: [
            {
              protocolName: 'info',
              contentType: BtpPacket.MIME_TEXT_PLAIN_UTF8,
              data: Buffer.from(this.plugin.getAccount(), 'ascii')
            }
          ]
        }
      })
    } else {
      this.send({
        type: BtpPacket.TYPE_RESPONSE,
        requestId: obj.requestId,
        data: {
          protocolData: [
            {
              protocolName: 'info',
              contentType: BtpPacket.MIME_APPLICATION_JSON,
              data: Buffer.from(JSON.stringify(this.plugin.getInfo()), 'ascii')
            }
          ]
        }
      })
    }
  },

  _handleBalanceMessage (obj, protocolDataAsObj) {
    this.plugin.getBalance().then(decStr => {
      let hexStr = parseInt(decStr).toString(16)
      if (hexStr.length % 2 === 1) {
        hexStr = '0' + hexStr
      }
      let balanceBuf = Buffer.from(hexStr, 'hex')
      while (balanceBuf.length < 8) {
        balanceBuf = Buffer.concat([ Buffer.from([ 0 ]), balanceBuf ])
      }
      this.send({
        type: BtpPacket.TYPE_RESPONSE,
        requestId: obj.requestId,
        data: {
          protocolData: [
            {
              protocolName: 'balance',
              contentType: BtpPacket.MIME_APPLICATION_OCTET_STREAM,
              data: balanceBuf
            }
          ]
        }
      })
    })
  },

  _handleMessage (obj, protocolDataAsObj) {
    switch (obj.data.protocolData[0].protocolName) {
      case 'ilp':
        return this._handleIlpMessage(obj, protocolDataAsObj)
      case 'info':
        return this._handleInfoMessage(obj, protocolDataAsObj)
      case 'balance':
        return this._handleBalanceMessage(obj, protocolDataAsObj)
    }
  },

  handleConnection () {
    this.announceMyRoute()
  },

  handleMessage (obj) {
    try {
      let protocolDataAsObj = {}
      let protocolDataAsArr
      protocolDataAsArr = obj.data.protocolData

      for (let i = 0; i < protocolDataAsArr.length; i++) {
        protocolDataAsObj[protocolDataAsArr[i].protocolName] = protocolDataAsArr[i]
      }
      switch (obj.type) {
        case BtpPacket.TYPE_ACK:
          // If it's a response to sendRequest, then resolve it:
          if (this.requestsReceived[obj.requestId]) {
            this.requestsReceived[obj.requestId].resolve()
            delete this.requestsSent[obj.requestId]
          }
          break
        case BtpPacket.TYPE_RESPONSE:
          // If it's a response to sendRequest, then resolve it:
          if (this.requestsReceived[obj.requestId]) {
            if (Array.isArray(obj.data) && obj.data.length) {
              this.requestsReceived[obj.requestId].resolve(obj.data[0])
            } else { // treat it as an ACK, see https://github.com/interledger/rfcs/issues/283
              this.requestsReceived[obj.requestId].resolve()
            }
            delete this.requestsSent[obj.requestId]
          }
          break

        case BtpPacket.TYPE_ERROR:
          // If it's a response to sendRequest, then resolve it:
          if (this.requestsReceived[obj.requestId]) {
            // according to LPI, an error response should fulfill (not reject) the request handler promise
            this.requestsReceived[obj.requestId].fulfill(obj.data.rejectionReason)
            delete this.requestsSent[obj.requestId]
          }
          break

        case BtpPacket.TYPE_PREPARE:
          const lpiTransfer = {
            id: obj.data.transferId.toString(),
            from: this.plugin.getAccount(),
            to: protocolDataAsObj.to.data.toString('ascii'),
            ledger: this.plugin.getInfo().prefix,
            amount: obj.data.amount.toString(),
            ilp: protocolDataAsObj.ilp.data.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
            noteToSelf: {},
            executionCondition: obj.data.executionCondition.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
            expiresAt: obj.data.expiresAt.toISOString(),
            custom: {}
          }
          try {
            this.plugin.sendTransfer(lpiTransfer).then(result => {
              this.send({
                type: BtpPacket.TYPE_ACK,
                requestId: obj.requestId,
                data: []
              })
            }, err => {
              console.error(err)
              this.send({
                type: BtpPacket.TYPE_ERROR,
                requestId: obj.requestId,
                data: {
                  rejectionReason: Buffer.from(err.message, 'ascii'), // TODO: use the right error object here ...
                  protocolData: []
                }
              })
            })
          } catch (e) {
            console.error(e)
          }
          break

        case BtpPacket.TYPE_FULFILL:
          const fulfillmentBase64 = obj.data.fulfillment.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
          this.plugin.fulfillCondition(obj.data.transferId, fulfillmentBase64).then(() => {
            this.send({
              type: BtpPacket.TYPE_ACK,
              requestId: obj.requestId,
              data: []
            })
          }, err => {
            this.send({
              type: BtpPacket.TYPE_ERROR,
              requestId: obj.requestId,
              data: {
                rejectionReason: Buffer.from(err.message, 'ascii'), // TODO: use the right error object here ...
                protocolData: []
              }
            })
          })
          break

        case BtpPacket.TYPE_REJECT:
          this.plugin.rejectIncomingTransfer(obj.data.transferId, IlpPacket.deserializeIlpError(obj.data.rejectionReason))
          break

        case BtpPacket.TYPE_MESSAGE:
          this._handleMessage(obj, protocolDataAsObj)
          break
        default:
         // ignore
      }
    } catch (e) {
      console.error(e)
    }
  },

  start () {
    return this.plugin.connect()
  },

  stop () {
    return this.plugin.disconnect()
  }
}
module.exports = Frog
