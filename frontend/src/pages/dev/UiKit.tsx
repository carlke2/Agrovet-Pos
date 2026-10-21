import { useState } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import DataTable from "@/components/ui/DataTable";
import Drawer from "@/components/ui/Drawer";
import EmptyState from "@/components/ui/EmptyState";
import { Checkbox, FormField, Input, Select, Switch, Textarea } from "@/components/ui/Field";
import Modal from "@/components/ui/Modal";
import Money from "@/components/ui/Money";
import PageHeader from "@/components/ui/PageHeader";
import PageLoader from "@/components/ui/PageLoader";
import Pagination from "@/components/ui/Pagination";
import QuantityStepper from "@/components/ui/QuantityStepper";
import SearchInput from "@/components/ui/SearchInput";
import { CardSkeleton, Skeleton, TableSkeleton } from "@/components/ui/Skeleton";
import Spinner from "@/components/ui/Spinner";
import StatusBadge from "@/components/ui/StatusBadge";
import Tabs from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime } from "@/lib/datetime";

const sampleRows = [
  { id: "a", name: "Sample row", qty: 12, amount: 12500 },
  { id: "b", name: "Second row", qty: 3, amount: 480 },
];

export default function UiKit() {
  const toast = useToast();
  const [tab, setTab] = useState("one");
  const [page, setPage] = useState(1);
  const [qty, setQty] = useState(2);
  const [checked, setChecked] = useState(true);
  const [sms, setSms] = useState(false);
  const [modal, setModal] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");

  return (
    <div className="space-y-8 p-4 md:p-6">
      <PageHeader
        title="Component gallery"
        subtitle="Every shared component, for review in development."
        breadcrumb={[{ label: "Dev" }, { label: "UI" }]}
      />

      <Card>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">Buttons</h2>
        <div className="flex flex-wrap gap-2">
          <Button>Primary</Button>
          <Button variant="accent">New sale</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="ghost">Ghost</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
          <Button loading>Saving</Button>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">Status</h2>
        <div className="flex flex-wrap gap-2">
          <StatusBadge variant="success">Paid</StatusBadge>
          <StatusBadge variant="warning">Low stock</StatusBadge>
          <StatusBadge variant="danger">Expired</StatusBadge>
          <StatusBadge variant="info">Note</StatusBadge>
          <StatusBadge variant="inactive">Inactive</StatusBadge>
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Fields</h2>
        <FormField label="Name" hint="Shown on receipts" htmlFor="kit-name">
          <Input id="kit-name" placeholder="Item name" />
        </FormField>
        <FormField label="Notes" error="This field is required" htmlFor="kit-notes">
          <Textarea id="kit-notes" />
        </FormField>
        <FormField label="Category" htmlFor="kit-category">
          <Select id="kit-category" defaultValue="feed">
            <option value="feed">Feed</option>
            <option value="health">Health</option>
          </Select>
        </FormField>
        <div className="flex flex-wrap items-center gap-4">
          <Checkbox label="Available" checked={checked} onChange={(event) => setChecked(event.target.checked)} />
          <Switch label="Example switch" checked={sms} onCheckedChange={setSms} />
          <QuantityStepper value={qty} onChange={setQty} />
        </div>
        <SearchInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search items or scan barcode" />
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">Money and date</h2>
        <p className="text-lg font-semibold text-ink">
          <Money amount={12500} />
        </p>
        <p className="tabular mt-1 text-sm text-muted">{formatDateTime(new Date("2026-10-21T10:15:00Z"))}</p>
      </Card>

      <Tabs tabs={[{ id: "one", label: "List" }, { id: "two", label: "Add" }]} value={tab} onChange={setTab} />

      <DataTable
        columns={[
          { key: "name", header: "Name" },
          { key: "qty", header: "Qty", numeric: true },
          { key: "amount", header: "Amount", numeric: true, render: (row) => <Money amount={row.amount} /> },
        ]}
        rows={query ? [] : sampleRows}
        rowKey={(row) => row.id}
        selectable
        selectedKeys={selected}
        onSelectedKeysChange={setSelected}
        emptyMode={query ? "search" : "empty"}
        emptyTitle={query ? "No items match your search" : "No items yet"}
        emptyMessage={query ? "Try a different name or barcode." : "Add an item when you are ready."}
      />
      <Pagination page={page} pageCount={4} onPageChange={setPage} />

      <div className="grid gap-4 md:grid-cols-3">
        <CardSkeleton />
        <div className="rounded-card border border-sand bg-surface p-5">
          <Skeleton className="h-4 w-24" />
          <div className="mt-4 flex items-center gap-3">
            <Spinner />
            <Spinner inline size="sm" />
          </div>
        </div>
        <TableSkeleton rows={3} columns={3} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <EmptyState mode="empty" title="No items yet" message="Nothing has been added." action={<Button size="sm">Add item</Button>} />
        </Card>
        <Card>
          <EmptyState mode="search" title="No items match your search" message="Clear the search to see everything." />
        </Card>
      </div>

      <Card className="flex flex-wrap gap-2">
        <Button onClick={() => setModal(true)}>Open modal</Button>
        <Button variant="secondary" onClick={() => setDrawer(true)}>Open drawer</Button>
        <Button variant="danger" onClick={() => setConfirm(true)}>Open confirm</Button>
        <Button variant="ghost" onClick={() => toast.success("Saved", "The example notification is on screen.")}>
          Show toast
        </Button>
      </Card>

      <PageLoader label="Page loader" detail="Centered spinner with a label" className="rounded-card border border-sand bg-surface" />

      <Modal
        open={modal}
        title="Example modal"
        onClose={() => setModal(false)}
        footer={<Button onClick={() => setModal(false)}>Close</Button>}
      >
        <p>Dialogs trap focus and close with Escape.</p>
      </Modal>
      <Drawer open={drawer} title="Example drawer" onClose={() => setDrawer(false)}>
        <p className="text-sm text-muted">Overlay panel for filters and the mobile menu.</p>
      </Drawer>
      <ConfirmDialog
        open={confirm}
        title="Deactivate this record?"
        message="This is a preview of the danger confirm dialog."
        danger
        loading={confirming}
        confirmLabel="Deactivate"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirming(true);
          window.setTimeout(() => {
            setConfirming(false);
            setConfirm(false);
            toast.warning("Preview only", "No record was changed.");
          }, 600);
        }}
      />
    </div>
  );
}
