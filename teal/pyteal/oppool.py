from pyteal import *

ON_CALL_APP = Bytes("base16", "068101")  # v6 program "int 1"

def _construct_itxn() -> Expr:
    return Seq(
        InnerTxnBuilder.Begin(),
        InnerTxnBuilder.SetFields(
            {
                TxnField.type_enum: TxnType.ApplicationCall,
                TxnField.on_completion: OnComplete.DeleteApplication,
                TxnField.approval_program: ON_CALL_APP,
                TxnField.clear_state_program: ON_CALL_APP,
                TxnField.fee: Int(0),
            }
        ),
        InnerTxnBuilder.Submit(),
    )

class OpPool:

    @Subroutine(TealType.none)
    def maximize_budget(fee: Expr) -> Expr:
        """Maximize the available opcode budget without spending more than the given fee.
        Note: the available budget just prior to calling maximize_budget() must be
        high enough to execute the budget increase code. The exact budget required
        depends on the provided fee expression, but a budget of ~25 should be
        sufficient for most use cases. If lack of budget is an issue then consider
        moving the call to maximize_budget() earlier in the pyteal program."""

        i = ScratchVar(TealType.uint64)
        n = fee / Global.min_txn_fee()
        return For(i.store(Int(0)), i.load() < n, i.store(i.load() + Int(1))).Do(
            _construct_itxn()
        )