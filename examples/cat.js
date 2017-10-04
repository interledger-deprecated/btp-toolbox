const BtpPacket = require('btp-packet')
const IlpPacket = require('ilp-packet')
const BtpCat = require('../src/cat')
const chalk = require('chalk')

console.log(chalk.bold.green('alice sends:'), chalk.green(BtpCat({
  type: BtpPacket.TYPE_MESSAGE,
  requestId: 4,
  data: {
    protocolData: [
      {
        protocolName: 'ilp',
        contentType: BtpPacket.MIME_APPLICATION_OCTET_STRING,
        data: IlpPacket.serializeIlpPacket({
          "type": 6,
          "typeString": "ilqp_by_destination_request",
          "data": {
            "destinationAccount": "de.eur.blue.bob",
            "destinationAmount": "9000000000",
            "destinationHoldDuration": 3000
          }
        })
      }, {
        protocolName: 'to',
        contentType: BtpPacket.MIME_TEXT_PLAIN_UTF8,
        data: 'us.usd.red.connie'
      }
    ]
  }
}, BtpPacket.BTP_VERSION_1)))

console.log(chalk.bold.red('alice receives:'), chalk.red(BtpCat({
  type: BtpPacket.TYPE_RESPONSE,
  requestId: 4,
  data: {
    protocolData: [
      {
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
          "type": 7,
          "typeString": "ilqp_by_destination_response",
          "data": {
            "sourceAmount": "10782788022",
            "sourceHoldDuration": 5000
          }
        })
      }
    ]
  }
}, BtpPacket.BTP_VERSION_1)))
