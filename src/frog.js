const BtpPacket = require('btp-packet')
const IlpPacket = require('ilp-packet')
const crypto = require('crypto')
const uuid = require('uuid/v4')

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
      contentType: BtpPacket.MIME_APPLICATION_OCTET_STRING,
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

function lpiErrorToBtpError (err, whileFulfilling = false) {
  const messageAndCode = {
    UnreachableError: { code: 'T00', message: 'Temporary error, indicating that the connector cannot process this request at the moment. Try again later' },
    NotAcceptedError: { code: 'F00', message: 'Data were symantically invalid' },
    InvalidFieldsError: { code: 'F01', message: 'At least one field contained structurally invalid data, e.g. timestamp full of garbage characters' },
    TransferNotFoundError: { code: 'F03', message: 'The transferId included in the packet does not reference an existing transfer' },
    InvalidFulfillmentError: { code: 'F04', message: 'The fulfillment included in the packet does not match the transfer\'s condition' },
    DuplicateIdError: { code: 'F05', message: 'The transferId and method match a previous request, but other data do not' },
    AlreadyRolledBackError: { code: 'F06', message: 'The transfer cannot be fulfilled because it has already been rejected or expired' },
    AlreadyFulfilledError: { code: 'F07', message: 'The transfer cannot be rejected because it has already been fulfilled' },
    InsufficientBalanceError: { code: 'F08', message: 'The transfer cannot be prepared because there is not enough available liquidity' }
  }

  function makeError (name) {
    let err = new Error(messageAndCode[name].message)
    err.code = messageAndCode[name].code
    err.name = name
    return err
  }

  switch (err.name) {
    // errors with one-to-one mapping:
    case 'InvalidFieldsError':
    case 'UnreachableError':
    case 'TransferNotFoundError':
    case 'DuplicateIdError':
    case 'AlreadyRolledBackError':
    case 'AlreadyFulfilledError':
    case 'InsufficientBalanceError':
      return makeError(err.name)
    case 'NotAcceptedError':
      if (whileFulfilling) {
        return makeError('InvalidFulfillmentError')
      }
      return makeError(err.name)
    // LPI-only errors:
    case 'TransferNotConditionalError': return makeError('F03', 'TransferNotFoundError')
    case 'AccountNotFoundError': return makeError('F01', 'InvalidFieldsError')
    case 'NoSubscriptionsError': return makeError('T00', 'UnreachableError')
    // case 'MissingFulfillmentError':
    // case 'RequestHandlerAlreadyRegisteredError':
    default: return makeError('F00', 'NotAcceptedError')
  }
}

function lpiErrorToRejectionMessage (err, triggeredBy) {
  return {
    code: err.code,
    name: err.name,
    message: err.message,
    triggered_by: triggeredBy,
    forwarded_by: [],
    triggered_at: new Date().toISOString(),
    additional_info: {}
  }
}

function btpErrorToLpiError (err) {
  const message = {
    InvalidFieldsError: 'Arguments or configuration were invalidated client-side',
    UnreachableError: 'An error occured due to connection failure',
    TransferNotFoundError: 'A requested transfer does not exist, or is not conditional, and cannot be fetched', // also used for TransferNotConditionalError
    DuplicateIdError: 'A transfer with the same ID and different fields has been sent',
    AlreadyRolledBackError: 'A requested transfer has already been timed out or rejected and cannot be modified',
    AlreadyFulfilledError: 'A requested transfer has already been fulfilled and cannot be modified',
    InsufficientBalanceError: 'An operation has been rejected because the source balance isn\'t high enough',
    NotAcceptedError: 'An operation has been rejected due to ledger-side logic'
  }

  function makeError (name) {
    let err = new Error(message[name])
    err.name = name
    return err
  }

  switch (err.name) {
    // errors with one-to-one mapping:
    case 'UnreachableError': return makeError(err.name)
    case 'NotAcceptedError': return makeError(err.name)
    case 'InvalidFieldsError': return makeError(err.name)
    case 'TransferNotFoundError': return makeError(err.name)
    case 'DuplicateIdError': return makeError(err.name)
    case 'AlreadyRolledBackError': return makeError(err.name)
    case 'AlreadyFulfilledError': return makeError(err.name)
    case 'InsufficientBalanceError': return makeError(err.name)

    // BTP-only error, see
    // https://github.com/interledger/rfcs/blob/726705c/0004-ledger-plugin-interface/0004-ledger-plugin-interface.md#fulfillcondition
    case 'InvalidFulfillmentError': return makeError('NotAcceptedError')
    default: return makeError('NotAcceptedError')
  }
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
      data: MakeProtocolData({
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
    return this.send(obj)
  },
  registerPluginEventHandlers () {
    this.plugin.on('incoming_prepare', (transfer) => {
      try {
        this.send({
          type: BtpPacket.TYPE_PREPARE,
          requestId: generateRequestId(),
          data: {
            transferId: transfer.id, // String in both LPI and BTP
            expiresAt: new Date(transfer.expiresAt), // String in LPI, DateTime in BTP
            amount: transfer.amount, // String in both
            executionCondition: transfer.executionCondition, // Base64 in both
            protocolData: MakeProtocolData(transfer)
          }
        })
      } catch (e) {
        console.error(e)
      }
    })
    this.plugin.registerRequestHandler((request) => {
      const promise = new Promise((resolve, reject) => {
        this.requestsReceived[request.id] = {
          resolve (responseData) { // should be used both for BTP Response and BTP Error!
            resolve({
              id: uuid(), // in LPI, both messages involved in a request get their own message id
              from: request.to,
              to: request.from,
              ledger: request.ledger,
              ilp: responseData, // undefined in case of Ack
              custom: {}
            })
          },
          reject // should only be used if something really goes wrong, not for BTP Error!
        }
      })
      this.send({
        type: BtpPacket.TYPE_MESSAGE,
        requestId: request.id,
        data: MakeProtocolData(request)
      })
      return promise
    })
    this.plugin.on('outgoing_fulfill', (transfer, fulfillment) => {
      try {
        this.send({
          type: BtpPacket.TYPE_FULFILL,
          requestId: generateRequestId(),
          data: {
            transferId: transfer.id, // String in both LPI and BTP
            fulfillment, // Base64 in both
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
            transferId: transfer.id, // String in both LPI and BTP
            rejectionReason: Buffer.from(rejectionReason, 'base64'), // Base64 in LPI, Buffer in BTP
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
      id: obj.requestId.toString(), // String in LPI, Number in BTP
      from: this.plugin.getAccount(), // String
      to: protocolDataAsObj.to.data.toString('ascii'), // String in LPI, Buffer in BTP
      ledger: this.plugin.getInfo().prefix, // String
      ilp: protocolDataAsObj.ilp.data.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), // Base64 in LPI, Buffer in BTP
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
            rejectionReason: response.ilp, // Base64 in both LPI and BTP
            protocolData: responseProtocolData
          }
        })
      } else {
        this.send({
          type: BtpPacket.TYPE_RESPONSE,
          requestId: obj.requestId,
          data: MakeProtocolData(response)
        })
      }
    }, err => {
      this.send({
        type: BtpPacket.TYPE_ERROR,
        requestId: obj.requestId,
        data: {
          rejectionReason: lpiErrorToBtpError(err),
          protocolData: []
        }
      })
    })
  },

  _handleInfoMessage (obj, protocolDataAsObj) {
    if (protocolDataAsObj.info.data[0] === 0) {
      this.send({
        type: BtpPacket.TYPE_RESPONSE,
        requestId: obj.requestId,
        data: [
          {
            protocolName: 'info',
            contentType: BtpPacket.MIME_TEXT_PLAIN_UTF8,
            data: Buffer.from(this.plugin.getAccount(), 'ascii')
          }
        ]
      })
    } else {
      this.send({
        type: BtpPacket.TYPE_RESPONSE,
        requestId: obj.requestId,
        data: [
          {
            protocolName: 'info',
            contentType: BtpPacket.MIME_APPLICATION_JSON,
            data: Buffer.from(JSON.stringify(this.plugin.getInfo()), 'ascii')
          }
        ]
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
        data: [
          {
            protocolName: 'balance',
            contentType: BtpPacket.MIME_APPLICATION_OCTET_STRING,
            data: balanceBuf
          }
        ]
      })
    })
  },

  _handleMessage (obj, primaryProtocol, protocolDataAsObj) {
    switch (primaryProtocol) {
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
      if ([BtpPacket.TYPE_ACK, BtpPacket.TYPE_MESSAGE, BtpPacket.TYPE_RESPONSE].indexOf(obj.type) !== -1) {
        protocolDataAsArr = obj.data
      } else {
        protocolDataAsArr = obj.data.protocolData
      }

      for (let i = 0; i < protocolDataAsArr.length; i++) {
        protocolDataAsObj[protocolDataAsArr[i].protocolName] = protocolDataAsArr[i]
      }
      let primaryProtocol
      let primaryData
      if (protocolDataAsArr.length) {
        primaryProtocol = protocolDataAsArr[0].protocolName
        primaryData = protocolDataAsArr[0].data
      }

      switch (obj.type) {
        case BtpPacket.TYPE_ACK:
          // If it's a response to a route broadcast, then resolve it:
          if (this.requestsReceived[obj.requestId]) {
            this.requestsReceived[obj.requestId].resolve()
            delete this.requestsSent[obj.requestId]
          }
          break
        case BtpPacket.TYPE_RESPONSE:
          // If it's a response to a quote request, then resolve it:
          if (this.requestsReceived[obj.requestId]) {
            this.requestsReceived[obj.requestId].resolve(primaryData)
            delete this.requestsSent[obj.requestId]
          }
          break

        case BtpPacket.TYPE_ERROR:
          // If it's an error in response to a route or quote, then resolve it:
          if (this.requestsReceived[obj.requestId]) {
            // according to LPI, an error response should resolve (not reject) the request handler promise
            this.requestsReceived[obj.requestId].resolve(obj.data.rejectionReason)
            delete this.requestsSent[obj.requestId]
          }
          break

        case BtpPacket.TYPE_PREPARE:
          let to = this.plugin.getInfo().connectors[0]
          if (protocolDataAsObj.to) {
            to = protocolDataAsObj.to.data.toString('ascii') // String in LPI, Buffer in BTP
          }
          const lpiTransfer = {
            id: obj.data.transferId.toString(), // String in LPI, Number in BTP
            from: this.plugin.getAccount(), // String
            to,
            ledger: this.plugin.getInfo().prefix, // String
            amount: obj.data.amount, // String in both objects
            ilp: protocolDataAsObj.ilp.data.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), // Base64 in LPI, Buffer in BTP
            noteToSelf: {},
            executionCondition: obj.data.executionCondition, // Base64 in both
            expiresAt: obj.data.expiresAt.toISOString(), // String in LPI, DateTime in BTP
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
              console.log('sendTransfer rejected its promise, putting ERROR on BTP')
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
            console.log('sendTransfer should not throw!', e)
            console.error(e)
          }
          break

        case BtpPacket.TYPE_FULFILL:
          this.plugin.fulfillCondition(obj.data.transferId.toString(), obj.data.fulfillment).then(() => { // fulfillment is Base64 in both LPI and BTP
            this.send({
              type: BtpPacket.TYPE_ACK,
              requestId: obj.requestId, // reuse the BTP requestId for the Ack
              data: []
            })
          }, err => {
            this.send({
              type: BtpPacket.TYPE_ERROR,
              requestId: obj.requestId, // reuse the BTP requestId for the Error
              data: {
                rejectionReason: lpiErrorToBtpError(err),
                protocolData: []
              }
            })
          })
          break

        case BtpPacket.TYPE_REJECT:
          // transferId String in both LPI and BTP
          // rejectionReason Buffer in BTP but Object in LPI! 
          const btpErrorObj = IlpPacket.deserializeIlpError(obj.data.rejectionReason)
          const lpiErrorThrowable = btpErrorToLpiError(btpErrorObj)
          const lpiRejectionMessage = lpiErrorToRejectionMessage(lpiErrorThrowable, this.plugin.getAccount())
          this.plugin.rejectIncomingTransfer(obj.data.transferId, lpiRejectionMessage)
          break

        case BtpPacket.TYPE_MESSAGE:
          this._handleMessage(obj, primaryProtocol, protocolDataAsObj)
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
