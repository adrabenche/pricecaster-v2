#!/usr/bin/python3
"""
================================================================================================

The Pricecaster II Program

v5.0

(c) 2022-23 Randlabs, inc.

------------------------------------------------------------------------------------------------
v1.0 - first version
v2.0 - stores Pyth Payload
v3.0 - supports Pyth V2 "batched" price Payloads.
v3.1 - fixes to integrate with Wormhole Core Contract work.
v4.0 - supports Pyth 3.0 Wire payload.
v4.1 - audit fixes
v5.0 - Algorand ASA centric redesign.  Now, keys are 8-byte ASA IDs.

This program stores price data verified from Pyth VAA messaging. To accept data, this application
requires to be the last of the Wormhole VAA verification transaction group.

The following application calls are available.

store: Submit payload.  

The payload format must be V3, with batched message support.

------------------------------------------------------------------------------------------------

Global state:

key             Algorand Standard Asset (ASA) ID
value           packed fields as follow: 

                Bytes
                
                8               price
                8               confidence
                4               exponent
                8               Price EMA value
                8               Confidence EMA value
                1               status
                4               number of publishers
                8               Timestamp
                64              Origin productId + priceId key in Pyth network.
                -----------------------------------------------------------------------
                Total: 57 bytes.

------------------------------------------------------------------------------------------------
"""
from inspect import currentframe
from pyteal.ast import *
from pyteal.types import *
from pyteal.compiler import *
from pyteal.ir import *
from globals import *
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
PRICE_DATA_OFFSET = Int(64)
PRICE_DATA_LEN = Int(41)
PRICE_DATA_TIMESTAMP_OFFSET = Int(109)
PRICE_DATA_PREV_PRICE_OFFSET = Int(133)
PRICE_DATA_TIMESTAMP_LEN = Int(8)
PRICE_DATA_PREV_PRICE_LEN = Int(8)

UINT64_SIZE = Int(8)

def XAssert(cond):
    return Assert(And(cond, Int(currentframe().f_back.f_lineno)))

@Subroutine(TealType.uint64)
def is_creator():
    return Txn.sender() == Global.creator_address()


@Subroutine(TealType.uint64)
# Arg0: Bootstrap with the authorized VAA Processor appid.
def bootstrap():
    return Seq([
        App.globalPut(Bytes("coreid"), Btoi(Txn.application_args[0])),
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
        XAssert(is_corecall.load() == Int(1)),
        Return(Int(1))
    ])


def store():
    # * Sender must be owner
    # * This must be part of a transaction group
    # * All calls in group must be issued from authorized Wormhole core.
    # * Argument 0 must be array of ASA IDs corresponding to each of the attestations.
    # * Argument 1 must be Pyth payload.

    pyth_payload = ScratchVar(TealType.bytes)
    packed_price_data = ScratchVar(TealType.bytes)
    num_attestations = ScratchVar(TealType.uint64)
    attestation_size = ScratchVar(TealType.uint64)
    attestation_data = ScratchVar(TealType.bytes)
    product_price_key = ScratchVar(TealType.bytes)

    i = ScratchVar(TealType.uint64)

    return Seq([

        # Verify that we have an array of Uint64 values
        XAssert(Len(ASA_ID_ARRAY) % UINT64_SIZE == Int(0)),

        pyth_payload.store(PYTH_PAYLOAD),
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

        For(i.store(Int(0)), i.load() < num_attestations.load(), i.store(i.load() + Int(1))).Do(
            Seq([
                attestation_data.store(Extract(pyth_payload.load(), PYTH_BEGIN_PAYLOAD_OFFSET + (Int(PYTH_ATTESTATION_V2_BYTES) * i.load()), Int(PYTH_ATTESTATION_V2_BYTES))),
                product_price_key.store(Extract(attestation_data.load(), Int(0), PRODUCT_PRICE_KEY_LEN)),
                packed_price_data.store(Concat(
                    Extract(attestation_data.load(), PRICE_DATA_OFFSET, PRICE_DATA_LEN),   # price, confidence, exponent, price EMA, conf EMA, status, # publishers
                    Extract(attestation_data.load(), PRICE_DATA_TIMESTAMP_OFFSET, PRICE_DATA_TIMESTAMP_LEN),   # timestamp
                )),
                App.globalPut(Extract(ASA_ID_ARRAY, i.load() * UINT64_SIZE, UINT64_SIZE), Concat(packed_price_data.load(), product_price_key.load())),
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

    print("Pricecaster V2 Program     Version 5.0, (c) 2022-23 Randlabs, inc.")
    print("Compiling approval program...")

    with open(approval_outfile, "w") as f:
        compiled = compileTeal(pricecaster_program(),
                               mode=Mode.Application, version=6)
        f.write(compiled)

    print("Written to " + approval_outfile)
    print("Compiling clear state program...")

    with open(clear_state_outfile, "w") as f:
        compiled = compileTeal(clear_state_program(),
                               mode=Mode.Application, version=6)
        f.write(compiled)

    print("Written to " + clear_state_outfile)
