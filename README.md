
# Pricecaster Service

**Version 7.0.0**

- [Pricecaster Service V2](#pricecaster-service-v2)
  * [Introduction](#introduction)
  * [System Overview](#system-overview)
    + [Wormhole Core Contracts](#wormhole-core-contracts)
    + [VAA Structure](#vaa-structure)
  * [Pricecaster Onchain App](#pricecaster-onchain-app)
    + [Price storage formats](#price-storage-formats)
    + [Exponent and Decimal Ranges](#exponent-and-decimal-ranges)
  * [Installation](#installation)
  * [Deployment of Applications](#deployment-of-applications)
  * [Backend Configuration](#backend-configuration)
    + [Diagnosing failed transactions](#diagnosing-failed-transactions)
  * [Running the system](#running-the-system)
  * [Tests](#tests)
  * [Guardian Spy Setup](#guardian-spy-setup)
  * [Pricecaster SDK](#pricecaster-sdk)
  * [Appendix](#appendix)
    + [Common errors](#common-errors)
    + [Sample Pyth VAA payload](#sample-pyth-vaa-payload)

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
| Reserved |  Reserved for future use | 91 |

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
$ npx ts-node  tools/deploy.ts 86525623 testnet keys/owner.key


Pricecaster v2   Version 7.0  Apps Deployment Tool
Copyright 2022 Randlabs Inc.

Parameters for deployment: 
From: 4NM56GAFQEXSEVZCLAUA6WXFGTRD6ZCEGNLGT2LGLY25CHA6RLGHQLPJVM
Network: testnet
Wormhole Core AppId: 86525623

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

The backend will read configuration from a `settings.ts` file pointed by the `PRICECASTER_SETTINGS` environment variable.  

The following settings are available:

|Value|Description| 
|-- |-- |
|algo.token   | The token string for connecting the desired Algorand node.  | 
|algo.api   | The API host URL for connecting the desired Algorand node.  | 
|algo.port   | The port to connect to the desired Algorand node.  |  
|algo.dumpFailedTx|  Set to `true` to dump failed transactions. Intended for debugging and analysis. |
|algo.dumpFailedTxDirectory|  Destination of .STXN (signed-transaction) files for analysis. |
| pyth.priceService.mainnet | The Pyth price service URL for mainnet connection |
| pyth.priceService.testnet | The Pyth price service URL for testnet connection | 
| pyth.priceService.pollIntervalMs | The interval between the block of prices are polled from the Pyth Price service | 
|    apps.pricecasterAppId | The application Id of the deployed VAA priceKeeper V2 TEAL program |
|    apps.ownerKeyFile| The file containing keys for the owner file. |
| storage.db |  The SQLite database file used by the Pricecaster backend |
| network |  Set to testnet or mainnet | 
| debug.skipPublish | Set to `true` to just fetch the prices without publishing anything | 

### Diagnosing failed transactions

If a transaction fails, a diagnostic system is available where the group TX is dumped in a directory. To use this, set the relevant settings file:

```
  algo: {
    ...
    dumpFailedTx: true,
    dumpFailedTxDirectory: './dump'
  },
```

The dump directory will be filled with files named `failed-xxxx.stxn`.  You can use this file and `goal clerk` to trigger the stateless logic checks:

```
root@47d99e4cfffc:~/testnetwork/Node# goal clerk dryrun -t failed-1641324602942.stxn
tx[0] trace:
  1 intcblock 1 8 0 32 66 20 => <empty stack>
  9 bytecblock 0x => <empty stack>
 12 txn Fee => (1000 0x3e8)
 14 pushint 1000 => (1000 0x3e8)
 .
 . 
 .
 47 txn ApplicationID => (622608992 0x251c4260)
 49 pushint 596576475 => (596576475 0x238f08db)
 55 == => (0 0x0)
 56 assert =>
 56 assert failed pc=56

REJECT
ERROR: assert failed pc=56
```

In this example output, this means the logic failed due to mismatched stateful application id.


For a stateful run, you must do a remote dryrun.  This is done by:

```
goal clerk dryrun -t failed-1641324602942.stxn  --dryrun-dump -o dump.dr
goal clerk dryrun-remote -D dump.dr -v

```

## Backend operation 

Check the `package.json` file for `npm run start-xxx`  automated commands. 

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




