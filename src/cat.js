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
      dataStr = `IlpPacket.serializeIlpPacket(${JSON.stringify(IlpPacket.deserializeIlpPacket(obj.data), null, 2).split('\n').join('\n      ')})`
    } else {
      dataStr = bufferToEvalStr(obj.data)
    }
    return `{\n      protocolName: '${obj.protocolName}',\n      contentType: ${mimeStrMap[obj.contentType]},\n      data: ${dataStr}\n    }`
  })
  return `[ ${strArr.join(', ')} ]`
}

function fieldsToEvalStrs (obj) {
  let ret = []
  for (let name in obj) {
    if (name === 'protocolData') {
      ret.push(`protocolData: ${protocolDataToEvalStr(obj.protocolData)}`)
    } else if (['executionCondition', 'fulfillment'].indexOf(name) !== -1) {
      // binary fields, although currently still base64, see https://github.com/interledgerjs/btp-packet/issues/8
      ret.push(`${name}: '${obj[name]}'`)
    } else if (['transferId', 'amount'].indexOf(name) !== -1) {
      // string fields:
      ret.push(`${name}: '${obj[name]}'`)
    } else {
      ret.push(`${name}: ${obj[name]}`)
    }
  }
  return ret
}

module.exports = function (obj) {
  const typeStrMap = {
    1: 'BtpPacket.TYPE_RESPONSE',
    2: 'BtpPacket.TYPE_ERROR',
    3: 'BtpPacket.TYPE_PREPARE',
    4: 'BtpPacket.TYPE_FULFILL',
    5: 'BtpPacket.TYPE_REJECT',
    6: 'BtpPacket.TYPE_MESSAGE'
  }
  return `{ \n` +
    `  type: ${typeStrMap[obj.type]}, \n` +
    `  requestId: ${obj.requestId}, \n` +
    `  data: {\n` +
    `    ${fieldsToEvalStrs(obj.data).join(',\n    ')}\n` +
    `  }\n` +
    `}\n`
}
