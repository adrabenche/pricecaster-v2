#!/usr/bin/python3
"""
================================================================================================

The Pricecaster Onchain Program

Version 7.0

(c) 2022-23 Randlabs, inc.

------------------------------------------------------------------------------------------------
v1.0 - first version
v2.0 - stores Pyth Payload
v3.0 - supports Pyth V2 "batched" price Payloads.
v3.1 - fixes to integrate with Wormhole Core Contract work.
v4.0 - supports Pyth 3.0 Wire payload.
v4.1 - audit fixes
v5.0 - Algorand ASA centric redesign.  Now, keys are 8-byte ASA IDs.
v6.0 - Store Normalized price format (picodollars per asset microunit)
v6.5 - Use OpPull for budget maximization.  
       Reject publications with Status != 1
       Modify normalization price handling.
v7.0 - C3-Testnet deployment version: Use linear-addressable global space for entries.

This program stores price data verified from Pyth VAA messaging. To accept data, this application
requires to be the last of the Wormhole VAA verification transaction group.

The following application calls are available.

store: Submit payload.  

The payload format must be V3, with batched message support.

------------------------------------------------------------------------------------------------

ASA ID mappings are stored off-chain in the backend system, so it's the responsibility of the
caller engine to mantain a canonical mapping between Pyth product-prices and ASA IDs.

The global state is treated like a linear array (Blob) of entries with the following format:


key             data
value           Linear array packed with fields as follow: 

                Bytes

                8               asa_id
                
                8               normalized price

                8               price
                8               confidence

                4               exponent

                8               price EMA
                8               confidence EMA

                8               att time
                8               publish time

                8               prev_publish_time
                8               prev_price
                8               prev_confidence
TOTAL           92 Bytes.

First byte of storage is reserved to keep number of entries.

------------------------------------------------------------------------------------------------
"""
from inspect import currentframe
from pyteal import *
from globals import *
from oppool import OpPool
from globalblob import *
import sys

METHOD = Txn.application_args[0]
ASA_ID_ARRAY = Txn.application_args[1]
PYTH_PAYLOAD = Txn.application_args[2]
SLOT_TEMP = ScratchVar(TealType.uint64)
WORMHOLE_CORE_ID = App.globalGet(Bytes("coreid"))
PYTH_ATTESTATION_V2_BYTES = 149

PYTH_MAGIC_HEADER = Bytes("\x50\x32\x57\x48")
PYTH_WIRE_FORMAT_MAJOR_VERSION = Bytes("\x00\x03")
PYTH_PAYLOAD_ID = Bytes("\x02")
PYTH_NUMFIELDS = Bytes("\x00\x01")

PYTH_HEADER_OFFSET = Int(0)
PYTH_HEADER_LEN = Int(4)
PYTH_FIELD_WIRE_FORMAT_VERSION_OFFSET = Int(4)
PYTH_FIELD_WIRE_FORMAT_VERSION_LEN = Int(2)
PYTH_FIELD_NUM_REMFIELDS_OFFSET = Int(8)
PYTH_FIELD_NUM_REMFIELDS_LEN = Int(2)
PYTH_FIELD_PAYLOAD_OFFSET = Int(10)
PYTH_FIELD_PAYLOAD_LEN = Int(1)
PYTH_FIELD_ATTEST_COUNT_OFFSET = Int(11)
PYTH_FIELD_ATTEST_COUNT_LEN = Int(2)
PYTH_FIELD_ATTESTATION_SIZE_OFFSET = Int(13)
PYTH_FIELD_ATTESTATION_SIZE_LEN = Int(2)
PYTH_BEGIN_PAYLOAD_OFFSET = Int(15)
PRODUCT_PRICE_KEY_LEN = Int(64)

# Stored prices have two blocks: 
# BLOCK 1 (price,conf,expo,ema_p,ema_c)
# BLOCK 2 (att_time,pub_time,prev_pub_time,prev_price,prev_conf)
#

GLOBAL_ENTRY_SIZE = 92
MAX_ENTRIES = int(63 * 127 / GLOBAL_ENTRY_SIZE)
FREE_ENTRY = Bytes('base16', '0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000')

BLOCK1_OFFSET = Int(64)
BLOCK1_LEN = Int(36)
BLOCK1_NORMALIZED_OFFSET = Int(72)
BLOCK1_EXPONENT_OFFSET = Int(64) + Int(16)
BLOCK1_STATUS_OFFSET = Int(100)
BLOCK1_STATUS_LEN = Int(1)
BLOCK2_OFFSET = Int(109)
BLOCK2_LEN = Int(40)

UINT64_SIZE = Int(8)
UINT32_SIZE = Int(4)

ALGO_DECIMALS = Int(6)
PICO_DOLLARS_DECIMALS = Int(12)

IGNORE_ATTESTATION = Int(0xFFFFFFFFFFFFFFFF)
ENTRY_NOT_FOUND    = Int(0xFFFFFFFFFFFFFF00)
GLOBAL_SPACE_FULL  = Int(0xFFFFFFFFFFFFFF01)

def XAssert(cond):
    return Assert(And(cond, Int(currentframe().f_back.f_lineno)))

@Subroutine(TealType.uint64)
def is_creator():
    return Txn.sender() == Global.creator_address()


@Subroutine(TealType.uint64)
# Arg0: Bootstrap with the authorized VAA Processor appid.
def bootstrap():
    op_pool = OpPool()
    return Seq([
        op_pool.maximize_budget(Int(1000)),
        App.globalPut(Bytes("coreid"), Btoi(Txn.application_args[0])),
        GlobalBlob.zero(),
        Approve()
    ])


@Subroutine(TealType.uint64)
def check_group_tx():
    #
    # Verifies that group contains expected transactions:
    #
    # - calls/optins issued with authorized appId (Wormhole Core).
    # - calls/optins issued for this appId (Pricecaster)
    # - payment transfers for upfront fees from owner.
    #
    # There must be at least one app call to Wormhole Core Id.
    #
    i = SLOT_TEMP
    is_corecall = ScratchVar(TealType.uint64)
    return Seq([
        is_corecall.store(Int(0)),
        For(i.store(Int(0)),
            i.load() < Global.group_size() - Int(1),
            i.store(i.load() + Int(1))).Do(Seq([
                If (Gtxn[i.load()].application_id() == WORMHOLE_CORE_ID, is_corecall.store(Int(1))),
                Assert(
                    Or(
                        Gtxn[i.load()].application_id() == WORMHOLE_CORE_ID,
                        Gtxn[i.load()].application_id() == Global.current_application_id(),
                        And(
                            Gtxn[i.load()].type_enum() == TxnType.Payment,
                            Gtxn[i.load()].sender() == Global.creator_address()
                    )))
                ])
        ),
        XAssert(Or(Tmpl.Int("TMPL_I_TESTING"), is_corecall.load() == Int(1))),
        Return(Int(1))
    ])


@Subroutine(TealType.uint64)
def find_asaid_index(asaId):
    #
    # Returns NOT_FOUND or entry-index
    #
    i = ScratchVar(TealType.uint64)
    index = ScratchVar(TealType.uint64)
    offset = ScratchVar(TealType.uint64)

    return Seq([
        index.store(ENTRY_NOT_FOUND),
        offset.store(Int(0)),
        For(i.store(Int(1)),
            i.load() < get_entry_count(), i.store(i.load() + Int(1))).Do(
            Seq([
                offset.store(i.load() * Int(GLOBAL_ENTRY_SIZE)),
                If(Btoi(GlobalBlob.read(offset.load(), offset.load() + UINT64_SIZE)) == asaId,
                   Seq([
                       index.store(i.load()),
                       Break()
                   ]))
            ])),
        Return(index.load())
    ])

@Subroutine(TealType.uint64)
def get_entry_count():
    return Btoi(GlobalBlob.read(Int(0), Int(1)))

@Subroutine(TealType.none)
def inc_entry_count():
    entrycount = ScratchVar(TealType.uint64)
    return Seq([
        entrycount.store(get_entry_count() + Int(1)),
        GlobalBlob.write(Int(0), Substring(Itob(entrycount.load()), Int(0), Int(1)))
    ])


@Subroutine(TealType.none)
def add_entry(data):
    entrycount = ScratchVar(TealType.uint64)
    return Seq([
        entrycount.store(get_entry_count()),
        XAssert(entrycount.load() < Int(MAX_ENTRIES)),
        update_entry(entrycount.load() + Int(1), data),
        inc_entry_count(),
    ])


@Subroutine(TealType.none)
def update_entry(index, data):
    return Seq([
        XAssert(Len(data) == Int(GLOBAL_ENTRY_SIZE)),
        GlobalBlob.write(Int(1) + (index * Int(GLOBAL_ENTRY_SIZE)), data)
    ])


@Subroutine(TealType.none)
def publish_data(asa_id, attestation_data):
    packed_price_data = ScratchVar(TealType.bytes)
    asa_decimals = ScratchVar(TealType.uint64)
    pyth_price = ScratchVar(TealType.uint64)
    normalized_price = ScratchVar(TealType.uint64)
    asa_id_index = ScratchVar(TealType.uint64)
    ad = AssetParam.decimals(asa_id)
    exponent = ScratchVar(TealType.uint64)
    norm_exp = Int(0xffffffff) & (Int(0x100000000) - exponent.load())

    return Seq([
            # Normalize price as price * 10^(12 + exponent - asset_decimals) with  -12 <= exponent < 12,  0 <= d <= 19 
        If (
            asa_id == Int(0), 

            # if Asset is 0 (ALGO), we cannot get decimals through AssetParams, so set to known value.
            asa_decimals.store(ALGO_DECIMALS),
            
            # otherwise, get onchain decimals parameter. 
            asa_decimals.store(Seq([ad, XAssert(ad.hasValue()), ad.value()]))
            ),

        pyth_price.store(Btoi(Extract(attestation_data, BLOCK1_OFFSET, UINT64_SIZE))),
        exponent.store(Btoi(Extract(attestation_data, BLOCK1_EXPONENT_OFFSET, UINT32_SIZE))),

        #                                                  
        # Branch as follows, if exp < 0     p' = p * 10^12
        #                                     -----------------
        #                                       10^d * 10^ABS(e)
        #
        # otherwise,  p' = p * 10^12 * 10^e
        #                  -----------------
        #                        10^d
        #
        # where -12 <= e <= 12 ,  0 <= d <= 19
        #

        If (exponent.load() < Int(0x80000000),  # uint32, 2-compl positive 
            normalized_price.store(WideRatio([pyth_price.load(), Exp(Int(10), PICO_DOLLARS_DECIMALS), Exp(Int(10), exponent.load())], 
                                                [Exp(Int(10), asa_decimals.load())])),

            normalized_price.store(WideRatio([pyth_price.load(), Exp(Int(10), PICO_DOLLARS_DECIMALS)], 
                                                [Exp(Int(10), asa_decimals.load()), Exp(Int(10), norm_exp)]))
        ),

        # Concatenate all
        packed_price_data.store(Concat(
            Itob(asa_id),
            Itob(normalized_price.load()),
            Extract(attestation_data, BLOCK1_OFFSET, BLOCK1_LEN),   # price, confidence, exponent, price EMA, conf EMA
            Extract(attestation_data, BLOCK2_OFFSET, BLOCK2_LEN),   # att_time,pub_time,prev_pub_time,prev_price,prev_conf
        )),

        # Lookup blob, store or update.

        asa_id_index.store(find_asaid_index(asa_id)),
        If(asa_id_index.load() == ENTRY_NOT_FOUND, 
            add_entry(packed_price_data.load()), 
            update_entry(asa_id_index.load(), packed_price_data.load()))
    ])


def store():
    # * Sender must be owner
    # * This must be part of a transaction group
    # * All calls in group must be issued from authorized Wormhole core.
    # * Argument 0 must be array of ASA IDs corresponding to each of the attestations that corresponds
    #   to valid prices to update. If an entry is -1 (unsigned 0xFFFF FFFF FFFF FFFF), the corresponding attestation entry is ignored and 
    #   not published, otherwise a lnear lookup is done and the price entry is updated. If there is no entry
    #   with such ASA ID a new one is created.
    # * Argument 1 must be Pyth payload.

    pyth_payload = ScratchVar(TealType.bytes)
    num_attestations = ScratchVar(TealType.uint64)
    attestation_size = ScratchVar(TealType.uint64)
    attestation_data = ScratchVar(TealType.bytes)
    asa_id = ScratchVar(TealType.uint64)

    i = ScratchVar(TealType.uint64)
    op_pool = OpPool()
    return Seq([

        # Verify that we have an array of Uint64 values
        XAssert(Len(ASA_ID_ARRAY) % UINT64_SIZE == Int(0)),

        pyth_payload.store(PYTH_PAYLOAD),

        # If testing mode is active, ignore group checks

        XAssert(Or(Tmpl.Int("TMPL_I_TESTING"), Global.group_size() > Int(1))),
        XAssert(Txn.application_args.length() == Int(3)),
        XAssert(is_creator()),
        XAssert(Or(Tmpl.Int("TMPL_I_TESTING"), check_group_tx())),
        
        # check magic header and version.
        # We dont check minor version as we expect minor-version changes to NOT affect
        # the wire-format compatibility.
        #
        XAssert(Extract(pyth_payload.load(), PYTH_HEADER_OFFSET, PYTH_HEADER_LEN) == PYTH_MAGIC_HEADER),
        XAssert(Extract(pyth_payload.load(), PYTH_FIELD_WIRE_FORMAT_VERSION_OFFSET, PYTH_FIELD_WIRE_FORMAT_VERSION_LEN) == PYTH_WIRE_FORMAT_MAJOR_VERSION),

        # check number of remaining fields (this is constant 1)
        XAssert(Extract(pyth_payload.load(), PYTH_FIELD_NUM_REMFIELDS_OFFSET, PYTH_FIELD_NUM_REMFIELDS_LEN) == PYTH_NUMFIELDS),

        # check payload-id (must be type 2: Attestation) 
        XAssert(Extract(pyth_payload.load(), PYTH_FIELD_PAYLOAD_OFFSET, PYTH_FIELD_PAYLOAD_LEN) == PYTH_PAYLOAD_ID),

        # get attestation count
        num_attestations.store(Btoi(Extract(pyth_payload.load(), PYTH_FIELD_ATTEST_COUNT_OFFSET, PYTH_FIELD_ATTEST_COUNT_LEN))),
        XAssert(num_attestations.load() > Int(0)),

        # must be one ASA ID for each attestation
        XAssert(Len(ASA_ID_ARRAY) == UINT64_SIZE * num_attestations.load()),

        # ensure standard V2 format 150-byte attestation
        attestation_size.store(Btoi(Extract(pyth_payload.load(), PYTH_FIELD_ATTESTATION_SIZE_OFFSET, PYTH_FIELD_ATTESTATION_SIZE_LEN))),
        XAssert(attestation_size.load() == Int(PYTH_ATTESTATION_V2_BYTES)),
        
        # this message size must agree with data in fields
        XAssert(attestation_size.load() * num_attestations.load() + PYTH_BEGIN_PAYLOAD_OFFSET == Len(pyth_payload.load())),
        
        # Read each attestation, store in global state.
        # Use each ASA IDs  passed in call.

        op_pool.maximize_budget(Int(1000)),
        For(i.store(Int(0)), i.load() < num_attestations.load(), i.store(i.load() + Int(1))).Do(
            Seq([
                attestation_data.store(Extract(pyth_payload.load(), PYTH_BEGIN_PAYLOAD_OFFSET + (Int(PYTH_ATTESTATION_V2_BYTES) * i.load()), Int(PYTH_ATTESTATION_V2_BYTES))),
                asa_id.store(Btoi(Extract(ASA_ID_ARRAY, i.load() * UINT64_SIZE, UINT64_SIZE))),

                # Ignore this attestation of no ASA ID available.
                If(asa_id.load() == IGNORE_ATTESTATION, Continue()),

                # Ensure status == 1

                If(Extract(attestation_data.load(), BLOCK1_STATUS_OFFSET, BLOCK1_STATUS_LEN) != Bytes("base16", "0x01"),
                    Log(Concat(Bytes("PC_IGNORED_PRICE_INVALID_STATUS "), Itob(asa_id.load()))),

                    # Valid status,  continue publication....
                    Seq([
                        # op_pool.maximize_budget(Int(2000)),
                        # publish_data(asa_id.load(), attestation_data.load())
                    ])
                )
            ])
        ),
        Approve()])


def pricecaster_program():
    handle_create = Return(bootstrap())
    handle_update = Return(is_creator())
    handle_delete = Return(is_creator())
    handle_optin = Return(Int(1))
    handle_noop = Cond(
        [METHOD == Bytes("store"), store()],
    )
    return Seq([
        # XAssert(Txn.rekey_to() == Global.zero_address()),
        XAssert(Txn.asset_close_to() == Global.zero_address()),
        XAssert(Txn.close_remainder_to() == Global.zero_address()),
        Cond(
        [Txn.application_id() == Int(0), handle_create],
        [Txn.on_completion() == OnComplete.OptIn, handle_optin],
        [Txn.on_completion() == OnComplete.UpdateApplication, handle_update],
        [Txn.on_completion() == OnComplete.DeleteApplication, handle_delete],
        [Txn.on_completion() == OnComplete.NoOp, handle_noop])
    ])


def clear_state_program():
    return Int(1)


if __name__ == "__main__":

    approval_outfile = "teal/build/pricecaster-v2-approval.teal"
    clear_state_outfile = "teal/build/pricecaster-v2-clear.teal"

    if len(sys.argv) >= 2:
        approval_outfile = sys.argv[1]

    if len(sys.argv) >= 3:
        clear_state_outfile = sys.argv[2]

    print("Pricecaster V2 TEAL Program     Version 7.0, (c) 2022-23 Randlabs, inc.")
    print("Compiling approval program...")

    optimize_options = OptimizeOptions(scratch_slots=True)

    with open(approval_outfile, "w") as f:
        compiled = compileTeal(pricecaster_program(),
                               mode=Mode.Application, version=7, optimize=optimize_options)
        f.write(compiled)

    print("Written to " + approval_outfile)
    print("Compiling clear state program...")

    with open(clear_state_outfile, "w") as f:
        compiled = compileTeal(clear_state_program(),
                               mode=Mode.Application, version=7)
        f.write(compiled)

    print("Written to " + clear_state_outfile)
