const BtpFrog = require('../src/frog')
const BtpSpider = require('../src/spider')
const BtpCat = require('../src/cat')
const PluginBells = require('ilp-plugin-bells')

const plugin = new PluginBells({
  account: 'https://red.ilpdemo.org/ledger/accounts/alice',
  password: 'alice'
})

let spiderPeerId

const frog = new BtpFrog(plugin, (obj) => {
  if (spiderPeerId) {
    console.log('Relaying from Frog to Spider', BtpCat(obj))
    spider.send(obj, spiderPeerId)
  } else {
    console.log('Message from Frog lost because nobody is connected to the Spider yet', BtpCat(obj))
  }
})

const spider = new BtpSpider({ listen: 8000 }, (peerId) => {
  if (spiderPeerId) {
    console.log('ignoring second attempt to connect to spider!', spiderPeerId)
  } else {
    spiderPeerId = peerId
  }
}, (obj, peerId) => {
  console.log('Relaying from Spider to Frog', BtpCat(obj))
  frog.handleMessage(obj)
})

frog.start().then(() => { console.log('Frog started') })
spider.start().then(() => { console.log('Spider started') })
