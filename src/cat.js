const BtpPacket = require('btp-packet')
const IlpPacket = require('ilp-packet')

function bufferToEvalStr (buf) {
  let byteStrArr = []
  for (let i = 0; i < buf.length; i++) {
    byteStrArr.push(buf[i].toString())
  }
  return `new Buffer([ ${byteStrArr.join(', ')} ])`
}

function protocolDataToEvalStr (arr) {
  const mimeStrMap = {
    0: 'BtpPacket.MIME_APPLICATION_OCTET_STRING',
    1: 'BtpPacket.MIME_TEXT_PLAIN_UTF8',
    2: 'BtpPacket.MIME_APPLICATION_JSON'
  }
  const strArr = arr.map(obj => {
    let dataStr
    if (obj.contentType === BtpPacket.MIME_TEXT_PLAIN_UTF8) {
      dataStr = `'${obj.data.toString('ascii')}'`
    } else if (obj.contentType === BtpPacket.MIME_APPLICATION_JSON) {
      dataStr = `JSON.stringify(${JSON.stringify(JSON.parse(obj.data.toString('ascii')), null, 2).split('\n').join('\n    ')})`
    } else if (obj.protocolName === 'ilp') {
      dataStr = `IlpPacket.serializeIlpPacket(${JSON.stringify(IlpPacket.deserializeIlpPacket(obj.data), null, 2).split('\n').join('\n    ')})`
    } else {
      dataStr = bufferToEvalStr(obj.data)
    }
    return `{\n    protocolName: '${obj.protocolName}',\n    contentType: ${mimeStrMap[obj.contentType]},\n    data: ${dataStr}\n  }`
  })
  return `[ ${strArr.join(', ')} ]`
}

function fieldsToEvalStrs (obj) {
  let ret = []
  for (let name in obj) {
    if (name === 'protocolData') {
      continue
    }
    // binary fields, although currently still base64, see https://github.com/interledgerjs/btp-packet/issues/8
    if (['executionCondition', 'fulfillment'].indexOf(name) !== -1) {
      ret.push(`${name}: '${obj[name]}'`)
    // string fields:
    } else if (['transferId', 'amount'].indexOf(name) !== -1) {
      ret.push(`${name}: '${obj[name]}'`)
    } else {
      ret.push(`${name}: ${obj[name]}`)
    }
  }
  return ret
}

module.exports = function (obj, btpVersion = BtpPacket.BTP_VERSION_ALPHA) {
  const typeStrMap = {
    0: 'BtpPacket.TYPE_ACK + 1',
    1: 'BtpPacket.TYPE_RESPONSE + 1',
    2: 'BtpPacket.TYPE_ERROR + 1',
    3: 'BtpPacket.TYPE_PREPARE + 1',
    4: 'BtpPacket.TYPE_FULFILL + 1',
    5: 'BtpPacket.TYPE_REJECT + 1',
    6: 'BtpPacket.TYPE_MESSAGE + 1'
  }
  let packetType = obj.type
  let dataStr

  if (btpVersion === BtpPacket.BTP_VERSION_ALPHA) {
    packetType -= 1
    if ([BtpPacket.TYPE_ACK, BtpPacket.TYPE_RESPONSE, BtpPacket.TYPE_MESSAGE].indexOf(packetType) !== -1) {
      dataStr = protocolDataToEvalStr(obj.data)
    }
  }

  if (!dataStr) {
    dataStr = `{\n` +
      `    ${fieldsToEvalStrs(obj.data).join(',\n    ')}\n` +
      `    protocolData: ${protocolDataToEvalStr(obj.data.protocolData)}\n` +
      `  }`
  }

  return `{ \n` +
    `  type: ${typeStrMap[packetType]}, \n` +
    `  requestId: ${obj.requestId}, \n` +
    `  data: ${dataStr}\n` +
    `}\n`
}
