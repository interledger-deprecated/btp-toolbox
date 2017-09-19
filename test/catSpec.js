const BtpPacket = require('btp-packet')
const IlpPacket = require('ilp-packet')
const btpCat = require('../src/cat')
const assert = require('chai').assert

// See https://github.com/interledgerjs/ilp-packet/pull/14
IlpPacket.serializeIlpPacket = (json) => {
  switch (json.type) {
    case IlpPacket.Type.TYPE_ILP_PAYMENT: return IlpPacket.serializeIlpPayment(json.data)
    case IlpPacket.Type.TYPE_ILQP_LIQUIDITY_REQUEST: return IlpPacket.serializeIlqpLiquidityRequest(json.data)
    case IlpPacket.Type.TYPE_ILQP_LIQUIDITY_RESPONSE: return IlpPacket.serializeIlqpLiquidityResponse(json.data)
    case IlpPacket.Type.TYPE_ILQP_BY_SOURCE_REQUEST: return IlpPacket.serializeIlqpBySourceRequest(json.data)
    case IlpPacket.Type.TYPE_ILQP_BY_SOURCE_RESPONSE: return IlpPacket.serializeIlqpBySourceResponse(json.data)
    case IlpPacket.Type.TYPE_ILQP_BY_DESTINATION_REQUEST: return IlpPacket.serializeIlqpByDestinationRequest(json.data)
    case IlpPacket.Type.TYPE_ILQP_BY_DESTINATION_RESPONSE: return IlpPacket.serializeIlqpByDestinationResponse(json.data)
    case IlpPacket.Type.TYPE_ILP_ERROR: return IlpPacket.serializeIlpError(json.data)
    default: throw new Error('JSON object has invalid type')
  }
}

describe('BtpCat', function () {
  beforeEach(function () {
    this.prefix = `\n\
const BtpPacket = require('btp-packet')\n\
const IlpPacket = require('ilp-packet')\n\
\n\
// See https://github.com/interledgerjs/ilp-packet/pull/14\n\
IlpPacket.serializeIlpPacket = (json) => {\n\
  switch (json.type) {\n\
    case IlpPacket.Type.TYPE_ILP_PAYMENT: return IlpPacket.serializeIlpPayment(json.data)\n\
    case IlpPacket.Type.TYPE_ILQP_LIQUIDITY_REQUEST: return IlpPacket.serializeIlqpLiquidityRequest(json.data)\n\
    case IlpPacket.Type.TYPE_ILQP_LIQUIDITY_RESPONSE: return IlpPacket.serializeIlqpLiquidityResponse(json.data)\n\
    case IlpPacket.Type.TYPE_ILQP_BY_SOURCE_REQUEST: return IlpPacket.serializeIlqpBySourceRequest(json.data)\n\
    case IlpPacket.Type.TYPE_ILQP_BY_SOURCE_RESPONSE: return IlpPacket.serializeIlqpBySourceResponse(json.data)\n\
    case IlpPacket.Type.TYPE_ILQP_BY_DESTINATION_REQUEST: return IlpPacket.serializeIlqpByDestinationRequest(json.data)\n\
    case IlpPacket.Type.TYPE_ILQP_BY_DESTINATION_RESPONSE: return IlpPacket.serializeIlqpByDestinationResponse(json.data)\n\
    case IlpPacket.Type.TYPE_ILP_ERROR: return IlpPacket.serializeIlpError(json.data)\n\
    default: throw new Error('JSON object has invalid type')\n\
  }\n\
}\n\
exports = `
  })

  it('should give an eval-able string for an ILQP request over BTP message', function () {
    const obj = {
      type: BtpPacket.TYPE_MESSAGE,
      requestId: 4,
      data: {
        protocolData: [ {
          protocolName: 'ilp',
          contentType: BtpPacket.MIME_APPLICATION_OCTET_STRING,
          data: IlpPacket.serializeIlpPacket({
            type: 6,
            typeString: 'ilqp_by_destination_request',
            data: {
              destinationAccount: 'de.eur.blue.bob',
              destinationAmount: '9000000000',
              destinationHoldDuration: 3000
            }
          })
        }, {
          protocolName: 'to',
          contentType: BtpPacket.MIME_TEXT_PLAIN_UTF8,
          data: 'us.usd.red.connie'
        } ]
      }
    }
    assert.deepEqual(eval(this.prefix + btpCat(obj)), obj) // eslint-disable-line no-eval
  })

  it('should give an eval-able string for an ILQP response over BTP response', function () {
    const obj = {
      type: BtpPacket.TYPE_RESPONSE,
      requestId: 4,
      data: {
        protocolData: [ {
          protocolName: 'from',
          contentType: BtpPacket.MIME_TEXT_PLAIN_UTF8,
          data: 'us.usd.red.connie'
        }, {
          protocolName: 'to',
          contentType: BtpPacket.MIME_TEXT_PLAIN_UTF8,
          data: 'us.usd.red.alice'
        }, {
          protocolName: 'ilp',
          contentType: BtpPacket.MIME_APPLICATION_OCTET_STRING,
          data: IlpPacket.serializeIlpPacket({
            'type': 7,
            'typeString': 'ilqp_by_destination_response',
            'data': {
              'sourceAmount': '10782788022',
              'sourceHoldDuration': 5000
            }
          })
        } ]
      }
    }
    assert.deepEqual(eval(this.prefix + btpCat(obj)), obj) // eslint-disable-line no-eval
  })
})
