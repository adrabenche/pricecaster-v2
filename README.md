
# Pricecaster Service V2

## Introduction

This service comprises on-chain and off-chain components and tools. The purpose is to consume prices from "price fetchers" and feeds blockchain publishers. 

The current implementation is a Wormhole client that uses the JS SDK to get VAAs from Pyth network and feed the payload and cryptographic verification data to a transaction group for validation. Subsequently, the data is optionally processed and stored, either price or metrics. For details regarding Wormhole VAAs see design documents: 

  https://github.com/certusone/wormhole/tree/dev.v2/whitepapers

## System Overview

**The objective is to receive signed messages -named as Verifiable Attestments (VAAs) in Wormhole jargon- from our relayer backend (Pricecaster) , verify them against a fixed (and upgradeable) set of "guardian public keys" and process them, publishing on-chain price information or doing governance chores depending on the VAA payload.**


The design is based in two contracts that work in tandem, a  **Stateful contract (VAA_Processor)** that accepts calls for verifying and commiting VAAs, and also mantains the global guardian set; and a **verifier stateless contract** that does the computational work of ECDSA signature verification.

Due to computation and space limits, the validation of the 19 guardian signatures against the payload is partitioned so each stateless contract validates a subset of the guardian signatures. If ECDSA decompress and validation opcodes are used, that yields 650+1750 = 2400 computation units * 7 = 16800, leaving 3200 free units for remaining opcodes.
In our design, We call **verification step** to each of the app calls + stateless logic involved  in verifying a block of signatures.

Keep in mind that *not all* the 19 signatures must be present in a VAA verification, but at least 1 + (2/3)  of the current guardian set.

The maximum number of signatures in each verification step is fixed at contract compilation stage, so with this in mind and example values:

* let $N_S$ be the total signatures to verify $(19)$
* let $N_V$ be the number of signatures per verification step $(7)$,   
* the required number of transactions $N_T = \lceil{N_S/N_V}\rceil = \lceil{19/7}\rceil = 3$
* Each transaction-step $T_i$ will verify signatures $[j..k]$ where $j = i \times N_V$, $k = min(N_S-1, j+N_V-1)$, so for $T_0 = [0..6]$, $T_1 = [7..13]$, $T_2 = [14..18]$. 

The verification process inputs consist of: 
1. the set of current guardian public keys, 
2. the signed message digest (VAA information fields + generic payload), 
3. the set of signatures in the VAA header.  

With the above in mind, and considering the space and computation limits in the current Algorand protocol, the typical flow for verifying a VAA for 19 guardians using step-size of 7, would be based on the following transaction group:


| TX# | App calls | Stateless logic |
| --- | --------- | --------------- |
|  0  | _args_: guardian_pk[0..6], _txnote_: signed_digest          | _args_: sig[0..6]    |
|  1  | _args_: guardian_pk[7..13], _txnote_: signed_digest          | _args_: sig[7..13]   |
|  2  | _args_: guardian_pk[14..18], _txnote_: signed_digest          | _args_: sig[14..18]  | 
|  3  | VAA consume call | N/A |

The current design requires the last call to be a call to an authorized application. This is intended to process VAA price data. The authorized appid must be set accordingly using the `setauthid` call in the VAA Processor contract after deployment.
If no call is going to be made, a dummy app call must be inserted in group for the transaction group to succeed.

To mantain the long-term transaction costs predictable, when not all signatures are provided but > TRUNC(N_S*2/3)+1, the number of transactions in the group does not change, but a transaction may have zero signatures as input, e.g for a VAA with 14 signatures:

| TX# | App calls | Stateless logic |
| --- | --------- | --------------- |
|  0  | _args_: guardian_pk[0..6], _txnote_: signed_digest          | _args_: sig[0..6]    |
|  1  | _args_: guardian_pk[7..13], _txnote_: signed_digest          | _args_: sig[7..13]   |
|  2  | _args_: guardian_pk[14..18], _txnote_: signed_digest          | _args_: **empty**    | 
|  3  | VAA consume call | N/A |

The backend will currently **call the Pricekeeper V2 contract to store data** as the last TX group. See below for details on how Pricekeeper works.

Regarding stateless logic we can say that,

* Its code is constant and it's known program hash is validated by the stateful program.
* Asserts that the appropiate stateful program is called using known AppId embedded at compile stage.
* Passing signature subset through arguments does not pose any higher risk since any tampered signature will make the operation to fail; 
* The signed digest and public keys are retrieved through transaction note field and argument. This limits for the current design the maximum digest size to 1000 bytes and the maximum number of public keys -and guardians to ~64.
* Verification is performed using TEAL5 ECDSA opcodes. If any signature do not verify, transaction fails and subsequently, the entire transaction group aborts.

For the stateful app-calls we consider,

* Global state stores guardian public-keys, entry count (set size) and guardian set expiration time.
* Initial state after deployment could be set through a bootstrap call, using last guardian-set-change governance VAA if available.
* Sender must be stateless logic 
* Argument 1 must contain guardian public keys for guardians $[k..j]$
* Argument 2 must contain current guardian size set
* Note field must contain signed digest.
* Passed guardian keys $[k..j]$ must match the current global state.
* Passed guardian size set must match the current global state.
* Last TX in the verification step (total group size-1) triggers VAA processing according to fields (e.g: do governance chores, unpack Pyth price ticker, etc).  Last TX in the entire group must be an authorized application call.

**VAA Structure**

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
**VAA Commitment**

Each VAA is uniquely identified by tuple (emitter_chain_id, emitter_address, sequence). We are currently interested in VAAs for:

* Governance operations:
    * Upgrade guardian set
    * Upgrade contract [this is necessary for non-publishers?]

* Pyth Ticker Data

## Pricekeeper V2 App

The Pricekeeper V2 App mantains a record of product/asset symbols (e.g ALGO/USD, BTC/USDT) indexed by keys of tuple `(productId,priceId)` and a byte array encoding price and metrics information. As the original Pyth Payload is 150-bytes long and it wouldn't fit in the value field for each key, the Pricekeeper contract converts on-the-fly the payload to a more compact form, discarding unneeded information.

The Pricekeeper V2 App will allow storage to succeed only if:

* Sender is the contract owner.
* Call is part of a group where all application calls are from the expected VAA processor Appid, 
* Call is part of a group where the verification slot has all bits set.

At deployment, the priceKeeper V2 contract must have the "vaapid" global field set accordingly.

Consumers must interpret the stored bytes as fields organized as:

```
Bytes
8               Price
4               Exponent
8               Time-weighted average price
8               Time-weighted average confidence
8               Confidence
1               Status (valid prices are published with status=1)
1               Corporate Act (see Pyth documentation for this field.)
8               Timestamp (based on Solana contract call time).

46 bytes.
```
## Price-Explorer sample 

The `samples` subdirectory contains a React app showing how consumers can fetch symbols, price information from the contract,  and display this information in real-time. 

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
$ npx ts-node tools\deploy.ts 1054 XNP7HMWUZAJTTHNIGENRKUQOGL5FQV3QVDGYUYUCGGNSHN3CQGMQKL3XHM dev keys\owner.key

Pricecaster v2 Apps Deployment Tool
Copyright 2022 Wormhole Project Contributors

Parameters for deployment:
From: XNP7HMWUZAJTTHNIGENRKUQOGL5FQV3QVDGYUYUCGGNSHN3CQGMQKL3XHM
Network: dev

Enter YES to confirm parameters, anything else to abort. YES
,Pricecaster V2 Program, (c) 2022 Wormhole Project Contributors
Compiling approval program...
Written to teal/build/pricecaster-v2-approval.teal
Compiling clear state program...
Written to teal/build/pricecaster-v2-clear.teal
,
Creating Pricekeeper V2...
txId: VDB34IJPAKBA4S3VBYJ6B6MMSCOWHLUYETLHEXPWJOS2QJ4PPD6Q
Deployment App Id: 1100
,ASA ID Mapper Program, (c) 2022 Wormhole Project Contributors
Compiling approval program...
Written to teal/build/mapper-approval.teal
Compiling clear state program...
Written to teal/build/mapper-clear.teal
,
Creating ASA ID Mapper...
txId: OQC7GKFRLLPIRGB35ZPYAP2XBYJEKJEGJ4S3S42RLPUUUPFQMILA
Deployment App Id: 1101
Compiling verify VAA stateless code...
,,
Stateless program address:  5PKAA6VERF6XZQAOJVKST262JKLKIYP3EGFO54ZD7YPUV7TRQOZ2BN6SPA
Writing deployment results file DEPLOY-1651761990771...
Writing stateless code binary file VAA-VERIFY-1651761990771.BIN...
Bye.
```

* To operate, the stateless contract address must be supplied with funds to pay fees when submitting transactions.
* Use the generated `DEPLOY-XXX` file to set values in the `settings-worm.ts` file (or your current one): app ids and stateless hash.  
* Copy the generated `VAA-VERIFY-xxx`  file as `vaa-verify.bin` under the `bin` directory.

## Backend Configuration

The backend will read configuration from a `settings.ts` file pointed by the `PRICECASTER_SETTINGS` environment variable.  

The following settings are available:

|Value|Description| 
|-- |-- |
|pollInterval   |  The interval for polling the fetcher component for new VAAs. | 
|algo.token   | The token string for connecting the desired Algorand node.  | 
|algo.api   | The API host URL for connecting the desired Algorand node.  | 
|algo.port   | The port to connect to the desired Algorand node.  |  
|algo.dumpFailedTx|  Set to `true` to dump failed transactions. Intended for debugging and analysis. |
|algo.dumpFailedTxDirectory|  Destination of .STXN (signed-transaction) files for analysis. |
| apps.vaaVerifyProgramBinFile | The compiled binary of the VAA verification TEAL program. This should point to the output of the deployment process file `VAA-VERIFY-xxxxxx.BIN`  |
| apps.vaaProcessorAppId |  The application Id of the deployed VAA processor TEAL program. |
|    apps.priceKeeperV2AppId | The application Id of the deployed VAA priceKeeper V2 TEAL program |
|    apps.vaaVerifyProgramHash | The hash of the VAA verify program |
|    apps.ownerAddress | The owner account address for the deployed programs |
|    apps.ownerKeyFile| The file containing keys for the owner file. |
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

* Fire up the dev sandbox.
* Feed the reserve funds account with 10000000000 uALGOs:

  ` ./sandbox goal clerk send -a 10000000000 -f <account> -t XNP7HMWUZAJTTHNIGENRKUQOGL5FQV3QVDGYUYUCGGNSHN3CQGMQKL3XHM`

  **Replace <account>** with one of the pre-funded sandbox accounts (use `goal account list` to see them)


* Run the test suite:
  
  `npm run wormhole-sc-test`

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


## Appendix

### Common errors

**TransactionPool.Remember: transaction XMGXHGC4GVEHQD2T7MZDKTFJWFRY5TFXX2WECCXBWTOZVHC7QLAA: overspend, account X**

If account X is the stateless program address, this means that this account is without enough balance to pay the fees for each TX group.



### Sample Pyth VAA payload

See the documentation `doc` subdirectory for format information.

The following is a real world sample for a payload. For brevity purposes, only the first attestation bytes are dumped.

```
----------------------------------------------------------------------------------------
50325748			Header (P2WH)
0003				Major Version (3)
0000				Minor Version (0)
0001				Size of remaining header fields (constant 1)
02				    Payload Id.  BatchPriceAttestation is 2.
----------------------------------------------------------------------------------------
0005                Num of Attestations
0095c               Size in bytes of each attestation
----------------------------------------------------------------------------------------
c67940be40e0cc7ffaa1acb08ee3fab30955a197da1ec297ab133d4d43d86ee6	product_id
ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace    price_id
0000002f102f53c0													price
0000000005204180													conf
fffffff8															exponent
0000002fb05b7a40													ema_price
00000000064a7e98													ema_conf
01																	status
00000015															num_publishers
00000020															max_num_publishers
000000006283efc2													attestation_time
000000006283efc2													publish_time
000000006283efc1													prev_publish_time
0000002f102f53c0													prev_price
0000000004f34f40													prev_conf
-----------------------------------------------------------------------------------------
.
.
(remaining attestations follow)
.
.
```