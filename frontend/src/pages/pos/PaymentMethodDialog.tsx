import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";

type PaymentMethodDialogProps = {
  open: boolean;
  onClose: () => void;
  onCash: () => void;
  onMpesa: () => void;
  cashLoading: boolean;
  mpesaLoading: boolean;
};

/** Temporary choice between the existing cash sale and M-Pesa STK flows. */
export default function PaymentMethodDialog({
  open,
  onClose,
  onCash,
  onMpesa,
  cashLoading,
  mpesaLoading,
}: PaymentMethodDialogProps) {
  const busy = cashLoading || mpesaLoading;

  return (
    <Modal
      open={open}
      title="Payment"
      onClose={onClose}
      closeDisabled={busy}
      className="max-w-sm"
      footer={
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
      }
    >
      <p className="text-sm text-ink">Choose how this sale is paid.</p>
      <div className="mt-4 grid gap-2">
        <Button size="lg" className="w-full" loading={cashLoading} disabled={mpesaLoading} onClick={onCash}>
          Cash
        </Button>
        <Button size="lg" variant="secondary" className="w-full" loading={mpesaLoading} disabled={cashLoading} onClick={onMpesa}>
          M-Pesa STK
        </Button>
      </div>
    </Modal>
  );
}
