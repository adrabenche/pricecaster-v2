#!/usr/bin/python3
"""
================================================================================================

The Pricecaster II Program

v4.0

(c) 2022 Wormhole Project Contributors

------------------------------------------------------------------------------------------------
v1.0 - first version
v2.0 - stores Pyth Payload
v3.0 - supports Pyth V2 "batched" price Payloads.
v3.1 - fixes to integrate with Wormhole Core Contract work.
v4.0 - supports Pyth 3.0 Wire payload.

This program stores price data verified from Pyth VAA messaging. To accept data, this application
requires to be the last of the Wormhole VAA verification transaction group.

The following application calls are available.

store: Submit payload.  

The payload format must be V3, with batched message support.

------------------------------------------------------------------------------------------------

Global state:

key             Concatenated productId + priceId
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
                8               previous price
                -------------------------------------
                Total: 57 bytes.

------------------------------------------------------------------------------------------------
"""
from pyteal.ast import *
from pyteal.types import *
from pyteal.compiler import *
from pyteal.ir import *
from globals import *
import sys

METHOD = Txn.application_args[0]
PYTH_PAYLOAD = Txn.application_args[1]
SLOT_TEMP = ScratchVar(TealType.uint64)
WORMHOLE_CORE_ID = App.globalGet(Bytes("coreid"))
PYTH_ATTESTATION_V2_BYTES = 149

PYTH_MAGIC_HEADER = Bytes("\x50\x32\x57\x48")
PYTH_WIRE_FORMAT_MAJOR_VERSION = Bytes("\x00\x03")

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
        Assert(is_corecall.load() == Int(1)),
        Return(Int(1))
    ])


def store():
    # * Sender must be owner
    # * This must be part of a transaction group
    # * All calls in group must be issued from authorized Wormhole core.
    # * Argument 0 must be Pyth payload.

    pyth_payload = ScratchVar(TealType.bytes)
    packed_price_data = ScratchVar(TealType.bytes)
    num_attestations = ScratchVar(TealType.uint64)
    attestation_size = ScratchVar(TealType.uint64)
    attestation_data = ScratchVar(TealType.bytes)
    product_price_key = ScratchVar(TealType.bytes)

    i = ScratchVar(TealType.uint64)

    return Seq([
        pyth_payload.store(PYTH_PAYLOAD),
        Assert(Global.group_size() > Int(1)),
        Assert(Txn.application_args.length() == Int(2)),
        Assert(is_creator()),
        Assert(check_group_tx()),
        
        # check magic header and version.
        # We dont check minor version as we expect minor-version changes to NOT affect
        # the wire-format compatibility.
        #
        Assert(Extract(pyth_payload.load(), Int(0), Int(4)) == PYTH_MAGIC_HEADER),
        Assert(Extract(pyth_payload.load(), Int(4), Int(2)) == PYTH_WIRE_FORMAT_MAJOR_VERSION),

        # check number of remaining fields (this is constant 1)
        Assert(Extract(pyth_payload.load(), Int(8), Int(2)) == Bytes("\x00\x01")),

        # check payload-id (must be type 2: Attestation) 
        Assert(Extract(pyth_payload.load(), Int(10), Int(1)) == Bytes("\x02")),

        # get attestation count
        num_attestations.store(Btoi(Extract(pyth_payload.load(), Int(11), Int(2)))),
        Assert(num_attestations.load() > Int(0)),

        # ensure standard V2 format 150-byte attestation
        attestation_size.store(Btoi(Extract(pyth_payload.load(), Int(13), Int(2)))),
        Assert(attestation_size.load() == Int(PYTH_ATTESTATION_V2_BYTES)),
        
        # this message size must agree with data in fields
        Assert(attestation_size.load() * num_attestations.load() + Int(15) == Len(pyth_payload.load())),
        
        # Read each attestation, store in global state.

        For(i.store(Int(0)), i.load() < num_attestations.load(), i.store(i.load() + Int(1))).Do(
            Seq([
                attestation_data.store(Extract(pyth_payload.load(), Int(15) + (Int(PYTH_ATTESTATION_V2_BYTES) * i.load()), Int(PYTH_ATTESTATION_V2_BYTES))),
                product_price_key.store(Extract(attestation_data.load(), Int(0), Int(64))),
                packed_price_data.store(Concat(
                    Extract(attestation_data.load(), Int(64), Int(41)),   # price, confidence, exponent, price EMA, conf EMA, status, # publishers
                    Extract(attestation_data.load(), Int(109), Int(8)),   # timestamp
                    Extract(attestation_data.load(), Int(133), Int(8)),   # previous price
                )),
                App.globalPut(product_price_key.load(), packed_price_data.load()),
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
    return Cond(
        [Txn.application_id() == Int(0), handle_create],
        [Txn.on_completion() == OnComplete.OptIn, handle_optin],
        [Txn.on_completion() == OnComplete.UpdateApplication, handle_update],
        [Txn.on_completion() == OnComplete.DeleteApplication, handle_delete],
        [Txn.on_completion() == OnComplete.NoOp, handle_noop]
    )


def clear_state_program():
    return Int(1)


if __name__ == "__main__":

    approval_outfile = "teal/build/pricecaster-v2-approval.teal"
    clear_state_outfile = "teal/build/pricecaster-v2-clear.teal"

    if len(sys.argv) >= 2:
        approval_outfile = sys.argv[1]

    if len(sys.argv) >= 3:
        clear_state_outfile = sys.argv[2]

    print("Pricecaster V2 Program, (c) 2022 Wormhole Project Contributors")
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
