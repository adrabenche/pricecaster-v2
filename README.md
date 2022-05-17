
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

For deployment, use `-p 7074` to expose ports; remove `-ti` to leave the container running in the background.


## Appendix

### Common errors

**TransactionPool.Remember: transaction XMGXHGC4GVEHQD2T7MZDKTFJWFRY5TFXX2WECCXBWTOZVHC7QLAA: overspend, account X**

If account X is the stateless program address, this means that this account is without enough balance to pay the fees for each TX group.



### Sample Pyth VAA

This is a sample signed VAA from Pyth, which streams batched price data.

```
01                version
00000000          guardian-set-index
01                signature-count
00                sig index 0
5bf8170ce643e98f5f43d86dce130b9ad7ff3d01e4ec59489f34619ca324df8264b7aca4d412caafea247aafaa36ccd3d028098402cc5bf9a33f52bfc867c1a601   sig 0
61a5ff9a          timestamp
00000859          nonce 
0001              chain-id
3afda841c1f43dd7d546c8a581ba1f92a139f4133f9f6ab095558f6a359df5d4      emitter-address
0000000000000012  sequence
20                consistency-level

payload:

50325748		P2W_MAGIC (p2wh)
0002        P2W_FORMAT_VERSION
02				  Payload ID
0005			  # of Price attestations in this batch
0096        Size in bytes of each attestation

Attestation follows: 

50325748
0002
01
1dc9fc22544655b453008cc68559639a8f74d584d94f84ac945b36c957afd9db
73dc009953c83c944690037ea477df627657f45c14f16ad3a61089c5a3f9f4f2
01
000000000630a010
fffffff8
000000000623c88e
000000009fbfbc1f
000000009b155c1f00000000000127a100000000755eafbc000000009b155c1f000000000000c350010000000000620a4ecb

50325748
0002
01
0264e3935b6fb12d2c5d92d75adb8175ca5b454c7d7ec279b0d27647ee0fd33f
08f781a893bc9340140c5f89c8a96f438bcfae4d1474cc0f688e3a52892c7318
0100000000054a37b0fffffff8000000000541380d00000000a138fc3f00000000b6dfdb3f000000000000fd5600000000769a3b9c00000000b6dfdb3f000000000000c350010000000000620a4ecb

50325748
0002
01
e0b43fa07b9318a2de306080fc8946494ae30c6af9b12b4dc99f1847718e6341a
fcc9a5bb5eefd55e12b6f0b4c8e6bccf72b785134ee232a5d175afd082e883201
0000000001011868fffffffb00000000010233e2000000005821445f000000003414d83d00000000000054850000000070b122fc000000003414d83d000000000000848d000000000000620a4ecb

50325748
0002
01
101be52cc7068adf747f67759e86b478c6e90f81b05a8121d080cfa0a5a9a0736
de025a4cf28124f8ea6cb8085f860096dbc36d9c40002e221fc449337e065b201
0000000137791750fffffff8000000013567604800000001450fc47f000000003e9efade00000000001cc89e0000000076204e7c000000003e9efade000000000026e8f0010000000000620a4ecb

50325748
0002
01
a4b430a1ce2c68685e0c0e54a60340854fe15ce154e2f0b39927968e447cf93b1
fc18861232290221461220bd4e2acd1dcdfbc89c84092c93c18bdc7756c158801
0000000005f67d40fffffff80000000005f67804000000018773c2df00000001874d089f0000000000007513000000007547c2fc00000001874d089f0000000000007530010000000000620a4ecb

230abfe0ec3b460bd55fc4fb36356716329915145497202b8eb8bf1af6a0a3b9      product_id
fe650f0367d4a7ef9815a593ea15d36593f0643aaaf0149bb04be67ab851decd      price_id
01                price_type
0000002f17254388  price
fffffff7          exponent
0000002eed73d900  twap value
0000000070d3b43f  twap numerator for next upd
0000000037faa03d  twap denom for next upd
000000000e9e5551  twac value
00000000894af11c  twac numerator for next upd
0000000037faa03d  twac denom for next upd
000000000dda6eb8  confidence
01                status
00                corporate_act
0000000061a5ff9a  timestamp (based on Solana contract call time)
```

