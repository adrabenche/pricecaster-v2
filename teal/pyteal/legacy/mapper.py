from pyteal.ast import *
from pyteal.types import *
from pyteal.compiler import *
from pyteal.ir import *
from globals import *
import sys

METHOD = Txn.application_args[0]

@Subroutine(TealType.uint64)
def is_creator():
    return Txn.sender() == Global.creator_address()


@Subroutine(TealType.uint64)
# Arg0: Bootstrap with the authorized VAA Processor appid.
def bootstrap():
    return Approve()


def store():
    return Seq([
        Assert(is_creator()),
        App.globalPut(Txn.application_args[1], Txn.application_args[2]),
        Approve()
    ])


def delete():
    return Seq([
        Assert(is_creator()),
        App.globalDel(Txn.application_args[1]),
        Approve()
    ])

def asa2keymapping_program():
    handle_create = Return(bootstrap())
    handle_update = Return(is_creator())
    handle_delete = Return(is_creator())
    handle_noop = Cond(
        [METHOD == Bytes("store"), store()],
        [METHOD == Bytes("delete"), delete()]
    )

    return Cond(
        [Txn.application_id() == Int(0), handle_create],
        [Txn.on_completion() == OnComplete.UpdateApplication, handle_update],
        [Txn.on_completion() == OnComplete.DeleteApplication, handle_delete],
        [Txn.on_completion() == OnComplete.NoOp, handle_noop]
    )


def clear_state_program():
    return Int(1)


if __name__ == "__main__":

    approval_outfile = "teal/build/mapper-approval.teal"
    clear_state_outfile = "teal/build/mapper-clear.teal"

    if len(sys.argv) >= 2:
        approval_outfile = sys.argv[1]

    if len(sys.argv) >= 3:
        clear_state_outfile = sys.argv[2]

    print("ASA ID Mapper Program, (c) 2022 Wormhole Project Contributors")
    print("Compiling approval program...")

    with open(approval_outfile, "w") as f:
        compiled = compileTeal(asa2keymapping_program(), mode=Mode.Application, version=6)
        f.write(compiled)

    print("Written to " + approval_outfile)
    print("Compiling clear state program...")

    with open(clear_state_outfile, "w") as f:
        compiled = compileTeal(clear_state_program(), mode=Mode.Application, version=6)
        f.write(compiled)

    print("Written to " + clear_state_outfile)
