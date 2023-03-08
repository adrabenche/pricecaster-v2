
# Pricecaster Service

**Version 7.5.1-alpha**

- [Pricecaster Service](#pricecaster-service)
  * [Introduction](#introduction)
  * [System Overview](#system-overview)
    + [Wormhole Core Contracts](#wormhole-core-contracts)
  * [Prerequisites](#prerequisites)
  * [Pricecaster Onchain App Storage](#pricecaster-onchain-app-storage)
    + [System Slot](#system-slot)
    + [Price slots](#price-slots)
    + [Price storage formats](#price-storage-formats)
    + [Exponent and Decimal Ranges](#exponent-and-decimal-ranges)
    + [Store operation](#store-operation)
    + [Reset operation](#reset-operation)
  * [Installation](#installation)
  * [Deployment of Applications](#deployment-of-applications)
  * [Backend Configuration](#backend-configuration)
    + [Diagnosing failed transactions](#diagnosing-failed-transactions)
  * [Backend operation](#backend-operation)
    + [The Slot Layout database](#the-slot-layout-database)
    + [Main Loop](#main-loop)
    + [REST API](#rest-api)
  * [Tests](#tests)
  * [Pricecaster SDK](#pricecaster-sdk)
  * [Additional tools](#additional-tools)
  * [Appendix](#appendix)
    + [Common errors](#common-errors)
    + [VAA Structure](#vaa-structure)
    + [Sample Pyth VAA payload](#sample-pyth-vaa-payload)
  * [License](#license)

<small><i><a href='http://ecotrust-canada.github.io/markdown-toc/'>Table of contents generated with markdown-toc</a></i></small>

## Introduction

This service comprises on-chain and off-chain components and tools. The purpose is to consume prices from "price fetchers" and feeds blockchain publishers. 

The current implementation is a Pyth Price Service client that is used to get VAAs from Pyth network and feed the payload and cryptographic verification data to a transaction group for validation. Subsequently, the data is processed and stored in the Pricecaster app contract, which is deployed on the Algorand blockchain. For details regarding Wormhole VAAs see design documents: 

  https://github.com/certusone/wormhole/tree/dev.v2/whitepapers

## System Overview

**The objective is to receive signed messages -named as Verifiable Attestments (VAAs) in Wormhole jargon- from our relayer backend (Pricecaster) , verify them against a fixed (and upgradeable) set of "guardian public keys" and process them, publishing on-chain price information or doing governance chores depending on the VAA payload.**

### Wormhole Core Contracts

The verification of each received VAA is done by the tandem of Wormhole SDK plus core Wormhole contracts deployed in Algorand chain. Refer to https://github.com/certusone/wormhole/tree/dev.v2/algorand for the Wormhole Token and Core Bridge components, and to https://github.com/certusone/wormhole/tree/dev.v2/sdk for the JS SDK.

The backend will currently **call the Pricecaster contract to store data** as the last TX group. See below for details on how Pricecaster works.

## Prerequisites

The pricecaster system requires the following components to run:

* Algorand node.
* **Pyth Price Service**. Pyth network offers two public endpoints: ```https://xc-testnet.pyth.network``` and ```https://xc-mainnet.pyth.network```.  This is enough for development and non-production deployments; for production Pyth recommends a dedicated installation. See https://github.com/pyth-network/pyth-crosschain/tree/main/third_party/pyth/price-service.  Note that a dedicated installation **also requires a Wormhole spy deployment**. 

* Deployed Wormhole contracts 

For local development the recommendation is to use **Tilt** to run: an Algorand sandbox with deployed Wormhole contracts, a set of guardians and Wormhole daemon, ready to be used.  This is hard to deploy by-hand, you have been warned.

To use Tilt, 

* Install Docker + Kubernetes Support.  The straightforward way is to use Docker Desktop and activate Kubernetes Support, both in Linux MacOS or Windows.
* Install https://docs.tilt.dev/install.html.  Tilt can be installed under WSL.
* Clone the Wormhole repository from  https://github.com/wormhole-foundation/wormhole.
* Under this directory run

  ```
  tilt up -- --algorand
  ```

  The live Wormhole network runs 19 guardians, so to simulate more realistic conditions, set the number of guardians > 1 using the --num parameter.

* Use the Tilt console to check for all services to be ready.  Note that the Algorand sandbox will have several pre-made and pre-funded accounts with vanity-addresses prefixed by `DEV...`  Use those accounts for development only!

## Pricecaster Onchain App Storage

The Pricecaster Smart Contract mantains a global space of storage with a layout of logical slots that are sequentially added as required. The global space key/value entries are stored as follows:

| key | value |
|-----|-------|
| coreid | The Wormhole Core application id to validate VAAs |
| 0x00   | Linear space, bytes 0..127 |
| 0x01   | Linear space, bytes 128..255 |
| 0x02   | Linear space, bytes 256..383 |
| .    | .                          |
| .    | .                          |
| .    | .                          |
| 0x3e | Linear space, bytes 7874..8001   |

The linear space offers up to 8kB, each slot is 92 bytes wide (see format further below); so 86 slots are available. Actually 85 slots are available to store price information, as the slot with index 85 is the **system slot** which is used for internal data' bookkeeping. So the entire linear space is logically divided as:

| Slot 0 | Slot 1 | ... | Slot 84 | System Slot |

### System Slot

The system slot has the following organization:

| Field | Explanation | Size (bytes) |
|-------|-------------|--------------|
| Entry count | The number of allocated slots | 1 |
| Config flags | A set of configuration flags. See below | 1 |
| Reserved |  Reserved for future use | 90 |


#### Configuration flags

The **setflags** app call is used by the operator to change operating flags. This field is a 8-bit number with the following meaning:

```
7 6 5 4 3 2 1 0
+ + + + + + + + 
| | | | | | | +-------- Reserved
| | | | | | +---------- Reserved
| | | | | +------------ Reserved
| | | | +-------------- Reserved
| | | +---------------- Reserved
| | +------------------ Reserved
| +-------------------- Reserved
+---------------------- System Use (Testing-mode deployment)
```

Bit 7 is set by system and cannot be set by operator.

### Price slots

Price slots have the following format:

| Field         | Explanation | Size (bytes) |
|---------------|-------------|--------------|
| ASA ID        | The Algorand Standard Asset (ASA) identifier for this price | 8 |
| Norm_Price    | The C3-Normalized price. See details below. | 8            |
| Price         | The price as integer.  Use the `exponent` field as `price` * 10^`exponent` to obtain decimal value. | 8            |
| Confidence    | The confidence (standard deviation) of the price | 8            |
| Exponent      | The exponent to convert integer to decimal values | 4            | 
| Price EMA     | The exponential-median-average (EMA) of the price field over a 30-day period | 8 | 
| Confidence EMA| The exponential-median-average (EMA) of the confidence field over a 30-day period | 8 | 
| Attestation Time | The timestamp of the moment the VAA was attested by the Wormhole network  | 8 |
| Publish Time | The timestamp of the moment the price was published in the Pyth Network | 8 |
| Prev Publish Time | The previous known Publish Time for this asset | 8 |
| Prev Price | The previous known price for this asset | 8 | 
| Prev Confidence | The previous known confidence ratio for this asset | 8 |

A slot is allocated using the **alloc** app call. A slot allocation operation sets the ASA ID for which prices will be stored in the slot. Also this extends the number of valid slots by 1,  increasing the _entry count_ field in the **System Slot**.

### Price storage formats

As is shown in the table above, prices are reported in two-formats:

* **Standard price**  This is the original price in the Pyth payload.  To obtain the real value you must use `exponent` field to set the decimal point as  `p' = p * 10^e` 
* **C3-Normalized price** This is the price in terms of _picodollars per microunit_, and is targeted at C3 centric applications. The normalization is calculated as `p' = p*10^(12+e-d)` where `e` is the exponent and `d` the number of decimals the asset uses.  `d` is obtained by looking at ASA parameter `Decimals`.

### Exponent and Decimal Ranges

Pyth network exponents are at time of this writing in the range `e=[-8,8]` but future expansions can raise this to `e=[-12,12]`.  Decimals according to Algorand can be from zero (indivisible ASA) to 19.
With this in mind, the normalized price format will yield the following values with boundary `d` and `e` values:

| d | e | Result |
|---|---|--------|
|0  |-12| p' = p | 
|0  |12 | p' = p*10^24 (Overflow). The maximum exponent usable with 0 decimals is +7. |
|19 |-12| p' = p/10^19 =~ 0 |
|19 |12 | p' = p*10^5 |
|0  |0  | p' = p*10^12|
|19 |0  | p' = 0| 

### Store operation

The Pricecaster app will allow storage to succeed only if the transaction group contains:

* Sender is the contract creator.
* Calls/optins issued with authorized appId (Wormhole Core).
* Calls/optins issued for the Pricecaster appid.
* Payment transfers for upfront fees from owner.
* There must be at least one app call to Wormhole Core Id.

For normalized price calculation, the onchain ASA information is retrieved for the number of decimals. The exception is the ASA ID 0 which is used for **ALGO** with hardcoded 6 (six) decimals.

### Reset operation

The linear space can be zeroed, thus deallocating all slots and resetting the entry count to 0, by calling the privileged operation **reset**.


## Installation

Prepare all Node packages with:

```
npm install
```

## Deployment of Applications

* To deploy the Pricecaster-V2, follow the instructions below.

Use the deployment tools in `tools` subdirectory.

* To deploy Pricecaster V2 TEAL to use with Wormhole, make sure you have Python environment running (preferably >=3.7.0), and `pyteal` installed with `pip3`.  PyTEAL >= 0.18 is required.
* The deployment program will generate all TEAL files from PyTEAL sources and deploy the Pricecaster contract.

For example, using `deploy` with sample output: 

```
$ npx ts-node  tools/deploy.ts 86525623 testnet keys/owner.key 0


Pricecaster v2   Version 7.0  Apps Deployment Tool
Copyright 2022 Randlabs Inc.

Parameters for deployment: 
From: 4NM56GAFQEXSEVZCLAUA6WXFGTRD6ZCEGNLGT2LGLY25CHA6RLGHQLPJVM
Network: testnet
Wormhole Core AppId: 86525623
TestMode: false

Enter YES to confirm parameters, anything else to abort. YES
,Pricecaster V2 TEAL Program     Version 7.0, (c) 2022-23 Randlabs, inc.
Compiling approval program...
Written to teal/build/pricecaster-v2-approval.teal
Compiling clear state program...
Written to teal/build/pricecaster-v2-clear.teal
,
Deploying Pricecaster V2 Application...
txId: DASH2CFGFKZZQR5SCNBE3MAJ65FXTU7345LY6QNPU4ZIFO2OHGTA
Deployment App Id: 152656721
Writing deployment results file DEPLOY-1673103606201...
Bye.
```

* Use the generated `DEPLOY-XXX` file to set values in the settings file regarding app ids.

## Backend Configuration

The backend will read configuration from a set of environment variables, as follow:


|Value|Description| 
|-- |-- |
|PROM_PORT | The port where Prometheus metrics are exposed. |
|REST_PORT | The port where the REST API is exposed. |
|ALGO_TOKEN   | The token string for connecting the desired Algorand node.  | 
|ALGO_API   | The API host URL for connecting the desired Algorand node.  | 
|ALGO_PORT   | The port to connect to the desired Algorand node.  |  
|ALGO_GET_NETWORK_TX_PARAMS_CYCLE_INTERVAL | The interval (in publications) between the node is queried for the current network parameters. |
|PYTH_PRICESERVICE_MAINNET | The Pyth price service URL for mainnet connection |
| PYTH_PRICESERVICE_TESTNET | The Pyth price service URL for testnet connection | 
| PYTH_PRICESERVICE_POLL_INTERVAL_MS| The interval between the block of prices are polled from the Pyth Price service | 
| PYTH_PRICESERVICE_REQUEST_BLOCKSIZE | The number of prices to pull from the Price service in each request |
|    APPS_PRICECASTER_APPID | The application Id of the deployed VAA priceKeeper V2 TEAL program |
|    APPS_OWNER_KEY_MNEMO| The secret mnemonic for the owner/operator |
| STORAGE_DB |  The SQLite database file used by the Pricecaster backend |
| NETWORK |  Set to testnet or mainnet | 
| DEBUG_SKIP_PUBLISH | Set to `true` to just fetch the prices without publishing anything | 
| CACHE_POLICY | Set to 'OFF' to disable global state cache. Set to 'NEW_BLOCK' to cache Pricecaster global state on block availability |


It is possible to pass this variables as command line arguments to the `npm run start` command, for example:

```
PROM_PORT=4885 REST_PORT=4884 PYTH_PRICESERVICE_MAINNET=https://xc-mainnet.pyth.network PYTH_PRICESERVICE_TESTNET=https://xc-testnet.pyth.network PYTH_PRICESERVICE_DEVNET=https://xc-testnet.pyth.network PYTH_PRICESERVICE_POLL_INTERVAL_MS=5000 PYTH_PRICESERVICE_REQUEST_BLOCKSIZE=10 LOG_APPNAME=pricecaster-v2 LOG_DISABLE_CONSOLE_LOG=false LOG_DEBUGLEVEL=1 ALGO_TOKEN= ALGO_API=http://node.testnet.algoexplorerapi.io/ ALGO_PORT= ALGO_GET_NETWORK_TX_PARAMS_CYCLE_INTERVAL=10 APPS_PRICECASTER_APPID=160693210 APPS_OWNER_KEY_MNEMO="..." STORAGE_DB=./db/pricecaster.db NETWORK=testnet npm run start
```

## Backend operation 

### The Slot Layout database

To know which price-identifiers to retrieve from the Pyth Network a local database is used containing tuples of `(slot, asaid, priceid)` where the `slot` and `asaid` fields in each row must be consistent with the on-chain slots. For example, if slot `4` is allocated to store ASA ID `15000` on chain, this must be reflected on the database. Typically, for a running production Pricecaster system the existent slots will be fairly stable.

For development and initial production runs, preset slots can be bootstrapped using the `settings/bootSlotLayout.ts`  file. The file defines an array of slots with ASA ID and Pyth Price Ids; slots are allocated sequentially with the command: 

```
npm run bootstrap
```

:warn: This command will zero the onchain contract pointed by the `APPS_PRICECASTER_APPID` setting!  

After zeroing the contract, each slot will be assigned with the ASA ID specified.  Keep in mind that Pyth Price Ids must be mantained locally by the backend, as Pyth price ids are "chain agnostic". 

This is a typical output of a bootstrapping process:

```
Pricecaster Service Backend  Version 7.0.0 -- Copyright (c) 2022, 23 Randlabs Inc.

[2023-01-07 12:40:57] [INFO] - Loaded settings. 
[2023-01-07 12:40:57] [INFO] - Using network: testnet
[2023-01-07 12:40:57] [INFO] - Algorand Client: API: Port: 8002
[2023-01-07 12:40:57] [INFO] - Wormhole Appids: Core 86525623  Bridge 86525641 
[2023-01-07 12:40:57] [INFO] - Pricecaster Appid: 152524708
[2023-01-07 12:40:57] [INFO] - Database full path ./db/pricecaster.dbt
[2023-01-07 12:40:57] [WARN] - Bootstrapping process starting
[2023-01-07 12:40:57] [INFO] - Dropping SlotLayout table
[2023-01-07 12:40:57] [INFO] - Executed. Info: {"changes":0,"lastInsertRowid":0}
[2023-01-07 12:40:57] [INFO] - Creating new SlotLayout table
[2023-01-07 12:40:57] [INFO] - Executed. Info: {"changes":0,"lastInsertRowid":0}
[2023-01-07 12:40:57] [WARN] - Resetting contract.
[2023-01-07 12:41:03] [WARN] - Contract zeroed.
[2023-01-07 12:41:03] [INFO] - Bootstrapped slot layout
[2023-01-07 12:41:11] [INFO] - Added slot 0 for ASA ID: 0, PriceId: 08f781a893bc9340140c5f89c8a96f438bcfae4d1474cc0f688e3a52892c7318
[2023-01-07 12:41:18] [INFO] - Added slot 1 for ASA ID: 122146368, PriceId: ca80ba6dc32e08d06f1aa886011eed1d77c77be9eb761cc10d72b7d0a2fd57a6
[2023-01-07 12:41:25] [INFO] - Added slot 2 for ASA ID: 113638050, PriceId: 41f3625971ca2ed2263e78573fe5ce23e13d2558ed3f2e47ab0f84fb9e7ae722
[2023-01-07 12:41:32] [INFO] - Added slot 3 for ASA ID: 105300796, PriceId: d7566a3ba7f7286ed54f4ae7e983f4420ae0b1e0f3892e11f9c4ab107bbad7b9
[2023-01-07 12:41:40] [INFO] - Added slot 4 for ASA ID: 52771911, PriceId: d2c2c1f2bba8e0964f9589e060c2ee97f5e19057267ac3284caef3bd50bd2cb5
[2023-01-07 12:41:47] [INFO] - Added slot 5 for ASA ID: 100702091, PriceId: ecf553770d9b10965f8fb64771e93f5690a182edc32be4a3236e0caaa6e0581a
[2023-01-07 12:41:47] [INFO] - Pre-flight consistency check running
[2023-01-07 12:41:48] [INFO] - Pricecaster onchain entry count: 6, database count: 6
[2023-01-07 12:41:49] [INFO] - Pricecaster slot 0 ASA: 0, database 0
[2023-01-07 12:41:50] [INFO] - Pricecaster slot 1 ASA: 122146368, database 122146368
[2023-01-07 12:41:51] [INFO] - Pricecaster slot 2 ASA: 113638050, database 113638050
[2023-01-07 12:41:52] [INFO] - Pricecaster slot 3 ASA: 105300796, database 105300796
[2023-01-07 12:41:53] [INFO] - Pricecaster slot 4 ASA: 52771911, database 52771911
[2023-01-07 12:41:54] [INFO] - Pricecaster slot 5 ASA: 100702091, database 100702091
[2023-01-07 12:41:54] [INFO] - Good, Pricecaster onchain and database slot layouts consistent.
[2023-01-07 12:41:54] [INFO] - Bailing out, bye
hernandp@thinkpadmx:~/src/pricecaster-v2
```

If you want to clear the contract, or the database independently use `RESETDB=1` or `RESETCONTRACT=1` environment variables.

### Main Loop

The Pricecaster backend will run in a continuous loop to:

* Fetch one or more VAAs containing products prices according to the Slot Layout.  A VAA typically contains 5 attestations of prices, which may contain one or more of the specified prices. This means that if we ask for five prices they may be contained in one VAA payload, or to be distributed in five VAAs.  
* Build a transaction group using the Wormhole SDK to verify the VAA and call the **store** application call.
* Store statistics for monitoring operation.

## Tests

The tests are designed to run under **Tilt** environment.   See the Prerequisites section above on how to setup Tilt.

Run the Pricecaster contract tests with:

```
npm run test-sc
```

Backend tests will come shortly.

## Pricecaster SDK

A Work-in-progress Javascript SDK exists, along with a React app showing how consumers can fetch symbols, price information from the contract,  and display this information in real-time. 
Refer to the `pricecaster-sdk` repository.

## Additional tools

The following tools are available to help development:

* `tools/dump-priceids.ts`:  Execute with `npx ts-node`  to dump all available products/assets available in Pyth with it's corresponding Price Id. The default behavior is to dump `devnet` prices, change to `mainnet-beta` if you want.
* `tools/pcasmon.ts`: Tool to monitor the Pricecaster onchain contents. Execute it with the `appId` and `network` options.

## Appendix

### Common errors

**TransactionPool.Remember: transaction XMGXHGC4GVEHQD2T7MZDKTFJWFRY5TFXX2WECCXBWTOZVHC7QLAA: overspend, account X**

This means that this account has not enough balance to pay the fees for the  TX group.  

### VAA Structure

VAA structure is defined in: 
 https://github.com/certusone/wormhole/blob/dev.v2/whitepapers/0001_generic_message_passing.md

 Governance VAAs:
 https://github.com/certusone/wormhole/blob/dev.v2/whitepapers/0002_governance_messaging.md

 Sample Ethereum Struct Reference: 
 https://github.com/certusone/wormhole/blob/dev.v2/ethereum/contracts/Structs.sol

```
 VAA
 i Bytes        Field   
 0 1            Version
 1 4            GuardianSetIndex
 5 1            LenSignatures (LN)
 6 66*LN        Signatures where each S = { guardianIndex (1),r(32),s(32),v(1) }
 -------------------------------------< hashed/signed body starts here.
 4            timestamp
 4            Nonce
 2            emitterChainId
 32           emitterAddress
 8            sequence
 1            consistencyLevel
 N            payload
 --------------------------------------< hashed/signed body ends here.
```

### Sample Pyth VAA payload

See the documentation `doc` subdirectory for format information.

The following is a real world sample of a Pyth 3.0 payload. For brevity purposes, only the first attestation bytes are dumped.

```

----------------------------------------------------------------------------------------
50325748            Header (P2WH)
0003                Major Version (3)
0000                Minor Version (0)
0001                Size of remaining header fields (constant 1)
02                  Payload Id.  BatchPriceAttestation is 2.
----------------------------------------------------------------------------------------
0005                Num of Attestations
0095c               Size in bytes of each attestation
----------------------------------------------------------------------------------------
c67940be40e0cc7ffaa1acb08ee3fab30955a197da1ec297ab133d4d43d86ee6    product_id
ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace    price_id
0000002f102f53c0                                                    price
0000000005204180                                                    conf
fffffff8                                                            exponent
0000002fb05b7a40                                                    ema_price
00000000064a7e98                                                    ema_conf
01                                                                  status
00000015                                                            num_publishers
00000020                                                            max_num_publishers
000000006283efc2                                                    attestation_time
000000006283efc2                                                    publish_time
000000006283efc1                                                    prev_publish_time
0000002f102f53c0                                                    prev_price
0000000004f34f40                                                    prev_conf
-----------------------------------------------------------------------------------------
.
.
.


```

## License

Copyright 2022, 2023 C3. 

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.


