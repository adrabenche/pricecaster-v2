import algosdk from 'algosdk'
import PricecasterLib, { PRICECASTER_CI } from '../lib/pricecaster'
const { exit } = require('process')
const config = require('./deploy.config')
const term = require('terminal-kit').terminal

function formatExp (n: number | bigint, e: number): Number {
  return Number(n) * (10 ** e)
};

const title = 'Pricecaster Monitor'
const tableWidth = 200;

(async () => {
  if (process.argv.length !== 4) {
    console.log('Usage: pcasmon <appid> <network>\n')
    console.log('where:\n')
    console.log('appid                 The application id of the Wormhole core contract')
    console.log('network               Testnet, betanet, mainnet or dev (look in deploy.config.ts)')
    exit(0)
  }

  const appId = process.argv[2]
  const network: string = process.argv[3]

  const netconfig = config.networks[network]
  if (config === undefined) {
    console.log('Unsupported network: ' + network)
    exit(1)
  }

  const algodClient = new algosdk.Algodv2(netconfig.token, netconfig.api, netconfig.port)
  const pclib = new PricecasterLib(algodClient, '4NM56GAFQEXSEVZCLAUA6WXFGTRD6ZCEGNLGT2LGLY25CHA6RLGHQLPJVM')
  pclib.setAppId(PRICECASTER_CI, Number(appId))

  const sysSlot = await pclib.readSystemSlot()
  while (true) {
    const slots = await pclib.readParseGlobalState()

    const table = [
      ['Slot', 'ASAID', 'NormPrice', 'Price', 'Conf', 'PriceEMA', 'ConfEMA', 'AttTime', 'PubTime', 'PrevPubTime', 'PrevPrice', 'PrevConf']
    ]
    for (let i = 0; i < sysSlot.entryCount; ++i) {
      const exp = slots[i].exponent
      table.push([
        String(i),
        String(slots[i].asaId),
        String(slots[i].normalizedPrice),
        String(formatExp(slots[i].pythPrice, exp)),
        String(formatExp(slots[i].confidence, exp)),
        String(formatExp(slots[i].priceEMA, exp)),
        String(formatExp(slots[i].confEMA, exp)),
        String(slots[i].attTime),
        String(slots[i].pubTime),
        String(slots[i].prevPubTime),
        String(formatExp(slots[i].prevPrice, exp)),
        String(formatExp(slots[i].prevConf, exp))
      ])
    }
    term.clear()
    term.bgColor('blue').color('white')(title + ' '.repeat(tableWidth - title.length))
    term.moveTo(0, 2)
    term.table(table, {
      hasBorder: false,
      contentHasMarkup: true,
      textAttr: { bgColor: 'default' },
      firstCellTextAttr: { bgColor: 'blue' },
      firstRowTextAttr: { bgColor: 'yellow' },
      firstColumnTextAttr: { bgColor: 'red' },
      width: tableWidth,
      fit: true // Activate all expand/shrink + wordWrap
    })
  }
})()
