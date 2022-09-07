
# Pricecaster Service V2

**Version 6.6.0**

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

The current implementation is a Wormhole client that uses the JS SDK to get VAAs from Pyth network and feed the payload and cryptographic verification data to a transaction group for validation. Subsequently, the data is optionally processed and stored, either price or metrics. For details regarding Wormhole VAAs see design documents: 

  https://github.com/certusone/wormhole/tree/dev.v2/whitepapers

## System Overview

**The objective is to receive signed messages -named as Verifiable Attestments (VAAs) in Wormhole jargon- from our relayer backend (Pricecaster) , verify them against a fixed (and upgradeable) set of "guardian public keys" and process them, publishing on-chain price information or doing governance chores depending on the VAA payload.**

### Wormhole Core Contracts

The verification of each received VAA is done by the tandem of Wormhole SDK plus core Wormhole contracts deployed in Algorand chain. Refer to https://github.com/certusone/wormhole/tree/dev.v2/algorand for the Wormhole Token and Core Bridge components, and to https://github.com/certusone/wormhole/tree/dev.v2/sdk for the JS SDK.


The backend will currently **call the Pricekeeper V2 contract to store data** as the last TX group. See below for details on how Pricekeeper works.

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
## Pricecaster Onchain App

The Pricecaster App mantains a record of product/asset symbols (e.g ALGO/USD, BTC/USDT) indexed by keys of ASA IDs and a byte array encoding price and metrics information. As the original Pyth Payload is 150-bytes long and it wouldn't fit in the value field for each key, the Pricecaster contract converts on-the-fly the payload to a more compact form, discarding unneeded information.

The Pricecaster App stores the following stateful information:

* `coreId`:  The accepted Wormhole Core application Id.

The Pricecaster app will allow storage to succeed only if the transaction group contains:

* Sender is the contract creator.
* Calls/optins issued with authorized appId (Wormhole Core).
* Calls/optins issued for the Pricecaster appid.
* Payment transfers for upfront fees from owner.
* There must be at least one app call to Wormhole Core Id.

Consumers must interpret the stored bytes as fields organized as:

| Field         | Explanation | Size (bytes) |
|---------------|-------------|--------------|
| Price         | The price as integer.  Use the `exponent` field as `price` * 10^`exponent` to obtain decimal value. | 8            |
| Norm_Price    | The C3-Normalized price. See details below. | 8            |
| Confidence    | The confidence (standard deviation) of the price | 8            |
| Exponent      | The exponent to convert integer to decimal values | 4            | 
| Price EMA     | The exponential-median-average (EMA) of the price field over a 30-day period | 8 | 
| Confidence EMA| The exponential-median-average (EMA) of the confidence field over a 30-day period | 8 | 
| Status        | 1 if this is a valid publication | 1 |
| Timestamp     | The timestamp when Pyth stored this in Solana network | 8 |
| OriginalKey   | The original Price/Product key pair of this product in the Pyth Network | 64 | 


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



## Installation

Prepare all Node packages with:

```
npm install
```

## Deployment of Applications

* The Wormhole Core contract and the VAA Verify code have it's own deployment tool `algorand/admin.py` at the Certus One repository. 

Here is a sample output to deploy the Core Contracts in a sandboxed environment: 

```$ python admin.py --devnet --boot
(True, 'teal/core_approve.teal', 'teal/core_clear.teal', <algosdk.v2client.algod.AlgodClient object at 0x00000181066117E0>, 1002000, <TmplSig.TmplSig object at 0x0000018106611780>, True)
Writing teal/core_approve.teal
Writing teal/core_clear.teal
Generating the teal for the core contracts
Writing teal/token_approve.teal
Writing teal/token_clear.teal
Generating the teal for the token contracts: 4289
Generating the foundation account...
L9gdTqISnJFAwNgA10HFZ9ht+7SwtZ74TIzaMV8SV3nvYTyYkfnOklIxXQLpPsbQCjjNzsLZ+wbRX3xcjcK1vA==
    album jazz check clay deal caught acoustic sugar theme also tired major sweet disagree mad remember because crop economy buffalo salmon setup skirt about gravity
    55QTZGER7HHJEURRLUBOSPWG2AFDRTOOYLM7WBWRL56FZDOCWW6IMQYOU4
KL347v/4UOjjG1usk1FKl7Ir0c0qF2mJahEX9buKwpH1Pb9oQQtnmiqxO31CXw+TbljMF1pI20BENHdKdI2fog==
    pink title wash morning peanut wheel tenant force intact edge pioneer city first inmate filter blame coffee pretty master fabric jewel pencil mix above just
    6U6362CBBNTZUKVRHN6UEXYPSNXFRTAXLJENWQCEGR3UU5ENT6RORDKSLA
O0fX5N6oH7Y+LBNuiGNhz0Pz/ruMH3hDGtQu/ck31TZgr/b1yjwOtVx96AyF+Cj4aAuvOF5sfZGTm2YBP1VLNA==
    trash fringe include mistake dismiss pulse giggle basket assist mixed radar diagram track zero grape buzz humor harbor head spray negative evil repeat ability relief
    MCX7N5OKHQHLKXD55AGIL6BI7BUAXLZYLZWH3EMTTNTACP2VJM2P7VQ4TI
QR6W4l7PKVIgdn+0ewEZw0eSQiMcLuWNmZGN4vOeJCwEqWbjAxODlHTRS8zHKJSprtmqa90CLXvUpLdetrfA8A==
    sight flash image vote fatal behind rain legal isolate album milk label cause spawn three come royal great silver churn treat chicken gentle ability abstract
    ASUWNYYDCOBZI5GRJPGMOKEUVGXNTKTL3UBC266UUS3V5NVXYDYBO2SK5A
I2PB2eJQDiUUkJuxHtrfBBSNAK834YWap5iLtiMpSj8WeLLkp6FP9qpVSZEJ+XbIBIEwfSn1Jm4PYCapBXqozA==
    good airport hollow athlete bronze announce level oppose stomach half husband doctor boss scan runway thrive expose oyster slush hamster electric medal where ability electric
    CZ4LFZFHUFH7NKSVJGIQT6LWZACICMD5FH2SM3QPMATKSBL2VDGDX4P3DQ
Te4Z62VmHq6hyl8fFp3rwRV/XKTK5KAMtPXf117oFLyGeeX5Qk6j277I6xMEXNh6rKSidaP+GA40oNPfKtYLPA==
    situate guilt void green devote high fence garlic sentence inmate volume foster wreck blade festival tooth neglect south width law sad deliver thing absent dentist
    QZ46L6KCJ2R5XPWI5MJQIXGYPKWKJITVUP7BQDRUUDJ56KWWBM6HW6FE74
foundation address MCX7N5OKHQHLKXD55AGIL6BI7BUAXLZYLZWH3EMTTNTACP2VJM2P7VQ4TI  (100000.0 ALGO)

Creating the PortalCore app
Reading teal/core_approve.teal
Reading teal/core_clear.teal
{'address': 'JYJEGKPTKMW4SA2GX5J4XGGS2I4K2I2LLZN534P5KDEG4H7WYH2CF256K4',
 'emitterAddress': '4e124329f3532dc90346bf53cb98d2d238ad234b5e5bddf1fd50c86e1ff6c1f4',
 'wormhole core': '1054'}
Create the token bridge
Reading teal/token_approve.teal
Reading teal/token_clear.teal
token bridge contract is too large... This might prevent updates later
{'address': 'XAMJRRHC36UE56QCLKS3HQ42EMWPMRBDCWGHFFT62PCAUOPWVXRDD5UF3M',
 'emitterAddress': 'b81898c4e2dfa84efa025aa5b3c39a232cf64423158c72967ed3c40a39f6ade2',
 'token bridge': '1056'}
HFFy4BIqRzSIHs/OV0CY5e8UrfV3ns0QOWcfGwslXLSINIPubgTt57wILBF02Uc4hiW48pcXarei/6lLWNza4w==
    castle sing ice patrol mixture artist violin someone what access slow wrestle clap hero sausage oyster boost tone receive rapid bike announce pepper absent involve
    RA2IH3TOATW6PPAIFQIXJWKHHCDCLOHSS4LWVN5C76UUWWG43LRQNHGCD4
Sent some ALGO to: castle sing ice patrol mixture artist violin someone what access slow wrestle clap hero sausage oyster boost tone receive rapid bike announce pepper absent involve
```

* To deploy the Pricecaster-V2, follow the instructions below.

Use the deployment tools in `tools` subdirectory.

* To deploy Pricecaster V2 TEAL to use with Wormhole, make sure you have Python environment running (preferably >=3.7.0), and `pyteal` installed with `pip3`.  
* The deployment program will:  generate all TEAL files from PyTEAL sources and deploy the Pricekeeper V2 contract.

For example, using `deploy` with sample output: 

```
$ npx ts-node  tools/deploy.ts 86525623 testnet keys/owner.key


Pricecaster v2   Version 5.0  Apps Deployment Tool
Copyright 2022 Randlabs Inc.

Parameters for deployment:
From: XNP7HMWUZAJTTHNIGENRKUQOGL5FQV3QVDGYUYUCGGNSHN3CQGMQKL3XHM
Network: testnet
Wormhole Core AppId: 86525623

Enter YES to confirm parameters, anything else to abort. YES
,Pricecaster V2 Program     Version 5.0, (c) 2022-23 Randlabs, inc.
Compiling approval program...
Written to teal/build/pricecaster-v2-approval.teal
Compiling clear state program...
Written to teal/build/pricecaster-v2-clear.teal
,
Creating Pricekeeper V2...
txId: RKNGKKO5WQ7W4JYNYDU2RYMBISFX4W7RQ2GJKCBIPV2IA4QWL75A
Deployment App Id: 105363628
Writing deployment results file DEPLOY-1660680886392...
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
|    apps.pricecasterAppId | The application Id of the deployed VAA priceKeeper V2 TEAL program |
|    apps.ownerAddress | The owner account address for the deployed programs |
|    apps.ownerKeyFile| The file containing keys for the owner file. |
|apps.asaIdMapperDataNetwork|  The network (testnet or mainnet) that the Mapper use to convert values |
| pyth.chainId | The chainId of the Pyth data source |
| pyth.emitterAddress | The address (in hex) of the Pyth emitter |
| wormhole.spyServiceHost | The URI to listen for VAAs coming from the guardiand Spy service |
| symbols.sourceNetwork | The Pyth price information source (mainnet-beta, devnet or testnet), this is used to solve symbol to textual representation and to update the Mapper |

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

## Running the system

Check the `package.json` file for `npm run start-xxx`  automated commands. 

## Tests

Requirement: Algorand Sandbox.

Run the Pricecaster contract tests with:

```
npm run test-sc
```

Backend tests will come shortly.

## Guardian Spy Setup

The guardiand daemon in Spy mode can be bootstrapped using Docker.  An appropiate dockerfile for the `mainnet-beta` network at the time of this writing is:

```
FROM docker.io/golang:1.17.0-alpine as builder

RUN apk add --no-cache git gcc linux-headers alpine-sdk bash

WORKDIR /app
RUN git clone https://github.com/certusone/wormhole.git

WORKDIR /app/wormhole/tools
RUN CGO_ENABLED=0 ./build.sh

WORKDIR /app/wormhole
RUN tools/bin/buf lint && tools/bin/buf generate

WORKDIR /app/wormhole/node/tools
RUN go build -mod=readonly -o /dlv github.com/go-delve/delve/cmd/dlv

WORKDIR /app/wormhole/node
RUN go build -race -gcflags="all=-N -l" -mod=readonly -o /guardiand github.com/certusone/wormhole/node

FROM docker.io/golang:1.17.0-alpine

WORKDIR /app
COPY --from=builder /guardiand /app/guardiand

ENV PATH="/app:${PATH}"
RUN addgroup -S pyth -g 10001 && adduser -S pyth -G pyth -u 10001
RUN chown -R pyth:pyth .
USER pyth

ENTRYPOINT [ "guardiand", "spy", "--nodeKey", "/tmp/node.key" ]

```

You can bootstrap the dockerfile with: 

```
docker run -ti guardian-mainnet --nodeKey /tmp/node.key --spyRPC [::]:7074 --network /wormhole/mainnet/2 --bootstrap /dns4/wormhole-mainnet-v2-bootstrap.certus.one/udp/8999/quic/p2p/12D3KooWQp644DK27fd3d4Km3jr7gHiuJJ5ZGmy8hH4py7fP4FP7
```

For deployment, use `-p 7074` to expose ports; remove `-ti` and add `-d` to leave the container running in the background. (detached mode)


## Pricecaster SDK

A Work-in-progress Javascript SDK exists, along with a React app showing how consumers can fetch symbols, price information from the contract,  and display this information in real-time. 
Refer to the `pricecaster-sdk` repository.

## Appendix

### Common errors

**TransactionPool.Remember: transaction XMGXHGC4GVEHQD2T7MZDKTFJWFRY5TFXX2WECCXBWTOZVHC7QLAA: overspend, account X**

This means that this account has not enough balance to pay the fees for the  TX group.  

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





